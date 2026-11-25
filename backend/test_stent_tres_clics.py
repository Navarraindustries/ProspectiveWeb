"""P10: flow diverter en tres clics (proximal, distal y saco), como Siemens.

Un vaso sintético de Ø 3 mm a lo largo de z con un saco esférico pegado de
lado a z = 30: proximal en z = 5, distal en z = 55 y un clic en la cúpula
tienen que dar una línea por la arteria, el cuello delante del saco y un
dispositivo desplegado que lo cubre con anclaje a los dos lados.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_s3c_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state
from services.stent_tres_clics import elegir_opcion, elegir_saco, tramo_en_contacto

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

SACO = np.array([4.0, 0.0, 30.0])
R_SACO = 3.0


def _vaso_con_saco() -> vtk.vtkPolyData:
    tubo = vtk.vtkCylinder(); tubo.SetRadius(1.5); tubo.SetAxis(0, 0, 1)
    caja = vtk.vtkBox(); caja.SetBounds(-5, 5, -5, 5, 0, 60)
    tubo_corto = vtk.vtkImplicitBoolean(); tubo_corto.SetOperationTypeToIntersection()
    tubo_corto.AddFunction(tubo); tubo_corto.AddFunction(caja)
    saco = vtk.vtkSphere(); saco.SetCenter(*SACO); saco.SetRadius(R_SACO)
    union = vtk.vtkImplicitBoolean(); union.SetOperationTypeToUnion()
    union.AddFunction(tubo_corto); union.AddFunction(saco)
    muestra = vtk.vtkSampleFunction(); muestra.SetImplicitFunction(union)
    muestra.SetModelBounds(-3, 9, -5, 5, -2, 62); muestra.SetSampleDimensions(61, 51, 321)
    muestra.ComputeNormalsOff()
    iso = vtk.vtkContourFilter(); iso.SetInputConnection(muestra.GetOutputPort()); iso.SetValue(0, 0.0)
    iso.Update()
    return iso.GetOutput()


def _saco_cerrado() -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetCenter(*SACO); s.SetRadius(R_SACO - 0.1)
    s.SetThetaResolution(32); s.SetPhiResolution(32); s.Update()
    return s.GetOutput()


def _puntos_esfera(centro, r, n=400) -> np.ndarray:
    rng = np.random.default_rng(0)
    v = rng.normal(size=(n, 3))
    return np.asarray(centro) + r * v / np.linalg.norm(v, axis=1, keepdims=True)


# ── Lógica ───────────────────────────────────────────────────────────────── #

def test_el_tramo_del_cuello_es_donde_la_esfera_inscrita_toca_el_saco():
    z = np.linspace(0, 60, 241)
    linea = np.c_[np.zeros_like(z), np.zeros_like(z), z]
    s0, s1 = tramo_en_contacto(linea, np.full(len(z), 1.5), _puntos_esfera(SACO, R_SACO))
    # El saco (x de 1 a 7) se mete en el tubo: el contacto queda alrededor de z = 30.
    assert 24 < s0 < 30 < s1 < 36
    assert tramo_en_contacto(linea, np.full(len(z), 1.5), _puntos_esfera((20, 0, 30), 2)) is None


def test_el_clic_elige_la_lesion_mas_cercana_y_lejos_no_vale():
    a, b = ("a.vtp", _puntos_esfera(SACO, 3)), ("b.vtp", _puntos_esfera((0, 0, 50), 2))
    assert elegir_saco([a, b], (0, 0, 52.5))[0] == "b.vtp"
    assert elegir_saco([a, b], (30, 30, 30)) is None
    assert elegir_saco([a, b], None)[0] == "a.vtp"
    assert elegir_saco([], None) is None


class _Op:
    def __init__(self, i, fits): self.device_id, self.name, self.fits, self.reason = i, i.upper(), fits, "no cabe"


def test_la_opcion_pedida_o_la_primera_que_encaja():
    ops = [_Op("a", False), _Op("b", True), _Op("c", True)]
    assert elegir_opcion(ops, None).device_id == "b"
    assert elegir_opcion(ops, "c").device_id == "c"
    with pytest.raises(ValueError, match="no encaja"):
        elegir_opcion(ops, "a")
    with pytest.raises(ValueError, match="no está en el catálogo"):
        elegir_opcion(ops, "zz")
    assert elegir_opcion([_Op("a", False)], None) is None


# ── API ──────────────────────────────────────────────────────────────────── #

@pytest.fixture(scope="module")
def malla():
    return _vaso_con_saco()


def _sesion(malla, con_saco=True) -> str:
    sid = create_session()
    m = session_subdir(sid, "meshes")
    write_vtp(malla, m / "vessel_tree.vtp")
    if con_saco:
        write_vtp(_saco_cerrado(), m / "aneurysm_sac.vtp")
        write_state(sid, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
    return sid


def _clics(saco=(6.9, 0.0, 30.0), **extra) -> dict:
    body = {"source": {"x": 0, "y": 0, "z": 5}, "target": {"x": 0, "y": 0, "z": 55}, **extra}
    if saco is not None:
        body["sac"] = dict(zip("xyz", saco))
    return body


def test_tres_clics_extrae_dimensiona_y_despliega_cubriendo_el_cuello(malla):
    sid = _sesion(malla)
    r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["neck_source"] == "saco" and d["lesion_mesh"] == "aneurysm_sac.vtp"
    assert d["centerline"]["ends_in_lesion"] is False
    assert d["centerline"]["arc_length_mm"] == pytest.approx(50, abs=3)
    s0, s1 = d["sizing"]["neck_arc_mm"]
    assert 18 < s0 < 25 < s1 < 32          # arco desde z = 5: el saco está a ~25 mm
    assert d["device_id"] and d["stent"] is not None
    a, b = d["deploy_arc_mm"]
    assert a < s0 - 5 and b > s1 + 5, "el dispositivo tiene que anclar a los dos lados del cuello"
    assert 2.5 <= d["diameter_mm"] <= 4.0   # vaso de Ø 3 mm
    assert d["device_name"] in d["message"]
    # La cobertura da la etiqueta del dispositivo elegido, no una estimada del
    # tramo (en Case 3 salía «≈ 18 mm» para un Pipeline de 20).
    assert d["stent"]["coverage"] is not None
    assert d["stent"]["coverage"]["catalogue_length_mm"] == d["labelled_length_mm"]
    # La línea nueva sustituye a la anterior y el stent queda guardado.
    assert client.get(f"/api/centerline/{sid}").json()["arc_length_mm"] == d["centerline"]["arc_length_mm"]
    from services.device_state import read_stent
    guardado = read_stent(sid)
    assert guardado["kind"] == "centerline" and guardado["diameter_mm"] == d["diameter_mm"]


def test_con_el_cuello_medido_de_ese_saco_usa_la_morfometria(malla):
    sid = _sesion(malla)
    write_state(sid, "morpho.neck_origin_x", "1.6")
    write_state(sid, "morpho.neck_origin_y", "0.0")
    write_state(sid, "morpho.neck_origin_z", "30.0")
    write_state(sid, "morpho.neck_mm", "4.0")
    d = client.post(f"/api/stent-tres-clics/{sid}", json=_clics()).json()
    assert d["neck_source"] == "morfometria"
    s0, s1 = d["sizing"]["neck_arc_mm"]
    assert s1 - s0 == pytest.approx(4.0, abs=0.3)


def test_sin_clic_en_el_saco_usa_el_saco_medido(malla):
    sid = _sesion(malla)
    d = client.post(f"/api/stent-tres-clics/{sid}", json=_clics(saco=None)).json()
    assert d["lesion_mesh"] == "aneurysm_sac.vtp" and d["stent"] is not None


def test_clic_lejos_de_cualquier_saco_422(malla):
    sid = _sesion(malla)
    r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics(saco=(0, 0, 50)))
    assert r.status_code == 422 and "no cae sobre ningún saco" in r.json()["detail"]


def test_sin_saco_ni_candidatos_422(malla):
    sid = _sesion(malla, con_saco=False)
    r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics(saco=None))
    assert r.status_code == 422 and "detecta aneurismas" in r.json()["detail"]


def test_dispositivo_que_no_existe_422(malla):
    sid = _sesion(malla)
    r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics(device_id="no-existe"))
    assert r.status_code == 422 and "no está en el catálogo" in r.json()["detail"]


def test_si_falla_la_linea_de_antes_queda_intacta(malla):
    """El dispositivo pedido no existe: la línea ya se extrajo, pero no debe
    pisar la de antes ni dejar los temporales."""
    sid = _sesion(malla)
    m = session_subdir(sid, "meshes")
    (m / "centerline.vtp").write_bytes(b"antes")
    (m / "centerline_points.npz").write_bytes(b"antes")
    (m / "cl_stent.vtp").write_bytes(b"antes")
    r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics(device_id="no-existe"))
    assert r.status_code == 422
    for n in ("centerline.vtp", "centerline_points.npz", "cl_stent.vtp"):
        assert (m / n).read_bytes() == b"antes", n
    assert not (m / "centerline_p10.vtp").exists() and not (m / "centerline_p10.npz").exists()


def test_la_linea_nueva_se_lleva_el_ivus_y_el_stent_de_la_vieja(malla):
    sid = _sesion(malla)
    m = session_subdir(sid, "meshes")
    for n in ("ivus_pullback.u8", "ivus_pullback.json"):
        (m / n).write_bytes(b"de la linea vieja")
    from services.device_state import read_stent, save_stent
    save_stent(sid, {"kind": "centerline", "diameter_mm": 9.9})
    (m / "cl_stent.vtp").write_bytes(b"de la linea vieja")
    # Ningún dispositivo cabe en un vaso de Ø 3 mm con el catálogo vacío.
    import routers.plan as plan
    antes = plan._STENT_LIBRARY
    plan._STENT_LIBRARY = []
    try:
        d = client.post(f"/api/stent-tres-clics/{sid}", json=_clics()).json()
    finally:
        plan._STENT_LIBRARY = antes
    assert d["stent"] is None and "no se ha desplegado nada" in d["message"]
    assert not (m / "cl_stent.vtp").exists()
    assert not (m / "ivus_pullback.u8").exists() and not (m / "ivus_pullback.json").exists()
    assert not read_stent(sid)
    assert client.get(f"/api/centerline/{sid}").json()["arc_length_mm"] == d["centerline"]["arc_length_mm"]


def test_repetir_los_tres_clics_no_toca_el_clip_colocado(malla):
    """UNI-177: el stent nuevo sustituye al de antes; el clip del plan se queda,
    con su malla, su lista editable y lo evaluado con él."""
    from services.device_state import (read_clip_evaluation, read_clips, read_placed_clips,
                                       save_clip_evaluation, save_clips, save_placed_clips)
    sid = _sesion(malla)
    m = session_subdir(sid, "meshes")
    clip = {"index": 0, "clip_id": "navarro:t3:30:10.0", "name": "T3", "position": [6.9, 0.0, 30.0],
            "orientation": [0.0, 0.0, -80.0], "normal": [1.0, 0.0, 0.0], "is_custom": False}
    save_clips(sid, [clip])
    save_placed_clips(sid, {"clips": [{"key": 1, "clip_id": clip["clip_id"], "name": "T3",
                                        "position": clip["position"], "normal": clip["normal"],
                                        "rotation_deg": -80.0}]})
    save_clip_evaluation(sid, "occlusion", {"occluded_pct": 100.0})
    (m / "clips_placed.vtp").write_bytes(b"clip")
    for _ in range(2):                                   # en el ensayo se repitió dos veces
        r = client.post(f"/api/stent-tres-clics/{sid}", json=_clics())
        assert r.status_code == 200, r.text
        assert r.json()["stent"] is not None
    assert read_clips(sid) == [clip]
    assert read_placed_clips(sid)["clips"][0]["clip_id"] == clip["clip_id"]
    assert read_clip_evaluation(sid, "occlusion") is not None
    assert (m / "clips_placed.vtp").read_bytes() == b"clip"


def test_sin_malla_409():
    sid = create_session()
    assert client.post(f"/api/stent-tres-clics/{sid}", json=_clics()).status_code == 409
