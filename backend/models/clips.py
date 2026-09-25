"""Surgical clip planning models.

Matches prospective/models/clip_library.py and prospective/ui/widgets/clip_panel.py.
Step 5 — Planificación › Planificación clips.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .detection import Position3D


class ClipLibraryItem(BaseModel):
    """A surgical clip model from the device library."""

    id: str
    name: str = Field(..., description="Commercial name (e.g. 'Yasargil FT740T')")
    manufacturer: str
    length_mm: float = Field(..., description="Blade length (mm). Typical: 5–20 mm")
    angle_deg: float = Field(
        0.0, description="Clip angle (0 = straight, 90 = right-angle)"
    )
    is_fenestrated: bool = Field(
        False, description="True for fenestrated clips used on vessel bifurcations"
    )
    closing_force_g: float = Field(
        ..., description="Closing force in grams (typical: 80–200 g)"
    )
    compatible_applier: str = Field(
        ..., description="Required applier instrument model"
    )


class ClipPlacement(BaseModel):
    """One clip placed on the aneurysm neck."""

    clip_id: str = Field(..., description="ID of the clip from the library")
    position: Position3D = Field(..., description="Clip jaw centre in patient space (mm)")
    normal: list[float] = Field(
        ..., description="Clip blade normal vector [nx, ny, nz] — perpendicular to blade"
    )
    rotation_deg: float = Field(
        0.0, ge=-180.0, le=180.0,
        description="Rotation around the normal axis (degrees)"
    )


class ClipPlanRequest(BaseModel):
    """Request to add or update a clip in the planning."""

    session_id: str
    placements: list[ClipPlacement] = Field(
        ..., description="All clips to place (replaces the current plan)"
    )
    trajectory_entry: Position3D | None = Field(
        None, description="Surgical approach entry point in patient space (mm)"
    )
    trajectory_target: Position3D | None = Field(
        None, description="Surgical approach target point in patient space (mm)"
    )


class BranchUnderClipOut(BaseModel):
    """A visible branch origin within reach of the placed clip."""

    index: int
    position_mm: Position3D
    calibre_mm: float = Field(..., description="Branch diameter measured on the mesh (mm)")
    distance_to_clip_mm: float = Field(
        ..., description="Distance from the branch origin to the clip surface (mm)"
    )


class ClipPlanResult(BaseModel):
    """Result of a clip placement plan."""

    clips_mesh_url: str = Field(
        ..., description="URL of the combined clips mesh (.vtp) for 3D display"
    )
    trajectory_mesh_url: str | None = Field(
        None, description="URL of the trajectory cylinder mesh (.vtp)"
    )
    neck_coverage_pct: float = Field(
        ..., ge=0.0, le=100.0,
        description="Percentage of the neck cross-section occluded by the clips"
    )
    collision_detected: bool = Field(
        False,
        description=(
            "True when a clip intersects anatomy OUTSIDE the neck region. "
            "Touching the neck is what a clip is for, so it is not reported "
            "here: testing against a mesh that still contains the neck answers "
            "«is the clip where it should be?» and calls «yes» a collision."
        ),
    )
    neck_region_excluded: bool = Field(
        False,
        description=(
            "Whether the neck could be carved out before testing. False without "
            "a measured neck — the figure then includes the neck itself and is "
            "not a judgement about fit."
        ),
    )
    branches_under_clip: list["BranchUnderClipOut"] = Field(
        default_factory=list,
        description=(
            "Visible branch origins the placed clip reaches, nearest first. "
            "Measured against the clip's geometry rather than the neck centre, "
            "because the jaw length is exactly what decides how far the closing "
            "line extends. Not perforators \u2014 see the branch scan's calibre floor."
        ),
    )
    warning: str | None = Field(
        None, description="Warning when collision or poor coverage is detected"
    )


class ClipRecommendation(BaseModel):
    """Clip recommendation from the Clip Recommender assistant."""

    clip_id: str
    clip_name: str
    score: float = Field(..., description="Recommendation score (higher = better fit)")
    reason: str = Field(..., description="One-line clinical rationale for this clip")
    suggested_placement: ClipPlacement | None = Field(
        None, description="Pre-computed suggested placement, if available"
    )


# ── Clip selection (criteria-based recommender) ───────────────────────────── #
# `ClipRecommendation` above is the original one-score-plus-one-sentence answer
# and stays for the existing endpoint. The models below carry the reasoning:
# what was judged, what the measurement was, and what to build when nothing in
# the inventory fits.


class ClipCriterion(BaseModel):
    """One judged aspect of a clip, with the measurement behind the verdict."""

    key: str = Field(..., description="coverage | fenestration | reach | shape | force | geometry")
    label: str = Field(..., description="Human label shown in the criteria matrix")
    verdict: Literal["ok", "warn", "fail"]
    detail: str = Field(..., description="The reason, including the number it came from")


class ClipFitCheck(BaseModel):
    """Result of posing the clip on the patient's measured neck plane."""

    collision: bool = Field(..., description="True when the best pose still touches a neighbouring structure")
    n_contacts: int = Field(0, description="Intersecting triangles in the best pose")
    span_mm: float = Field(0.0, description="Width of the clip across the neck plane (mm)")
    neck_coverage_pct: float = Field(0.0, ge=0.0, le=100.0)
    clean_rolls: int = Field(0, description="Approach angles, of those tried, that clear neighbouring vessels")
    n_rolls: int = Field(0, description="Approach angles tried")
    note: str = ""


class ClipCandidateOut(BaseModel):
    """A clip judged against this case."""

    clip_id: str
    clip_name: str
    manufacturer: str = ""
    shape: str = Field("", description="Recto | Curvo | Angulado 90° | Angulado 45° | Bayoneta | Fenestrado")
    blade_length_mm: float = 0.0
    closing_force_g: float = 0.0
    score: float = Field(0.0, ge=0.0, le=100.0, description="0 when any criterion failed")
    verdict: Literal["ok", "warn", "fail"] = "ok"
    headline: str = Field("", description="The single sentence to show under the clip name")
    coverage_ratio: float = 0.0
    safety_margin_mm: float = 0.0
    availability: Literal["stock", "made_to_order", "template"] = Field(
        "stock",
        description=(
            "'made_to_order' is a real design manufactured for the case — it "
            "competes like stock, but is not on a shelf today."
        ),
    )
    bend_angle_deg: float = Field(
        0.0,
        description=(
            "True bend angle. `shape` is a coarse class, so a family that bends "
            "in 15° steps would otherwise lose the angle that gets machined."
        ),
    )
    closing_force_min_g: float = 0.0
    closing_force_max_g: float = Field(
        0.0, description="Equal to the minimum when the force is a single value"
    )
    force_provisional: bool = Field(
        False, description="True when the force is a design band, not a characterised figure"
    )
    criteria: list[ClipCriterion] = Field(default_factory=list)
    fit: ClipFitCheck | None = Field(
        None, description="Present only for the candidates verified against the mesh"
    )


class ManufactureSpecOut(BaseModel):
    """The clip to have made, when the inventory cannot serve the case."""

    blade_length_mm: float
    blade_width_mm: float
    blade_height_mm: float
    spring_length_mm: float
    shape: str
    angle_deg: float
    closing_force_g: float
    fenestration_mm: float = Field(
        0.0, description="Inner window diameter (mm); 0 when a plain clip is specified"
    )
    neck_mm: float
    label: str = Field(..., description="One-line summary of the part to order")
    reasons: list[str] = Field(default_factory=list, description="Why no stock clip served")
    confidence_notes: list[str] = Field(
        default_factory=list, description="Assumptions a machinist still has to confirm"
    )
    stl_url: str | None = Field(
        None,
        description=(
            "Watertight STL built from the NAVARRO™ design, ready for a workshop. "
            "Null when the family cannot build this shape — a catalogue clip is "
            "bought, not made."
        ),
    )
    part_no: str = Field("", description="Traceability number shared by both dossiers")
    source: Literal["navarro", "commercial", "unavailable"] = Field(
        "navarro",
        description=(
            "'navarro' = made from the family; 'commercial' = the family has no "
            "such shape yet, use this catalogue clip; 'unavailable' = neither "
            "serves this neck."
        ),
    )
    piece_label: str = Field("", description="What to order, in one line")
    commercial_name: str = Field("", description="Catalogue clip to use, when source='commercial'")
    fallback_reason: str = Field("", description="Why the family could not build it")
    dossier_internal_url: str | None = Field(
        None, description="PDF for the institution: full traceability and the case it came from"
    )
    dossier_workshop_url: str | None = Field(
        None,
        description=(
            "PDF for a third-party workshop. Carries NO patient data by "
            "construction — dimensions, tolerances, material and the checks to run."
        ),
    )


class ClipCaseOut(BaseModel):
    """The measurements the selection was made from, echoed back for the panel."""

    neck_mm: float = 0.0
    required_jaw_mm: float = Field(
        0.0,
        description=(
            "Mordaza mínima que cierra este cuello. NO es el diámetro: al "
            "cerrarse las hojas el cuello queda aplastado y su línea de cierre "
            "mide más. Con el contorno medido es su perímetro partido por dos; "
            "sin él, el diámetro × 1,5 (Neurology India; el estudio numérico de "
            "2024 mide una deformación de al menos 1,4×)."
        ),
    )
    required_jaw_source: str = Field(
        "none",
        description="perimeter (contorno medido) | factor (regla ×1,5) | floor | none",
    )
    required_jaw_detail: str = Field("", description="De dónde sale el número, en una frase")
    approach_angle_deg: float | None = Field(
        None,
        description=(
            "Ángulo del corredor de abordaje establecido contra el eje "
            "cuello→domo. Null si no hay trayectoria marcada."
        ),
    )
    approach_bend_deg: float | None = Field(
        None,
        description=(
            "La acodadura que ese corredor pide: 90° − el ángulo anterior. Las "
            "hojas tienen que quedar cruzadas sobre el cuello y el mango salir "
            "por el corredor; el ángulo entre esas dos direcciones ES la "
            "acodadura. No es una tabla, es geometría."
        ),
    )
    dome_height_mm: float = 0.0
    max_diameter_mm: float = 0.0
    ar: float = 0.0
    dnr: float = 0.0
    parent_artery_mm: float = 0.0
    neck_source: str = "auto"
    neck_tilt_deg: float = 0.0
    region: str = ""
    laterality: str = ""
    aneurysm_type: str = ""


class CustomJawOut(BaseModel):
    """A made-to-order clip sized exactly to this case."""

    #: The id this piece is placed under. Without it the custom jaw was a
    #: picture: you could dial a length, look at it and download the STL, but
    #: not put it in the plan — so it was never collision-checked, never
    #: reached `placed_navarro_id`, and the order form went back to the length
    #: derived from morphometry instead of the one that had just been chosen.
    clip_id: str = ""
    series: str
    shape: str = Field("straight", description="straight | curved | angled | fenestrated")
    angle_deg: float
    window_mm: float = Field(0.0, description="Inner window diameter, fenestrated only")
    resizable: bool = Field(True, description="False for the curved series: its jaw is an arc")
    jaw_mm: float = Field(..., description="The jaw this neck wants (mm of useful grip)")
    nearest_drawn_mm: float = Field(
        ..., description="Closest jaw length that exists as drawn CAD"
    )
    label: str
    reason: str
    mesh_url: str | None = Field(None, description="Preview mesh (.vtp), once generated")
    stl_url: str | None = Field(None, description="STL to send out, once generated")


class MultiClipConstructOut(BaseModel):
    """Un montaje de varios clips para un cuello que ninguna hoja cierra sola.

    Es técnica descrita —tándem apilado, «picket fence» con las hojas solapadas
    y escalonadas a lo largo del cuello—, no un apaño: en la serie publicada se
    reconstruyen cuellos gigantes con cuatro y siete clips fenestrados. Lo que
    aporta aquí es la parte geométrica; cuál de las técnicas corresponde lo
    decide el cirujano, y eso viaja en `cautions`.
    """

    n_clips: int = Field(..., ge=2)
    jaws_mm: list[float] = Field(..., description="La mordaza de cada clip del montaje")
    required_mm: float = Field(
        ..., description="La línea de cierre que hay que cubrir (cuello aplastado)")
    covered_mm: float = Field(
        ..., description="Lo que cubre el montaje: n·mordaza − (n−1)·solape")
    overlap_mm: float = Field(
        ...,
        description=(
            "Cuánto monta cada hoja sobre la anterior. SUPUESTO de este "
            "software: las series describen el solape sin dar la distancia."
        ),
    )
    shape: str = Field("", description="La forma que pide el caso, para todas las piezas")
    label: str = ""
    cautions: list[str] = Field(default_factory=list)


class ClipSelectionResult(BaseModel):
    """The complete answer for one case.

    `outcome` is never "nothing found": when the inventory cannot serve, the
    answer is a manufacturing specification.
    """

    outcome: Literal["stock", "marginal", "manufacture", "unmeasured"] = Field(
        ...,
        description=(
            "'stock' = at least one clip meets every criterion; "
            "'marginal' = usable clips exist but all carry a caveat, so a custom "
            "alternative is offered too; 'manufacture' = nothing in the inventory "
            "fits; 'unmeasured' = no reliable neck, so no selection is possible"
        ),
    )
    summary: str
    case: ClipCaseOut
    recommended: list[ClipCandidateOut] = Field(default_factory=list)
    rejected: list[ClipCandidateOut] = Field(
        default_factory=list,
        description="Near misses, each carrying the one criterion that disqualified it",
    )
    manufacture: ManufactureSpecOut | None = None
    custom_jaw: CustomJawOut | None = Field(
        None,
        description=(
            "Offered when the drawn jaw sizes only bracket what the case needs and "
            "the family is manufactured per case, so an exact jaw is a real option."
        ),
    )
    multiclip: MultiClipConstructOut | None = Field(
        None,
        description=(
            "Varias mordazas que juntas cierran un cuello que ninguna cierra "
            "sola. Se ofrece JUNTO a la especificación de fabricación, no en su "
            "lugar: son las dos salidas del mismo callejón, y elegir entre "
            "mandar fabricar una pieza o poner dos que ya existen es del "
            "cirujano."
        ),
    )
    caveats: list[str] = Field(
        default_factory=list, description="What limits how much weight this selection can bear"
    )


class ClipAnimationResult(BaseModel):
    """Everything a viewer needs to play the clip going on.

    Three meshes rather than one: the body never moves, and each blade turns
    about the hinge. The viewer animates actor transforms, so the geometry is
    fetched once and the motion costs nothing per frame.
    """

    body_url: str = Field(..., description="The part that does not move (spring and grip)")
    blade_a_url: str
    blade_b_url: str

    hinge: Position3D = Field(..., description="Pivot point, in the clip's own frame")
    hinge_axis: list[float] = Field(
        ..., description="Unit axis the blades turn about, in the clip's own frame"
    )
    swing_deg: float = Field(
        ..., description="How far EACH blade turns to reach full open"
    )
    mechanics_assumed: bool = Field(
        True,
        description=(
            "True while the opening is inferred from how commercial clips behave "
            "rather than supplied by the manufacturer. A closed STL records no "
            "mechanism, so the UI must not imply the motion is specified."
        ),
    )

    approach_entry: Position3D = Field(..., description="Where the clip starts its run")
    approach_target: Position3D
    approach_is_default: bool = Field(
        ...,
        description=(
            "True when no corridor was marked and the clip descends along the neck "
            "normal from the side away from the dome — the one direction certain to "
            "be clear of the sac. Mark Entrada/Diana to use the real approach."
        ),
    )

    position: Position3D = Field(..., description="Final pose: where the clip ends up")
    normal: list[float]
    rotation_deg: float
    clip_name: str = ""
