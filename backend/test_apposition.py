"""Aposición del stent a la pared (services/apposition.py).

Un vaso recto de calibre conocido y un stent de diámetro nominal conocido:
la separación es la diferencia de radios, con su signo.
- stent más estrecho que el vaso → separado (+);
- stent más ancho → comprimido (−);
- un ensanchamiento local del vaso se ve SOLO ahí;
- sobre el cuello no hay pared: no cuenta como mala aposición.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient
from vtkmodules.util.numpy_support import vtk_to_numpy

from main import app
from services.apposition import SCALAR, annotate
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir, write_states
from services.stent_deployment import deploy_stent_on_centerline

client = TestClient(app, raise_server_exceptions=True)


def _vaso(radio_de_z, largo=40.0, saco=None):
    """Superficie cerrada de un tubo a lo largo de z con radio r(z); `saco` =
    (centro, radio) de una esfera unida."""
    n = 121
    lado = largo + 12
    img = vtk.vtkImageData(); img.SetDimensions(n, n, n)
    paso = lado / (n - 1); img.SetSpacing(paso, paso, paso); img.SetOrigin(-lado / 2, -lado / 2, -6.0)
    ax = np.arange(n) * paso
    X, Y, Z = np.meshgrid(ax - lado / 2, ax - lado / 2, ax - 6.0, indexing="ij")
    r = radio_de_z(Z)
    f = np.sqrt(X ** 2 + Y ** 2) - r
    f = np.maximum(f, np.maximum(-Z, Z - largo))                 # tapas en z = 0 y z = largo
    if saco is not None:
        c, rs = saco
        f = np.minimum(f, np.sqrt((X - c[0]) ** 2 + (Y - c[1]) ** 2 + (Z - c[2]) ** 2) - rs)
    from vtkmodules.util.numpy_support import numpy_to_vtk
    img.GetPointData().SetScalars(numpy_to_vtk(f.ravel(order="F").astype(np.float32), deep=True))
    c = vtk.vtkContourFilter(); c.SetInputData(img); c.SetValue(0, 0.0); c.Update()
    return c.GetOutput()


def _RECTO(z):
    return np.full_like(z, 2.0, dtype=float)


def _linea(largo=40.0, n=81):
    z = np.linspace(4.0, largo - 4.0, n)
    return np.column_stack([np.zeros(n), np.zeros(n), z])


def _stent(diametro, linea):
    return deploy_stent_on_centerline(linea, np.full(len(linea), 2.0), stent_diameter_mm=diametro, braid=False)


def test_stent_mas_estrecho_queda_separado():
    linea = _linea()
    st = _stent(3.4, linea)
    r = annotate(st.stent_poly_data, _vaso(_RECTO), st.centerline_segment, voxel_mm=0.1)
    gap = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
    assert np.median(gap) == pytest.approx(0.3, abs=0.08)        # 2,0 − 1,7
    assert r.gap_area_pct > 95 and r.compressed_area_pct == 0
    assert r.proximal_gap_mm == pytest.approx(0.3, abs=0.1) and r.distal_gap_mm == pytest.approx(0.3, abs=0.1)


def test_stent_mas_ancho_queda_comprimido():
    linea = _linea()
    st = _stent(4.6, linea)
    r = annotate(st.stent_poly_data, _vaso(_RECTO), st.centerline_segment, voxel_mm=0.1)
    gap = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
    assert np.median(gap) == pytest.approx(-0.3, abs=0.08)       # 2,0 − 2,3
    assert r.compressed_area_pct > 95 and r.gap_area_pct == 0 and r.max_gap_mm == 0


def test_un_ensanchamiento_local_se_ve_solo_ahi():
    # Vaso de 2,0 mm de radio que llega a 3,0 entre z = 18 y z = 22.
    radio = lambda z: 2.0 + np.clip(1.0 - np.abs(z - 20.0) / 3.0, 0.0, None)   # noqa: E731
    linea = _linea()
    st = _stent(4.0, linea)
    annotate(st.stent_poly_data, _vaso(radio), st.centerline_segment, voxel_mm=0.1)
    P = vtk_to_numpy(st.stent_poly_data.GetPoints().GetData())
    gap = vtk_to_numpy(st.stent_poly_data.GetPointData().GetArray(SCALAR))
    centro, lejos = np.abs(P[:, 2] - 20.0) < 0.5, np.abs(P[:, 2] - 20.0) > 6.0
    assert np.median(gap[centro]) > 0.6          # la pared se aleja ~1 mm
    assert np.abs(np.median(gap[lejos])) < 0.12  # ajuste nominal fuera


def test_sobre_el_cuello_no_cuenta():
    saco = ((4.5, 0.0, 20.0), 3.5)
    linea = _linea()
    st = _stent(4.0, linea)
    vaso = _vaso(_RECTO, saco=saco)
    sin = annotate(st.stent_poly_data, vaso, st.centerline_segment, voxel_mm=0.1)
    st2 = _stent(4.0, linea)
    con = annotate(st2.stent_poly_data, vaso, st2.centerline_segment,
                   neck_center=(2.0, 0.0, 20.0), neck_mm=5.0, voxel_mm=0.1)
    assert sin.max_gap_mm > 1.0 and not sin.neck_excluded        # la boca cuenta como hueco
    assert con.neck_excluded and con.max_gap_mm < sin.max_gap_mm
    assert con.gap_area_pct < sin.gap_area_pct
    assert any("Sin cuello medido" in n for n in sin.notes)


class TestEndpoint:
    def test_el_stent_desplegado_lleva_el_mapa_y_el_resumen(self):
        sid = create_session()
        m = session_subdir(sid, "meshes")
        write_vtp(_vaso(_RECTO), m / "vessel_tree.vtp")
        linea = _linea()
        np.savez(m / "centerline_points.npz", points=linea, radii=np.full(len(linea), 2.0))
        write_states(sid, {"dicom.spacing_x": "0.1"})
        r = client.post(f"/api/cl-stent/{sid}", json={"session_id": sid, "stent_diameter_mm": 3.4,
                                                      "start_arc_mm": 5, "end_arc_mm": 25, "braid": True})
        assert r.status_code == 200, r.text
        a = r.json()["apposition"]
        assert a["gap_area_pct"] > 90 and a["noise_mm"] == 0.1
        assert a["max_gap_mm"] == pytest.approx(0.3, abs=0.12)
        guardado = read_vtp(m / "cl_stent.vtp")
        assert guardado.GetPointData().GetArray(SCALAR) is not None
