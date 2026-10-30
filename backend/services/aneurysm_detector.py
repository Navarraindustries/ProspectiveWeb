"""Aneurysm candidate detector — adapted from prospective/processing/aneurysm_detector.py.

Pure VTK + NumPy, zero Qt dependencies.  Algorithm v6.

Algorithm
---------
1. Pre-filter: remove disconnected noise components (< 5 % of largest component).
2. Pre-smoothing (optional, for XA/3DRA): Laplacian passes on a temporary copy.
3. Compute Mean + Gaussian curvature (vtkCurvatures).
4. Threshold on Gaussian curvature ≥ p85 (primary gate).
5. Connected-component analysis (vtkPolyDataConnectivityFilter).
6. Per-region hard gates:
   - positive_gauss_frac ≥ 0.50  (eliminates bifurcation saddles)
   - compactness ≥ 0.20           (eliminates elongated vessel arcs)
   - sphericity ≥ 0.28            (eliminates curved vessel segments)
7. Composite score with size-factor bias (peaks at Ø 8 mm).
8. Spatial deduplication (merge_dist_mm = 10 mm, or the regions' own box
   extent with merge_by="extent").

TC (Zenodo, octubre de 2026): suelo ABSOLUTO de Gauss en vez del percentil
(`min_gauss_curvature`), una segunda escala cuyas regiones se añaden detrás
(`gauss_floor_2`), orden por área × fracción convexa (`order_by="area_pgf"`)
y fusión por el tamaño de las cajas (`merge_by="extent"`). Cada una medida
sobre los 172 estudios con `scripts/gate_bench.py` y confirmada con una
pasada real; el preset está en `routers/detect._detector_for_modality`.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np
import vtk

try:
    from vtkmodules.util import numpy_support as ns
except ImportError:
    from vtk.util import numpy_support as ns  # type: ignore[no-redef]

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────── #
# Data classes                                                                  #
# ──────────────────────────────────────────────────────────────────────────── #

@dataclass
class AneurysmCandidate:
    """A single aneurysm candidate extracted from the vascular mesh."""

    index: int                              # 1-based rank
    centroid: tuple[float, float, float]    # (x, y, z) in mm
    radius_mm: float                        # estimated from surface area
    diameter_mm: float                      # = 2 × radius_mm
    mean_curvature: float
    gauss_curvature: float
    positive_gauss_frac: float
    compactness: float
    sphericity: float
    n_points: int
    score: float                            # composite detection score [0–1]
    poly_data: vtk.vtkPolyData = field(repr=False)
    cv_gauss: float       = 0.0
    normal_isotropy: float = 0.5
    #: "sphere_fit" (esfera ajustada a los puntos) o "area" (estimación por
    #: área, usada cuando el parche es casi plano y el ajuste se dispara).
    radius_method: str = "area"
    #: Área de la región (mm²). Con `order_by="area"` es la clave del orden.
    area_mm2: float = 0.0
    #: Lado mayor de la caja de la región (mm). Con `merge_by="extent"` fija
    #: el radio de fusión de duplicados.
    extent_mm: float = 0.0


@dataclass
class RegionTrace:
    """Una región de curvatura alta y lo que el detector decidió sobre ella.

    Solo se rellena con `AneurysmDetector.trace_regions = True` (el banco de
    medida, `scripts/bench_detector.py`): con 46 lesiones anotadas, saber qué
    puerta rechaza la región de la lesión es lo que permite reajustarla.
    `gate` es la primera puerta que no pasa ("points", "size", "mean_curv",
    "pgf", "compactness", "sphericity"), "merged" o "cap" si pasó todas pero
    no llegó a la lista, y "ok" si está en ella (con su `rank`).
    """

    centroid: tuple[float, float, float]
    n_points: int
    gate: str = "ok"
    rank: int | None = None
    radius_mm: float = 0.0
    mean_curvature: float = 0.0
    mean_curv_x_radius: float = 0.0
    positive_gauss_frac: float = 0.0
    compactness: float = 0.0
    sphericity: float = 0.0
    score: float = 0.0
    area_mm2: float = 0.0


@dataclass
class DetectionResult:
    """Full result from AneurysmDetector.detect()."""

    candidates: list[AneurysmCandidate]

    n_regions_total:       int   = 0
    n_failed_points:       int   = 0
    n_failed_size:         int   = 0
    n_failed_mean_curv:    int   = 0
    n_failed_pgf:          int   = 0
    n_failed_compact:      int   = 0
    n_failed_sphericity:   int   = 0
    n_merged:              int   = 0
    n_removed_components:  int   = 0
    gauss_threshold:       float = 0.0
    mean_curv_gate:        float = 0.0
    #: Traza por región (vacía salvo con `trace_regions`).
    regions: list[RegionTrace] = field(default_factory=list)
    #: Lo rellena `aneurysm_consensus.consensus` si los canales de calibre y
    #: cociente tenían que correr y no pudieron (p. ej. sin memoria para la
    #: rasterización). La lista sale solo de la curvatura y quien mide tiene
    #: que saberlo: en el banco Zenodo un «Unable to allocate» dejaba el
    #: estudio como válido con un canal menos.
    geometric_error: str = ""
    #: Canal de «saco pequeño» (29-10): regiones que pasan las puertas con la
    #: curvatura de una esfera, esféricas, compactas y de radio ≤ 3,5 mm, las
    #: mejores primero (esfericidad × pgf). Vacío si el detector no lo lleva.
    small_sacs: list[AneurysmCandidate] = field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────────── #
# Detector                                                                      #
# ──────────────────────────────────────────────────────────────────────────── #

def _clean_region(region: vtk.vtkPolyData) -> vtk.vtkPolyData:
    """La región de una componente, con puntos fusionados y SOLO triángulos.

    `vtkCleanPolyData` fusiona los puntos coincidentes y, por defecto, convierte
    el triángulo que se queda sin área en una línea (`ConvertPolysToLines`).
    Esas líneas llegaban a `vtkMassProperties`, que avisaba «Input data type
    must be VTK_TRIANGLE not 3» una vez por región (cientos por detección en
    una angio-TC) y no las contaba. Se quitan aquí: el área y los puntos son
    los mismos, los avisos no.
    """
    cl = vtk.vtkCleanPolyData()
    cl.SetInputData(region)
    cl.Update()
    limpia = cl.GetOutput()
    if limpia.GetNumberOfLines() == 0 and limpia.GetNumberOfVerts() == 0:
        return limpia
    # Solo los polígonos: los puntos y sus arrays se quedan como están.
    solo_polys = vtk.vtkPolyData()
    solo_polys.SetPoints(limpia.GetPoints())
    solo_polys.GetPointData().ShallowCopy(limpia.GetPointData())
    solo_polys.SetPolys(limpia.GetPolys())
    return solo_polys


def _dome_radius_mm(region: "vtk.vtkPolyData", area: float) -> tuple[float, str]:
    """Radio de la CÚPULA, no del parche.

    El radio se estimaba como ``sqrt(area / 4π)``, que trata el parche de
    curvatura como una esfera COMPLETA. No lo es: es el casquete convexo de la
    cúpula, así que el radio salía sistemáticamente corto. Medido sobre las
    ocho regiones de case 3, la esfera ajustada a los puntos del parche da un
    radio **1,75× mayor** de media (p10 1,53× · p90 2,35×).

    La consecuencia era que ``min_radius_mm = 1.5`` no pedía un aneurisma de
    3 mm de diámetro sino de unos 5, y descartaba **124 de 144 regiones**.

    Aquí se ajusta una esfera por mínimos cuadrados a los puntos del parche
    —lineal y cerrado, sin iterar—. Un casquete casi plano da un radio enorme o
    numéricamente inestable; en ese caso se vuelve a la estimación por área,
    que al menos está acotada, y se dice cuál se usó.

    Devuelve ``(radio_mm, método)`` con método ``"sphere_fit"`` o ``"area"``.
    """
    fallback = math.sqrt(area / (4.0 * math.pi)) if area > 0 else 0.0
    n = region.GetNumberOfPoints()
    if n < 4:
        return fallback, "area"

    pts = np.asarray([region.GetPoint(i) for i in range(n)], dtype=np.float64)
    # |p - c|² = r²  →  2p·c + (r² - |c|²) = |p|², lineal en (c, r²-|c|²).
    A = np.hstack([2.0 * pts, np.ones((n, 1))])
    b = (pts ** 2).sum(axis=1)
    try:
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return fallback, "area"

    centre = sol[:3]
    r2 = sol[3] + float((centre ** 2).sum())
    if not np.isfinite(r2) or r2 <= 0.0:
        return fallback, "area"
    r_fit = math.sqrt(r2)

    # Cordura: una esfera ajustada a un casquete plano se dispara. El parche no
    # puede pertenecer a una esfera mucho mayor que su propia extensión.
    extent = float(np.linalg.norm(pts.max(axis=0) - pts.min(axis=0)))
    if not np.isfinite(r_fit) or r_fit <= 0.0 or r_fit > max(4.0 * extent, 60.0):
        return fallback, "area"
    return r_fit, "sphere_fit"


class AneurysmDetector:
    """
    Detect aneurysm candidates on a pre-segmented vascular mesh (v6).

    Parameters
    ----------
    gauss_percentile:
        Percentile gate on Gaussian curvature (primary criterion).
    mean_curv_gate_percentile:
        Per-region mean curvature gate.
    min_radius_mm / max_radius_mm:
        Size filter.
    min_points:
        Minimum vertex count per region.
    merge_dist_mm:
        Merge duplicate candidates whose centroids are within this distance.
    max_candidates:
        Maximum returned candidates, ordered by score.
    min_positive_gauss_frac:
        Hard gate — fraction of Gauss+ vertices required.
    min_compactness:
        Hard gate — area/sphere_area ratio required.
    min_sphericity:
        Hard gate — min(bbox)/max(bbox) required.
    pre_smooth_iterations:
        Laplacian passes before curvature computation (0 = off for CTA, 25 for XA).
    min_mean_curv_radius:
        Si se da, sustituye a `mean_curv_gate_percentile`: la región pasa si
        su curvatura media × el radio de su esfera ajustada llega a este
        valor (esfera 1, tubo 0,5). No depende del resto de la malla, que es
        lo que fallaba con el percentil en mallas llenas de vasos finos.
    """

    def __init__(
        self,
        gauss_percentile:          float = 85.0,
        mean_curv_gate_percentile: float = 75.0,
        min_radius_mm:             float = 1.5,
        max_radius_mm:             float = 15.0,
        min_points:                int   = 8,
        merge_dist_mm:             float = 10.0,
        max_candidates:            int   = 8,
        min_positive_gauss_frac:   float = 0.50,
        min_compactness:           float = 0.20,
        min_sphericity:            float = 0.28,
        pre_smooth_iterations:     int   = 0,
        min_mean_curv_radius:      float | None = None,
        order_by:                  str = "score",
        min_gauss_curvature:       float | None = None,
        merge_by:                  str = "fixed",
        merge_min_mm:              float = 3.0,
        gauss_floor_2:             float | None = None,
        compactness_lax:           float | None = None,
        compactness_lax_pgf:       float = 0.75,
        compactness_lax_hr_max:    float = 1.5,
        mean_curv_abs_pgf:         float | None = None,
        small_sac_channel:         bool = False,
        small_sac_top:             int = 10,
        small_sac_quota:           int = 5,
        small_sac_r_max:           float = 3.5,
        small_sac_hr:              tuple[float, float] = (0.7, 1.3),
        small_sac_sphericity:      float = 0.6,
        small_sac_compactness:     float = 0.3,
        small_sac_pgf:             float = 0.7,
    ) -> None:
        self.min_mean_curv_radius      = min_mean_curv_radius
        self.gauss_percentile          = gauss_percentile
        self.mean_curv_gate_percentile = mean_curv_gate_percentile
        self.min_radius_mm             = min_radius_mm
        self.max_radius_mm             = max_radius_mm
        self.min_points                = min_points
        self.merge_dist_mm             = merge_dist_mm
        self.max_candidates            = max_candidates
        self.min_positive_gauss_frac   = min_positive_gauss_frac
        self.min_compactness           = min_compactness
        self.min_sphericity            = min_sphericity
        self.pre_smooth_iterations     = pre_smooth_iterations
        #: Rellenar `DetectionResult.regions`. Solo lo pide el banco de medida.
        self.trace_regions: bool       = False
        #: "score" (la puntuación compuesta) o "area" (la región convexa más
        #: grande primero). Ver `_order_key`.
        self.order_by                  = order_by
        #: Si se da, sustituye al percentil de Gauss por un suelo ABSOLUTO en
        #: mm⁻²: K ≥ 1/r² deja pasar toda cúpula de radio ≤ r. El percentil es
        #: relativo a la malla y en un árbol de vasos finos sube hasta K ≈ 0,6
        #: (radio ≤ 1,3 mm): un saco de 12–21 mm es plano para él (paso 3).
        self.min_gauss_curvature       = min_gauss_curvature
        #: Fusión de duplicados (paso 7): "fixed" = dos candidatos son el mismo
        #: si sus centros distan menos de `merge_dist_mm`; "extent" = menos
        #: que la media del lado mayor de sus cajas (mínimo `merge_min_mm`).
        #: Con 10 mm fijos, dos sacos vecinos (016, 050, 090) se comían entre
        #: sí y una región de vaso a 9 mm se tragaba una cúpula pequeña; con la
        #: caja el radio es el tamaño real de cada región. Ver `_merge_radius_mm`.
        self.merge_by                  = merge_by
        self.merge_min_mm              = merge_min_mm
        #: Segunda escala del suelo de Gauss (mm⁻²), solo con `min_gauss_curvature`:
        #: las regiones que forma el segundo suelo se añaden DETRÁS de las del
        #: primero y pasan las mismas puertas, el mismo orden y la misma
        #: fusión. Un suelo de 0,028 (esfera de 6 mm) recorta los sacos
        #: grandes enteros pero une un saco de 3–4 mm a su vaso; 0,06 (esfera
        #: de 4 mm) lo separa. Medido sobre los 172 de Zenodo (26-10): en
        #: lista 82 → 88, ninguna lesión baja de tramo.
        self.gauss_floor_2             = gauss_floor_2
        #: Compacidad condicionada (29-10, banco de puertas sobre las mallas
        #: limpias de los 172 de Zenodo): a una región muy convexa (pgf ≥
        #: `compactness_lax_pgf`) con curvatura de esfera (H·r ≤
        #: `compactness_lax_hr_max`) le basta `compactness_lax`. La cúpula de
        #: un saco de 14–25 mm sale con compacidad 0,10–0,19 (038: 0,18 con
        #: pgf 0,81 y H·r 1,0) y la puerta fija de 0,2 la tiraba; relajar la
        #: compacidad a secas metía regiones de vaso de 100–230 mm² (pgf
        #: 0,58–0,69) o con H·r 2,0–2,2 (085) por delante de lesiones.
        self.compactness_lax           = compactness_lax
        self.compactness_lax_pgf       = compactness_lax_pgf
        self.compactness_lax_hr_max    = compactness_lax_hr_max
        #: Curvatura media en valor absoluto si pgf ≥ este valor (solo con
        #: `min_mean_curv_radius`): la luz interior de un saco trombosado es
        #: una cúpula cóncava (037: 170 puntos, 109 mm², H·r = −1,34, pgf
        #: 0,75) y con el signo la puerta la tiraba. Sin la condición de pgf
        #: entran sillas cóncavas de bifurcación (109: pgf 0,58–0,72).
        self.mean_curv_abs_pgf         = mean_curv_abs_pgf
        #: Canal de «saco pequeño» (29-10, banco sobre las mallas limpias de los 172
        #: y pasada real): los sacos de 3–5 mm forman región propia (a la escala de
        #: 4 mm) con la curvatura de una esfera, pero el orden por área los deja
        #: detrás del tope del canal de curvatura (029_1, 098, 101, 154_2) o en los
        #: puestos 11–40. El canal los ordena por forma (esfericidad × pgf) y el
        #: consenso les reserva el puesto `small_sac_quota` si no hay ninguno
        #: entre los primeros: no vota ni cuenta como familia (con puestos propios
        #: se metía en 1.º–2.º y, fundido con un sitio de solo calibre, le daba una
        #: segunda familia que adelantaba a lesiones grandes: 126 y 154 perdían el
        #: 1.º). Medido: entre 5 63 → 65, entre 10 70 → 74, estudios 53 → 55, sin
        #: bajar ninguna banda; cuatro lesiones pasan del 5.º al 6.º.
        self.small_sac_channel         = small_sac_channel
        self.small_sac_top             = small_sac_top
        self.small_sac_quota           = small_sac_quota
        self.small_sac_r_max           = small_sac_r_max
        self.small_sac_hr              = small_sac_hr
        self.small_sac_sphericity      = small_sac_sphericity
        self.small_sac_compactness     = small_sac_compactness
        self.small_sac_pgf             = small_sac_pgf

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def _merge_radius_mm(self, a: AneurysmCandidate, b: AneurysmCandidate) -> float:
        """Distancia por debajo de la cual `b` duplica a `a` (que iba antes)."""
        if self.merge_by == "fixed":
            return self.merge_dist_mm
        if self.merge_by == "extent":
            return max(self.merge_min_mm, (a.extent_mm + b.extent_mm) / 2.0)
        raise ValueError(f"merge_by desconocido: {self.merge_by!r}")

    def _order_key(self, c: AneurysmCandidate) -> float:
        """Mayor = antes. Ver `order_by`.

        Por qué «área» en TC (paso 3 Zenodo, medido sobre 13 lesiones en 10
        angio-TC): la puntuación compuesta prima un radio de 4 mm (su
        `size_factor` vale 0,43 a 1,9 mm y 0,87 a 3,2 mm) y entierra sacos de
        5 mm con regiones perfectas (106: H·r 1,0, compacidad 0,6, esfericidad
        0,98, 14.ª). En un árbol vascular limpio las regiones convexas son
        bultos de bifurcación y curvas (pequeñas) y cúpulas (grandes): la
        región convexa MÁS GRANDE primero es una regla sin pesos que sube las
        lesiones entre los 5 de 2 a 4 y entre los 10 de 6 a 8 sobre las mismas
        mallas. En 3DRA (XA) se mide aparte con la regresión de Case 3 e IM_0055.
        """
        if self.order_by == "area":
            return c.area_mm2
        if self.order_by == "area_pgf":
            # Área por fracción de curvatura gaussiana positiva (26-10, banco de
            # puertas sobre los 172 de Zenodo con el suelo absoluto): las regiones
            # de vaso que iban por delante de una lesión tienen menos pgf (mediana
            # 0,62 frente a 0,70) y la cúpula de un saco es casi toda convexa.
            # Entre 5: 61 → 63, en 1.º 28 → 30, estudios 54 → 56, ninguna baja.
            return c.area_mm2 * c.positive_gauss_frac
        if self.order_by == "score":
            return c.score
        raise ValueError(f"order_by desconocido: {self.order_by!r}")

    def detect(self, poly_data: vtk.vtkPolyData) -> DetectionResult:
        """Run detection.  Returns DetectionResult (never raises)."""
        if poly_data is None or poly_data.GetNumberOfPoints() == 0:
            logger.warning("AneurysmDetector: empty mesh")
            return DetectionResult(candidates=[])

        logger.info(
            "Aneurysm detection — %d verts / %d tris",
            poly_data.GetNumberOfPoints(), poly_data.GetNumberOfPolys(),
        )

        # ── 0. Pre-filter: remove small disconnected noise components ───── #
        n_removed_components = 0
        n_orig_pts = poly_data.GetNumberOfPoints()

        pre_conn = vtk.vtkPolyDataConnectivityFilter()
        pre_conn.SetInputData(poly_data)
        pre_conn.SetExtractionModeToAllRegions()
        pre_conn.ColorRegionsOn()
        pre_conn.Update()
        n_comps = pre_conn.GetNumberOfExtractedRegions()

        if n_comps > 1:
            region_ids = ns.vtk_to_numpy(
                pre_conn.GetOutput().GetPointData().GetScalars()
            ).astype(np.int32)
            counts = np.bincount(region_ids.clip(0), minlength=n_comps)
            min_comp_pts = max(self.min_points * 5, int(counts.max() * 0.05))
            large_ids = [int(i) for i, c in enumerate(counts) if c >= min_comp_pts]
            n_removed_components = n_comps - len(large_ids)

            if n_removed_components > 0 and large_ids:
                sel = vtk.vtkPolyDataConnectivityFilter()
                sel.SetInputData(poly_data)
                sel.SetExtractionModeToSpecifiedRegions()
                sel.InitializeSpecifiedRegionList()
                for rid in large_ids:
                    sel.AddSpecifiedRegion(rid)
                sel.Update()

                cl = vtk.vtkCleanPolyData()
                cl.SetInputConnection(sel.GetOutputPort())
                cl.Update()
                poly_data = cl.GetOutput()

                logger.info(
                    "Pre-filter: removed %d/%d components (threshold >=%d pts) "
                    "— %d -> %d verts",
                    n_removed_components, n_comps, min_comp_pts,
                    n_orig_pts, poly_data.GetNumberOfPoints(),
                )

                if poly_data.GetNumberOfPoints() == 0:
                    logger.warning("Pre-filter removed all geometry — empty result")
                    return DetectionResult(
                        candidates=[], n_removed_components=n_removed_components
                    )

        # ── 0b. Pre-smoothing (XA / 3DRA — v6) ───────────────────────── #
        curvature_input = poly_data
        if self.pre_smooth_iterations > 0:
            smoother = vtk.vtkSmoothPolyDataFilter()
            smoother.SetInputData(poly_data)
            smoother.SetNumberOfIterations(self.pre_smooth_iterations)
            smoother.SetRelaxationFactor(0.10)
            smoother.FeatureEdgeSmoothingOff()
            smoother.BoundarySmoothingOff()
            smoother.Update()

            renorm = vtk.vtkPolyDataNormals()
            renorm.SetInputConnection(smoother.GetOutputPort())
            renorm.ComputePointNormalsOn()
            renorm.ComputeCellNormalsOff()
            renorm.SplittingOff()
            renorm.Update()
            curvature_input = renorm.GetOutput()
            logger.info(
                "Pre-smooth: %d Laplacian iterations on %d-vert mesh",
                self.pre_smooth_iterations, curvature_input.GetNumberOfPoints(),
            )

        # ── 0c. Triangulation guard ────────────────────────────────────── #
        tri_guard = vtk.vtkTriangleFilter()
        tri_guard.SetInputData(curvature_input)
        tri_guard.Update()
        curvature_input = tri_guard.GetOutput()

        # ── 1. Curvature arrays ────────────────────────────────────────── #
        mean_filter = vtk.vtkCurvatures()
        mean_filter.SetInputData(curvature_input)
        mean_filter.SetCurvatureTypeToMean()
        mean_filter.Update()
        mean_poly = mean_filter.GetOutput()

        gauss_filter = vtk.vtkCurvatures()
        gauss_filter.SetInputData(curvature_input)
        gauss_filter.SetCurvatureTypeToGaussian()
        gauss_filter.Update()

        mean_arr  = ns.vtk_to_numpy(
            mean_poly.GetPointData().GetArray("Mean_Curvature")
        ).astype(np.float64)

        gauss_arr = ns.vtk_to_numpy(
            gauss_filter.GetOutput().GetPointData().GetArray("Gauss_Curvature")
        ).astype(np.float64)

        # ── 2. Attach both arrays to mean_poly ─────────────────────────── #
        gauss_vtk = ns.numpy_to_vtk(gauss_arr.astype(np.float32), deep=True,
                                    array_type=vtk.VTK_FLOAT)
        gauss_vtk.SetName("Gauss_Curvature")
        mean_poly.GetPointData().AddArray(gauss_vtk)

        # ── 3. Threshold on GAUSSIAN curvature (primary gate) ──────────── #
        if self.min_gauss_curvature is not None:
            thresh_gauss = float(self.min_gauss_curvature)
        else:
            thresh_gauss = float(np.percentile(gauss_arr, self.gauss_percentile))
        thresh_gauss = max(thresh_gauss, 0.0)

        mean_curv_gate = float(np.percentile(mean_arr, self.mean_curv_gate_percentile))

        logger.info(
            "Gauss threshold p%.0f = %.4f  |  mean-curv gate p%.0f = %.4f",
            self.gauss_percentile, thresh_gauss,
            self.mean_curv_gate_percentile, mean_curv_gate,
        )

        mean_poly.GetPointData().SetActiveScalars("Gauss_Curvature")

        def regions_above(floor: float) -> tuple["vtk.vtkPolyData", int]:
            """Los vértices con K ≥ `floor` y sus componentes conexas (4)."""
            thresh = vtk.vtkThreshold()
            thresh.SetInputData(mean_poly)
            thresh.SetInputArrayToProcess(
                0, 0, 0, vtk.vtkDataObject.FIELD_ASSOCIATION_POINTS, "Gauss_Curvature"
            )
            thresh.SetThresholdFunction(vtk.vtkThreshold.THRESHOLD_UPPER)
            thresh.SetUpperThreshold(floor)
            thresh.SetAllScalars(0)
            thresh.Update()

            geom = vtk.vtkGeometryFilter()
            geom.SetInputConnection(thresh.GetOutputPort())
            geom.Update()
            high = geom.GetOutput()
            if high.GetNumberOfPoints() == 0:
                return high, 0
            conn = vtk.vtkPolyDataConnectivityFilter()
            conn.SetInputData(high)
            conn.SetExtractionModeToAllRegions()
            conn.Update()
            return high, conn.GetNumberOfExtractedRegions()

        # ── 4. Connected components, en una o dos escalas ──────────────── #
        # La segunda escala (`gauss_floor_2`) añade sus regiones detrás de las
        # de la primera: mismas puertas, mismo orden, misma fusión. Solo tiene
        # sentido con el suelo absoluto; con el percentil no hay segunda.
        floors = [thresh_gauss]
        if self.gauss_floor_2 is not None and self.min_gauss_curvature is not None:
            floors.append(max(float(self.gauss_floor_2), 0.0))
        work: list[tuple[float, "vtk.vtkPolyData", int]] = []
        n_regions = 0
        for floor in floors:
            high_gauss, n_at = regions_above(floor)
            logger.info("Gauss floor %.4f: %d connected regions", floor, n_at)
            n_regions += n_at
            work.extend((floor, high_gauss, i) for i in range(n_at))

        if n_regions == 0:
            logger.info("No positive Gaussian curvature regions found")
            return DetectionResult(
                candidates=[], gauss_threshold=thresh_gauss,
                mean_curv_gate=mean_curv_gate,
            )

        # ── 5. Analyse each region ─────────────────────────────────────── #
        candidates: list[AneurysmCandidate] = []
        n_fail_pts    = 0
        n_fail_size   = 0
        n_fail_mean   = 0
        n_fail_pgf    = 0
        n_fail_compact= 0
        n_fail_sph    = 0

        traces: list[RegionTrace] = []
        trace_of: dict[int, RegionTrace] = {}     # id(candidate) -> su traza

        for pool_floor, high_gauss, i in work:
            sel = vtk.vtkPolyDataConnectivityFilter()
            sel.SetInputData(high_gauss)
            sel.SetExtractionModeToSpecifiedRegions()
            sel.InitializeSpecifiedRegionList()
            sel.AddSpecifiedRegion(i)
            sel.Update()

            region = _clean_region(sel.GetOutput())

            n_pts = region.GetNumberOfPoints()
            bounds = region.GetBounds()
            cx = (bounds[0] + bounds[1]) / 2.0
            cy = (bounds[2] + bounds[3]) / 2.0
            cz = (bounds[4] + bounds[5]) / 2.0
            trace = RegionTrace(centroid=(cx, cy, cz), n_points=n_pts) if self.trace_regions else None
            if trace is not None:
                traces.append(trace)

            if n_pts < self.min_points:
                n_fail_pts += 1
                if trace is not None:
                    trace.gate = "points"
                continue

            # Todas las métricas antes que las puertas: cada una vale lo mismo
            # que cuando se calculaba justo antes de su puerta, y así la traza
            # las tiene también para las regiones rechazadas.
            mass = vtk.vtkMassProperties()
            mass.SetInputData(region)
            mass.Update()
            area   = mass.GetSurfaceArea()
            radius, radius_method = _dome_radius_mm(region, area)

            r_mean_arr  = ns.vtk_to_numpy(
                region.GetPointData().GetArray("Mean_Curvature")
            ).astype(np.float64)
            r_gauss_arr = ns.vtk_to_numpy(
                region.GetPointData().GetArray("Gauss_Curvature")
            ).astype(np.float64)

            mean_curv_region  = float(np.mean(r_mean_arr))
            gauss_curv_region = float(np.mean(r_gauss_arr))

            dx = bounds[1] - bounds[0]
            dy = bounds[3] - bounds[2]
            dz = bounds[5] - bounds[4]
            dims = sorted([dx, dy, dz])
            max_dim = dims[2]

            positive_gauss_frac = float(np.mean(r_gauss_arr > 0))

            r_bbox = max_dim / 2.0 if max_dim > 0 else 0.0
            sphere_area_bbox = 4.0 * math.pi * r_bbox ** 2
            compactness = (
                min(1.0, area / sphere_area_bbox)
                if sphere_area_bbox > 0
                else 0.0
            )
            sphericity = (dims[0] / dims[2]) if dims[2] > 0 else 0.0

            if trace is not None:
                trace.radius_mm = radius
                trace.mean_curvature = mean_curv_region
                trace.mean_curv_x_radius = mean_curv_region * radius
                trace.positive_gauss_frac = positive_gauss_frac
                trace.compactness = compactness
                trace.sphericity = sphericity

            if radius < self.min_radius_mm or radius > self.max_radius_mm:
                n_fail_size += 1
                if trace is not None:
                    trace.gate = "size"
                continue

            hr = mean_curv_region * radius
            if self.min_mean_curv_radius is not None:
                hr_gate = hr
                if (self.mean_curv_abs_pgf is not None
                        and positive_gauss_frac >= self.mean_curv_abs_pgf):
                    hr_gate = abs(hr)
                convexa = hr_gate >= self.min_mean_curv_radius
            else:
                convexa = mean_curv_region >= mean_curv_gate
            if not convexa:
                n_fail_mean += 1
                if trace is not None:
                    trace.gate = "mean_curv"
                continue

            if positive_gauss_frac < self.min_positive_gauss_frac:
                n_fail_pgf += 1
                if trace is not None:
                    trace.gate = "pgf"
                continue

            comp_min = self.min_compactness
            if (self.compactness_lax is not None
                    and positive_gauss_frac >= self.compactness_lax_pgf
                    and hr <= self.compactness_lax_hr_max):
                comp_min = self.compactness_lax
            if compactness < comp_min:
                n_fail_compact += 1
                if trace is not None:
                    trace.gate = "compactness"
                continue

            if sphericity < self.min_sphericity:
                n_fail_sph += 1
                if trace is not None:
                    trace.gate = "sphericity"
                continue

            # v5: cv_gauss
            mean_abs_gauss = abs(gauss_curv_region)
            std_gauss      = float(np.std(r_gauss_arr))
            cv_gauss       = float(np.clip(std_gauss / (mean_abs_gauss + 1e-6), 0.0, 10.0))

            # v5: normal_isotropy
            normal_isotropy = 0.5
            normals_vtk = region.GetPointData().GetNormals()
            if normals_vtk is not None and normals_vtk.GetNumberOfTuples() > 2:
                nrm  = ns.vtk_to_numpy(normals_vtk).astype(np.float64)
                nlen = np.linalg.norm(nrm, axis=1, keepdims=True)
                nlen = np.where(nlen > 1e-8, nlen, 1.0)
                nrm  = nrm / nlen
                cov_n   = np.cov(nrm.T)
                eigvals = np.sort(np.linalg.eigvalsh(cov_n))
                max_eig = eigvals[2]
                min_eig = max(eigvals[0], 0.0)
                normal_isotropy = float(min_eig / max_eig) if max_eig > 1e-10 else 0.0

            # Composite score
            norm_mean = float(np.clip(
                (mean_curv_region - mean_curv_gate) / (abs(mean_curv_gate) + 1e-6) / 5.0,
                0.0, 1.0,
            ))
            norm_gauss = float(np.clip(
                (gauss_curv_region - pool_floor) / (abs(pool_floor) + 1e-6) / 5.0,
                0.0, 1.0,
            ))

            if radius < 1.0:
                size_factor = 0.0
            elif radius < 2.0:
                size_factor = (radius - 1.0) * 0.5
            else:
                size_factor = max(0.0, 1.0 - abs(radius - 4.0) / 6.0)

            cv_penalty = float(np.clip((cv_gauss - 0.8) / 2.2, 0.0, 1.0))

            base_score = (0.05 * norm_mean
                          + 0.10 * norm_gauss
                          + 0.25 * positive_gauss_frac
                          + 0.08 * compactness
                          + 0.07 * sphericity
                          + 0.15 * normal_isotropy
                          + 0.30 * size_factor)
            score = float(np.clip(base_score * (1.0 - 0.20 * cv_penalty), 0.0, 1.0))

            cand = AneurysmCandidate(
                    index=0,
                    centroid=(cx, cy, cz),
                    radius_mm=radius,
                    diameter_mm=radius * 2.0,
                    radius_method=radius_method,
                    mean_curvature=mean_curv_region,
                    gauss_curvature=gauss_curv_region,
                    positive_gauss_frac=positive_gauss_frac,
                    compactness=compactness,
                    sphericity=sphericity,
                    n_points=n_pts,
                    score=score,
                    poly_data=region,
                    cv_gauss=cv_gauss,
                    normal_isotropy=normal_isotropy,
                    area_mm2=float(area),
                    extent_mm=float(max_dim),
                )
            candidates.append(cand)
            if trace is not None:
                trace.score = score
                trace.area_mm2 = float(area)
                trace_of[id(cand)] = trace

        # ── 6. Sort by score ───────────────────────────────────────────── #
        candidates.sort(key=self._order_key, reverse=True)

        # ── 7. Merge spatial duplicates ────────────────────────────────── #
        n_merged = 0
        merged: list[AneurysmCandidate] = []
        for c in candidates:
            pt = np.array(c.centroid)
            duplicate = any(
                float(np.linalg.norm(pt - np.array(m.centroid))) < self._merge_radius_mm(m, c)
                for m in merged
            )
            if duplicate:
                n_merged += 1
                if self.trace_regions:
                    trace_of[id(c)].gate = "merged"
            else:
                merged.append(c)
        small_sacs = self._small_sacs(candidates) if self.small_sac_channel else []
        candidates = merged[: self.max_candidates]
        if self.trace_regions:
            for c in merged[self.max_candidates:]:
                trace_of[id(c)].gate = "cap"

        for rank, c in enumerate(candidates, start=1):
            c.index = rank
            if self.trace_regions:
                trace_of[id(c)].rank = rank

        logger.info(
            "Detection done — %d candidates | %d regions | "
            "%d fail-size | %d fail-mean | %d fail-pgf | %d fail-compact | "
            "%d fail-sph | %d merged | %d noise-comps removed",
            len(candidates), n_regions, n_fail_size, n_fail_mean,
            n_fail_pgf, n_fail_compact, n_fail_sph, n_merged,
            n_removed_components,
        )

        return DetectionResult(
            candidates=candidates,
            n_regions_total=n_regions,
            n_failed_points=n_fail_pts,
            n_failed_size=n_fail_size,
            n_failed_mean_curv=n_fail_mean,
            n_failed_pgf=n_fail_pgf,
            n_failed_compact=n_fail_compact,
            n_failed_sphericity=n_fail_sph,
            n_merged=n_merged,
            n_removed_components=n_removed_components,
            gauss_threshold=thresh_gauss,
            mean_curv_gate=mean_curv_gate,
            regions=traces,
            small_sacs=small_sacs,
        )

    def _small_sacs(self, candidates: list[AneurysmCandidate]) -> list[AneurysmCandidate]:
        """Las regiones con forma de saco pequeño, las mejores primero.

        Sobre los candidatos que pasan las puertas y ANTES de la fusión de
        duplicados: un saco de 3 mm pegado a una región de vaso mayor cae
        dentro de su radio de fusión y desaparecería. Aquí se deduplican solo
        entre sí, con la misma regla.
        """
        lo, hi = self.small_sac_hr
        pool = [c for c in candidates
                if c.radius_mm <= self.small_sac_r_max
                and lo <= c.mean_curvature * c.radius_mm <= hi
                and c.sphericity >= self.small_sac_sphericity
                and c.compactness >= self.small_sac_compactness
                and c.positive_gauss_frac >= self.small_sac_pgf]
        pool.sort(key=lambda c: c.sphericity * c.positive_gauss_frac, reverse=True)
        kept: list[AneurysmCandidate] = []
        for c in pool:
            pt = np.array(c.centroid)
            if any(float(np.linalg.norm(pt - np.array(m.centroid))) < self._merge_radius_mm(m, c)
                   for m in kept):
                continue
            kept.append(c)
            if len(kept) >= self.small_sac_top:
                break
        return kept
