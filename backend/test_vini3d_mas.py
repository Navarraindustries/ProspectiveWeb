"""VINI 3D, segunda tanda (18-11): ramas en la línea, comparación con el estudio
anterior y la sección del informe. Sobre el tubo sintético de test_ivus_virtual."""
from __future__ import annotations

import io
import json

import numpy as np
from PIL import Image

from services.branch_origins import BranchOrigin, BranchScan, freeze_scan
from services.ivus_virtual import medir_sobre_malla, ramas_en_linea
from services.sessions import write_state
from test_ivus_virtual import EJE, _linea, _sesion, _tubo, client, radio


def _origen(x, y, z, calibre=1.0, padre=3.0, i=0):
    return BranchOrigin(index=i, position=(x, y, z), calibre_mm=calibre, parent_calibre_mm=padre, n_vertices=12)


# ── Ramas a lo largo de la línea ───────────────────────────────────────── #

def test_una_rama_sobre_la_pared_sale_en_su_posicion_y_una_lejana_no():
    pts, radios, arco = _linea()                     # z de 5 a 40, arco = z − 5
    z = 15.0
    pared = _origen(EJE[0] + float(radio(z)), EJE[1], z, i=0)
    lejos = _origen(EJE[0] + 6.0, EJE[1], 20.0, i=1)
    ramas = ramas_en_linea(pts, radios, arco, [lejos, pared])
    assert len(ramas) == 1
    r = ramas[0]
    assert abs(r.arc_mm - 10.0) < 0.3 and abs(r.distancia_mm - float(radio(z))) < 0.05
    assert r.calibre_mm == 1.0 and r.padre_mm == 3.0


def test_el_angulo_de_la_rama_va_en_el_marco_del_contorno():
    pts, radios, arco = _linea()
    a = ramas_en_linea(pts, radios, arco, [_origen(EJE[0] + 1.5, EJE[1], 12.0)])[0]
    b = ramas_en_linea(pts, radios, arco, [_origen(EJE[0] - 1.5, EJE[1], 12.0)])[0]
    diff = (a.angulo_deg - b.angulo_deg) % 360
    assert abs(diff - 180) < 2                       # lados opuestos del vaso


def test_api_devuelve_las_ramas_del_barrido_congelado():
    sid = _sesion()
    assert client.post(f"/api/centerline/{sid}/ivus").json()["branches"] == []      # sin barrido
    freeze_scan(sid, BranchScan(origins=[_origen(EJE[0], EJE[1] + float(radio(25.0)), 25.0)], calibre_floor_mm=0.8))
    d = client.post(f"/api/centerline/{sid}/ivus").json()
    assert d["branch_floor_mm"] == 0.8
    assert len(d["branches"]) == 1 and abs(d["branches"][0]["arc_mm"] - 20.0) < 0.3


# ── El mismo recorrido sobre el estudio anterior ───────────────────────── #

def test_la_misma_malla_da_las_mismas_areas_y_una_mas_estrecha_menos():
    pts, _r, arco = _linea()
    igual = medir_sobre_malla(pts, arco, _tubo())
    estrecha = medir_sobre_malla(pts, arco, _tubo(r=lambda z: 0.8 * radio(z)))
    a = np.array([s.area_mm2 for s in igual])
    b = np.array([s.area_mm2 for s in estrecha])
    exacta = np.pi * radio(pts[:, 2]) ** 2
    assert np.all(np.abs(a / exacta - 1) < 0.02)
    assert np.all(np.abs(b / a - 0.64) < 0.03)


def _registrar(sid: str, previa: str, M=None):
    from routers.followup import FOLLOWUP_STATE_KEY
    write_state(sid, FOLLOWUP_STATE_KEY, json.dumps({
        "previous_session_id": previa, "prev_to_curr": (M if M is not None else np.eye(4)).tolist(),
        "noise_mm": 0.3, "residual_median_mm": 0.1,
    }))


def _sesion_previa_estrecha() -> str:
    from services.segmentation import write_vtp
    from services.sessions import session_subdir
    sid = _sesion(con_linea=False)
    write_vtp(_tubo(r=lambda z: 0.8 * radio(z)), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


def test_api_comparar_pide_antes_la_superposicion_de_seguimiento():
    sid, previa = _sesion(), _sesion_previa_estrecha()
    r = client.post(f"/api/centerline/{sid}/ivus/compare", json={"previous_session_id": previa})
    assert r.status_code == 409 and "Seguimiento" in r.json()["detail"]
    _registrar(sid, "otra-sesion")                   # superpuesto, pero otro estudio
    assert client.post(f"/api/centerline/{sid}/ivus/compare", json={"previous_session_id": previa}).status_code == 409


def test_api_compara_seccion_a_seccion_con_la_superposicion_guardada():
    sid, previa = _sesion(), _sesion_previa_estrecha()
    # La previa desplazada 3 mm en x; la superposición la devuelve a su sitio.
    from services.followup import _transform
    from services.segmentation import read_vtp, write_vtp
    from services.sessions import session_subdir
    f = session_subdir(previa, "meshes") / "vessel_tree.vtp"
    T = np.eye(4); T[0, 3] = 3.0
    write_vtp(_transform(read_vtp(f), T), f)
    _registrar(sid, previa, np.linalg.inv(T))
    actual = client.post(f"/api/centerline/{sid}/ivus").json()
    r = client.post(f"/api/centerline/{sid}/ivus/compare", json={"previous_session_id": previa})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["sections"]) == actual["n_sections"] and d["noise_mm"] == 0.3
    pares = [(a["area_mm2"], b["area_mm2"]) for a, b in zip(actual["sections"], d["sections"]) if a["valid"] and b["valid"]]
    assert len(pares) > 50 and all(abs(b / a - 0.64) < 0.04 for a, b in pares)
    assert d["summary"]["mla_mm2"] < actual["summary"]["mla_mm2"]
    cache = session_subdir(sid, "meshes") / "ivus_compare.json"
    antes = cache.stat().st_mtime_ns
    client.post(f"/api/centerline/{sid}/ivus/compare", json={"previous_session_id": previa})
    assert cache.stat().st_mtime_ns == antes         # de la caché


# ── La sección del informe ─────────────────────────────────────────────── #

def test_los_bordes_de_la_luz_en_la_vista_longitudinal():
    from services.informe_vini3d import _cruces_eje_u
    t = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    c = _cruces_eje_u([[2 * np.cos(a), 2 * np.sin(a)] for a in t])
    assert c is not None and abs(c[0] + 2) < 0.01 and abs(c[1] - 2) < 0.01
    assert _cruces_eje_u([[5, 1], [6, 1], [6, 2]]) is None


def test_el_informe_lleva_vini3d_con_figuras_ramas_y_comparacion():
    from reportlab.platypus import Image as RlImage
    from reportlab.platypus import Paragraph

    from services.informe_vini3d import datos_vini3d
    from services.report_generator import ReportData, ReportGenerator

    sid, previa = _sesion(), _sesion_previa_estrecha()
    freeze_scan(sid, BranchScan(origins=[_origen(EJE[0], EJE[1] + float(radio(25.0)), 25.0)], calibre_floor_mm=0.8))
    _registrar(sid, previa)
    client.post(f"/api/centerline/{sid}/ivus/compare", json={"previous_session_id": previa})
    v = datos_vini3d(sid)
    assert v is not None and len(v.ramas) == 1 and v.comparacion is not None
    assert v.dispositivo is None                     # sin stent ni morfometría no hay dispositivo
    for png in (v.vista_l_png, v.corte_png):
        im = Image.open(io.BytesIO(png))
        assert im.format == "PNG" and im.size[0] > 300
    story = ReportGenerator(ReportData(vini3d=v))._section_vini3d()
    textos = " ".join(p.text for p in story if isinstance(p, Paragraph))
    assert "VINI 3D" in textos and "estudio anterior" in textos and "perforantes" in textos
    assert sum(isinstance(p, RlImage) for p in story) == 2


def test_sin_linea_central_el_informe_no_lleva_vini3d():
    from services.informe_vini3d import datos_vini3d
    from services.report_generator import ReportData, ReportGenerator
    sid = _sesion(con_linea=False)
    assert datos_vini3d(sid) is None
    assert ReportGenerator(ReportData())._section_vini3d() == []
    assert "_section_vini3d" in ReportGenerator._build_story.__code__.co_names
