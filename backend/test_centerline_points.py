"""Los puntos de la línea central (spec §7.1): el cliente los recorre y la gráfica de calibre lleva a ellos."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_clp_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _session_with_points(pts, radii) -> str:
    sid = create_session()
    np.savez(session_subdir(sid, "meshes") / "centerline_points.npz",
             points=np.asarray(pts, dtype=np.float32), radii=np.asarray(radii, dtype=np.float32))
    return sid


def test_devuelve_puntos_radios_y_arco_acumulado():
    sid = _session_with_points([[0, 0, 0], [0, 0, 1], [0, 0, 3]], [1.0, 1.5, 2.0])
    r = client.get(f"/api/centerline/{sid}/points")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["points"] == [{"x": 0, "y": 0, "z": 0}, {"x": 0, "y": 0, "z": 1}, {"x": 0, "y": 0, "z": 3}]
    assert body["radii_mm"] == [1.0, 1.5, 2.0]
    assert body["arc_mm"] == [0.0, 1.0, 3.0]


def test_sin_linea_central_404():
    sid = create_session()
    assert client.get(f"/api/centerline/{sid}/points").status_code == 404


def test_sesion_inexistente_404():
    assert client.get("/api/centerline/no-existe/points").status_code == 404


def test_menos_de_dos_puntos_409():
    sid = _session_with_points([[0, 0, 0]], [1.0])
    assert client.get(f"/api/centerline/{sid}/points").status_code == 409


def test_sin_usuario_401():
    sid = _session_with_points([[0, 0, 0], [0, 0, 1]], [1.0, 1.0])
    assert anonymous_client(app).get(f"/api/centerline/{sid}/points").status_code == 401


def test_fichero_ilegible_409_sin_eco_de_la_excepcion():
    sid = create_session()
    (session_subdir(sid, "meshes") / "centerline_points.npz").write_bytes(b"esto no es un npz")
    r = client.get(f"/api/centerline/{sid}/points")
    assert r.status_code == 409
    assert r.json()["detail"] == "La línea central guardada no se puede leer."


def test_radios_y_puntos_de_distinta_longitud_409():
    sid = _session_with_points([[0, 0, 0], [0, 0, 1], [0, 0, 2]], [1.0, 1.0])
    r = client.get(f"/api/centerline/{sid}/points")
    assert r.status_code == 409
    assert r.json()["detail"] == "La línea central guardada es inconsistente."
