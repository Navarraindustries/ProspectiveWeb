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
