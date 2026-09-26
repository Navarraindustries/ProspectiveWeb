"""The neck plane has to be inspectable, and a runaway sac has to say so.

Two defects these pin, both found while a user tried to verify a measurement
they did not trust:

1. The API reported `neck_origin` (a value derived from the sac's PCA) but never
   the plane actually used, so the 3D annotation rebuilt a neck ring from the
   principal axis. On an oblique neck — the exact case the rim fit exists for —
   the ring drawn was NOT the plane that measured the neck, and there was no way
   to see where the plane had landed.

2. When the neck plane sits below the true rim, the isolation keeps everything
   on the dome side and swallows the parent artery. That produced a 14 mm
   "aneurysm" from a candidate detected at 3.9 mm, reported with a green OK
   badge and no warning at all.
"""
from __future__ import annotations

import math
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_neckfb_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _sac_on_a_vessel() -> vtk.vtkPolyData:
    """A small dome sitting on a long straight artery — the shape at issue."""
    line = vtk.vtkLineSource()
    line.SetPoint1(-25.0, 0.0, 0.0)
    line.SetPoint2(25.0, 0.0, 0.0)
    line.SetResolution(80)
    line.Update()
    tube = vtk.vtkTubeFilter()
    tube.SetInputData(line.GetOutput())
    tube.SetRadius(2.0)
    tube.SetNumberOfSides(24)
    tube.CappingOn()
    tube.Update()

    dome = vtk.vtkSphereSource()
    dome.SetRadius(2.6)
    dome.SetCenter(0.0, 0.0, 2.6)
    dome.SetThetaResolution(30)
    dome.SetPhiResolution(30)
    dome.Update()

    app_ = vtk.vtkAppendPolyData()
    app_.AddInputData(tube.GetOutput())
    app_.AddInputData(dome.GetOutput())
    app_.Update()
    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(app_.GetOutput())
    clean.Update()
    return clean.GetOutput()


def _session_with_sac() -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    poly = _sac_on_a_vessel()
    write_vtp(poly, meshes / "vessel_tree.vtp")
    write_vtp(poly, meshes / "candidate_001.vtp")
    write_state(sid, "detect.best_vtp_name", "candidate_001.vtp")
    write_state(sid, "detect.n_candidates", "1")
    return sid


def _neck_plane(sid: str, *, rim: list[tuple[float, float, float]], apex: tuple[float, float, float]):
    # `normal` is required by the schema but ignored once >= 3 rim points are
    # given: the fit takes the orientation from the points themselves.
    body = {
        "origin": {"x": rim[0][0], "y": rim[0][1], "z": rim[0][2]},
        "normal": [0.0, 0.0, 1.0],
        "dome_seed": {"x": apex[0], "y": apex[1], "z": apex[2]},
        "rim_points": [{"x": p[0], "y": p[1], "z": p[2]} for p in rim],
    }
    return client.post(f"/api/morphometry/{sid}/neck-plane", json=body)


class TestThePlaneIsReportedBack:
    def test_a_fitted_plane_travels_with_the_result(self):
        # Without this the UI can only guess where the plane went.
        sid = _session_with_sac()
        r = _neck_plane(
            sid,
            rim=[(2.0, 0.0, 1.4), (-2.0, 0.0, 1.4), (0.0, 2.0, 1.4), (0.0, -2.0, 1.4)],
            apex=(0.0, 0.0, 5.0),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["plane_origin"] is not None, "the plane used has to come back"
        assert body["plane_normal"] is not None

    def test_the_reported_normal_is_a_unit_vector_pointing_at_the_dome(self):
        sid = _session_with_sac()
        body = _neck_plane(
            sid,
            rim=[(2.0, 0.0, 1.4), (-2.0, 0.0, 1.4), (0.0, 2.0, 1.4), (0.0, -2.0, 1.4)],
            apex=(0.0, 0.0, 5.0),
        ).json()
        n = body["plane_normal"]
        length = math.sqrt(n["x"] ** 2 + n["y"] ** 2 + n["z"] ** 2)
        assert abs(length - 1.0) < 1e-6, "the annotation rotates by it, so it must be unit"
        # The rim ring lies in z = 1.4 and the apex is above it, so the normal
        # must point up. A normal pointing away from the dome would make the
        # annotation draw the plane the wrong way round.
        assert n["z"] > 0.5

    def test_the_automatic_path_reports_no_plane(self):
        # Nothing was placed, so there is no plane to draw; saying "none" is the
        # honest answer, not echoing a PCA-derived stand-in as if it were one.
        sid = _session_with_sac()
        r = client.get(f"/api/morphometry/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["plane_origin"] is None
        assert r.json()["plane_normal"] is None


class TestARunawaySacSaysSo:
    def test_a_neck_wider_than_the_sac_is_called_out(self):
        # A plane cut well below the dome's base takes a wide slice of artery as
        # its "neck", so the neck comes back wider than the whole sac — the mouth
        # bigger than the thing it opens. Before this it was reported in silence,
        # with green OK badges on every ratio derived from it.
        sid = _session_with_sac()
        body = _neck_plane(
            sid,
            rim=[(6.0, 0.0, -1.6), (-6.0, 0.0, -1.6), (0.0, 6.0, -1.6), (0.0, -6.0, -1.6)],
            apex=(0.0, 0.0, 4.6),
        ).json()
        assert body["neck_mm"] > body["max_diameter_mm"], "fixture no longer reproduces the case"
        assert body["warning"], "an impossible neck must not be reported in silence"
        assert "imposible" in body["warning"]

    def test_a_plane_at_the_neck_measures_the_dome_and_not_the_artery(self):
        sid = _session_with_sac()
        body = _neck_plane(
            sid,
            rim=[(1.8, 0.0, 1.5), (-1.8, 0.0, 1.5), (0.0, 1.8, 1.5), (0.0, -1.8, 1.5)],
            apex=(0.0, 0.0, 5.0),
        ).json()
        # The dome is Ø 5.2 mm; the artery it sits on is 50 mm long. Anything
        # approaching that length means the artery came along.
        assert body["max_diameter_mm"] < 20.0, "the sac must not span the artery"


class TestTheMarkedPointsSurvive:
    """The rim points cost real effort to place; losing them on resume is a cost.

    The plane can be rebuilt from its origin and normal, so the MEASUREMENT was
    always safe. What was not saved were the marks themselves, so a resumed
    session showed a neck plane with nothing behind it and refining it meant
    marking the rim again from scratch.
    """

    def test_the_points_come_back_with_the_measurement(self):
        sid = _session_with_sac()
        rim = [(2.0, 0.0, 1.4), (-2.0, 0.0, 1.4), (0.0, 2.0, 1.4), (0.0, -2.0, 1.4)]
        _neck_plane(sid, rim=rim, apex=(0.0, 0.0, 5.0))

        body = client.get(f"/api/morphometry/{sid}").json()
        got = [(p["x"], p["y"], p["z"]) for p in body["rim_points"]]
        assert got == rim

    def test_they_survive_a_save_and_restore(self):
        from services.sessions import rehydrate_session, snapshot_session

        sid = _session_with_sac()
        rim = [(1.8, 0.0, 1.5), (-1.8, 0.0, 1.5), (0.0, 1.8, 1.5)]
        before = _neck_plane(sid, rim=rim, apex=(0.0, 0.0, 5.0)).json()
        snapshot_session(sid)
        after = client.get(f"/api/morphometry/{rehydrate_session(sid)}").json()

        assert [(p["x"], p["y"], p["z"]) for p in after["rim_points"]] == rim
        # And the measurement itself is unchanged, which was already true.
        assert after["neck_mm"] == before["neck_mm"]
        assert after["neck_source"] == "rim"

    def test_the_automatic_path_reports_no_marks(self):
        sid = _session_with_sac()
        assert client.get(f"/api/morphometry/{sid}").json()["rim_points"] == []


# ── El plano se reintenta antes de rendirse ──────────────────────────────── #

def _sac_above_a_gap() -> vtk.vtkPolyData:
    """Una arteria recta y, 1,5 mm por encima, la cúpula de un saco.

    El hueco es lo que hace de este un caso reproducible: un plano puesto en él
    no corta ninguna pared cerca del domo, así que no hay contorno de cuello y
    el aislamiento fracasa, igual que cuando el clic cae un milímetro fuera
    del cuello en una malla real.
    """
    line = vtk.vtkLineSource()
    line.SetPoint1(-25.0, 0.0, 0.0)
    line.SetPoint2(25.0, 0.0, 0.0)
    line.SetResolution(80)
    line.Update()
    tube = vtk.vtkTubeFilter()
    tube.SetInputData(line.GetOutput())
    tube.SetRadius(2.0)               # la pared de arriba queda en z = 2
    tube.SetNumberOfSides(24)
    tube.CappingOn()
    tube.Update()

    dome = vtk.vtkSphereSource()
    dome.SetRadius(2.6)
    dome.SetCenter(0.0, 0.0, 6.1)     # su fondo queda en z = 3,5
    dome.SetThetaResolution(30)
    dome.SetPhiResolution(30)
    dome.Update()

    app_ = vtk.vtkAppendPolyData()
    app_.AddInputData(tube.GetOutput())
    app_.AddInputData(dome.GetOutput())
    app_.Update()
    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(app_.GetOutput())
    clean.Update()
    return clean.GetOutput()


@pytest.fixture
def sesion_con_saco():
    """Sesión con un tubo y un saco, y un plano (z = 4, normal +z) que SÍ aísla.

    Un milímetro por debajo (z = 3) el plano cae en el hueco entre la arteria
    y el saco y no aísla nada.
    """
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    poly = _sac_above_a_gap()
    write_vtp(poly, meshes / "vessel_tree.vtp")
    write_vtp(poly, meshes / "candidate_001.vtp")
    write_state(sid, "detect.best_vtp_name", "candidate_001.vtp")
    write_state(sid, "detect.n_candidates", "1")
    return sid, (0.0, 0.0, 4.0), (0.0, 0.0, 1.0)


def _plano(sid, origin, normal):
    return client.post(f"/api/morphometry/{sid}/neck-plane",
                       json={"origin": {"x": origin[0], "y": origin[1], "z": origin[2]},
                             "normal": list(normal)})


class TestReintentoDelPlano:
    def test_un_origen_un_milimetro_fuera_del_cuello_se_corrige_solo(self, sesion_con_saco):
        # `sesion_con_saco` es el fixture del archivo que deja un tubo con un saco y
        # un plano que SÍ aísla; aquí se desplaza el origen 1 mm hacia el vaso.
        sid, origin, normal = sesion_con_saco
        malo = [origin[i] - 1.0 * normal[i] for i in range(3)]
        r = _plano(sid, malo, normal)
        assert r.status_code == 200, r.text
        from services.sessions import read_state
        assert abs(float(read_state(sid, "morpho.neck_shift_mm", "0"))) == 1.0
        # Y viaja en la respuesta, con el plano que de verdad se usó.
        body = r.json()
        assert body["neck_shift_mm"] == 1.0
        assert abs(body["plane_origin"]["z"] - origin[2]) < 1e-6

    def test_un_plano_que_ya_aisla_no_se_mueve(self, sesion_con_saco):
        sid, origin, normal = sesion_con_saco
        r = _plano(sid, origin, normal)
        assert r.status_code == 200, r.text
        from services.sessions import read_state
        assert float(read_state(sid, "morpho.neck_shift_mm", "")) == 0.0
        assert r.json()["neck_shift_mm"] == 0.0

    def test_un_plano_a_mas_de_dos_milimetros_sigue_fallando(self, sesion_con_saco):
        # Los desplazamientos tienen tope: un plano por encima de la cúpula
        # (que acaba en z = 8,7) no se "arregla" corriendo por el árbol hasta
        # dar con algo; con ±2 mm desde z = 15 sigue sin cortar nada.
        sid, _origin, normal = sesion_con_saco
        r = _plano(sid, (0.0, 0.0, 15.0), normal)
        assert r.status_code == 422, r.text
        assert "±2 mm" in r.json()["detail"]


def _tubo_vertical(radio: float, z0: float, z1: float) -> vtk.vtkPolyData:
    line = vtk.vtkLineSource()
    line.SetPoint1(0.0, 0.0, z0)
    line.SetPoint2(0.0, 0.0, z1)
    line.SetResolution(80)
    line.Update()
    tube = vtk.vtkTubeFilter()
    tube.SetInputData(line.GetOutput())
    tube.SetRadius(radio)
    tube.SetNumberOfSides(24)
    tube.CappingOn()
    tube.Update()
    return tube.GetOutput()


def _sesion_con(poly: vtk.vtkPolyData) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    write_vtp(poly, meshes / "vessel_tree.vtp")
    write_vtp(poly, meshes / "candidate_001.vtp")
    write_state(sid, "detect.best_vtp_name", "candidate_001.vtp")
    write_state(sid, "detect.n_candidates", "1")
    return sid


class TestElUmbralDelReintento:
    def test_un_cuello_de_decimas_no_basta_y_se_sigue_probando(self):
        # Un pedúnculo de 0,8 mm entra en el saco por debajo. El plano en él
        # "aísla" algo, pero con un cuello de décimas: es el borde rasante, no
        # el cuello. Con el umbral de antes (1 mm) se sigue probando, y 1 mm
        # más arriba el plano corta la cúpula.
        app_ = vtk.vtkAppendPolyData()
        app_.AddInputData(_sac_above_a_gap())
        app_.AddInputData(_tubo_vertical(0.4, 2.0, 3.8))
        app_.Update()
        sid = _sesion_con(app_.GetOutput())
        r = _plano(sid, (0.0, 0.0, 3.0), (0.0, 0.0, 1.0))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["neck_shift_mm"] == 1.0
        assert body["neck_mm"] >= 1.0

    def test_si_ninguno_llega_a_un_milimetro_se_devuelve_el_mejor_marcado(self):
        # Un vaso de 0,8 mm: ningún desplazamiento da un cuello de 1 mm. En vez
        # de un 422 que no dice nada, sale el mejor intento con el cuello
        # marcado como no válido.
        sid = _sesion_con(_tubo_vertical(0.4, -10.0, 10.0))
        r = _plano(sid, (0.0, 0.0, 0.0), (0.0, 0.0, 1.0))
        assert r.status_code == 200, r.text
        body = r.json()
        assert 0.0 < body["neck_mm"] < 1.0
        assert body["neck_valid"] is False
        assert body["warning"]


class TestElDesplazamientoSobreviveAlReanudar:
    def test_reproducir_el_plano_guardado_devuelve_el_desplazamiento_original(self, sesion_con_saco):
        # El origen guardado ya es el desplazado; al reproducirlo no se mueve,
        # pero lo que hay que contar es cuánto se movió respecto al clic.
        sid, origin, normal = sesion_con_saco
        malo = [origin[i] - 1.0 * normal[i] for i in range(3)]
        assert _plano(sid, malo, normal).json()["neck_shift_mm"] == 1.0

        r = client.get(f"/api/morphometry/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["neck_shift_mm"] == 1.0
        from services.sessions import read_state
        assert float(read_state(sid, "morpho.neck_shift_mm", "0")) == 1.0
