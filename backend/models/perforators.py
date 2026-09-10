"""Perforator risk detection models."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .detection import Position3D


# Risk level encoding:
#   1 = HIGH   (red)    distance < 3 mm from neck
#   2 = MEDIUM (yellow) distance 3–6 mm from neck
#   3 = LOW    (green)  distance > 6 mm from neck
RiskLevel = Literal[1, 2, 3]

RISK_LABELS: dict[int, str] = {1: "Alto", 2: "Medio", 3: "Bajo"}
RISK_COLORS: dict[int, str] = {1: "#ef4444", 2: "#eab308", 3: "#22c55e"}

# Clinically realistic ranges for perforators:
#   Lenticulostriate arteries:  diameter 0.3–1.5 mm
#   Distance threshold (high):  < 3 mm from neck
#   Distance threshold (medium): 3–5 mm from neck
# The authoritative radii live in routers/perforators.py (_ZONE_RADII) and now
# travel on the result, so the UI cannot drift from them the way this comment
# and the viewer legend both had (they said 3–6 mm while 3–5 was computed).


class PerforatorCandidate(BaseModel):
    """A single perforator vessel candidate near the aneurysm neck."""

    id: str = Field(..., description="Unique identifier for this candidate")
    position_mm: Position3D = Field(
        ..., description="Center of the perforator vessel in patient space (mm)"
    )
    radius_mm: float = Field(
        ..., ge=0.1, le=5.0,
        description="Estimated vessel radius (mm). Typical range: 0.15–0.75 mm",
    )
    distance_to_neck_mm: float = Field(
        ..., ge=0.0,
        description="Distance from this vessel to the aneurysm neck plane (mm)",
    )
    risk_level: RiskLevel = Field(
        ...,
        description="Risk classification: 1=High (<3 mm), 2=Medium (3–6 mm), 3=Low (>6 mm)",
    )
    risk_label: str = Field(
        ..., description="Human-readable risk label ('Alto', 'Medio', 'Bajo')"
    )
    risk_color: str = Field(
        ..., description="Hex color for 3D display (#ef4444, #eab308, #22c55e)"
    )


class PerforatorsResult(BaseModel):
    """Branch origins found near the aneurysm neck.

    Not perforators in the strict sense: a true perforator is 0.1–0.5 mm and CT
    or MR angiography does not resolve it, so it never reaches the mesh. What is
    listed here are VISIBLE branch origins — the most the imaging allows — and an
    empty list is not evidence that there are none.
    """

    calibre_floor_mm: float = Field(
        0.0,
        description=(
            "Vessel diameter below which this scan cannot resolve anything, set "
            "by the voxel size it ran at. Travels with the result so an empty "
            "list cannot be read as «there are none»."
        ),
    )
    scanned_mesh_points: int = Field(
        0, description="Points in the mesh the scan actually ran on."
    )
    candidates: list[PerforatorCandidate] = Field(
        ..., description="List of all detected branch origins"
    )
    high_count: int = Field(..., description="Number of high-risk candidates (risk_level=1)")
    medium_count: int = Field(..., description="Number of medium-risk candidates (risk_level=2)")
    low_count: int = Field(..., description="Number of low-risk candidates (risk_level=3)")
    search_radius_mm: float = Field(
        ...,
        description="Radius around the neck used to search for perforators (mm)",
    )
    zone_radii_mm: list[float] = Field(
        default_factory=lambda: [3.0, 5.0, 8.0],
        description=(
            "Outer radius of each risk zone: [high, medium, low] in mm. Sent so "
            "the viewer legend states the bands actually used instead of "
            "hard-coding its own."
        ),
    )
