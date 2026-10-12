"""Treatment decision router — CLIP vs ENDOVASCULAR."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import json

from models import (DecisionFactor, TeamDecision, TeamDecisionRequest,
                    TreatmentDecisionRequest, TreatmentDecisionResult)
from services.audit import ACT_TREATMENT_DECISION, audit_append
from services.access import require_session
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import User
from services.treatment import compute_decision
from services.sessions  import read_state, write_state, session_exists

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["treatment"])

#: La respuesta del motor tal cual (la devuelve GET y vuelve al reanudar).
RESULT_KEY = "treatment.result_json"
#: Las entradas clínicas con que se pidió.
INPUTS_KEY = "clinical.decision_inputs_json"


#: F1-176: la decisión del equipo. Claves propias y fuera de RESULT_KEY porque
#: no sale del motor: re-evaluar, cambiar la localización o re-medir tiran la
#: recomendación, y nada de eso dice nada de lo que el equipo decidió.
TEAM_KEYS = ("treatment.team_decision", "treatment.decided_by", "treatment.team_other")


def stored_team(session_id: str) -> TeamDecision | None:
    """La decisión del equipo guardada, o None si no se ha registrado."""
    key = read_state(session_id, "treatment.team_decision", "")
    if key not in ("clipaje", "endovascular", "vigilar", "otra"):
        return None
    return TeamDecision(team_decision=key,
                        decided_by=read_state(session_id, "treatment.decided_by", ""),
                        other_text=read_state(session_id, "treatment.team_other", ""))


def stored_decision(session_id: str) -> TreatmentDecisionResult | None:
    """La última recomendación guardada en la sesión, o None si no la hay.

    Lleva la decisión del equipo (`team`) leída aparte, así que reanudar la
    devuelve sin más (routers/session_state.py usa esta función)."""
    raw = read_state(session_id, RESULT_KEY, "")
    if not raw:
        return None
    try:
        result = TreatmentDecisionResult.model_validate_json(raw)
    except ValueError:
        logger.warning("Decisión guardada ilegible en %s", session_id)
        return None
    result.team = stored_team(session_id)
    return result


def stored_inputs(session_id: str) -> TreatmentDecisionRequest | None:
    """Las entradas clínicas de la última decisión, con este session_id."""
    raw = read_state(session_id, INPUTS_KEY, "")
    if not raw:
        return None
    try:
        data = json.loads(raw)
        # La localización vigente es la elegida en Morfometría, que puede
        # haber cambiado después de decidir.
        site = read_state(session_id, "clinical.site", "")
        if site:
            data["location"] = site
        return TreatmentDecisionRequest(session_id=session_id, **data)
    except (ValueError, TypeError):
        logger.warning("Entradas de la decisión ilegibles en %s", session_id)
        return None


def _load_float(session_id: str, key: str, default: float) -> float:
    """Read a float from session state; fall back to default on any error."""
    try:
        raw = read_state(session_id, key, "")
        return float(raw) if raw else default
    except (ValueError, Exception):
        return default


@router.post(
    "/treatment-decision",
    response_model=TreatmentDecisionResult,
    summary="Compute CLIP vs ENDOVASCULAR recommendation",
    description=(
        "Runs the heuristic CLIP-vs-ENDO engine on the aneurysm morphometry "
        "(stored in the session after Step 3 — Detección/Morfometría) and optional "
        "clinical inputs (location, rupture status). "
        "Returns a scored recommendation with full factor breakdown.\n\n"
        "For a RUPTURED aneurysm it also returns the Japan Stroke Data Bank "
        "score for each route separately, which is the only fitted model in "
        "the step; the heuristic engine stops scoring WFNS, Fisher and age "
        "there so the same variables are not counted twice.\n\n"
        "**References:** AHA/ASA 2023, ISAT 2015, BRAT 2019, Brinjikji 2009, "
        "Neurol Med Chir 2021;61(2) (JSDB)."
    ),
)
async def compute_treatment_decision(
    req: TreatmentDecisionRequest,
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> TreatmentDecisionResult:
    # Validate session (soft check — morpho may not be available yet in early development)
    if not session_exists(req.session_id):
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")

    # Load morphometric values persisted by the morphometry step (Session C).
    # Keys are written by routers/detect.py after compute_morphometrics().
    # Values default to 0.0 when morphometry has not been run yet; compute_decision()
    # treats 0.0 inputs as "not available" and skips the corresponding factors.
    neck_mm           = _load_float(req.session_id, "morpho.neck_mm",          0.0)
    aspect_ratio      = _load_float(req.session_id, "morpho.ar",               0.0)
    dnr               = _load_float(req.session_id, "morpho.dnr",              0.0)
    max_diameter_mm   = _load_float(req.session_id, "morpho.max_diameter_mm",  0.0)
    bottleneck_factor = _load_float(req.session_id, "morpho.bf",               0.0)
    undulation_index  = _load_float(req.session_id, "morpho.ui",               0.0)

    # El PHASES que ya calculó el paso de morfometría. No entra en la aritmética
    # clip-vs-endo —responde otra pregunta— pero decide si el atajo del aneurisma
    # pequeño puede decir «vigilancia» sin contradecir un riesgo de rotura alto
    # que la propia aplicación estimó dos pasos antes.
    phases = None
    raw_phases = read_state(req.session_id, "phases.json", "")
    if raw_phases:
        try:
            phases = json.loads(raw_phases)
        except (ValueError, TypeError):
            pass

    # El saco que llegó al límite del recorte en Morfometría: el Ø con que se
    # calculó el PHASES mide también vaso padre, y la nota que lo cita lo dice.
    parent_in_sac = read_state(req.session_id, "morpho.sac_hit_crop", "0") == "1"

    result = compute_decision(
        phases=phases,
        parent_in_sac=parent_in_sac,
        neck_mm=neck_mm,
        aspect_ratio=aspect_ratio,
        dnr=dnr,
        max_diameter_mm=max_diameter_mm,
        bottleneck_factor=bottleneck_factor,
        undulation_index=undulation_index,
        location=req.location,
        ruptured=req.is_ruptured,
        patient_age=req.patient_age,
        wfns_grade=req.wfns_grade,
        fisher_grade=req.fisher_grade,
        prior_stroke=req.prior_stroke,
    )

    # Persist treatment result to session state for report generation (Session E).
    write_state(req.session_id, "treatment.recommendation",     result["recommendation"])
    write_state(req.session_id, "treatment.recommendation_key", result["recommendation_key"])
    write_state(req.session_id, "treatment.confidence",         result["confidence"])
    # Con qué localización se decidió: cambiarla en Morfometría solo invalida la
    # decisión si es otra (routers/detect.py, set_clinical_site).
    write_state(req.session_id, "treatment.location",           req.location)
    # El sumatorio ya no se guarda: no se enseña en pantalla ni se imprime, y
    # dejarlo en el estado era dejar la puerta abierta a que volviera por el
    # informe. El motor lo sigue calculando por dentro, que es de donde sale la
    # recomendación; lo que se retira es la cifra, no el razonamiento.
    #
    # Los factores sí viajan —son la justificación— pero sin su peso.
    factors_for_json = [
        # `votes` también: sin él el informe ponía «Clipping» junto a un
        # índice que se enseña pero no influye en la recomendación.
        {"name": f["name"], "direction": f["direction"],
         "source": f.get("source", ""), "votes": bool(f.get("votes", True))}
        for f in result.get("factors", [])
    ]
    write_state(req.session_id, "treatment.factors_json", json.dumps(factors_for_json))
    write_state(req.session_id, "treatment.notes_json",
                json.dumps(result.get("notes", [])))
    write_state(req.session_id, "treatment.endovascular_json",
                json.dumps(result.get("endovascular") or {}))
    write_state(req.session_id, "treatment.perforators_json",
                json.dumps(result.get("perforators") or {}))
    # El JSDB viaja entero al informe. Es lo único de la pantalla que trae un
    # modelo ajustado detras, asi que perderlo al imprimir seria perder la
    # unica cifra validada del paso.
    write_state(req.session_id, "treatment.jsdb_json",
                json.dumps(result.get("jsdb") or {}))

    # El contexto clínico. La edad ya puntúa; las comorbilidades siguen sin
    # hacerlo —no hay estructura publicada que trasladar— y se imprimen junto a
    # la recomendación, que es donde de verdad pesan: la sesión multidisciplinar.
    write_state(req.session_id, "clinical.wfns_grade",
                "" if req.wfns_grade is None else str(req.wfns_grade))
    write_state(req.session_id, "clinical.fisher_grade",
                "" if req.fisher_grade is None else str(req.fisher_grade))
    write_state(req.session_id, "clinical.patient_age",
                "" if req.patient_age is None else str(req.patient_age))
    write_state(req.session_id, "clinical.prior_stroke",
                "" if req.prior_stroke is None else str(req.prior_stroke))
    write_state(req.session_id, "clinical.has_comorbidities",
                "1" if req.has_comorbidities else "0")

    # La respuesta entera y lo que se pidió. Reanudar volvía sin decisión
    # (F1-27): las claves de arriba son las que lee el informe, no bastan para
    # rehacer la pantalla (faltan la cobertura, las notas, los factores con su
    # fuente…), y sin decisión «Planificar dispositivos» quedaba apagado. Las
    # entradas van en `clinical.*` porque son lo escrito a mano: cambiar la
    # localización borra la decisión, no lo que la persona tecleó.
    write_state(req.session_id, RESULT_KEY, TreatmentDecisionResult(**result).model_dump_json())
    write_state(req.session_id, INPUTS_KEY, req.model_dump_json(exclude={"session_id"}))

    # La recomendación es lo que el informe imprime y lo que se lleva a la
    # sesión multidisciplinar: queda quién la pidió y con qué salió. La
    # constante existía y nadie la usaba.
    audit_append(ACT_TREATMENT_DECISION, {
        "session_id": req.session_id,
        "recommendation": result.get("recommendation_key", ""),
        "confidence": result.get("confidence", ""),
        "ruptured": bool(req.is_ruptured),
    }, username=current_user.username if current_user else "")

    out = TreatmentDecisionResult(**result)
    out.team = stored_team(req.session_id)
    return out


# ── PUT/GET /treatment-decision/{session_id}/team ─────────────────────────── #

@router.put(
    "/treatment-decision/{session_id}/team",
    response_model=TeamDecision,
    summary="Record the team's decision",
    description=(
        "What the team decided (clipaje, endovascular, vigilar u otra) and who "
        "decided it, kept apart from the engine's recommendation: the report "
        "prints it first, under «Plan elegido». It survives re-evaluating or "
        "changing the location; only clearing the decision step removes it. "
        "`team_decision: null` removes it."
    ),
)
async def set_team_decision(
    session_id: str,
    req: TeamDecisionRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> TeamDecision:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    require_session(db, current_user, session_id)
    if req.team_decision is None:
        for key in TEAM_KEYS:
            write_state(session_id, key, "")
    else:
        write_state(session_id, "treatment.team_decision", req.team_decision)
        write_state(session_id, "treatment.decided_by", req.decided_by.strip())
        write_state(session_id, "treatment.team_other",
                    req.other_text.strip() if req.team_decision == "otra" else "")
    team = stored_team(session_id) or TeamDecision()
    # Es lo que se lleva a la historia: queda quién la registró y qué puso.
    audit_append(ACT_TREATMENT_DECISION, {
        "session_id": session_id, "team": team.model_dump(),
    }, username=current_user.username if current_user else "")
    return team


@router.get(
    "/treatment-decision/{session_id}/team",
    response_model=TeamDecision,
    summary="The team's recorded decision",
    description=(
        "The team's decision on its own, also when no recommendation was "
        "computed (the team can decide without the engine). "
        "`team_decision` is null when none was recorded."
    ),
)
async def get_team_decision(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> TeamDecision:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    require_session(db, current_user, session_id)
    return stored_team(session_id) or TeamDecision()


# ── GET /treatment-decision/{session_id} ──────────────────────────────────── #

@router.get(
    "/treatment-decision/{session_id}",
    response_model=TreatmentDecisionResult,
    summary="The stored CLIP vs ENDOVASCULAR recommendation",
    description=(
        "Returns the last recommendation computed in this session, exactly as "
        "POST /treatment-decision returned it, without recomputing. 404 when "
        "none was computed (or it was cleared). A resumed session needs it: "
        "without it the decision step came back empty and device planning "
        "stayed disabled."
    ),
)
async def get_treatment_decision(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> TreatmentDecisionResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    # Es el trabajo de una sesión ligada a un paciente: solo quien lo ve.
    require_session(db, current_user, session_id)
    stored = stored_decision(session_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Esta sesión no tiene una decisión guardada.")
    return stored


# ── DELETE /treatment-decision/{session_id} ───────────────────────────────── #

#: Everything the decision engine and its clinical context write. The report
#: reads these keys directly, so clearing the recommendation on screen without
#: clearing them left the PDF recommending a treatment for an aneurysm whose
#: measurements had already been discarded.
TREATMENT_STATE_KEYS = (
    "treatment.recommendation", "treatment.recommendation_key",
    "treatment.confidence",
    # Ya no se escriben, pero una sesión guardada antes de retirarlas las tiene
    # dentro: se siguen borrando para que no reaparezcan en su informe.
    "treatment.clip_pct", "treatment.endo_pct",
    "treatment.clip_points", "treatment.endo_points",
    "treatment.factors_json", "treatment.notes_json",
    "treatment.endovascular_json", "treatment.perforators_json",
    "treatment.jsdb_json", "treatment.location", RESULT_KEY,
    "clinical.patient_age", "clinical.has_comorbidities",
    "clinical.wfns_grade", "clinical.fisher_grade", "clinical.prior_stroke",
    INPUTS_KEY,
)

#: The PHASES score is a rupture risk built on the same morphometry, so it goes
#: whenever the decision does.
PHASES_STATE_KEYS = ("phases.json",)


def clear_decision_only(session_id: str) -> None:
    """La recomendación y nada más: ni el contexto clínico escrito a mano
    (`clinical.*`) ni las puntuaciones. Lo usa el cambio de localización, que
    deja la decisión de otro sitio pero no toca la edad ni el WFNS."""
    for key in TREATMENT_STATE_KEYS:
        if key.startswith("treatment."):
            write_state(session_id, key, "")


def clear_treatment_state(session_id: str) -> None:
    """Forget the recommendation, its clinical context and the PHASES score.

    Never the team's decision (TEAM_KEYS): it is typed by hand, and losing it
    without anyone asking is what the F1 audit blocks. It goes only when the
    team chooses «Sin registrar» in its own card (PUT …/team with null)."""
    for key in (*TREATMENT_STATE_KEYS, *PHASES_STATE_KEYS):
        write_state(session_id, key, "")


@router.delete(
    "/treatment-decision/{session_id}",
    summary="Clear the treatment recommendation",
    description=(
        "Removes the CLIP vs ENDOVASCULAR recommendation, the clinical context "
        "recorded alongside it and the PHASES score, so none of them reach the "
        "PDF or the DICOM SR.\n\n"
        "Called on its own from the decision step, and automatically whenever the "
        "morphometry underneath is discarded. Idempotent. The team's decision "
        "(PUT …/team) is kept: it is removed only from its own card."
    ),
)
async def clear_treatment(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    # Borra trabajo de una sesión ligada a un paciente: solo quien lo ve.
    require_session(db, current_user, session_id)
    clear_treatment_state(session_id)
    return {"status": "cleared"}
