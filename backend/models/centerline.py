"""Vessel centerline extraction models."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .detection import Position3D


class CenterlineRequest(BaseModel):
    """Request to extract the medial-axis centreline between two vessel points."""

    session_id: str
    source: Position3D = Field(..., description="Start point on/inside the vessel (mm)")
    target: Position3D | None = Field(
        None,
        description=(
            "End point on/inside the vessel (mm). Optional: without it the line ends "
            "INSIDE the lesion — the measured sac or, if there is none, the selected "
            "candidate — at its deepest point."
        ),
    )
    voxel_size_mm: float = Field(
        0.8, ge=0.3, le=2.0,
        description="Voxelisation resolution (mm). Lower = more accurate but slower.",
    )


class CenterlineResult(BaseModel):
    """Centreline geometry metrics + tube mesh URL for the 3D viewer."""

    centerline_mesh_url: str = Field(
        ..., description="URL of the centreline tube mesh (.vtp), radius ≈ vessel caliber"
    )
    n_points: int = Field(..., description="Number of resampled centreline points")
    arc_length_mm: float = Field(..., description="Total path length along the centreline")
    chord_length_mm: float = Field(..., description="Straight-line source → target distance")
    tortuosity: float = Field(
        ..., description="arc / chord (1.0 = perfectly straight; ≥1.25 = high)"
    )
    tortuosity_index_pct: float = Field(
        ..., description="(arc − chord) / chord as a percentage"
    )
    mean_diameter_mm: float = Field(..., description="Mean vessel diameter along the path")
    min_diameter_mm: float = Field(..., description="Minimum vessel diameter (narrowest point)")
    max_diameter_mm: float = Field(..., description="Maximum vessel diameter (widest point)")
    ends_in_lesion: bool = Field(False, description="The line ends inside the sac / selected candidate instead of at a picked point")
    mean_curvature_per_mm: float | None = Field(
        None, description="Mean curvature of the parent vessel along the smoothed centreline (1/mm); "
                          "the stretch inside the lesion is left out. Null when the measured stretch is too short",
    )
    mean_curvature_radius_mm: float | None = Field(
        None, description="Radius of the arc with the mean curvature (1 / mean curvature, mm)",
    )
    mean_torsion_per_mm: float | None = Field(
        None, description="Mean |torsion| of the parent vessel where it bends (curvature ≥ 0.02 /mm), in 1/mm. "
                          "Null when that stretch is almost straight or too short",
    )
    curvature_length_mm: float | None = Field(
        None, description="Length of parent vessel the curvature and torsion were measured on (ends trimmed), mm",
    )
    curvature_sigma_mm: float = Field(
        2.0, description="Gaussian smoothing of the centreline before differentiating (mm)",
    )
    voxel_mm: float | None = Field(
        None, description="Voxel of the grid the radii were measured on (mm): the inscribed diameter "
                          "moves in steps of this size. Null for centrelines extracted before it was stored",
    )
    warning: str | None = Field(
        None, description="Warning shown for high tortuosity or degenerate geometry"
    )


class CenterlinePoints(BaseModel):
    """The resampled medial-axis points the extraction saved, for the client to walk along."""

    points: list[Position3D] = Field(..., description="Centreline points (mm, volume frame), ~0.5 mm apart")
    radii_mm: list[float] = Field(..., description="Local vessel radius at each point (mm)")
    arc_mm: list[float] = Field(..., description="Cumulative arc length at each point, starting at 0 (mm)")
    ends_in_lesion: bool = Field(False, description="The last point is inside the lesion (the walk may go all the way to it)")


class CrossSectionRequest(BaseModel):
    """Request to analyse cross-sections along the previously-extracted centreline."""

    session_id: str
    n_samples: int = Field(
        40, ge=10, le=100,
        description="Number of cutting planes along the centreline (more = finer).",
    )


class ClStentRequest(BaseModel):
    """Deploy a virtual stent along the extracted centreline."""

    session_id: str
    stent_diameter_mm: float = Field(
        4.0, ge=1.0, le=10.0, description="Nominal stent outer diameter (mm)"
    )
    start_arc_mm: float | None = Field(
        None, ge=0.0, description="Arc-length start (mm). Omit for the centreline start."
    )
    end_arc_mm: float | None = Field(
        None, ge=0.0, description="Arc-length end (mm). Omit for the centreline end."
    )
    braid: bool = Field(True, description="Add helical braid wires for a flow-diverter look")
    braid_count: int = Field(6, ge=0, le=16, description="Braid wires per wind direction")
    device_id: str | None = Field(
        None, description="Catalogue device whose braid gives the coverage map (default: the Pipeline family)")
    catalogue_length_mm: float | None = Field(
        None, gt=0.0, description="Labelled length of the catalogue device being deployed, when known "
                                  "(the sizing chose it). The coverage summary then reports it instead "
                                  "of back-computing one from the drawn segment")


class ClStentApposition(BaseModel):
    """Aposición del stent a la pared, punto a punto (services/apposition.py)."""

    noise_mm: float = Field(..., description="Por debajo de esto una separación no se distingue")
    gap_area_pct: float = Field(..., description="% del stent (fuera del cuello) separado de la pared")
    compressed_area_pct: float = Field(..., description="% donde el nominal es mayor que el vaso")
    max_gap_mm: float
    proximal_gap_mm: float = Field(..., description="Separación (p90) en los primeros 3 mm")
    distal_gap_mm: float = Field(..., description="Separación (p90) en los últimos 3 mm")
    neck_excluded: bool
    notes: list[str] = Field(default_factory=list)


class ClStentCoverage(BaseModel):
    """Cobertura metálica de la trenza, punto a punto (services/braid_coverage.py)."""

    device: str = Field(..., description="Familia cuya construcción se ha usado")
    nominal_coverage_pct: float = Field(..., description="Cobertura al diámetro nominal (catálogo)")
    nominal_angle_deg: float = Field(..., description="Ángulo de los hilos con el eje al nominal")
    neck_coverage_pct: float | None = Field(None, description="Cobertura estimada delante del cuello")
    min_coverage_pct: float = Field(..., description="p5 sobre el tramo en contacto con el vaso")
    max_coverage_pct: float = Field(..., description="p95 sobre el tramo en contacto con el vaso")
    min_local_diameter_mm: float = Field(..., description="Diámetro más estrecho al que queda abierto")
    deployed_length_mm: float = Field(..., description="Longitud del tramo dibujado")
    labelled_length_mm: float = Field(..., description="Longitud de catálogo que, alargada, lo cubre")
    catalogue_length_mm: float | None = Field(
        None, description="Longitud etiquetada del dispositivo desplegado, si se sabe (la eligió el "
                          "dimensionado). Con ella, el resumen da esa y no la estimada del tramo")
    notes: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    neck_pore_density: float | None = Field(None, description="Poros por mm² delante del cuello (null sin cuello o sin número de hilos)")
    wires: int | None = Field(None, description="Hilos de la trenza a esta medida")


class ClStentResult(BaseModel):
    """Deployed centreline-guided stent mesh + fit metrics."""

    stent_mesh_url: str = Field(..., description="URL of the deployed stent tube mesh (.vtp)")
    length_mm: float = Field(..., description="Arc length of the deployed segment")
    nominal_diameter_mm: float = Field(..., description="Requested stent diameter")
    mean_vessel_diameter_mm: float = Field(..., description="Mean vessel Ø over the segment")
    coverage_ratio: float = Field(..., description="stent_r / vessel_r (1.0 = perfect fit; <1 undersized)")
    total_arc_mm: float = Field(..., description="Total centreline arc length (for range sliders)")
    warning: str | None = Field(None, description="Fit warning (over/undersized)")
    apposition: ClStentApposition | None = Field(
        None, description="El mapa va en la malla, en el campo `aposicion_mm`")
    coverage: ClStentCoverage | None = Field(
        None, description="Cobertura metálica; el mapa va en la malla (`cobertura_delta_pct`). "
                          "Solo con trenza y dentro de las medidas de la familia.",
    )


class CrossSectionResult(BaseModel):
    """Cross-sectional diameter profile along the vessel + stenosis estimate."""

    arc_positions_mm: list[float] = Field(..., description="Sample positions along the centreline")
    diameters_mm: list[float] = Field(..., description="Equivalent-circle diameter at each position")
    mean_diameter_mm: float
    median_diameter_mm: float
    min_diameter_mm: float
    max_diameter_mm: float
    mean_area_mm2: float
    stenosis_ratio: float = Field(..., description="min_area / median_area (1.0 = uniform)")
    stenosis_pct: float = Field(..., description="(1 − ratio) × 100 — narrowing at the tightest point")
    stenosis_label: str = Field(
        ..., description="'Sin estenosis' | 'Leve' | 'Significativa' | 'Perfil irregular'")
    stenosis_note: str = Field(
        "", description="Why the stenosis is not graded (profile with branch jumps); '' when graded")
    warning: str | None = None


class CenterlineClearResult(BaseModel):
    """Outcome of discarding the extracted centreline."""

    removed: list[str] = Field(
        default_factory=list,
        description="Session files deleted (centreline geometry and anything built on it)",
    )
    had_centerline: bool = Field(
        ..., description="False when there was no centreline to discard"
    )


# ── Dimensionado de flow-diverter (services/fd_sizing.py) ─────────────────── #

class FdLandingZone(BaseModel):
    """Calibre del vaso en un anclaje, medido con cortes perpendiculares."""

    arc_from_mm: float
    arc_to_mm: float
    diameter_mm: float = Field(..., description="Mediana de los cortes redondos; 0 = sin medir")
    min_mm: float
    max_mm: float
    n_sections: int
    truncated: bool = Field(..., description="La línea central se acaba antes del anclaje entero")


class FdOption(BaseModel):
    device_id: str
    name: str
    manufacturer: str
    diameter_mm: float = Field(..., description="Medida elegida; 0 = ninguna encaja")
    length_mm: float = Field(..., description="Longitud ETIQUETADA elegida; 0 = ninguna basta")
    fits: bool
    reason: str
    neck_note: str = Field("", description="Cobertura metálica a la altura del cuello")
    narrow_end_note: str = Field("", description="Cobertura en el anclaje más estrecho")
    deploy_arc_mm: list[float] = Field(..., description="[inicio, fin] centrado en el cuello; con trenza conocida, con su largo desplegado en este vaso")
    elongated_length_mm: float = Field(..., description="La etiqueta + 32,6 % (alargamiento medio medido)")
    wires: int | None = Field(None, description="Hilos de la trenza a esta medida (null sin trenzado en el catálogo)")
    neck_coverage_pct: float | None = Field(None, description="Cobertura metálica estimada delante del cuello (%)")
    neck_porosity_pct: float | None = Field(None, description="100 − cobertura (%)")
    neck_pore_density: float | None = Field(None, description="Poros por mm² delante del cuello")
    nominal_pore_density: float | None = Field(None, description="Poros por mm² al diámetro nominal")
    deployed_length_mm: float | None = Field(None, description="Longitud desplegada estimada en este vaso (sin empujar ni tirar)")
    elongation_pct: float | None = Field(None, description="Cuánto más que la etiqueta (%)")
    braid_note: str = Field("", description="Lo anterior, en una frase")


class FdSizingResult(BaseModel):
    neck_arc_mm: list[float]
    neck_from_rim: bool
    total_arc_mm: float
    proximal: FdLandingZone
    distal: FdLandingZone
    mismatch_mm: float
    target_diameter_mm: float
    required_length_mm: float
    multiple_devices: bool
    options: list[FdOption]
    warnings: list[str]
    notes: list[str]
    sources: list[str]


# ── IVUS virtual (VINI 3D) ────────────────────────────────────────────────── #

class IvusSectionStent(BaseModel):
    """El stent desplegado en una sección, con la aposición del mapa 3D (services/apposition.py)."""

    contour: list[list[float]] = Field(..., description="Stent contour (u, v) in mm, closed")
    apposition_mm: list[float | None] = Field(
        ..., description="Per contour point: + gap to the wall, − compressed; null in front of the neck (no wall)")
    max_gap_mm: float | None = None
    max_compression_mm: float | None = None
    at_neck: bool = Field(False, description="Most of the contour is in front of the aneurysm neck")


class IvusStentSummary(BaseModel):
    """Apposition along the deployed stent, section by section."""

    from_arc_mm: float
    to_arc_mm: float
    noise_mm: float = Field(..., description="A gap below this (one voxel) cannot be told apart")
    gap_length_mm: float = Field(..., description="Stent length with some gap above the noise")
    max_gap_mm: float
    compressed_length_mm: float
    neck_length_mm: float = Field(..., description="Length with no wall: in front of the neck or inside the lesion (not malapposition)")
    proximal_gap_mm: float = Field(..., description="Largest gap in the first 3 mm with wall (landing zone)")
    distal_gap_mm: float = Field(..., description="Largest gap in the last 3 mm with wall")


class IvusSection(BaseModel):
    """Una sección del pullback virtual, perpendicular a la línea central."""

    arc_mm: float = Field(..., description="Position along the centreline (mm from its start)")
    valid: bool = Field(..., description="A closed lumen contour surrounds the centreline here (measures present)")
    in_lesion: bool = Field(False, description="The section is inside the lesion (sac or candidate zone): not a vessel measure")
    in_branch: bool = Field(False, description="Another branch joins the lumen here: not usable as reference")
    area_mm2: float | None = None
    perimeter_mm: float | None = None
    d_min_mm: float | None = Field(None, description="Shortest chord through the lumen centroid")
    d_max_mm: float | None = Field(None, description="Longest chord through the lumen centroid")
    d_eq_mm: float | None = Field(None, description="Equivalent-circle diameter 2·√(A/π)")
    eccentricity: float | None = Field(None, description="(d_max − d_min) / d_max")
    d_perimeter_mm: float | None = Field(None, description="Perimeter-derived diameter P/π")
    d_inscribed_mm: float | None = Field(None, description="Diameter of the largest circle inside the lumen")
    inscribed_center: list[float] | None = Field(None, description="Centre (u, v) in mm of the largest inscribed circle")
    circularity: float | None = Field(None, description="4πA/P²: 1 for a circle, lower for a flattened or indented lumen")
    angle_min_deg: float | None = Field(None, description="Direction of d_min in the section frame (0° = +u, counter-clockwise)")
    angle_max_deg: float | None = None
    centroid: list[float] | None = Field(None, description="Lumen centroid (u, v) in mm, centreline at (0, 0)")
    contour: list[list[float]] = Field(default_factory=list, description="Lumen contour (u, v) in mm, closed, ~72 points")
    stent: IvusSectionStent | None = Field(None, description="The deployed centreline stent at this section, if it passes here")


class IvusSummary(BaseModel):
    """IVUS conventions: minimal lumen area and the largest lumen within 10 mm on each side, without crossing a branch."""

    mla_mm2: float
    mla_index: int
    mla_arc_mm: float
    d_min_mm: float
    d_max_mm: float
    eccentricity: float
    ref_prox_mm2: float | None = None
    ref_prox_arc_mm: float | None = None
    ref_dist_mm2: float | None = None
    ref_dist_arc_mm: float | None = None
    ref_mm2: float | None = Field(None, description="Mean of the available references")
    area_stenosis_pct: float | None = Field(None, description="(1 − MLA / reference) × 100")


class IvusBranch(BaseModel):
    """A visible branch origin on the wall of the walked vessel (from the frozen branch scan)."""

    arc_mm: float = Field(..., description="Position along the centreline (mm from its start)")
    calibre_mm: float = Field(..., description="Branch diameter")
    parent_mm: float = Field(..., description="Diameter of the vessel it leaves")
    angle_deg: float = Field(..., description="Direction in the section frame (0° = +u, counter-clockwise), like the contour")
    distance_mm: float = Field(..., description="From the origin to the centreline")


class IvusResult(BaseModel):
    """Virtual IVUS pullback computed from the volume along the centreline."""

    n_sections: int
    size_px: int = Field(..., description="Each section image is size_px × size_px")
    fov_mm: float = Field(..., description="Side of each section image (mm)")
    stack_url: str = Field(..., description="Raw uint8 stack, n_sections × size_px × size_px, row = v, column = u")
    window: list[float] = Field(..., description="Intensities mapped to 0 and 255")
    sections: list[IvusSection]
    summary: IvusSummary | None = None
    note: str = ""
    stent: IvusStentSummary | None = Field(None, description="Apposition of the deployed centreline stent, if any")
    branches: list[IvusBranch] = Field(
        default_factory=list, description="Visible branch origins along the line. Perforators (0.1–0.5 mm) are not visible and never listed")
    branch_floor_mm: float | None = Field(None, description="Below this diameter the scan cannot resolve a vessel; null without a scan")


class IvusCompareRequest(BaseModel):
    previous_session_id: str = Field(..., description="The earlier study, already superimposed in Seguimiento")


class IvusCompareSection(BaseModel):
    arc_mm: float
    valid: bool
    in_branch: bool = False
    area_mm2: float | None = None
    d_min_mm: float | None = None
    d_max_mm: float | None = None
    contour: list[list[float]] = Field(default_factory=list, description="Earlier lumen contour (u, v) in mm, same section planes as the current pullback")


class IvusCompareResult(BaseModel):
    """The current centreline cut through the earlier study, superimposed with the Seguimiento registration."""

    previous_session_id: str
    sections: list[IvusCompareSection]
    summary: IvusSummary | None = Field(None, description="IVUS summary of the earlier study at the same positions")
    noise_mm: float = Field(..., description="Registration noise from Seguimiento: a diameter change below it cannot be told apart")
    residual_median_mm: float


class StentTresClicsRequest(BaseModel):
    """P10: los tres clics del stent virtual."""

    source: Position3D = Field(..., description="Proximal point on the parent artery (mm), before the neck")
    target: Position3D = Field(..., description="Distal point on the parent artery (mm), after the neck")
    sac: Position3D | None = Field(
        None, description="Click on the sac (mm). Optional: without it, the measured sac or the selected candidate")
    device_id: str | None = Field(
        None, description="Catalogue flow diverter to deploy; default the first that fits")


class StentTresClicsResult(BaseModel):
    """P10: línea central, dimensionado y despliegue encadenados."""

    centerline: CenterlineResult
    sizing: FdSizingResult
    neck_source: str = Field(..., description="'morfometria' (the measured neck of this sac) or 'saco' "
                                              "(where the centreline's inscribed sphere touches the sac mesh)")
    neck_marked: bool = Field(False, description="With neck_source='morfometria': the person marked the "
                                                 "neck (point or rim). False = Morfometría's automatic "
                                                 "estimate from the sac")
    lesion_mesh: str = Field(..., description="Lesion mesh the neck was located against")
    device_id: str | None = Field(None, description="Deployed device; null when no option fits")
    device_name: str | None = None
    diameter_mm: float | None = None
    labelled_length_mm: float | None = None
    deploy_arc_mm: list[float] | None = None
    stent: ClStentResult | None = Field(None, description="Null when no catalogue option fits")
    message: str = Field(..., description="What was done, in one sentence, or why nothing was deployed")
