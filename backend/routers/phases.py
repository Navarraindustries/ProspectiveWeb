"""PHASES score router — 5-year rupture risk of an unruptured aneurysm."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException

from models.elapss import ElapssRequest, ElapssResult
from models.phases import PhasesRequest, PhasesResult
from models.uiats import UiatsItem, UiatsRequest, UiatsResult
from services.elapss import compute_elapss
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


@router.post(
    "/elapss",
    response_model=ElapssResult,
    summary="ELAPSS: riesgo de crecimiento a 3 y 5 años",
    description=(
        "Backes et al., Neurology 2017. Seis factores: HSA previa, localización, "
        "edad, población, tamaño y forma. Predice CRECIMIENTO, no rotura: orienta "
        "cada cuánto repetir la imagen. Con `session_id` queda registrado y llega "
        "al informe PDF, con los valores introducidos al lado de sus puntos."
    ),
)
async def elapss(req: ElapssRequest) -> ElapssResult:
    result = compute_elapss(req)
    if req.session_id:
        if not session_exists(req.session_id):
            raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")
        write_state(req.session_id, "elapss.json", json.dumps({
            "total_score": result.total_score, "score_band": result.score_band,
            "growth_3yr_pct": result.growth_3yr_pct, "growth_5yr_pct": result.growth_5yr_pct,
            "points": {
                "earlier_sah": result.earlier_sah_pts, "location": result.location_pts,
                "age": result.age_pts, "population": result.population_pts,
                "size": result.size_pts, "shape": result.shape_pts,
            },
            "inputs": req.model_dump(exclude={"session_id"}),
        }))
        logger.info("ELAPSS recorded for %s — score=%d", req.session_id, result.total_score)
    return result


@router.post(
    "/uiats",
    response_model=UiatsResult,
    summary="UIATS: suma a favor de tratar y suma a favor de vigilar",
    description=(
        "Etminan et al., Neurology 2015 (figura 2). Con 3 puntos o más de "
        "diferencia recomienda la columna mayor; con 2 o menos, «no "
        "concluyente». Es un consenso de expertos, no un modelo ajustado a "
        "desenlaces. Con `session_id` queda registrado y llega al informe."
    ),
)
async def uiats(req: UiatsRequest) -> UiatsResult:
    from services.uiats import SRC_UIATS, compute_uiats
    try:
        s = compute_uiats(**req.model_dump(exclude={"session_id", "age_years"}), age=req.age_years)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    notes = [
        "Consenso de 69 especialistas (Delphi), no un modelo ajustado a desenlaces: "
        "ordena la conversación, no decide.",
        "En series externas UIATS, como PHASES y ELAPSS, no discriminó de forma fiable.",
    ]
    if req.age_years == 40:
        notes.append("La figura original no incluye los 40 años en la columna de vigilancia "
                     "(«< 40» y «41-60»); se han contado con 41-60.")
    result = UiatsResult(
        repair=s.repair, conservative=s.conservative, difference=s.difference,
        recommendation=s.recommendation,
        repair_items=[UiatsItem(label=l, points=p) for l, p in s.repair_items],
        conservative_items=[UiatsItem(label=l, points=p) for l, p in s.conservative_items],
        notes=notes, sources=[SRC_UIATS],
    )
    if req.session_id:
        if not session_exists(req.session_id):
            raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")
        write_state(req.session_id, "uiats.json", json.dumps({
            "repair": s.repair, "conservative": s.conservative, "difference": s.difference,
            "recommendation": s.recommendation,
            "repair_items": s.repair_items, "conservative_items": s.conservative_items,
            "inputs": req.model_dump(exclude={"session_id"}),
        }))
        logger.info("UIATS recorded for %s — %d vs %d", req.session_id, s.repair, s.conservative)
    return result
