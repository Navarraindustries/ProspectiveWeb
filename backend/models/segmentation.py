"""Segmentation request / result models."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .detection import Position3D


class AutoThresholdResult(BaseModel):
    """Auto-computed thresholds suggested to the user before segmentation."""

    lower: float = Field(..., description="Lower iso-surface threshold (HU or raw units)")
    upper: float = Field(..., description="Upper iso-surface threshold (HU or raw units)")
    strategy: Literal[
        "dsa",                # DSA subtraction detected (p99 < 0, max >> 0)
        "xa_band_pass",       # 3DRA wide WW > 2000 → p90–p99 band
        "xa_wc_ww",           # 3DRA narrow WW → calibrated WC/WW formula
        "xa_window_mismatch", # 3DRA whose WC/WW is a display preset → p99–p99.9 band
        "xa_raw16",           # 3DRA raw 16-bit (no HU rescale) → p99–p99.9 band
        "ct_stats",           # CTA with contrast → WC-based formula clamped to [150, 500] HU
        "ct_wc_ww",           # CT fallback → WC/WW derivation
        "mr_percentile",      # MR → p90–p99 of non-background voxels
        "wc_ww",              # Generic fallback
    ] = Field(..., description="Strategy used to compute the thresholds")
    is_dsa: bool = Field(
        False,
        description="True when DSA subtraction was detected (background ≈ -1024 HU)",
    )
    hint: str = Field(
        ...,
        description=(
            "Human-readable explanation of the chosen strategy, "
            "shown as a tip in the segmentation panel"
        ),
    )
    voxel_fraction: float | None = Field(
        None,
        description=(
            "Fraction of voxels captured by [lower, upper] in the full volume (0–1). "
            "Null when the DICOM volume has not been loaded yet. "
            "Values > 0.15 usually indicate the threshold is too permissive."
        ),
    )


class SegmentRequest(BaseModel):
    """Parameters sent by the user to launch the segmentation pipeline."""

    session_id: str
    series_id: str
    lower: float = Field(..., description="Lower iso-surface threshold (HU)")
    upper: float = Field(..., description="Upper iso-surface threshold (HU)")
    smoothing: int = Field(
        3, ge=0, le=10,
        description="Smoothing level 0–10 (combines Laplacian smoothing + decimation)",
    )
    cleanup: int = Field(
        3, ge=0, le=10,
        description="Cleanup level 0–10 (removes disconnected mesh fragments)",
    )
    main_tree_only: bool = Field(
        False,
        description=(
            "Keep only the largest connected component. Measured on this "
            "project's angiographic studies, that component IS the vessel tree "
            "(case 3: 60.3%, case 9: 63.7%) and everything else is bone: pieces "
            "of 228-2948 mm3 sitting 37-92 mm away, which no speck filter "
            "reaches and no HU threshold separates (99% of the bone falls inside "
            "the tree's own intensity range). Refused with a message on CTA, "
            "where contrast touches bone and the largest component is the whole "
            "head (795000-1220000 mm3) - there the seed-grow tool is the answer."
        ),
    )
    full_resolution: bool = Field(
        False,
        description=(
            "Segment at the volume's native resolution instead of downsampling "
            "the longest axis to 256. Halving a volume also halves the tree's "
            "connectivity — measured on case 9 the largest connected component "
            "falls from 69% to 42% — so thin vessels break into fragments that "
            "the cleanup then removes, leaving visible gaps. Costs minutes "
            "instead of seconds on a 384³ or larger study."
        ),
    )


class SuggestedBand(BaseModel):
    """Adaptive starting band derived from the volume's own intensity histogram.

    A single universal rule (percentile-based) — not a per-modality preset — so
    the sliders start in the right place for ANY scale (CT HU, 3DRA raw, MR).
    """

    lower: float = Field(..., description="Suggested lower threshold (starting band)")
    upper: float = Field(..., description="Suggested upper threshold (starting band)")
    vmin: float = Field(..., description="Robust minimum for the slider range (p0.5)")
    vmax: float = Field(..., description="Robust maximum for the slider range (p99.9)")


class PreviewRequest(BaseModel):
    """Fast coarse-mesh preview while the user tunes the thresholds."""

    lower: float
    upper: float
    cleanup: int = Field(7, ge=0, le=10, description="Cleanup level 0–10 (top-N isolation)")
    downsample: int = Field(3, ge=1, le=6, description="Volume stride for the coarse preview")


class PreviewResult(BaseModel):
    mesh_url: str = Field(..., description="URL of the coarse preview mesh (.vtp), cache-busted")
    vertices: int
    voxel_fraction: float = Field(..., description="Fraction of voxels in [lower, upper] (0–1)")


class SegmentResult(BaseModel):
    """Mesh produced by the segmentation pipeline."""

    mesh_url: str = Field(
        ...,
        description=(
            "URL of the segmented mesh file (.vtp) relative to the API base. "
            "Loaded directly by vtk.js in the browser."
        ),
    )
    voxel_fraction: float | None = Field(
        None,
        description="Fraction of voxels captured by the applied thresholds (0–1). Null until real segmentation runs.",
    )
    strategy: str = Field(..., description="Strategy that produced the auto-thresholds")
    is_dsa: bool = Field(False, description="True when DSA mode was active")
    vertices: int = Field(..., description="Number of vertices in the output mesh")
    faces: int = Field(..., description="Number of triangular faces in the output mesh")
    kept_fraction: float = Field(
        1.0,
        description=(
            "Share of the thresholded volume that survived the cleanup filter "
            "(0–1). Below ~0.9 the mesh may be missing vessel branches."
        ),
    )
    fragments_removed: int = Field(
        0, description="Connected components discarded by the cleanup filter"
    )
    main_tree_applied: bool = Field(
        False,
        description="True when 'keep only the main tree' actually ran.",
    )
    main_tree_warning: str = Field(
        "",
        description=(
            "Why it did not run, when it was asked for and refused. A button "
            "that silently does nothing is worse than one that explains."
        ),
    )
    main_tree_removed: int = Field(
        0, description="Connected components the main-tree filter discarded"
    )
    downsample_factor: int = Field(
        1,
        description=(
            "Voxel-decimation factor used (1 = native resolution). Above 1 the "
            "tree is measurably less connected, so gaps in the mesh are expected."
        ),
    )
    largest_removed_mm3: float = Field(
        0.0,
        description=(
            "Volume of the biggest discarded component, in mm³. A few mm³ is a "
            "speck; tens of mm³ is a vessel segment that left the mesh."
        ),
    )
    threshold_lower: float = Field(
        0.0,
        description=(
            "Lower threshold the mesh was built with. The client MIP starts its "
            "vessel transfer function here instead of at a fixed HU value."
        ),
    )


class CeilingCompareRequest(BaseModel):
    """Probar la banda CON y SIN techo, y contrastar lo que detecta cada una.

    La casilla «sin límite superior» no puede tener un valor por defecto: los
    dos casos anotados del proyecto piden lo contrario. Y no se puede decidir
    sola —se midió la regla evidente y no separa—, así que se prueban las dos.
    """

    lower: float = Field(..., description="Umbral inferior (el mismo para ambas)")
    upper: float = Field(..., description="Techo a contrastar contra no tener ninguno")
    smoothing: int = Field(3, ge=0, le=10)
    cleanup: int = Field(7, ge=0, le=10)
    main_tree_only: bool = True
    full_resolution: bool = Field(
        False,
        description=(
            "Debe valer lo MISMO que en el botón de segmentar. Si no, la "
            "comparación describe una malla distinta de la que se obtendrá."
        ),
    )


class ComparedCandidate(BaseModel):
    """Un sitio propuesto, y en qué configuración aparece."""

    position: Position3D
    diameter_mm: float
    channels: list[str] = Field(default_factory=list)
    rank_con_techo: int | None = Field(
        None, description="Puesto con el techo puesto; null si no aparece así")
    rank_sin_techo: int | None = Field(
        None, description="Puesto sin techo; null si no aparece así")
    en_ambas: bool = False


class CeilingCompareResult(BaseModel):
    """Las dos listas fundidas. No cambia la malla de la sesión."""

    candidates: list[ComparedCandidate] = Field(default_factory=list)
    vertices_con_techo: int = 0
    vertices_sin_techo: int = 0
    n_con_techo: int = 0
    n_sin_techo: int = 0
    note: str = ""
