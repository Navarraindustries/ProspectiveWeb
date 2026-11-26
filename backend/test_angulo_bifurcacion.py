"""Ángulo de bifurcación guiado (madre + dos hijas) sobre fantomas de ángulo conocido."""
from __future__ import annotations

import math

import numpy as np
import pytest
import vtk

from services.angulo_bifurcacion import medir_bifurcacion
from test_centerline_sin_camino import _malla


def _y(semi_deg: float, r_madre=1.5, r_hija=1.1, largo=16.0, asim_deg: float | None = None):
    """Madre por -x hasta el origen; hijas a ±semi_deg del eje x (asim_deg: la 2.ª a otro ángulo)."""
    a2 = semi_deg if asim_deg is None else asim_deg
    h1 = (largo * math.cos(math.radians(semi_deg)), largo * math.sin(math.radians(semi_deg)), 0.0)
    h2 = (largo * math.cos(math.radians(a2)), -largo * math.sin(math.radians(a2)), 0.0)
    m = _malla([((-20, 0, 0), (0, 0, 0), r_madre), ((0, 0, 0), h1, r_hija), ((0, 0, 0), h2, r_hija)])
    p1 = tuple(0.8 * x for x in h1)
    p2 = tuple(0.8 * x for x in h2)
    return m, (-14.0, 0.0, 0.0), p1, p2


@pytest.mark.parametrize("semi", [45, 60, 75])
def test_y_simetrica(semi):
    m, madre, h1, h2 = _y(semi)
    r = medir_bifurcacion(m, madre, h1, h2)
    assert r.angulo_hijas_deg == pytest.approx(2 * semi, abs=8)
    assert r.angulo_hija1_deg == pytest.approx(semi, abs=8)
    assert r.angulo_hija2_deg == pytest.approx(semi, abs=8)
    assert np.linalg.norm(np.array(r.punto)) < 3.0                 # cerca de la bifurcación real
    assert r.diametro_madre_mm == pytest.approx(3.0, abs=0.4)
    assert r.diametro_hija1_mm == pytest.approx(2.2, abs=0.4)


def test_y_asimetrica():
    m, madre, h1, h2 = _y(30, asim_deg=80)
    r = medir_bifurcacion(m, madre, h1, h2)
    assert r.angulo_hija1_deg == pytest.approx(30, abs=8)
    assert r.angulo_hija2_deg == pytest.approx(80, abs=8)
    assert r.angulo_hijas_deg == pytest.approx(110, abs=10)


def test_el_saco_no_desvia_las_lineas():
    """Un saco gordo encima de la bifurcación: el camino de mínimo coste podía
    atajar por él; con el saco fuera de la máscara, el ángulo es el del vaso."""
    semi = 60
    h1 = (16 * math.cos(math.radians(semi)), 16 * math.sin(math.radians(semi)), 0.0)
    h2 = (16 * math.cos(math.radians(semi)), -16 * math.sin(math.radians(semi)), 0.0)
    centro, r_saco = (3.0, 0.0, 0.0), 2.6
    m = _malla([((-20, 0, 0), (0, 0, 0), 1.5), ((0, 0, 0), h1, 1.1), ((0, 0, 0), h2, 1.1),
                (centro, (3.05, 0.0, 0.0), r_saco)])
    s = vtk.vtkSphereSource(); s.SetCenter(*centro); s.SetRadius(r_saco - 0.2)
    s.SetThetaResolution(32); s.SetPhiResolution(32); s.Update()
    saco = vtk.vtkPolyData(); saco.DeepCopy(s.GetOutput())
    r = medir_bifurcacion(m, (-14.0, 0.0, 0.0), tuple(0.8 * x for x in h1), tuple(0.8 * x for x in h2), saco=saco)
    assert r.sin_saco
    assert r.angulo_hijas_deg == pytest.approx(2 * semi, abs=12)


def test_hijas_en_el_mismo_vaso_lo_dice():
    m, madre, h1, _ = _y(60)
    with pytest.raises(ValueError, match="mismo vaso"):
        medir_bifurcacion(m, madre, h1, tuple(0.95 * x for x in h1))


# ── API ───────────────────────────────────────────────────────────────────── #

import os  # noqa: E402

os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
from fastapi.testclient import TestClient  # noqa: E402

from conftest import anonymous_client  # noqa: E402
from main import app  # noqa: E402
from services.database import Base, engine  # noqa: E402
from services.segmentation import write_vtp  # noqa: E402
from services.sessions import create_session, session_subdir  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _cuerpo(madre, h1, h2):
    p = lambda q: {"x": q[0], "y": q[1], "z": q[2]}  # noqa: E731
    return {"madre": p(madre), "hija_1": p(h1), "hija_2": p(h2)}


def test_api_mide_y_guarda():
    m, madre, h1, h2 = _y(60)
    sid = create_session()
    write_vtp(m, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    assert client.get(f"/api/centerline/{sid}/bifurcacion").json() is None
    r = client.post(f"/api/centerline/{sid}/bifurcacion", json=_cuerpo(madre, h1, h2))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["angulo_hijas_deg"] == pytest.approx(120, abs=8)
    assert len(b["linea_1"]) > 10 and len(b["linea_2"]) > 10
    assert b["sin_saco"] is False                     # no hay saco medido en esta sesión
    assert client.get(f"/api/centerline/{sid}/bifurcacion").json() == b


def test_api_errores_dicen_que_hacer():
    m, madre, h1, _ = _y(60)
    sid = create_session()
    assert client.post(f"/api/centerline/{sid}/bifurcacion", json=_cuerpo(madre, h1, h1)).status_code == 409
    write_vtp(m, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    r = client.post(f"/api/centerline/{sid}/bifurcacion", json=_cuerpo(madre, h1, tuple(0.95 * x for x in h1)))
    assert r.status_code == 422 and "mismo vaso" in r.json()["detail"]


def test_api_sin_usuario_401():
    sid = create_session()
    m, madre, h1, h2 = _y(60)
    assert anonymous_client(app).post(f"/api/centerline/{sid}/bifurcacion", json=_cuerpo(madre, h1, h2)).status_code == 401
