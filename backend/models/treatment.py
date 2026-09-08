"""Treatment decision models — CLIP vs ENDOVASCULAR recommendation.

Matches prospective/processing/treatment_decision.py.
Step 5 — Planificación › Decisión terapéutica.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Aneurysm locations (from treatment_decision.py LOCATIONS list)
AneurysmLocation = Literal[
    "Desconocida / No especificada",
    "ACM — Arteria Cerebral Media",
    "ACA / ACoA — Arteria Comunicante Anterior",
    "ACI proximal (segm. cavernoso / clinoideo)",
    "ACI distal (PCOM / oftálmica)",
    "ACoP — Arteria Comunicante Posterior",
    "Basilar (punta, tronco o AICA)",
    "PICA / Vertebral",
    "Otra localización",
]

RecommendationKey = Literal["clip", "endo", "mdt", "surveillance"]
Confidence = Literal["Alta", "Moderada", "Baja"]


class DecisionFactor(BaseModel):
    """One contributing factor in the CLIP vs ENDO scoring."""

    name: str = Field(..., description="Short display name of the factor")
    detail: str = Field(..., description="One-line clinical rationale")
    direction: Literal["clip", "endo", "neutral"] = Field(
        ..., description="Which direction this factor pushes the recommendation"
    )
    points: int = Field(..., ge=0, description="Weight / magnitude of this factor")
    source: str = Field(
        "",
        description=(
            "Where the threshold comes from and where the WEIGHT comes from — "
            "rarely the same place. The thresholds are largely published; the "
            "weights are heuristic and say so, rather than looking derived."
        ),
    )


class TreatmentDecisionRequest(BaseModel):
    """Clinical context inputs needed to compute the CLIP vs ENDO recommendation."""

    session_id: str

    # Clinical inputs (optional — default to unknown/false when not provided)
    location: AneurysmLocation = Field(
        "Desconocida / No especificada",
        description="Anatomical location of the aneurysm",
    )
    is_ruptured: bool = Field(
        False, description="True if the aneurysm is acutely ruptured (SAH)"
    )
    patient_age: int | None = Field(
        None, ge=0, le=120,
        description=(
            "Patient age in years. Now scored: the validated Japan Stroke Data "
            "Bank model penalises clipping from 72 and coiling only from 80. "
            "Optional — the engine reports how much of the case it could see "
            "rather than refusing to answer."
        ),
    )
    wfns_grade: int | None = Field(
        None, ge=1, le=5,
        description=(
            "WFNS grade (1–5). Only exists for a ruptured aneurysm — it grades a "
            "subarachnoid haemorrhage — so it is ignored when `is_ruptured` is "
            "false, and never required. It is the heaviest variable in the "
            "validated model."
        ),
    )
    fisher_grade: int | None = Field(
        None, ge=1, le=4,
        description=(
            "Fisher grade (1–4) of blood on CT. Ruptured aneurysms only. Grade 4 "
            "argues for clipping: the validated model penalises coiling there, "
            "and a bulky haematoma can be evacuated in the same operation."
        ),
    )
    has_comorbidities: bool = Field(
        False,
        description=(
            "True if significant surgical comorbidities are present. Clinical "
            "context only — recorded in the report, not weighted by the engine."
        ),
    )


class TreatmentDecisionResult(BaseModel):
    """Full output of the CLIP vs ENDO decision engine."""

    # ── Scores ────────────────────────────────────────────────────────────── #
    clip_points: int = Field(
        0, ge=0, description="Raw points that argued for clipping — the actual sum"
    )
    endo_points: int = Field(
        0, ge=0, description="Raw points that argued for endovascular treatment"
    )
    clip_pct: int = Field(
        ..., ge=0, le=100,
        description=(
            "Clip points as a share of the total, 0–100. NOT a probability and "
            "not a proportion of patients: the ratio of two heuristic sums. Use "
            "it to draw a proportional bar, and show `clip_points` as the figure."
        ),
    )
    endo_pct: int = Field(..., ge=0, le=100, description="Endo share of the total, 0–100")
    coverage_pct: int = Field(
        100, ge=0, le=100,
        description=(
            "How much of the case the engine could actually evaluate, as a share "
            "of the weight available. Nothing is mandatory — and WFNS and Fisher "
            "cannot be, since they do not exist for an unruptured aneurysm — but "
            "confidence is capped by this, because agreement among the factors "
            "that were seen cannot make up for the ones that were not."
        ),
    )
    missing_inputs: list[str] = Field(
        default_factory=list,
        description="Inputs that applied to this case and were not supplied.",
    )
    notes: list[str] = Field(
        default_factory=list,
        description=(
            "Reasoning that is not a scored factor: why a small aneurysm is or "
            "is not a surveillance case, what the PHASES score says about it, "
            "and what the engine could not settle."
        ),
    )
    balance: int = Field(
        ..., description="clip_score − endo_score (positive → clip preferred)"
    )

    # ── Recommendation ────────────────────────────────────────────────────── #
    recommendation: str = Field(..., description="Human-readable recommendation string")
    recommendation_key: RecommendationKey = Field(
        ..., description="Machine-readable recommendation key"
    )
    confidence: Confidence = Field(..., description="Confidence level of the recommendation")

    # ── Factors breakdown ─────────────────────────────────────────────────── #
    factors: list[DecisionFactor] = Field(
        ..., description="All factors that contributed to the score, for display"
    )
    clip_factors: list[str] = Field(
        ..., description="Names of factors favouring clip"
    )
    endo_factors: list[str] = Field(
        ..., description="Names of factors favouring endovascular"
    )
