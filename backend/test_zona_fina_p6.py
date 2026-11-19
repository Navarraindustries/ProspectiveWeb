# -*- coding: utf-8 -*-
"""P6: la zona del cuello con todo el detalle (services.zona_fina).

Medido en Case 3 y Zenodo 015 (ver SIGMA_ZONA_FINA_VOX en
services.segmentation): la decimación no borra nada junto al cuello; lo que
borra las ramas finas es el desenfoque de 0,7 vóxeles antes de marching cubes.
Una rama de 1 × 2 vóxeles de sección queda por debajo de 0,5 con ese
desenfoque (≈ 0,44 en el eje) y por encima con el de la zona fina (≈ 0,65):
es el caso mínimo que estos tests reproducen.
"""
from __future__ import annotations

import json

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient
from vtkmodules.util.numpy_support import vtk_to_numpy

from services import zona_fina
from services.segmentation import mask_to_surface, read_vtp, surface_quality, write_vtp

SP = (0.3, 0.3, 0.3)


def _mascara():
    """Un tubo grueso a lo largo de x con una rama de 1 × 2 vóxeles hacia +y."""
    m = np.zeros((40, 64, 120), dtype=bool)
    zz, yy = np.mgrid[0:40, 0:64]
    tubo = (zz - 20) ** 2 + (yy - 20) ** 2 <= 36
    m[:, :, 4:116] = tubo[:, :, None]
    m[20, 25:52, 30:32] = True                       # la rama: z = 20 (1), x = 30–31 (2)
    return m


#: En mm (x, y, z): la base de la rama sobre el tubo, y puntos a lo largo de ella.
BASE = (30.5 * 0.3, 26 * 0.3, 20 * 0.3)
RAMA = np.array([(30.5 * 0.3, y * 0.3, 20 * 0.3) for y in range(32, 50, 2)])


def _dist_a(poly, pts):
    d = vtk.vtkImplicitPolyDataDistance(); d.SetInput(poly)
    return np.array([abs(d.EvaluateFunction(p)) for p in pts])


@pytest.fixture(scope="module")
def mallas():
    m = _mascara()
    prod = mask_to_surface(m, SP)
    fina = mask_to_surface(m, SP, zona_fina=(BASE, 8.0))
    return m, prod, fina


class TestSuperficie:

    def test_la_produccion_pierde_la_rama(self, mallas):
        _m, prod, _f = mallas
        assert np.median(_dist_a(prod, RAMA)) > 0.25

    def test_la_zona_fina_la_conserva(self, mallas):
        _m, _p, fina = mallas
        assert np.max(_dist_a(fina, RAMA)) < 0.25

    def test_sigue_cerrada_y_en_una_pieza(self, mallas):
        _m, _p, fina = mallas
        q = surface_quality(fina)
        assert q["boundary_edges"] == 0
        assert q["components"] == 1

    def test_fuera_de_la_zona_no_cambia(self, mallas):
        """A más de radio + rampa + unos mm, la superficie es la misma."""
        _m, prod, fina = mallas
        P = vtk_to_numpy(fina.GetPoints().GetData())
        lejos = P[np.linalg.norm(P - np.array(BASE), axis=1) > 13.0]
        assert len(lejos) > 100
        assert np.percentile(_dist_a(prod, lejos), 99) < 0.05

    def test_sin_zona_es_la_misma_malla(self):
        """Una zona que no toca nada deja la malla igual que sin zona."""
        m = _mascara()
        a = mask_to_surface(m, SP)
        b = mask_to_surface(m, SP, zona_fina=((-50.0, -50.0, -50.0), 5.0))
        assert a.GetNumberOfPoints() == b.GetNumberOfPoints()

    def test_dentro_de_la_zona_no_se_decima(self):
        from services.segmentation import _decimate_outside
        s = vtk.vtkSphereSource(); s.SetThetaResolution(60); s.SetPhiResolution(60); s.Update()
        tf = vtk.vtkTriangleFilter(); tf.SetInputData(s.GetOutput()); tf.Update()
        esfera = tf.GetOutput()
        c = np.array([0.5, 0.0, 0.0])
        out = _decimate_outside(esfera, 0.6, tuple(c), 0.25)
        P0 = vtk_to_numpy(esfera.GetPoints().GetData())
        P1 = vtk_to_numpy(out.GetPoints().GetData())
        dentro = P0[np.linalg.norm(P0 - c, axis=1) <= 0.25]
        # Cada vértice de la zona sigue ahí, en el mismo sitio.
        from scipy.spatial import cKDTree
        d, _ = cKDTree(P1).query(dentro)
        assert d.max() < 1e-6
        assert out.GetNumberOfPoints() < esfera.GetNumberOfPoints()
        assert surface_quality(out)["boundary_edges"] == 0


class TestMascaraGuardada:

    def test_ida_y_vuelta(self, tmp_path):
        m = _mascara()
        zona_fina.guardar(tmp_path, {"mask": m, "spacing": SP, "shift_xyz": (1.0, 2.0, 3.0),
                                     "surface_kw": {"smooth_iters": 40, "pass_band": 0.05},
                                     "refine": None}, "123:456", main_tree=True)
        d = zona_fina.cargar(tmp_path)
        assert np.array_equal(d["mask"], m)
        assert d["shift_xyz"] == [1.0, 2.0, 3.0] and d["huella"] == "123:456" and d["main_tree"]
        # Bits empaquetados y comprimidos: ocupa una fracción de un byte por vóxel.
        assert (tmp_path / zona_fina.NOMBRE).stat().st_size < m.size / 20

    def test_sin_fichero_no_hay_mascara(self, tmp_path):
        assert zona_fina.cargar(tmp_path) is None

    def test_rehacer_respeta_la_traslacion(self):
        m = _mascara()
        datos = {"mask": m, "spacing": SP, "shift_xyz": [10.0, 0.0, -5.0],
                 "surface_kw": {"smooth_iters": 40, "pass_band": 0.05}, "refine": None}
        centro = (BASE[0] + 10.0, BASE[1], BASE[2] - 5.0)          # en el marco de la malla
        poly = zona_fina.rehacer(datos, centro, 8.0)
        assert np.max(_dist_a(poly, RAMA + np.array([10.0, 0.0, -5.0]))) < 0.25

    def test_la_receta_de_vasos_pide_el_volumen(self):
        datos = {"mask": _mascara(), "spacing": SP, "shift_xyz": [0, 0, 0],
                 "surface_kw": {}, "refine": {"background_hu": 0, "low_hu": 100, "cap_hu": 150}}
        with pytest.raises(ValueError):
            zona_fina.rehacer(datos, BASE, 8.0)


class TestAjuste:

    def _isla(self):
        s = vtk.vtkSphereSource(); s.SetCenter(9.0, 18.0, -6.0); s.SetRadius(1.5); s.Update()
        tf = vtk.vtkTriangleFilter(); tf.SetInputData(s.GetOutput()); tf.Update()
        return tf.GetOutput()

    def test_se_queda_con_la_pieza_mayor_si_la_segmentacion_lo_hizo(self, mallas):
        _m, prod, fina = mallas
        ap = vtk.vtkAppendPolyData(); ap.AddInputData(fina); ap.AddInputData(self._isla()); ap.Update()
        from routers.segment import mesh_fingerprint
        out = zona_fina.ajustar(ap.GetOutput(), prod, {"main_tree": True}, BASE, 8.0, {mesh_fingerprint(prod)})
        assert surface_quality(out)["components"] == 1

    def test_respeta_un_recorte(self, mallas):
        """Malla de trabajo recortada (x < 22 mm, la zona llega a 17): lo de fuera no vuelve."""
        _m, prod, fina = mallas
        from services.mesh_crop import clip_box
        recortada = clip_box(prod, -1, 22.0, -1, 30, -1, 30)
        out = zona_fina.ajustar(fina, recortada, {"main_tree": False}, BASE, 8.0, {"otra"})
        P = vtk_to_numpy(out.GetPoints().GetData())
        assert vtk_to_numpy(fina.GetPoints().GetData())[:, 0].max() > 30.0
        assert P[:, 0].max() < 22.0 + zona_fina.TOLERANCIA_EDICION_MM + 0.5
        assert np.max(_dist_a(out, RAMA)) < 0.25                  # la rama, dentro de la zona, sigue


# ── Endpoint ──────────────────────────────────────────────────────────────── #

@pytest.fixture()
def client():
    from main import app
    return TestClient(app, raise_server_exceptions=True)


def _sesion(con_mascara=True, con_cuello=True):
    from routers.segment import mesh_fingerprint
    from services.sessions import create_session, session_subdir, write_states
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    m = _mascara()
    prod = mask_to_surface(m, SP)
    write_vtp(prod, meshes / "vessel_tree.vtp")
    if con_mascara:
        zona_fina.guardar(meshes, {"mask": m, "spacing": SP, "shift_xyz": (0, 0, 0),
                                   "surface_kw": {"smooth_iters": 40, "pass_band": 0.05},
                                   "refine": None}, mesh_fingerprint(prod), main_tree=True)
    if con_cuello:
        write_states(sid, {f"morpho.neck_origin_{k}": str(v) for k, v in zip("xyz", BASE)})
    return sid, prod


class TestEndpoint:

    def test_rehace_el_cuello(self, client):
        sid, prod = _sesion()
        r = client.post(f"/api/mesh-neck-detail/{sid}", json={"radius_mm": 8})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["neck_source"] == "morfometria" and j["radius_mm"] == 8
        assert j["added_vertices"] > 0 and j["undo_depth"] >= 1
        from services.sessions import read_state, session_subdir
        nueva = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert np.max(_dist_a(nueva, RAMA)) < 0.25
        assert surface_quality(nueva)["boundary_edges"] == 0
        estado = json.loads(read_state(sid, "seg.neck_detail", ""))
        assert estado["radius_mm"] == 8 and estado["huella"]
        # El panel de ramas lo sabe.
        p = client.get(f"/api/perforators/{sid}").json()
        assert p["neck_detail_radius_mm"] == 8 and p["neck_detail_available"]

    def test_rehacerla_otra_vez_no_cuenta_como_edicion(self, client):
        """Con otro radio se rehace desde la máscara, sin recortar por cercanía."""
        sid, _ = _sesion()
        assert client.post(f"/api/mesh-neck-detail/{sid}", json={"radius_mm": 8}).status_code == 200
        r = client.post(f"/api/mesh-neck-detail/{sid}", json={"radius_mm": 12})
        assert r.status_code == 200
        from services.sessions import session_subdir
        q = surface_quality(read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp"))
        assert q["boundary_edges"] == 0 and q["components"] == 1

    def test_se_deshace(self, client):
        sid, prod = _sesion()
        client.post(f"/api/mesh-neck-detail/{sid}", json={"radius_mm": 8})
        r = client.post(f"/api/mesh-restore/{sid}", json={"scope": "undo"})
        assert r.status_code == 200, r.text
        from services.sessions import session_subdir
        assert read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp").GetNumberOfPoints() == prod.GetNumberOfPoints()

    def test_sin_mascara_409(self, client):
        sid, _ = _sesion(con_mascara=False)
        r = client.post(f"/api/mesh-neck-detail/{sid}", json={})
        assert r.status_code == 409 and "segmentar" in r.json()["detail"]

    def test_sin_cuello_409(self, client):
        sid, _ = _sesion(con_cuello=False)
        r = client.post(f"/api/mesh-neck-detail/{sid}", json={})
        assert r.status_code == 409 and "morfometría" in r.json()["detail"]

    def test_radio_fuera_de_rango_422(self, client):
        sid, _ = _sesion()
        assert client.post(f"/api/mesh-neck-detail/{sid}", json={"radius_mm": 50}).status_code == 422
