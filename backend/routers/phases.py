"""PHASES score router — 5-year rupture risk of an unruptured aneurysm."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException

from models.phases import PhasesRequest, PhasesResult
from services.phases import compute_phases
from services.sessions import read_state, session_exists, write_state

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["phases"])


def _invalidate_decision_if_risk_changed(session_id: str, result: PhasesResult) -> None:
    """Tira la recomendación si el riesgo de rotura estimado ha cambiado.

    Sólo si ha cambiado: volver a abrir la calculadora y pulsar sin tocar nada
    no puede borrar una decisión.
    """
    from routers.treatment import clear_treatment_state

    if not read_state(session_id, "treatment.recommendation_key", ""):
        return
    raw = read_state(session_id, "phases.json", "")
    if not raw:
        return                      # no había score previo: nada que contradecir
    try:
        before = json.loads(raw)
    except (ValueError, TypeError):
        return
    if (before.get("total_score") == result.total_score
            and before.get("risk_band") == result.risk_band):
        return
    logger.info("PHASES changed (%s → %s) — clearing the stale treatment decision "
                "for session %s", before.get("total_score"), result.total_score,
                session_id)
    clear_treatment_state(session_id)


@router.post(
    "/phases",
    response_model=PhasesResult,
    summary="Compute the PHASES score",
    description=(
        "Computes the PHASES 5-year rupture-risk score for an unruptured aneurysm "
        "(Greving et al., Lancet Neurology 2014) from six factors: Population, "
        "Hypertension, Age, Size, Earlier SAH and Site. The Size factor is usually "
        "filled from the morphometric analysis.\n\n"
        "Pass `session_id` to record the score in the planning session — that is "
        "what makes it appear in the PDF report and the DICOM SR."
    ),
)
async def phases(req: PhasesRequest) -> PhasesResult:
    result = compute_phases(req)

    if req.session_id:
        if not session_exists(req.session_id):
            raise HTTPException(
                status_code=404, detail=f"Session '{req.session_id}' not found"
            )
        # Una decisión ya tomada pudo consultar este riesgo: el atajo del
        # aneurisma pequeño devuelve «vigilancia» o «discusión multidisciplinaria»
        # según la banda. Si la banda cambia —se corrigen la hipertensión o una
        # HSA previa— lo que se decidió con la anterior deja de valer, y el
        # informe lo imprimiría junto al riesgo nuevo. Se invalida sólo cuando
        # cambia de verdad, como en la morfometría.
        _invalidate_decision_if_risk_changed(req.session_id, result)

        # Store the inputs alongside the score: the size auto-fills from the
        # morphometry, so a later re-measurement would otherwise leave a number
        # in the report that nothing on file explains.
        write_state(req.session_id, "phases.json", json.dumps({
            "total_score":  result.total_score,
            "risk_5yr_pct": result.risk_5yr_pct,
            "risk_band":    result.risk_band,
            "points": {
                "population":   result.population_pts,
                "hypertension": result.hypertension_pts,
                "age":          result.age_pts,
                "size":         result.size_pts,
                "sah":          result.sah_pts,
                "site":         result.site_pts,
            },
            "inputs": {
                "population":   req.population,
                "hypertension": req.hypertension,
                "age_years":    req.age_years,
                "size_mm":      req.size_mm,
                "earlier_sah":  req.earlier_sah,
                "site":         req.site,
            },
        }))
        logger.info("PHASES recorded for %s — score=%d (%.1f%%)",
                    req.session_id, result.total_score, result.risk_5yr_pct)

    return result
