"""Tests for the surgical approach trajectory (Feature 3)."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_traj_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.sessions import create_session, write_state
from services.report_generator import read_trajectory_state, build_report_data_from_session

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


class TestEndpoint:
    def test_save_returns_depth(self):
        sid = create_session()
        r = client.post(f"/api/trajectory/{sid}", json={
            "entry": {"x": 0, "y": 0, "z": 0}, "target": {"x": 3, "y": 4, "z": 0},
        })
        assert r.status_code == 200, r.text
        assert abs(r.json()["depth_mm"] - 5.0) < 0.05  # 3-4-5 triangle

    def test_state_roundtrip_and_clear(self):
        sid = create_session()
        client.post(f"/api/trajectory/{sid}", json={
            "entry": {"x": 1, "y": 2, "z": 3}, "target": {"x": 4, "y": 6, "z": 3},
        })
        tr = read_trajectory_state(sid)
        assert tr["entry"] == [1.0, 2.0, 3.0]
        assert tr["target"] == [4.0, 6.0, 3.0]
        assert abs(tr["depth_mm"] - 5.0) < 0.05

        r = client.delete(f"/api/trajectory/{sid}")
        assert r.status_code == 204
        assert read_trajectory_state(sid) == {}

    def test_angle_vs_principal_axis(self):
        sid = create_session()
        # Approach along +x; principal axis along +x → incidence angle 0°.
        write_state(sid, "morpho.axis_x", "1")
        write_state(sid, "morpho.axis_y", "0")
        write_state(sid, "morpho.axis_z", "0")
        client.post(f"/api/trajectory/{sid}", json={
            "entry": {"x": 0, "y": 0, "z": 0}, "target": {"x": 10, "y": 0, "z": 0},
        })
        assert read_trajectory_state(sid)["angle_deg"] < 1.0

    def test_report_data_includes_trajectory(self):
        sid = create_session()
        client.post(f"/api/trajectory/{sid}", json={
            "entry": {"x": 0, "y": 0, "z": 0}, "target": {"x": 0, "y": 0, "z": 12},
        })
        data = build_report_data_from_session(sid)
        assert data.trajectory  # non-empty
        assert data.trajectory["target"] == [0.0, 0.0, 12.0]
        assert abs(data.trajectory["depth_mm"] - 12.0) < 0.05

    def test_no_trajectory_empty(self):
        sid = create_session()
        assert read_trajectory_state(sid) == {}
        assert build_report_data_from_session(sid).trajectory == {}

    def test_unknown_session_404(self):
        r = client.post("/api/trajectory/nope", json={
            "entry": {"x": 0, "y": 0, "z": 0}, "target": {"x": 1, "y": 1, "z": 1},
        })
        assert r.status_code == 404


# ── F1-247: el corredor guardado vuelve, y sabe si sigue al día ───────────── #

def _sesion_con_malla() -> str:
    import vtk
    from services.segmentation import write_vtp
    from services.sessions import session_subdir
    src = vtk.vtkSphereSource()
    src.SetRadius(10.0); src.SetThetaResolution(16); src.SetPhiResolution(16); src.Update()
    sid = create_session()
    write_vtp(src.GetOutput(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def _guardar_trayectoria(sid: str) -> dict:
    r = client.post(f"/api/trajectory/{sid}", json={
        "entry": {"x": 40, "y": 0, "z": 0}, "target": {"x": 0, "y": 0, "z": 0},
    })
    assert r.status_code == 200, r.text
    return r.json()


def _reanudar(sid: str) -> dict:
    assert client.post("/api/sessions/save", json={
        "session_id": sid, "current_step": 5, "label": "t"}).status_code == 200
    r = client.post(f"/api/sessions/{sid}/restore")
    assert r.status_code == 200, r.text
    return r.json()


class TestCorredorGuardado:
    def test_guardar_escribe_el_analisis_y_vuelve_al_reanudar(self):
        from services.sessions import read_state
        sid = _sesion_con_malla()
        puesto = _guardar_trayectoria(sid)
        assert puesto["corridor"] is not None and puesto["stale"] is False
        # Lo que escribe la ruta, no una clave puesta a mano.
        assert read_state(sid, "trajectory.corridor_json", "")
        assert read_state(sid, "trajectory.verdict", "") == puesto["corridor"]["verdict"]
        r = _reanudar(sid)
        assert r["trajectory"]["corridor"] == puesto["corridor"]
        assert r["trajectory"]["stale"] is False
        assert r["trajectory"]["angle_deg"] == puesto["angle_deg"]

    def test_cambiar_la_malla_deja_el_corredor_desfasado(self):
        """El veredicto se midió sobre la malla de antes: tras recortarla no
        puede volver como «Guardada ✓» (ni seguir en el informe)."""
        from services.sessions import read_state
        sid = _sesion_con_malla()
        _guardar_trayectoria(sid)
        crop = client.post(f"/api/mesh-crop/{sid}", json={
            "mode": "sphere", "center": {"x": 10, "y": 0, "z": 0}, "radius": 6.0, "invert": False})
        assert crop.status_code == 200, crop.text
        for k in ("corridor_json", "verdict", "verdict_reason", "findings"):
            assert read_state(sid, f"trajectory.{k}", "") == "", k
        # Los puntos siguen: son del cirujano, no de la malla.
        assert read_state(sid, "trajectory.entry_x", "") == "40.0"
        tr = client.get(f"/api/trajectory/{sid}").json()
        assert tr["stale"] is True and tr["corridor"] is None
        assert _reanudar(sid)["trajectory"]["stale"] is True

    def test_volver_a_guardar_la_pone_al_dia(self):
        sid = _sesion_con_malla()
        _guardar_trayectoria(sid)
        client.post(f"/api/mesh-crop/{sid}", json={
            "mode": "sphere", "center": {"x": 10, "y": 0, "z": 0}, "radius": 6.0, "invert": False})
        assert _guardar_trayectoria(sid)["stale"] is False
        assert client.get(f"/api/trajectory/{sid}").json()["stale"] is False

    def test_sin_malla_no_hay_nada_que_este_desfasado(self):
        sid = create_session()
        assert _guardar_trayectoria(sid)["stale"] is False
        assert client.get(f"/api/trajectory/{sid}").json()["stale"] is False
