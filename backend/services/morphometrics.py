"""Aneurysm morphometric analysis — adapted from prospective/processing/morphometrics.py.

Pure VTK + NumPy + SciPy, zero Qt dependencies.

Computes all clinical indices used for cerebral aneurysm planning:
  • Volume, surface area, equivalent sphere diameter
  • Max diameter, bounding-box dimensions
  • Neck diameter (plane-slicing PCA axis), dome height
  • DNR, AR, BF, compactness (Wadell sphericity)
  • UI (ConvexHull), EI, NSI, SR (0 when parent artery unknown)
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import vtk

from services import index_thresholds as T
from services.numero import cifra, cifra_corta

try:
    from vtkmodules.util import numpy_support as ns
except ImportError:
    from vtk.util import numpy_support as ns  # type: ignore[no-redef]

logger = logging.getLogger(__name__)


@dataclass
class MorphometricResult:
    """All morphometric measurements for one aneurysm candidate."""

    # ── Volumetric ────────────────────────────────────────────────────── #
    volume_mm3: float
    surface_area_mm2: float
    eq_sphere_diam_mm: float

    # ── Bounding-box dimensions ───────────────────────────────────────── #
    bbox_l_mm: float           # longest axis (≈ max diameter)
    bbox_w_mm: float           # intermediate axis
    bbox_h_mm: float           # shortest axis
    # Tamaño: la mayor distancia entre dos puntos del saco (P17). Antes era
    # bbox_l_mm, que cambia al girar el estudio.
    max_diameter_mm: float

    # ── Neck / dome (via plane slicing) ──────────────────────────────── #
    neck_diameter_mm: float
    dome_height_mm: float
    neck_plane_pos: float      # parametric position along principal axis [0–1]

    # ── Clinical ratios ───────────────────────────────────────────────── #
    dome_to_neck_ratio: float
    aspect_ratio: float
    compactness: float         # Wadell sphericity

    # ── Shape-complexity indices ──────────────────────────────────────── #
    bottleneck_factor:  float = 0.0
    undulation_index:   float = 0.0
    ellipticity_index:  float = 0.0
    non_sphericity_idx: float = 0.0
    size_ratio:         float = 0.0
    # Ancho máximo del domo paralelo al cuello (P17): el numerador del DNR
    # (Brinjikji 2009) y del BF (Hoh 2007), y el Dmax de CMHA.
    dome_width_mm:      float = 0.0

    # ── PCA axes ─────────────────────────────────────────────────────── #
    principal_axis: tuple[float, float, float] = field(default=(0.0, 0.0, 1.0))
    centroid: tuple[float, float, float]       = field(default=(0.0, 0.0, 0.0))

    # ── Reliability guard (Tier 1) ────────────────────────────────────── #
    # A trustworthy analysis needs a *closed* (watertight) sac mesh.  When the
    # input is an open surface patch (e.g. the detector's curvature cap), the
    # volume-based metrics and the plane-slice neck degenerate; we flag that
    # here and null the affected fields instead of emitting absurd numbers.
    reliable:         bool = True   # False → volume/neck metrics not trustworthy
    watertight:       bool = True   # mesh had no boundary (open) edges
    reliability_note: str  = ""     # human-readable reason when reliable is False

    # ── Derived labels ────────────────────────────────────────────────── #
    @property
    def rupture_risk_label(self) -> str:
        """Heuristic risk label (not a clinical diagnosis).

        Thresholds: Dhar 2008, Raghavan 2005, Greving 2014.
        """
        return self.rupture_risk()[0]

    def rupture_risk(self) -> tuple[str, list[str]]:
        """(etiqueta, criterios que la sostienen), con la cifra de cada uno.

        El informe explicaba el nivel con una frase fija —«DNR ≥ 1.6 o AR ≥
        1.3»— aunque lo hubiera decidido otro índice: un caso con AR 0,85 y
        DNR 1,17 salía «Moderado» por su cociente de tamaño, y el texto decía
        que era por dos índices que no cumplía.
        """
        # Los cortes son los de la insignia y los de Decisión (F1-160/161/163):
        # antes aquí el AR moderado cortaba en 1,3 y la insignia en 1,2.
        alto = [
            (self.aspect_ratio >= T.AR_HIGH, f"AR {cifra(self.aspect_ratio, 2)} ≥ {cifra_corta(T.AR_HIGH)}"),
            (self.dome_to_neck_ratio >= T.DNR_HIGH, f"DNR {cifra(self.dome_to_neck_ratio, 2)} ≥ {cifra(T.DNR_HIGH)}"),
            (self.undulation_index >= T.UI_HIGH, f"ondulación (UI) {cifra(self.undulation_index, 2)} ≥ {cifra(T.UI_HIGH, 2)}"),
            (self.size_ratio >= T.SR_HIGH, f"cociente de tamaño (SR) {cifra(self.size_ratio, 2)} ≥ {cifra(T.SR_HIGH)}"),
        ]
        moderado = [
            (self.aspect_ratio >= T.AR_MOD, f"AR {cifra(self.aspect_ratio, 2)} ≥ {cifra_corta(T.AR_MOD)}"),
            (self.dome_to_neck_ratio >= T.DNR_MOD, f"DNR {cifra(self.dome_to_neck_ratio, 2)} ≥ {cifra_corta(T.DNR_MOD)}"),
            (self.ellipticity_index >= T.EI_MOD, f"elipticidad (EI) {cifra(self.ellipticity_index, 2)} ≥ {cifra(T.EI_MOD, 2)}"),
            (self.undulation_index >= T.UI_MOD, f"ondulación (UI) {cifra(self.undulation_index, 2)} ≥ {cifra(T.UI_MOD, 2)}"),
            (self.size_ratio >= T.SR_MOD, f"cociente de tamaño (SR) {cifra(self.size_ratio, 2)} ≥ {cifra(T.SR_MOD)}"),
        ]
        por_alto = [texto for cumple, texto in alto if cumple]
        if por_alto:
            return "Alto", por_alto
        por_moderado = [texto for cumple, texto in moderado if cumple]
        if por_moderado:
            return "Moderado", por_moderado
        return "Bajo", []


class MorphometricAnalyzer:
    """
    Compute morphometric indices from a vtkPolyData aneurysm mesh.

    Parameters
    ----------
    n_slices:
        Number of cross-sections sampled along the principal axis.
    neck_search_fraction:
        Fraction of the dome length (from base) within which to search
        for the minimum cross-section (neck).
    """

    def __init__(
        self,
        n_slices: int = 40,
        neck_search_fraction: float = 0.40,
    ) -> None:
        self.n_slices = n_slices
        self.neck_search_fraction = neck_search_fraction

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def analyze(
        self,
        poly_data: vtk.vtkPolyData,
        neck_plane: Optional[tuple] = None,
    ) -> MorphometricResult:
        """Run all measurements.  Raises ValueError on empty mesh.

        Parameters
        ----------
        neck_plane:
            Optional ``(origin, normal, neck_diam_mm)`` giving a *known* neck
            plane (semi-automatic Tier 2 flow).  When supplied, the neck is
            taken as ``neck_diam_mm`` (measured from the clip contour by the
            caller) instead of being re-searched via plane slicing — which
            degenerates on the grazing mesh extremity.  ``dome_height`` is then
            the sac's extent beyond the plane along ``+normal``.
        """
        if poly_data is None or poly_data.GetNumberOfPoints() == 0:
            raise ValueError("Empty mesh — run aneurysm detection first.")

        logger.info(
            "Morphometric analysis — %d pts / %d tris",
            poly_data.GetNumberOfPoints(), poly_data.GetNumberOfPolys(),
        )

        volume_mm3, surface_area_mm2 = self._mass_properties(poly_data)

        bounds = poly_data.GetBounds()
        dims = sorted([
            bounds[1] - bounds[0],
            bounds[3] - bounds[2],
            bounds[5] - bounds[4],
        ], reverse=True)
        bbox_l, bbox_w, bbox_h = dims

        centroid, principal_axis = self._pca_axis(poly_data)
        pts_all = ns.vtk_to_numpy(poly_data.GetPoints().GetData()).astype(np.float64)
        hull_vol, hull_area = self._convex_hull(pts_all)

        if neck_plane is not None:
            # ── Known neck plane (semi-automatic Tier 2) ──────────────────── #
            n_origin = np.asarray(neck_plane[0], dtype=np.float64)
            n_normal = np.asarray(neck_plane[1], dtype=np.float64)
            n_normal = n_normal / (np.linalg.norm(n_normal) or 1.0)
            neck_diam = float(neck_plane[2])
            beyond = (pts_all - n_origin) @ n_normal      # >0 = dome side
            dome_height = float(max(0.0, beyond.max()))
            neck_pos = 0.0                                 # neck at base of clipped sac
            # The user's plane defines the neck→dome axis; use it downstream.
            principal_axis = n_normal
            centroid = n_origin
            neck_abs, apex_abs = 0.0, dome_height
        else:
            neck_diam, dome_height, neck_pos = self._find_neck(
                poly_data, centroid, principal_axis
            )
            proj = (pts_all - centroid) @ principal_axis
            neck_abs = float(proj.min() + neck_pos * (proj.max() - proj.min()))
            apex_abs = float(proj.max())

        max_diam    = self._feret_diameter(pts_all) or bbox_l
        eq_diam     = (2.0 * (3.0 * volume_mm3 / (4.0 * math.pi)) ** (1.0 / 3.0)
                       if volume_mm3 > 0 else 0.0)
        # El ancho del domo no puede pasar del tamaño: un corte que pilla dos
        # lazos (un trozo de arteria madre en el saco recortado) lo inflaría.
        dome_width  = min(self._dome_width(poly_data, centroid, principal_axis,
                                           neck_abs, apex_abs), max_diam)
        dnr         = dome_width / neck_diam  if neck_diam >= 0.1 else 0.0
        ar          = dome_height / neck_diam if neck_diam >= 0.1 else 0.0
        bf          = dnr      # Hoh 2007: el mismo cociente que el DNR de Brinjikji
        compactness = self._wadell_sphericity(volume_mm3, surface_area_mm2)

        ui  = (float(max(0.0, 1.0 - volume_mm3 / hull_vol)) if hull_vol > 0 else 0.0)
        # Raghavan 2005 normaliza a una semiesfera ABIERTA: las áreas van sin la
        # tapa del cuello, que en la malla cerrada es el disco del cuello.
        neck_area = math.pi * neck_diam ** 2 / 4.0 if neck_diam >= 0.1 else 0.0
        nsi = self._raghavan_index(volume_mm3, surface_area_mm2 - neck_area)
        ei  = self._raghavan_index(hull_vol, hull_area - neck_area)

        # ── Reliability guard (Tier 1) ─────────────────────────────────── #
        # Volume-based metrics and the plane-slice neck are only trustworthy on
        # a closed, physically plausible sac.  Open surface patches (the
        # detector's curvature cap) give a garbage vtkMassProperties volume and
        # a degenerate grazing "neck".  We guard the two groups independently so
        # a closed sac with a merely-degenerate auto-neck keeps its valid volume
        # while only the neck-derived ratios are nulled (→ prompt a neck plane).
        n_boundary      = self._boundary_edge_count(poly_data)
        watertight      = n_boundary == 0
        bbox_vol        = bbox_l * bbox_w * bbox_h
        vol_ok          = 0.0 < volume_mm3 <= bbox_vol * 1.05
        volume_reliable = watertight and vol_ok
        # A user-supplied neck plane is measured from the clip contour → trusted;
        # otherwise the auto neck must be on a closed mesh and above the floor.
        neck_reliable   = (neck_plane is not None) or (watertight and 0.1 <= neck_diam <= max_diam)
        reliable        = volume_reliable and neck_reliable

        # F1-152: la nota antes contaba «32 aristas de borde» y pedía «definir
        # un plano de cuello»; la persona no sabe qué es una arista de borde ni
        # qué botón es ese plano. Se dice qué pasa y qué hacer con los botones
        # que tiene delante («Marcar cuello» / «Marcar ápice»). El recuento de
        # aristas se queda en el log para quien depure la malla.
        reasons = []
        if watertight and not vol_ok:
            reasons.append("volumen no plausible")
        if not neck_reliable and watertight:
            reasons.append("cuello no medible automáticamente")
        note = ""
        if not reliable:
            note = "; ".join(
                ["La medida automática no cierra el saco: marca cuello y ápice"]
                + reasons)
            logger.warning("Morphometry unreliable — %s (aristas de borde: %d)",
                           note, n_boundary)
        if not volume_reliable:
            # Volume group depends on a closed, plausible mesh.
            volume_mm3  = 0.0
            eq_diam     = 0.0
            compactness = 0.0
            ui = ei = nsi = 0.0
        if not neck_reliable:
            # Neck group (neck, dome, DNR, AR, BF) needs a valid neck; EI and
            # NSI too, because they take the neck disc off the area.
            neck_diam   = 0.0
            dome_height = 0.0
            neck_pos    = 0.0
            dome_width  = 0.0
            dnr = ar = bf = 0.0
            ei = nsi = 0.0

        result = MorphometricResult(
            volume_mm3         = volume_mm3,
            surface_area_mm2   = surface_area_mm2,
            eq_sphere_diam_mm  = eq_diam,
            bbox_l_mm          = bbox_l,
            bbox_w_mm          = bbox_w,
            bbox_h_mm          = bbox_h,
            max_diameter_mm    = max_diam,
            neck_diameter_mm   = neck_diam,
            dome_height_mm     = dome_height,
            neck_plane_pos     = neck_pos,
            dome_to_neck_ratio = dnr,
            aspect_ratio       = ar,
            compactness        = compactness,
            bottleneck_factor  = bf,
            undulation_index   = ui,
            ellipticity_index  = ei,
            non_sphericity_idx = nsi,
            dome_width_mm      = dome_width,
            principal_axis    = tuple(principal_axis),
            centroid           = tuple(centroid),
            reliable           = reliable,
            watertight         = watertight,
            reliability_note   = note,
        )

        logger.info(
            "Morphometrics done — V=%.1f mm3  D_max=%.1f mm  "
            "D_neck=%.1f mm  DNR=%.2f  AR=%.2f  BF=%.2f  UI=%.3f  EI=%.3f",
            volume_mm3, max_diam, neck_diam, dnr, ar, bf, ui, ei,
        )
        return result

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _mass_properties(poly_data: vtk.vtkPolyData) -> tuple[float, float]:
        tri = vtk.vtkTriangleFilter()
        tri.SetInputData(poly_data)
        tri.Update()

        mp = vtk.vtkMassProperties()
        mp.SetInputConnection(tri.GetOutputPort())
        mp.Update()

        return abs(float(mp.GetVolume())), float(mp.GetSurfaceArea())

    @staticmethod
    def _boundary_edge_count(poly_data: vtk.vtkPolyData) -> int:
        """Number of boundary (open) edges.  0 → watertight closed surface."""
        fe = vtk.vtkFeatureEdges()
        fe.SetInputData(poly_data)
        fe.BoundaryEdgesOn()
        fe.FeatureEdgesOff()
        fe.NonManifoldEdgesOff()
        fe.ManifoldEdgesOff()
        fe.Update()
        return int(fe.GetOutput().GetNumberOfCells())

    @staticmethod
    def _pca_axis(poly_data: vtk.vtkPolyData) -> tuple[np.ndarray, np.ndarray]:
        pts = ns.vtk_to_numpy(poly_data.GetPoints().GetData()).astype(np.float64)
        centroid = pts.mean(axis=0)
        cov = np.cov((pts - centroid).T)
        eigvals, eigvecs = np.linalg.eigh(cov)
        principal = eigvecs[:, np.argmax(eigvals)]
        return centroid, principal

    def _find_neck(
        self,
        poly_data: vtk.vtkPolyData,
        centroid: np.ndarray,
        axis: np.ndarray,
    ) -> tuple[float, float, float]:
        pts  = ns.vtk_to_numpy(poly_data.GetPoints().GetData()).astype(np.float64)
        proj = (pts - centroid) @ axis
        p_min, p_max = proj.min(), proj.max()
        extent = p_max - p_min

        if extent < 1e-3:
            bounds   = poly_data.GetBounds()
            fallback = min(
                bounds[1] - bounds[0],
                bounds[3] - bounds[2],
                bounds[5] - bounds[4],
            )
            return fallback, extent, 0.0

        search_end = p_min + extent * self.neck_search_fraction
        positions  = np.linspace(p_min, search_end, self.n_slices)

        best_perim = float("inf")
        best_pos   = p_min
        best_diam  = extent

        for pos in positions:
            plane_origin = centroid + pos * axis
            perim, diam  = self._slice_perimeter(poly_data, plane_origin, axis)
            if perim > 0 and perim < best_perim:
                best_perim = perim
                best_pos   = pos
                best_diam  = diam

        dome_height = p_max - best_pos
        neck_pos    = (best_pos - p_min) / extent if extent > 0 else 0.0
        return best_diam, dome_height, float(neck_pos)

    @staticmethod
    def _slice_perimeter(
        poly_data: vtk.vtkPolyData,
        origin: np.ndarray,
        normal: np.ndarray,
    ) -> tuple[float, float]:
        plane = vtk.vtkPlane()
        plane.SetOrigin(origin.tolist())
        plane.SetNormal(normal.tolist())

        cutter = vtk.vtkCutter()
        cutter.SetInputData(poly_data)
        cutter.SetCutFunction(plane)
        cutter.GenerateValues(1, 0.0, 0.0)
        cutter.Update()
        cut = cutter.GetOutput()

        if cut.GetNumberOfPoints() < 3:
            return 0.0, 0.0

        pts  = ns.vtk_to_numpy(cut.GetPoints().GetData()).astype(np.float64)
        diff = pts - np.roll(pts, -1, axis=0)
        perim = float(np.sum(np.linalg.norm(diff, axis=1)))
        diam  = perim / math.pi if perim > 0 else 0.0
        return perim, diam

    # ------------------------------------------------------------------ #
    # Shape-complexity indices                                            #
    # ------------------------------------------------------------------ #

    def _dome_width(
        self,
        poly_data: vtk.vtkPolyData,
        origin: np.ndarray,
        axis: np.ndarray,
        neck_abs: float,
        apex_abs: float,
    ) -> float:
        """Ancho máximo del domo en cortes paralelos al cuello, con calibre.

        Cada corte se mide por la mayor distancia entre dos de sus puntos, no
        por perímetro/π: un corte ovalado o con rugosidad daba otro número.
        Se salta el 5 % junto al cuello y el 2 % junto al ápice, como antes.
        """
        extent = apex_abs - neck_abs
        if extent < 1e-3:
            return 0.0
        positions = np.linspace(neck_abs + 0.05 * extent, apex_abs - 0.02 * extent, 30)
        ancho = 0.0
        for pos in positions:
            plane = vtk.vtkPlane()
            plane.SetOrigin((origin + pos * axis).tolist())
            plane.SetNormal(axis.tolist())
            cutter = vtk.vtkCutter()
            cutter.SetInputData(poly_data)
            cutter.SetCutFunction(plane)
            cutter.Update()
            cut = cutter.GetOutput()
            if cut.GetNumberOfPoints() < 2:
                continue
            pts = ns.vtk_to_numpy(cut.GetPoints().GetData()).astype(np.float64)
            ancho = max(ancho, self._feret_diameter(pts))
        return ancho

    @staticmethod
    def _feret_diameter(pts: np.ndarray) -> float:
        """Mayor distancia entre dos puntos: no depende de la orientación.

        Basta con mirar los vértices de la envolvente convexa; si no se puede
        construir (puntos coplanares, como un corte), se miran todos.
        """
        if len(pts) < 2:
            return 0.0
        cand = pts
        try:
            from scipy.spatial import ConvexHull  # type: ignore[import]
            if len(pts) >= 5:
                cand = pts[ConvexHull(pts).vertices]
        except Exception:
            cand = pts
        if len(cand) > 4000:      # tope de memoria; la envolvente casi nunca llega
            cand = cand[np.linspace(0, len(cand) - 1, 4000).astype(int)]
        mejor = 0.0
        for i in range(0, len(cand), 512):
            d = np.linalg.norm(cand[i:i + 512, None, :] - cand[None, :, :], axis=2)
            mejor = max(mejor, float(d.max()))
        return mejor

    @staticmethod
    def _convex_hull(pts: np.ndarray) -> tuple[float, float]:
        """(volumen, área) de la envolvente convexa; (0, 0) si no se puede."""
        try:
            from scipy.spatial import ConvexHull  # type: ignore[import]
            if pts.shape[0] < 4:
                return 0.0, 0.0
            hull = ConvexHull(pts)
            return float(hull.volume), float(hull.area)
        except Exception:
            return 0.0, 0.0

    @staticmethod
    def _raghavan_index(volume: float, open_area: float) -> float:
        """1 − (18π)^⅓·V^⅔/S (Raghavan 2005): 0 en una semiesfera abierta.

        Con el saco da el NSI y con su envolvente convexa el EI; S es el área
        sin la tapa del cuello. Con esta fórmula el NSI coincide con el de CMHA
        en los 100 sacos de O2.
        """
        if open_area <= 0 or volume <= 0:
            return 0.0
        return float(max(0.0, 1.0 - (18.0 * math.pi) ** (1.0 / 3.0) * volume ** (2.0 / 3.0) / open_area))

    @staticmethod
    def _wadell_sphericity(volume: float, area: float) -> float:
        """Wadell compactness: pi^(1/3) * (6V)^(2/3) / A."""
        if area <= 0 or volume <= 0:
            return 0.0
        return math.pi ** (1.0 / 3.0) * (6.0 * volume) ** (2.0 / 3.0) / area
