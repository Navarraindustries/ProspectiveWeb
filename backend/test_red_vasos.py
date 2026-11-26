"""Red de líneas centrales del árbol (TEASAR sobre la máscara por cortes)."""
from __future__ import annotations

import os
import tempfile
import time

_tmp = tempfile.mkdtemp(prefix="prospective_red_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.distancia_malla import DistanciaFirmada
from services.red_vasos import extraer_red
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir
from test_centerline_sin_camino import _malla

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _dentro(malla, red) -> np.ndarray:
    d = DistanciaFirmada(malla)
    return np.array([d.EvaluateFunction(*q) for t in red.tramos for q in t.puntos])


def test_bifurcacion_en_y():
    m = _malla([((0, 0, 0), (20, 0, 0), 1.5), ((20, 0, 0), (34, 10, 0), 1.0), ((20, 0, 0), (34, -10, 0), 1.0)])
    red = extraer_red(m)
    assert len(red.uniones) == 1
    assert len(red.extremos) == 3
    assert len(red.tramos) == 3
    u = np.array(red.uniones[0])
    assert np.linalg.norm(u - (20, 0, 0)) < 2.0
    assert (_dentro(m, red) < 0).all()
    largos = sorted(t.largo_mm for t in red.tramos)
    assert largos[-1] == pytest.approx(20, abs=3)          # la madre, hasta la tapa
    radios = sorted(float(np.median(t.radios)) for t in red.tramos)
    assert radios[-1] == pytest.approx(1.5, abs=0.15) and radios[0] == pytest.approx(1.0, abs=0.15)


def test_vaso_grueso_un_solo_camino():
    """En un vaso grueso el eje es una cresta de varios vóxeles: sin el
    enganche a la red salían caminos paralelos duplicados."""
    m = _malla([((0, 0, 0), (40, 0, 0), 3.0)])
    red = extraer_red(m)
    assert len(red.tramos) == 1 and len(red.uniones) == 0 and len(red.extremos) == 2
    assert red.largo_total_mm == pytest.approx(40, abs=3)
    assert (_dentro(m, red) < 0).all()


def test_un_bulto_de_la_pared_no_es_una_rama():
    m = _malla([((0, 0, 0), (40, 0, 0), 2.0), ((20, 0, 0), (20, 2.6, 0), 0.9)])
    red = extraer_red(m)
    assert len(red.uniones) == 0 and len(red.tramos) == 1


def test_una_rama_fina_de_verdad_se_queda():
    m = _malla([((0, 0, 0), (40, 0, 0), 2.0), ((20, 0, 0), (20, 12, 0), 0.8)])
    red = extraer_red(m)
    assert len(red.uniones) == 1 and len(red.extremos) == 3
    rama = min(red.tramos, key=lambda t: float(np.median(t.radios)))
    assert float(np.median(rama.radios)) == pytest.approx(0.8, abs=0.15)
    assert rama.largo_mm == pytest.approx(12.8, abs=1.5)      # del eje del tronco a la punta redonda


def _sesion() -> str:
    sid = create_session()
    m = _malla([((0, 0, 0), (20, 0, 0), 1.5), ((20, 0, 0), (34, 10, 0), 1.0), ((20, 0, 0), (34, -10, 0), 1.0)])
    write_vtp(m, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def test_api_da_la_red_y_la_guarda():
    sid = _sesion()
    r = client.post(f"/api/mesh/{sid}/red", params={"name": "vessel_tree.vtp"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "/vessel_tree.red.vtp?v=" in body["url"]
    assert (body["tramos"], body["uniones"], body["extremos"]) == (3, 1, 3)
    dst = session_subdir(sid, "meshes") / "vessel_tree.red.vtp"
    pd = read_vtp(dst)
    assert pd.GetPointData().GetArray("colores") is not None
    antes = dst.stat().st_mtime
    assert client.post(f"/api/mesh/{sid}/red", params={"name": "vessel_tree.vtp"}).json() == body
    assert dst.stat().st_mtime == antes
    time.sleep(0.05)
    write_vtp(read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp"), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    client.post(f"/api/mesh/{sid}/red", params={"name": "vessel_tree.vtp"})
    assert dst.stat().st_mtime > antes


def test_api_nombres_raros_422_y_mallas_que_no_hay_404():
    sid = _sesion()
    for nombre in ("../x.vtp", "vessel_tree.suave.vtp", "vessel_tree.red.vtp", "vessel_tree.calibre.vtp", "a/b.vtp"):
        assert client.post(f"/api/mesh/{sid}/red", params={"name": nombre}).status_code in (404, 422), nombre
    assert client.post(f"/api/mesh/{sid}/red", params={"name": "nada.vtp"}).status_code == 404


def test_api_sin_usuario_401():
    sid = _sesion()
    assert anonymous_client(app).post(f"/api/mesh/{sid}/red", params={"name": "vessel_tree.vtp"}).status_code == 401
