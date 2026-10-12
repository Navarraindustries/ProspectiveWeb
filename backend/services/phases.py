"""PHASES score computation (Greving et al., Lancet Neurology 2014).

Factors: Population, Hypertension, Age, Size, Earlier SAH, Site.

Puntos y riesgos son los publicados (tabla 3 de Greving 2014). Las bandas
«bajo / moderado / alto» (corte en 2 % y 7 %) NO son de la publicación: son de
esta aplicación, y solo deciden el color y si el atajo del aneurisma pequeño
puede decir «vigilancia» (services/treatment.py).
"""
from __future__ import annotations

from models.phases import PhasesRequest, PhasesResult

# Population points
_POP = {"other": 0, "japan": 3, "finland": 5}
# Site points: ICA=0, MCA=2, ACA/PComm/posterior=4
_SITE = {"ica": 0, "mca": 2, "aca_pcom_posterior": 4}

# Greving 2014, tabla 3: puntos por tamaño 0 / 3 / 6 / 10 y HSA previa 1. La
# tabla anterior (5 / 6 y 4) venía del panel de escritorio y la columna de
# riesgo estaba corrida un escalón: un 10 daba 7,8 % en vez de 5,3 %.
_RISK_5YR = {0: 0.4, 1: 0.4, 2: 0.4, 3: 0.7, 4: 0.9, 5: 1.3, 6: 1.7, 7: 2.4, 8: 3.2, 9: 4.3, 10: 5.3, 11: 7.2}
_RISK_12_PLUS = 17.8   # la publicación agrupa ≥ 12 (máximo posible: 22)


def _size_points(size_mm: float) -> int:
    if size_mm < 7.0:
        return 0
    if size_mm < 10.0:
        return 3
    if size_mm < 20.0:
        return 6
    return 10


def phases_label(score: object, risk_pct: object) -> str:
    """«PHASES n · x,x % a 5 años (Greving 2014)».

    Decisión y el informe citaban la cifra cada uno a su manera («PHASES 9 →
    5.9 %», «PHASES 9 — 5.9 %»), sin decir de qué tabla salía; un mismo rótulo
    con la fuente deja ver que es la misma cifra y de dónde viene. Coma decimal
    porque es como lo lee el clínico.
    """
    try:
        pct = f"{float(risk_pct):.1f}".replace(".", ",")
    except (TypeError, ValueError):
        pct = "—"
    return f"PHASES {score} · {pct} % a 5 años (Greving 2014)"


def compute_phases(req: PhasesRequest) -> PhasesResult:
    pop = _POP.get(req.population, 0)
    htn = 1 if req.hypertension else 0
    age = 1 if req.age_years >= 70 else 0
    size = _size_points(req.size_mm)
    sah = 1 if req.earlier_sah else 0
    site = _SITE.get(req.site, 0)

    total = pop + htn + age + size + sah + site
    risk = _RISK_5YR.get(total, _RISK_12_PLUS)
    # Bandas propias de la app (ver docstring del módulo), no de Greving.
    band = "high" if risk >= 7.0 else "moderate" if risk >= 2.0 else "low"

    return PhasesResult(
        population_pts=pop,
        hypertension_pts=htn,
        age_pts=age,
        size_pts=size,
        sah_pts=sah,
        site_pts=site,
        total_score=total,
        risk_5yr_pct=risk,
        risk_band=band,
    )
