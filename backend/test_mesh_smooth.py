"""Copia suavizada de la malla para el visor (17-11): picos fuera, forma igual."""
from __future__ import annotations

import os
import tempfile
import time

_tmp = tempfile.mkdtemp(prefix="prospective_suave_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import vtk
from fastapi.testclient import TestClient
from vtk.util.numpy_support import vtk_to_numpy

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.mesh_smooth import suavizar
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _esfera_con_pico() -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetRadius(5); s.SetThetaResolution(48); s.SetPhiResolution(48); s.Update()
    p = vtk.vtkPolyData(); p.DeepCopy(s.GetOutput())
    pts = p.GetPoints(); x = list(pts.GetPoint(200)); n = np.array(x) / np.linalg.norm(x)
    pts.SetPoint(200, *(np.array(x) + 1.5 * n))   # un pico de 1,5 mm
    return p


def test_quita_el_pico_y_no_encoge_la_esfera():
    p = _esfera_con_pico()
    q = suavizar(p)
    a = vtk_to_numpy(q.GetPoints().GetData())
    r = np.linalg.norm(a, axis=1)
    assert r[200] < 5.6, r[200]                     # el pico baja (era 6,5)
    assert abs(np.median(r) - 5.0) < 0.1            # el resto se queda donde estaba
    assert q.GetPointData().GetNormals() is not None


def _sesion() -> str:
    sid = create_session()
    write_vtp(_esfera_con_pico(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def test_api_crea_la_copia_y_la_rehace_si_cambia_la_malla():
    sid = _sesion()
    r = client.post(f"/api/mesh/{sid}/smooth", params={"name": "vessel_tree.vtp"})
    assert r.status_code == 200, r.text
    assert "/vessel_tree.suave.vtp?v=" in r.json()["url"]
    dst = session_subdir(sid, "meshes") / "vessel_tree.suave.vtp"
    assert dst.exists()
    antes = dst.stat().st_mtime
    time.sleep(0.05)
    write_vtp(_esfera_con_pico(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    client.post(f"/api/mesh/{sid}/smooth", params={"name": "vessel_tree.vtp"})
    assert dst.stat().st_mtime > antes
    assert read_vtp(dst).GetNumberOfPoints() > 0


def test_api_nombres_raros_422_y_mallas_que_no_hay_404():
    sid = _sesion()
    for nombre in ("../x.vtp", "vessel_tree.suave.vtp", "a.stl", "a/b.vtp"):
        assert client.post(f"/api/mesh/{sid}/smooth", params={"name": nombre}).status_code in (404, 422), nombre
    assert client.post(f"/api/mesh/{sid}/smooth", params={"name": "nada.vtp"}).status_code == 404


def test_api_sin_usuario_401():
    sid = _sesion()
    assert anonymous_client(app).post(f"/api/mesh/{sid}/smooth", params={"name": "vessel_tree.vtp"}).status_code == 401
