"""Stent planning models."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .detection import Position3D


class StentParams(BaseModel):
    """Parameters that define how the stent is placed."""

    stent_id: str = Field(
        ...,
        description="Identifier of the stent model from the device library",
    )
    diameter_mm: float = Field(
        ..., ge=1.0, le=10.0,
        description="Stent nominal diameter (mm). Typical range: 2.5–5.0 mm",
    )
    length_mm: float = Field(
        ..., ge=5.0, le=50.0,
        description="Stent deployed length (mm). Typical range: 15–35 mm",
    )
    position: Position3D = Field(
        ..., description="Stent center position in patient space (mm)"
    )
    rotation_deg: float = Field(
        0.0, ge=-180.0, le=180.0,
        description="Rotation around the vessel axis (degrees)",
    )


class PlanRequest(BaseModel):
    """Request to compute a stent deployment plan."""

    session_id: str
    stent: StentParams


class PlanResult(BaseModel):
    """Result of a stent deployment plan."""

    stent_mesh_url: str = Field(
        ...,
        description="URL of the deployed stent mesh (.vtp) for 3D visualization",
    )
    coverage_pct: float = Field(
        ..., ge=0.0, le=100.0,
        description=(
            "How much of the neck plus its landing zones the device actually "
            "spans, as a percentage — the quantity this field's name always "
            "claimed. 100% means the stent bridges the neck with 5 mm of "
            "anchorage each side. NOTE: this is NOT metal coverage over the "
            "ostium; that depends on the parent-vessel diameter, which this "
            "planner does not measure. A previous version returned an unsourced "
            "metal-coverage figure here (32% plus an oversizing bonus whose sign "
            "was backwards)."
        ),
    )
    neck_diameter_covered_mm: float = Field(
        ...,
        description="Length of the neck diameter effectively spanned by the stent (mm)",
    )
    required_length_mm: float = Field(
        0.0,
        description="Length the device needs to bridge the neck plus both landing zones (mm)",
    )
    deployed: bool = Field(
        True, description="False if the requested parameters are geometrically incompatible"
    )
    notes: list[str] = Field(
        default_factory=list,
        description="What this planner is not computing, stated explicitly.",
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Published sources behind the sizing statements.",
    )
    warning: str | None = Field(
        None,
        description="Warning shown when the device cannot bridge the neck or is out of range",
    )


class StentLibraryItem(BaseModel):
    """A single stent model available in the device library."""

    id: str
    name: str = Field(..., description="Commercial name of the stent")
    manufacturer: str
    min_diameter_mm: float
    max_diameter_mm: float
    available_lengths_mm: list[float]
    type: str = Field(
        ..., description="Stent type: 'flow_diverter' | 'coil_assist' | 'neck_bridge'"
    )


class DeviceClearResult(BaseModel):
    """Outcome of removing placed devices from a session's plan."""

    cleared: list[str] = Field(
        default_factory=list,
        description="Device families this call cleared ('clips' | 'coils' | 'stent')",
    )
    remaining: list[str] = Field(
        default_factory=list,
        description="Device families that still hold a plan after the call",
    )
    meshes_removed: int = Field(
        0, description="Device mesh files (.vtp) deleted from the session"
    )
    mesh_urls: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Mesh URL per still-placed device family. Lets a resumed session put "
            "its devices back in the 3D viewer, which otherwise showed an empty "
            "scene while the report still listed them."
        ),
    )
