"""Treatment decision router — CLIP vs ENDOVASCULAR."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

import json

from models import TreatmentDecisionRequest, TreatmentDecisionResult, DecisionFactor
from services.treatment import compute_decision
from services.sessions  import read_state, write_state, session_exists

router = APIRouter(prefix="/api", tags=["treatment"])


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
        "Runs the 8-factor evidence-based decision engine using aneurysm morphometry "
        "(stored in the session after Step 3 — Detección/Morfometría) and optional "
        "clinical inputs (location, rupture status). "
        "Returns a scored recommendation with full factor breakdown.\n\n"
        "**References:** ISAT 2002, BRAT 2013, AHA/ASA Guidelines 2015."
    ),
)
async def compute_treatment_decision(
    req: TreatmentDecisionRequest,
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

    result = compute_decision(
        phases=phases,
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
    )

    # Persist treatment result to session state for report generation (Session E).
    write_state(req.session_id, "treatment.recommendation",     result["recommendation"])
    write_state(req.session_id, "treatment.recommendation_key", result["recommendation_key"])
    write_state(req.session_id, "treatment.confidence",         result["confidence"])
    write_state(req.session_id, "treatment.clip_pct",           str(result["clip_pct"]))
    write_state(req.session_id, "treatment.endo_pct",           str(result["endo_pct"]))
    write_state(req.session_id, "treatment.clip_points",        str(result["clip_points"]))
    write_state(req.session_id, "treatment.endo_points",        str(result["endo_points"]))
    # Serialise factors list as JSON for report builder. `source` travels with
    # them: a weight without its provenance reads as if it had been derived.
    factors_for_json = [
        {"name": f["name"], "direction": f["direction"], "points": f["points"],
         "source": f.get("source", "")}
        for f in result.get("factors", [])
    ]
    write_state(req.session_id, "treatment.factors_json", json.dumps(factors_for_json))
    write_state(req.session_id, "treatment.notes_json",
                json.dumps(result.get("notes", [])))
    write_state(req.session_id, "treatment.endovascular_json",
                json.dumps(result.get("endovascular") or {}))
    write_state(req.session_id, "treatment.perforators_json",
                json.dumps(result.get("perforators") or {}))

    # El contexto clínico. La edad ya puntúa; las comorbilidades siguen sin
    # hacerlo —no hay estructura publicada que trasladar— y se imprimen junto a
    # la recomendación, que es donde de verdad pesan: la sesión multidisciplinar.
    write_state(req.session_id, "clinical.wfns_grade",
                "" if req.wfns_grade is None else str(req.wfns_grade))
    write_state(req.session_id, "clinical.fisher_grade",
                "" if req.fisher_grade is None else str(req.fisher_grade))
    write_state(req.session_id, "clinical.patient_age",
                "" if req.patient_age is None else str(req.patient_age))
    write_state(req.session_id, "clinical.has_comorbidities",
                "1" if req.has_comorbidities else "0")

    return TreatmentDecisionResult(**result)


# ── DELETE /treatment-decision/{session_id} ───────────────────────────────── #

#: Everything the decision engine and its clinical context write. The report
#: reads these keys directly, so clearing the recommendation on screen without
#: clearing them left the PDF recommending a treatment for an aneurysm whose
#: measurements had already been discarded.
TREATMENT_STATE_KEYS = (
    "treatment.recommendation", "treatment.recommendation_key",
    "treatment.confidence", "treatment.clip_pct", "treatment.endo_pct",
    "treatment.clip_points", "treatment.endo_points",
    "treatment.factors_json", "treatment.notes_json",
    "treatment.endovascular_json", "treatment.perforators_json",
    "clinical.patient_age", "clinical.has_comorbidities",
    "clinical.wfns_grade", "clinical.fisher_grade",
)

#: The PHASES score is a rupture risk built on the same morphometry, so it goes
#: whenever the decision does.
PHASES_STATE_KEYS = ("phases.json",)


def clear_treatment_state(session_id: str) -> None:
    """Forget the recommendation, its clinical context and the PHASES score."""
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
        "morphometry underneath is discarded. Idempotent."
    ),
)
async def clear_treatment(session_id: str) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    clear_treatment_state(session_id)
    return {"status": "cleared"}
