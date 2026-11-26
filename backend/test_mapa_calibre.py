"""Mapa de calibre: diámetro local por rayo en cada vértice, para pintarlo."""
from __future__ import annotations

import os
import tempfile
import time

_tmp = tempfile.mkdtemp(prefix="prospective_calibre_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy

from conftest import anonymous_client
from main import app
from services.database import Base, engine
from services.fantoma_tubos import catalogo
from services.mapa_calibre import CAMPO, calibre, mediana_vecinos
from services.mesh_smooth import suavizar
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

_FANTOMAS = catalogo()


@pytest.mark.parametrize("f", _FANTOMAS, ids=[f.nombre for f in _FANTOMAS])
def test_fantomas_diametro_y_sin_tapas_rojas(f):
    d = calibre(f.malla, suavizar(f.malla))
    assert not np.isnan(d).any()
    assert np.median(d) == pytest.approx(2 * f.radio_mm, abs=0.02)
    assert np.percentile(d, 5) > 2 * f.radio_mm - 0.06
    assert np.percentile(d, 95) < 2 * f.radio_mm + 0.06
    # Las tapas: el rayo corre a lo largo del tubo (daba 11-14 mm en tubos de 3).
    assert d.max() < 1.25 * 2 * f.radio_mm


def test_normales_al_reves_no_cambian_nada():
    f = _FANTOMAS[0]
    s = suavizar(f.malla)
    n = vtk_to_numpy(s.GetPointData().GetNormals())
    al_reves = numpy_to_vtk(-n, deep=True)
    al_reves.SetName("Normals")
    s.GetPointData().SetNormals(al_reves)
    assert np.median(calibre(f.malla, s)) == pytest.approx(2 * f.radio_mm, abs=0.02)


def test_mediana_de_vecinos_quita_un_pico_y_rellena_huecos():
    s = vtk.vtkSphereSource(); s.SetThetaResolution(24); s.SetPhiResolution(24); s.Update()
    m = s.GetOutput()
    v = np.full(m.GetNumberOfPoints(), 2.0)
    v[10] = 30.0
    v[20] = np.nan
    out = mediana_vecinos(m, v)
    assert out[10] == pytest.approx(2.0) and out[20] == pytest.approx(2.0)


def _sesion() -> str:
    sid = create_session()
    write_vtp(_FANTOMAS[0].malla, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def test_api_crea_la_copia_con_el_campo_y_la_rehace_si_cambia_la_malla():
    sid = _sesion()
    r = client.post(f"/api/mesh/{sid}/calibre", params={"name": "vessel_tree.vtp"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "/vessel_tree.calibre.vtp?v=" in body["url"]
    assert body["campo"] == CAMPO
    assert body["mediana_mm"] == pytest.approx(3.0, abs=0.02)
    dst = session_subdir(sid, "meshes") / "vessel_tree.calibre.vtp"
    copia = read_vtp(dst)
    assert copia.GetPointData().GetArray(CAMPO) is not None
    assert copia.GetNumberOfPoints() == _FANTOMAS[0].malla.GetNumberOfPoints()
    antes = dst.stat().st_mtime
    assert client.post(f"/api/mesh/{sid}/calibre", params={"name": "vessel_tree.vtp"}).json() == body
    assert dst.stat().st_mtime == antes                       # de la caché
    time.sleep(0.05)
    write_vtp(_FANTOMAS[0].malla, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    client.post(f"/api/mesh/{sid}/calibre", params={"name": "vessel_tree.vtp"})
    assert dst.stat().st_mtime > antes


def test_api_nombres_raros_422_y_mallas_que_no_hay_404():
    sid = _sesion()
    for nombre in ("../x.vtp", "vessel_tree.suave.vtp", "vessel_tree.calibre.vtp", "a.stl", "a/b.vtp"):
        assert client.post(f"/api/mesh/{sid}/calibre", params={"name": nombre}).status_code in (404, 422), nombre
    assert client.post(f"/api/mesh/{sid}/calibre", params={"name": "nada.vtp"}).status_code == 404


def test_api_sin_usuario_401():
    sid = _sesion()
    assert anonymous_client(app).post(f"/api/mesh/{sid}/calibre", params={"name": "vessel_tree.vtp"}).status_code == 401
