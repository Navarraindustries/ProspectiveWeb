"""Línea central que termina DENTRO de la lesión (17-11).

En case 3 el destino marcado junto al saco se pegaba al eje de la basilar
(`_snap_to_best_center` elige el vóxel más hondo de alrededor, y la arteria
madre es más honda que el cuello) y el recorrido por dentro nunca entraba en
el saco. Sin destino marcado, la línea termina ahora en el punto más hondo del
saco medido o, si no lo hay, de la zona del candidato elegido.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_cll_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import vtk
from fastapi.testclient import TestClient

from main import app
from services.centerline import extract_centerline
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

SACO = (4.0, 0.0, 30.0)   # centro de la esfera del saco, pegada al lado del vaso
R_SACO = 3.0


def _vaso_con_saco() -> vtk.vtkPolyData:
    """Un tubo de r = 1,5 mm a lo largo de z con un saco esférico de r = 3 mm
    pegado de lado (cuello estrecho), como una sola superficie cerrada."""
    tubo = vtk.vtkCylinder(); tubo.SetRadius(1.5); tubo.SetAxis(0, 0, 1)
    caja = vtk.vtkBox(); caja.SetBounds(-5, 5, -5, 5, 0, 40)
    tubo_corto = vtk.vtkImplicitBoolean(); tubo_corto.SetOperationTypeToIntersection()
    tubo_corto.AddFunction(tubo); tubo_corto.AddFunction(caja)
    saco = vtk.vtkSphere(); saco.SetCenter(*SACO); saco.SetRadius(R_SACO)
    union = vtk.vtkImplicitBoolean(); union.SetOperationTypeToUnion()
    union.AddFunction(tubo_corto); union.AddFunction(saco)
    muestra = vtk.vtkSampleFunction(); muestra.SetImplicitFunction(union)
    muestra.SetModelBounds(-3, 9, -5, 5, -2, 42); muestra.SetSampleDimensions(61, 51, 221)
    muestra.ComputeNormalsOff()
    iso = vtk.vtkContourFilter(); iso.SetInputConnection(muestra.GetOutputPort()); iso.SetValue(0, 0.0)
    iso.Update()
    return iso.GetOutput()


def _saco_cerrado() -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetCenter(*SACO); s.SetRadius(R_SACO - 0.1)
    s.SetThetaResolution(32); s.SetPhiResolution(32); s.Update()
    return s.GetOutput()


def _cupula_abierta() -> vtk.vtkPolyData:
    """Solo la cúpula (x > 4,5): lo que deja la detección, una zona abierta."""
    plano = vtk.vtkPlane(); plano.SetOrigin(4.5, 0, 0); plano.SetNormal(1, 0, 0)
    corte = vtk.vtkClipPolyData(); corte.SetInputData(_saco_cerrado()); corte.SetClipFunction(plano)
    corte.Update()
    return corte.GetOutput()


def _dentro_del_saco(p) -> bool:
    return float(np.linalg.norm(np.asarray(p) - SACO)) < R_SACO


def test_con_el_saco_cerrado_termina_dentro_del_saco_y_lejos_del_cuello():
    r = extract_centerline(_vaso_con_saco(), (0.0, 0.0, 5.0), None, 0.5, target_region=_saco_cerrado())
    fin = r.points[-1]
    assert _dentro_del_saco(fin), fin
    assert fin[0] > 2.5, f"el final se quedó en el vaso o en el cuello: {fin}"
    # Cerca del centro del saco: es el punto más hondo.
    assert np.linalg.norm(fin - SACO) < 1.5, fin


def test_con_la_zona_abierta_del_candidato_tambien_entra():
    r = extract_centerline(_vaso_con_saco(), (0.0, 0.0, 5.0), None, 0.5, target_region=_cupula_abierta())
    fin = r.points[-1]
    assert _dentro_del_saco(fin), fin
    assert fin[0] > 2.5, fin


def test_sin_lesion_y_sin_destino_es_un_error_claro():
    try:
        extract_centerline(_vaso_con_saco(), (0.0, 0.0, 5.0), None, 0.5)
    except ValueError as e:
        assert "destino" in str(e)
    else:
        raise AssertionError("debía fallar sin destino")


# ── API ──────────────────────────────────────────────────────────────── #

def _sesion(con_saco: bool) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    write_vtp(_vaso_con_saco(), meshes / "vessel_tree.vtp")
    if con_saco:
        write_vtp(_saco_cerrado(), meshes / "aneurysm_sac.vtp")
        write_state(sid, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
    return sid


def _sin_destino() -> dict:
    return {"session_id": "x", "source": {"x": 0, "y": 0, "z": 5}, "voxel_size_mm": 0.5}


def test_api_sin_destino_termina_en_el_saco_y_lo_dice():
    sid = _sesion(con_saco=True)
    r = client.post(f"/api/centerline/{sid}", json=_sin_destino())
    assert r.status_code == 200, r.text
    assert r.json()["ends_in_lesion"] is True
    pts = client.get(f"/api/centerline/{sid}/points").json()
    assert pts["ends_in_lesion"] is True
    fin = pts["points"][-1]
    assert _dentro_del_saco((fin["x"], fin["y"], fin["z"]))
    # Al volver a leer (tras «Reanudar») se sigue sabiendo.
    assert client.get(f"/api/centerline/{sid}").json()["ends_in_lesion"] is True


def test_api_sin_destino_usa_la_zona_del_candidato_elegido_si_no_hay_saco():
    sid = _sesion(con_saco=False)
    write_vtp(_cupula_abierta(), session_subdir(sid, "meshes") / "aneurysm_cand_002.vtp")
    write_state(sid, "detect.selected_candidate", "cand-002")
    write_state(sid, "detect.cand_002.vtp_name", "aneurysm_cand_002.vtp")
    r = client.post(f"/api/centerline/{sid}", json=_sin_destino())
    assert r.status_code == 200, r.text
    fin = client.get(f"/api/centerline/{sid}/points").json()["points"][-1]
    assert _dentro_del_saco((fin["x"], fin["y"], fin["z"]))


def test_api_sin_destino_ni_candidato_422():
    sid = _sesion(con_saco=False)
    r = client.post(f"/api/centerline/{sid}", json=_sin_destino())
    assert r.status_code == 422
    assert "candidato" in r.json()["detail"]


def test_api_con_destino_marcado_no_dice_que_acaba_en_la_lesion():
    sid = _sesion(con_saco=True)
    body = {**_sin_destino(), "target": {"x": 0, "y": 0, "z": 20}}
    r = client.post(f"/api/centerline/{sid}", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["ends_in_lesion"] is False
    assert client.get(f"/api/centerline/{sid}/points").json()["ends_in_lesion"] is False


# ── Vaso portador (P13) ──────────────────────────────────────────────── #

def test_la_curvatura_es_del_vaso_portador_sin_la_entrada_al_saco():
    """El tubo es recto a lo largo de z y la línea gira al final para entrar en
    el saco: ese giro no cuenta, el vaso portador sale casi recto."""
    r = extract_centerline(_vaso_con_saco(), (0.0, 0.0, 5.0), None, 0.5, target_region=_saco_cerrado())
    assert r.n_portador is not None and 0 < r.n_portador < len(r.points)
    corte = r.points[r.n_portador]
    assert 24.0 < corte[2] < 30.0, corte          # justo antes del cuello
    assert np.linalg.norm(r.points[: r.n_portador, :2], axis=1).max() < 0.5   # sobre el eje del tubo
    assert r.curvatura_media is not None and r.curvatura_media < 0.01
    from services.curvatura import geometria_eje
    assert geometria_eje(r.points).curvatura_media > 3 * r.curvatura_media


def test_api_guarda_el_tramo_portador_y_lo_vuelve_a_leer_igual():
    sid = _sesion(con_saco=True)
    post = client.post(f"/api/centerline/{sid}", json=_sin_destino()).json()
    get = client.get(f"/api/centerline/{sid}").json()
    assert post["mean_curvature_per_mm"] is not None
    for k in ("mean_curvature_per_mm", "mean_torsion_per_mm", "curvature_length_mm"):
        assert get[k] == post[k], k
