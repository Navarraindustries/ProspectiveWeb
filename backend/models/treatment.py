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
    votes: bool = Field(
        True,
        description=(
            "False para un factor que se ENSEÑA pero no influye en la "
            "recomendación. Los índices de forma son el caso: vienen de la "
            "literatura de riesgo de rotura, no están validados para elegir "
            "modalidad, y lo que sí sostienen está en `endovascular`. Borrar "
            "una medida porque no cuenta la esconde; enseñarla con su razón la "
            "deja discutible."
        ),
    )
    source: str = Field(
        "",
        description=(
            "Where the threshold comes from and where the WEIGHT comes from — "
            "rarely the same place. The thresholds are largely published; the "
            "weights are heuristic and say so, rather than looking derived."
        ),
    )


class EndovascularProfileOut(BaseModel):
    """What the endovascular option looks like for this geometry.

    Not a second recommendation. The engine chooses BETWEEN two treatments; this
    describes one of them, using the part of the morphology that has published
    backing for that question: the wide-neck definition predicts the need for a
    balloon or a stent, and a high aspect ratio predicts recanalisation after
    coiling.
    """

    technique: str = Field(
        "unknown", description="simple | assisted | diverter | unknown"
    )
    technique_label: str = ""
    rationale: str = ""
    durability: str = Field(
        "", description="What to expect of long-term occlusion, when the geometry says."
    )
    cautions: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


class JsdbItemOut(BaseModel):
    """Una variable del modelo JSDB, con lo que aportó."""

    label: str = ""
    detail: str = ""


class JsdbArmOut(BaseModel):
    """Una de las dos puntuaciones del JSDB: la del clipaje o la del coiling."""

    arm: Literal["clip", "coil"]
    label: str = ""
    #: Las variables que penalizan esta vía en ESTE paciente. Sin sus puntos:
    #: los autores no publican bandas ni un AUC —validan que la tasa de mal
    #: resultado correlaciona con la puntuación—, así que el número no se puede
    #: leer como un riesgo, y enseñarlo era el último puntaje en pantalla.
    #: Lo que el modelo sí sostiene es la COMPARACIÓN, y esa se queda.
    items: list[JsdbItemOut] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class JsdbOut(BaseModel):
    """Japan Stroke Data Bank — riesgo estimado por cada vía, por separado.

    No es una segunda recomendación ni un voto. El motor contesta «por qué vía»
    con una diferencia de puntos heurísticos; esto estima, con un modelo
    ajustado sobre 3 547 hemorragias, cómo de mal puede ir CADA vía.

    Sólo existe en aneurismas rotos: la cohorte entera es HSA. En un incidental
    es `null`, que dice algo distinto de dos ceros.
    """

    clip: JsdbArmOut
    coil: JsdbArmOut
    favours: Literal["clip", "coil", "tie"] = Field(
        ..., description="Cuál sale MENOS penalizado. Es el signo de una resta "
                         "entre dos riesgos estimados, no una indicación."
    )
    verdict: str = ""
    both_poor: bool = Field(
        False,
        description=(
            "Las dos vías puntúan alto. Es lo único que el motor no puede "
            "decir: su saldo 0 significa «empate», nunca «las dos van mal»."
        ),
    )
    known_pct: int = Field(100, ge=0, le=100)
    missing: list[str] = Field(default_factory=list)
    source: str = ""


class PerforatorTerritoryOut(BaseModel):
    """Las perforantes que la anatomía hace esperar en esta localización.

    **No es una medida de este paciente.** Una perforante mide 0.1-0.5 mm y el
    vóxel de una angio-TC ronda 0.5-1.0 mm, así que no llega a la malla y no se
    puede detectar. Esto es lo que un cirujano usa en su lugar: saber dónde
    nacen. Las variantes anatómicas son frecuentes.
    """

    arteries: str = ""
    supplies: str = ""
    consequence: str = ""
    surgical_note: str = ""
    sources: list[str] = Field(default_factory=list)


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
            "false, and never required. It no longer scores in the heuristic "
            "balance: it feeds the JSDB model, which has it fitted in three "
            "levels instead of two."
        ),
    )
    fisher_grade: int | None = Field(
        None, ge=1, le=4,
        description=(
            "Fisher grade (1–4) of blood on CT. Ruptured aneurysms only. Feeds "
            "the JSDB coiling score, where bulky blood penalises the "
            "endovascular route — a bulky haematoma can be evacuated during "
            "clipping. No longer scored twice in the heuristic balance."
        ),
    )
    prior_stroke: int | None = Field(
        None, ge=0, le=10,
        description=(
            "Number of previous strokes. The one JSDB variable this application "
            "did not collect anywhere. It is asymmetric in the model: coiling is "
            "penalised from the first, clipping only from the second. Not the "
            "same as PHASES' `earlier_sah`, which is narrower (a previous "
            "subarachnoid haemorrhage from another aneurysm). Ruptured cases only."
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

    # ── Sin puntuaciones ──────────────────────────────────────────────────── #
    #
    # El motor sigue sumando pesos por dentro —de ahí sale la recomendación—
    # pero el sumatorio no sale de aquí. Publicarlo invitaba a leer «CLIP 72 %»
    # como una probabilidad o como la proporción de pacientes a los que les fue
    # mejor, y no es ninguna de las dos cosas: es el cociente de dos sumas con
    # pesos elegidos a mano, sin una sola cohorte detrás que los ajuste. Lo que
    # el motor puede sostener es la recomendación y los factores que la
    # empujan, y eso es lo que sale. Pedido por dirección el 24-09-2026.
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
    endovascular: EndovascularProfileOut | None = Field(
        None,
        description=(
            "How the endovascular option looks here — technique, expected "
            "durability and caveats. Computed even when the recommendation is "
            "clipping: a multidisciplinary discussion compares both options, not "
            "just the winning one."
        ),
    )
    jsdb: JsdbOut | None = Field(
        None,
        description=(
            "Japan Stroke Data Bank: riesgo estimado de mal resultado al alta "
            "(mRS > 2) por CADA vía, con un modelo ajustado sobre 3 547 "
            "hemorragias. Null en un aneurisma no roto — su cohorte entera es "
            "HSA, así que sobre un incidental no dice nada, y eso no es un hueco."
        ),
    )
    perforators: PerforatorTerritoryOut | None = Field(
        None,
        description=(
            "Perforator territory expected at this location, from anatomy \u2014 not "
            "from this patient's imaging, which cannot resolve a 0.1-0.5 mm "
            "vessel. Null when no location was given: inventing a default "
            "territory would be filler."
        ),
    )
    notes: list[str] = Field(
        default_factory=list,
        description=(
            "Reasoning that is not a scored factor: why a small aneurysm is or "
            "is not a surveillance case, what the PHASES score says about it, "
            "and what the engine could not settle."
        ),
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
