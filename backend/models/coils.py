"""Endovascular coil embolization models.

Matches prospective/models/coil_library.py and prospective/ui/widgets/coil_panel.py.
Step 5 — Planificación › Embolización (Coils).
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from .detection import Position3D


class CoilLibraryItem(BaseModel):
    """An endovascular coil model from the device library."""

    id: str
    name: str = Field(..., description="Commercial name (e.g. 'Target 360 Nano')")
    manufacturer: str
    diameter_mm: float = Field(
        ..., description="Primary coil loop diameter (mm). Typical: 2–20 mm"
    )
    length_cm: float = Field(
        ..., description="Coil length when uncoiled (cm). Typical: 5–40 cm"
    )
    coil_type: str = Field(
        ..., description="Type: 'framing' | 'filling' | 'finishing' | 'flow_assist'"
    )
    is_detachable: bool = Field(
        True, description="True for electrolytically detachable coils (GDC-type)"
    )


class CoilPlacement(BaseModel):
    """One coil placed inside the aneurysm sac."""

    coil_id: str = Field(..., description="ID of the coil from the library")
    position: Position3D = Field(
        ..., description="Approximate coil centre in patient space (mm)"
    )
    packing_density: float = Field(
        ..., ge=0.0, le=1.0,
        description="Local packing density contribution from this coil (0–1)"
    )


class CoilPlanRequest(BaseModel):
    """Request to update the coil embolization plan."""

    session_id: str
    placements: list[CoilPlacement] = Field(
        ..., description="All coils placed inside the aneurysm sac"
    )


class CoilConstructStep(BaseModel):
    """One rung of the suggested construct: which model, how many, and why."""

    coil_id: str
    name: str
    manufacturer: str
    diameter_mm: float
    length_cm: float
    role: str = Field(..., description="framing | filling | finishing")
    count: int = Field(..., ge=1)
    rationale: str


class CoilConstructResult(BaseModel):
    """Catalogue filtered by the measured sac, with a suggested sequence.

    Real coiling runs framing (shapes the cage) then filling then finishing.
    The UI used to send N identical coils at one point, and the catalogue was
    offered unfiltered — so a 12 mm framing coil could be picked for a 3 mm sac.
    The sizing rules behind this already existed in `services/coils.py`; they
    were imported by the router and never called.
    """

    steps: list[CoilConstructStep] = Field(default_factory=list)
    dome_mm: float = 0.0
    volume_mm3: float = 0.0
    projected_packing: float = Field(
        0.0, ge=0.0, le=1.0,
        description=(
            "Packing the construct would reach, from catalogue wire volumes. "
            "An arithmetic projection, not a prediction of how the coils will "
            "actually settle inside the sac."
        ),
    )
    feasible: bool = False
    note: str = ""


class CoilPlanResult(BaseModel):
    """Result of a coil embolization plan."""

    coils_mesh_url: str = Field(
        ..., description="URL of the coil bundle mesh (.vtp) for 3D display"
    )
    total_packing_density: float = Field(
        ..., ge=0.0, le=1.0,
        description=(
            "Measured packing density of the aneurysm sac: total coil wire volume "
            "(from the catalogue) divided by the sac volume (from morphometry). "
            "Warning below 0.20; planning aims at 0.25."
        ),
    )
    packing_min: float = Field(
        0.20, ge=0.0, le=1.0,
        description="Packing density below which coil compaction is described.",
    )
    meets_minimum: bool = Field(
        False, description="Whether the measured packing reaches `packing_min`.",
    )
    durability: str = Field(
        "",
        description=(
            "What the measured packing density supports saying. Deliberately not "
            "an occlusion forecast: the Raymond-Roy grade is read off the "
            "post-procedure angiogram, and no published curve maps packing "
            "density onto it. An earlier version returned "
            "`estimated_occlusion_pct` from a hand-tuned exponential with no "
            "source; that field was removed rather than re-derived."
        ),
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Published sources behind the packing thresholds.",
    )
    warning: str | None = Field(
        None,
        description="Warning when the measured packing density is below `packing_min`.",
    )
