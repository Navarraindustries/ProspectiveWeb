"""Los puntos y cortes que el frontend copia de PHASES, ELAPSS y UIATS.

Por qué: Morfometría avisa ANTES de «Calcular» de cuántos puntos cambia el
PHASES junto a un corte («con 9,5 mm el PHASES baja de 10 a 7 puntos») y de si
el Ø del cuerpo cambia de tramo en ELAPSS o UIATS. Para eso el frontend lleva su
copia de las tablas (frontend/src/components/morphometry/diameterCut.ts). Si esa
copia se separa de la del backend, el aviso contradice al cálculo; esta prueba
lee el archivo y compara.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

from models.phases import PhasesRequest
from services import elapss, uiats
from services.phases import _POP, _SITE, _size_points, compute_phases

_TS = (Path(__file__).resolve().parent.parent / "frontend" / "src" / "components"
       / "morphometry" / "diameterCut.ts").read_text(encoding="utf-8")


def _const(name: str):
    """`export const NAME = <lista | objeto | número>` de diameterCut.ts como valor Python."""
    m = re.search(rf"export const {name}\s*=\s*(\[[^\]]*\]|\{{[^}}]*\}}|-?\d+(?:\.\d+)?)", _TS)
    assert m, f"{name} no está en diameterCut.ts"
    lit = m.group(1)
    if lit.startswith("{"):
        lit = re.sub(r"(\w+)\s*:", r"'\1':", lit)   # claves sin comillas de TS
    return ast.literal_eval(lit)


def _cuts(points_of) -> list[float]:
    """Dónde cambia de puntos una función de tamaño, barriendo 0–30 mm cada 0,01."""
    cuts, prev = [], points_of(0.0)
    for i in range(1, 3001):
        x = i / 100
        p = points_of(x)
        if p != prev:
            # Con «<=» (UIATS, riesgo por tamaño) el cambio llega a 10,01: el
            # corte es 10 igual; el frontend no distingue el borde exacto.
            cuts.append(round(x))
            prev = p
    return cuts


def _phases(**kw) -> int:
    base = dict(population="other", hypertension=False, age_years=40, size_mm=0.0,
                earlier_sah=False, site="ica")
    return compute_phases(PhasesRequest(**(base | kw))).total_score


def test_phases_size_cuts_and_points():
    cuts = _cuts(_size_points)
    assert cuts == _const("PHASES_CUTS")
    assert [_size_points(0.0)] + [_size_points(c) for c in cuts] == _const("PHASES_SIZE_PTS")


def test_phases_population_and_site():
    assert _const("PHASES_POP_PTS") == _POP
    assert _const("PHASES_SITE_PTS") == _SITE


def test_phases_hypertension_age_and_earlier_sah():
    assert _phases(hypertension=True) == _const("PHASES_HTN_PTS")
    assert _phases(earlier_sah=True) == _const("PHASES_SAH_PTS")
    edad = _const("PHASES_AGE_MIN")
    assert _phases(age_years=edad) == _const("PHASES_AGE_PTS")
    assert _phases(age_years=edad - 1) == 0


def test_elapss_cuts():
    assert _cuts(elapss.size_points) == _const("ELAPSS_CUTS")


def test_uiats_cuts():
    assert _cuts(uiats.diameter_points) == _const("UIATS_DIAMETER_CUTS")
    assert _cuts(uiats.size_risk_points) == _const("UIATS_SIZE_RISK_CUTS")
