"""Un umbral por índice, el mismo en la insignia, en el riesgo y en Decisión (F1-160/161/163/179/180).

Por qué: la insignia del AR cortaba en 1,2, la etiqueta de riesgo en 1,3 y
Decisión en 1,3 y 2,0; el DNR en 1,5 y 1,6; la ondulación en 0,15, 0,10/0,25 y
0,20. Y el BF decía «Cuello ancho» en Morfometría justo cuando Decisión decía
«cuello moderadamente estrecho». Ahora los cortes viven en
services/index_thresholds.py, el frontend los copia en thresholds.ts y esta
prueba los compara.
"""
from __future__ import annotations

import re
from pathlib import Path

from services import index_thresholds as T
from services.endovascular import endovascular_profile
from services.morphometrics import MorphometricResult
from services.treatment import compute_decision

_TS = (Path(__file__).resolve().parent.parent / "frontend" / "src" / "components"
       / "morphometry" / "thresholds.ts").read_text(encoding="utf-8")

NOMBRES = ("AR_HIGH", "AR_MOD", "DNR_HIGH", "DNR_MOD", "BF_WIDE",
           "UI_HIGH", "UI_MOD", "EI_MOD", "SR_HIGH", "SR_MOD")


def _ts(name: str) -> float:
    m = re.search(rf"export const {name}\s*=\s*(-?\d+(?:\.\d+)?)", _TS)
    assert m, f"{name} no está en thresholds.ts"
    return float(m.group(1))


def _morfo(**kw) -> MorphometricResult:
    base = dict(volume_mm3=100, surface_area_mm2=100, eq_sphere_diam_mm=5,
                bbox_l_mm=7, bbox_w_mm=6, bbox_h_mm=5, max_diameter_mm=7,
                neck_diameter_mm=4, dome_height_mm=4, neck_plane_pos=0.2,
                dome_to_neck_ratio=1.0, aspect_ratio=1.0, compactness=0.8)
    return MorphometricResult(**(base | kw))


def _factor(prefix: str, **kw) -> dict:
    base = dict(neck_mm=4.5, aspect_ratio=0.0, dnr=0.0, max_diameter_mm=7.0,
                bottleneck_factor=0.0, undulation_index=0.0)
    r = compute_decision(**(base | kw))
    hits = [f for f in r["factors"] if f["name"].startswith(prefix)]
    assert hits, [f["name"] for f in r["factors"]]
    return hits[0]


def test_el_frontend_copia_los_mismos_cortes():
    for n in NOMBRES:
        assert _ts(n) == getattr(T, n), n


def test_los_cortes_acordados():
    assert (T.AR_HIGH, T.AR_MOD, T.DNR_HIGH, T.DNR_MOD, T.BF_WIDE) == (1.6, 1.2, 2.0, 1.6, 1.5)


class TestElRiesgoLeeLosMismosCortes:
    def test_ar_moderado_desde_1_2(self):
        etiqueta, motivos = _morfo(aspect_ratio=1.25).rupture_risk()
        assert etiqueta == "Moderado" and motivos == ["AR 1.25 ≥ 1.2"]

    def test_dnr_moderado_desde_1_6_no_1_5(self):
        assert _morfo(dome_to_neck_ratio=1.55).rupture_risk()[0] == "Bajo"
        assert _morfo(dome_to_neck_ratio=1.6).rupture_risk()[0] == "Moderado"


class TestDecisionLeeLosMismosCortes:
    def test_bf_alto_es_cuello_estrecho_como_la_insignia(self):
        f = _factor("Bottleneck", bottleneck_factor=1.65)
        assert "Cuello estrecho" in f["name"] and "1.65" in f["name"]
        assert "ancho" not in f["name"].lower()

    def test_bf_bajo_es_cuello_ancho(self):
        assert "Cuello ancho" in _factor("Bottleneck", bottleneck_factor=1.3)["name"]

    def test_ui_usa_el_corte_de_morfometria(self):
        # 0,22 era «muy irregular» en Decisión (> 0,20) y no «Alto» en el riesgo (≥ 0,25).
        f = _factor("Domo", undulation_index=0.22)
        assert "moderadamente" in f["name"]
        assert "0.20" not in f["name"]
        assert "0.25" in _factor("Domo", undulation_index=0.497)["name"]

    def test_ui_alto_con_vaso_padre_en_el_saco_lo_avisa(self):
        f = _factor("Domo", undulation_index=0.497, parent_in_sac=True)
        assert "vaso padre" in f["detail"]
        assert "vaso padre" not in _factor("Domo", undulation_index=0.497)["detail"]

    def test_ar_usa_los_cortes_de_morfometria(self):
        assert "1.2" in _factor("Relación de aspecto", aspect_ratio=1.25)["name"]
        assert "1.6" in _factor("Relación de aspecto", aspect_ratio=1.7)["name"]

    def test_el_perfil_endovascular_avisa_desde_el_mismo_corte_de_ui(self):
        assert endovascular_profile(neck_mm=3.0, dnr=2.5, undulation_index=0.22).cautions == []
        assert endovascular_profile(neck_mm=3.0, dnr=2.5, undulation_index=0.25).cautions


# ── El sentido del BF, en todo el texto ──────────────────────────────────── #
# Revisión de la Tarea 2: «> 1.5 → wide neck» seguía en el modelo de la API (y
# de ahí en openapi.json y schema.gen.ts) y «cuello ancho si > 1.5» en la
# portada. Un BF alto es un cuello relativamente ESTRECHO.

_ANCHO = r"(cuello\s+(relativamente\s+)?ancho|wide\s+neck)"
_MAYOR = r">\s*1[.,]5"
_BF_AL_REVES = re.compile(
    rf"{_ANCHO}\s*(si|if|cuando|when)?\s*(BF\s*)?{_MAYOR}|{_MAYOR}\s*(→|=|:|->)?\s*{_ANCHO}",
    re.IGNORECASE,
)
_RAIZ = Path(__file__).resolve().parent.parent


def _textos():
    for p in (_RAIZ / "backend").rglob("*.py"):
        if ".venv" not in p.parts and p.name != Path(__file__).name:
            yield p
    for patron in ("*.ts", "*.tsx"):
        yield from (_RAIZ / "frontend" / "src").rglob(patron)
    yield _RAIZ / "frontend" / "openapi.json"


def test_el_patron_reconoce_el_texto_al_reves():
    assert _BF_AL_REVES.search("(> 1.5 → wide neck)")
    assert _BF_AL_REVES.search("Ø domo / cuello · cuello ancho si > 1.5")
    assert not _BF_AL_REVES.search("BF > 1,5 = cuello relativamente estrecho; ≤ 1,5 = cuello relativamente ancho")


def test_ningun_texto_llama_ancho_a_un_bf_mayor_de_1_5():
    malos = [f"{p.relative_to(_RAIZ)}:{i}: {linea.strip()}"
             for p in _textos()
             for i, linea in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1)
             if _BF_AL_REVES.search(linea)]
    assert malos == []
