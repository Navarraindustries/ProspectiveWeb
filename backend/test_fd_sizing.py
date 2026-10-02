"""Dimensionado de flow-diverter sobre la línea central (services/fd_sizing.py).

Sobre vasos sintéticos de calibre conocido: un tubo recto, uno que se estrecha
y uno con un saco al lado. Lo que se defiende:
- el calibre de cada anclaje es el del vaso, no el del saco que tiene al lado;
- el diámetro se elige por el anclaje MAYOR y la medida del catálogo más cercana;
- una diferencia proximal–distal grande pide varios dispositivos;
- la longitud es la etiquetada más corta que cubre cuello más anclajes;
- una línea central que no pasa por el aneurisma no da cifras.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from routers.plan import _STENT_LIBRARY
from services.fd_sizing import pick_diameter, size_flow_diverter
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_states

client = TestClient(app, raise_server_exceptions=True)
LIB = [s.model_dump() for s in _STENT_LIBRARY]


def _vaso(r_prox: float, r_dist: float, largo: float = 60.0, saco: float = 0.0):
    """Tubo cerrado a lo largo de z, de r_prox (z=0) a r_dist (z=largo), con un
    saco esférico opcional pegado al lado en la mitad. Devuelve (malla, línea)."""
    n = 121
    z = np.linspace(0, largo, n)
    r = np.where(z < largo / 2 - 4, r_prox, np.where(z > largo / 2 + 4, r_dist,
                 np.interp(z, [largo / 2 - 4, largo / 2 + 4], [r_prox, r_dist])))
    pts = vtk.vtkPoints()
    for zi in z:
        pts.InsertNextPoint(0, 0, zi)
    line = vtk.vtkPolyLine()
    line.GetPointIds().SetNumberOfIds(n)
    for i in range(n):
        line.GetPointIds().SetId(i, i)
    cells = vtk.vtkCellArray(); cells.InsertNextCell(line)
    pd = vtk.vtkPolyData(); pd.SetPoints(pts); pd.SetLines(cells)
    radios = vtk.vtkDoubleArray(); radios.SetName("r")
    for ri in r:
        radios.InsertNextValue(float(ri))
    pd.GetPointData().SetScalars(radios)
    tube = vtk.vtkTubeFilter()
    tube.SetInputData(pd)
    tube.SetVaryRadiusToVaryRadiusByAbsoluteScalar()
    tube.SetNumberOfSides(48)
    tube.CappingOn()
    tube.Update()
    malla = tube.GetOutput()
    if saco > 0:
        s = vtk.vtkSphereSource()
        s.SetRadius(saco)
        s.SetCenter(r_prox + saco * 0.8, 0, largo / 2)
        s.SetThetaResolution(32); s.SetPhiResolution(32)
        s.Update()
        app_ = vtk.vtkAppendPolyData()
        app_.AddInputData(malla); app_.AddInputData(s.GetOutput()); app_.Update()
        malla = app_.GetOutput()
    linea = np.column_stack([np.zeros(n), np.zeros(n), z])
    return malla, linea


def test_tubo_recto_mide_el_calibre_y_elige_la_medida_del_catalogo():
    malla, linea = _vaso(2.0, 2.0, saco=3.0)
    r = size_flow_diverter(malla, linea, (2.0, 0, 30.0), 4.0, LIB)
    assert r.proximal.diameter_mm == pytest.approx(4.0, abs=0.1)
    assert r.distal.diameter_mm == pytest.approx(4.0, abs=0.1)
    assert not r.multiple_devices
    assert r.required_length_mm == pytest.approx(16.0, abs=0.01)   # 4 + 2·(1 + 5)
    ped = next(o for o in r.options if o.device_id.startswith("pipeline"))
    assert ped.fits and ped.diameter_mm == 4.0 and ped.length_mm == 16
    assert ped.deploy_arc_mm == pytest.approx((22.0, 38.0), abs=0.6)
    assert ped.elongated_length_mm == pytest.approx(16 * 1.326, abs=0.1)
    # Solo flow-diverters: el Enterprise y el Leo no se proponen aquí.
    assert {o.device_id for o in r.options} == {s["id"] for s in LIB if s["type"] == "flow_diverter"}


def test_el_saco_no_entra_en_el_calibre_del_anclaje():
    malla, linea = _vaso(1.5, 1.5, saco=4.0)
    r = size_flow_diverter(malla, linea, (1.5, 0, 30.0), 6.0, LIB)
    assert r.proximal.diameter_mm == pytest.approx(3.0, abs=0.1)
    assert r.distal.diameter_mm == pytest.approx(3.0, abs=0.1)


def test_vaso_que_se_estrecha_pide_varios_dispositivos():
    malla, linea = _vaso(2.25, 1.5)
    r = size_flow_diverter(malla, linea, (2.0, 0, 30.0), 4.0, LIB)
    assert r.proximal.diameter_mm == pytest.approx(4.5, abs=0.1)
    assert r.distal.diameter_mm == pytest.approx(3.0, abs=0.1)
    assert r.multiple_devices and r.mismatch_mm > 1.0
    assert r.target_diameter_mm == pytest.approx(4.5, abs=0.1)     # por el anclaje mayor
    ped = next(o for o in r.options if o.device_id.startswith("pipeline"))
    assert ped.diameter_mm == 4.5
    assert "sobredimensionado" in ped.narrow_end_note
    assert any("varios" in w for w in r.warnings)


def test_linea_central_que_no_pasa_por_el_aneurisma():
    malla, linea = _vaso(2.0, 2.0)
    with pytest.raises(ValueError, match="no recorre la arteria"):
        size_flow_diverter(malla, linea, (40.0, 0, 30.0), 4.0, LIB)


def test_linea_central_corta_avisa_del_anclaje_truncado():
    malla, linea = _vaso(2.0, 2.0)
    r = size_flow_diverter(malla, linea[linea[:, 2] >= 26.0], (2.0, 0, 30.0), 4.0, LIB)
    assert r.proximal.truncated and r.proximal.arc_to_mm - r.proximal.arc_from_mm < 5
    assert any("se acaba antes del anclaje proximal" in w for w in r.warnings)


def test_el_borde_marcado_fija_el_tramo_del_cuello():
    malla, linea = _vaso(2.0, 2.0)
    rim = [(2.0, 0, 26.0), (2.0, 1, 34.0), (2.0, -1, 30.0)]
    r = size_flow_diverter(malla, linea, (2.0, 0, 30.0), 4.0, LIB, rim_points=rim)
    assert r.neck_from_rim and r.neck_arc_mm == pytest.approx((26.0, 34.0), abs=0.6)
    assert r.required_length_mm == pytest.approx(20.0, abs=0.6)


def test_medida_del_catalogo():
    ped = {"available_diameters_mm": [3.5, 3.75, 4.0], "min_diameter_mm": 3.5, "max_diameter_mm": 4.0}
    assert pick_diameter(3.98, ped) == 4.0      # la más cercana, no la más pequeña admisible
    assert pick_diameter(3.62, ped) == 3.5      # 0,12 por debajo: dentro de la tolerancia
    assert pick_diameter(4.4, ped) == 0.0       # el catálogo no llega
    rango = {"min_diameter_mm": 2.0, "max_diameter_mm": 5.0}
    assert pick_diameter(3.1, rango) == 3.1     # sin lista: el objetivo, si cae en rango


class TestEndpoint:
    def _sesion(self, con_linea=True, con_morfo=True):
        sid = create_session()
        malla, linea = _vaso(2.0, 2.0, saco=3.0)
        meshes = session_subdir(sid, "meshes")
        write_vtp(malla, meshes / "vessel_tree.vtp")
        if con_linea:
            np.savez(meshes / "centerline_points.npz", points=linea)
        if con_morfo:
            write_states(sid, {"morpho.neck_origin_x": "2.0", "morpho.neck_origin_y": "0",
                               "morpho.neck_origin_z": "30.0", "morpho.neck_mm": "4.0"})
        return sid

    def test_devuelve_las_opciones(self):
        sid = self._sesion()
        r = client.post(f"/api/centerline/{sid}/fd-sizing")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["proximal"]["diameter_mm"] == pytest.approx(4.0, abs=0.1)
        assert any(o["fits"] for o in j["options"]) and j["sources"]

    def test_sin_linea_central(self):
        r = client.post(f"/api/centerline/{self._sesion(con_linea=False)}/fd-sizing")
        assert r.status_code == 422 and "línea central" in r.json()["detail"]

    def test_sin_morfometria(self):
        r = client.post(f"/api/centerline/{self._sesion(con_morfo=False)}/fd-sizing")
        assert r.status_code == 422 and "morfometría" in r.json()["detail"]


def test_una_rama_pegada_al_vaso_no_cuenta_como_su_calibre():
    # Caso real: a 12 mm del origen el contorno más cercano era el de una rama
    # de 1,7 mm que tocaba un vaso de 4–5 mm.
    malla, linea = _vaso(2.0, 2.0)
    rama = vtk.vtkCylinderSource()
    rama.SetRadius(0.8); rama.SetHeight(4.0); rama.SetResolution(32)
    rama.SetCenter(0, 0, 0); rama.CappingOn(); rama.Update()
    giro = vtk.vtkTransform(); giro.Translate(2.3, 0, 24.5); giro.RotateX(90)
    tf = vtk.vtkTransformPolyDataFilter(); tf.SetTransform(giro)
    tf.SetInputData(rama.GetOutput()); tf.Update()
    junta = vtk.vtkAppendPolyData(); junta.AddInputData(malla); junta.AddInputData(tf.GetOutput()); junta.Update()
    r = size_flow_diverter(junta.GetOutput(), linea, (2.0, 0, 30.0), 4.0, LIB)
    assert r.proximal.min_mm > 3.5, r.proximal


def test_avisa_si_la_arteria_madre_de_la_morfometria_no_casa():
    sid = TestEndpoint()._sesion()
    write_states(sid, {"morpho.parent_artery_mm": "1.67"})
    j = client.post(f"/api/centerline/{sid}/fd-sizing").json()
    assert any("no coincide" in w and "1.67" in w for w in j["warnings"])
