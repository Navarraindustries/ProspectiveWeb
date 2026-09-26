"""Vascular segmentation pipeline + mesh I/O.

Adapted from prospective/processing/segmentation.py — pure Python + VTK + NumPy.
Zero Qt dependencies.

Pipeline
--------
numpy volume (z, y, x)
    │
    ▼  Gaussian pre-smooth   (optional, scipy or SimpleITK)
    │
    ▼  Binary mask            (threshold band-pass or single-sided)
    │
    ▼  Morphological closing  (optional, fills micro-gaps)
    │
    ▼  Connected-component filter (keep largest N components)
    │
    ▼  vtkMarchingCubes       (iso-surface at 0.5 on binary mask)
    │
    ▼  vtkWindowedSincPolyDataFilter  (mesh smoothing)
    │
    ▼  vtkQuadricDecimation   (polygon count reduction)
    │
    ▼  vtkPolyDataNormals     (smooth normals for shading)
    │
    vtkPolyData  →  .vtp (vtk.js) / .stl (3D printing)
"""
from __future__ import annotations

import logging
import threading
import time
import os
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import vtk

try:
    from vtkmodules.util import numpy_support as ns
except ImportError:
    from vtk.util import numpy_support as ns  # type: ignore[no-redef]

logger = logging.getLogger(__name__)


# ── Result dataclass ───────────────────────────────────────────────────────── #

@dataclass
class SegmentationResult:
    poly_data:           vtk.vtkPolyData
    n_vertices:          int
    n_triangles:         int
    threshold_hu:        float
    reduction_pct:       float         # actual decimation achieved
    n_fragments_removed: int = 0
    is_preview:          bool = False
    # How much of the thresholded vasculature survived the component filter.
    # Silent loss here is how a real vessel branch disappears from the mesh, so
    # the numbers travel out to the UI instead of staying in the log.
    kept_fraction:       float = 1.0
    largest_removed_mm3: float = 0.0


# ── Main pipeline ──────────────────────────────────────────────────────────── #

class SegmentationPipeline:
    """Extract an iso-surface from a CT/XA volume using VTK Marching Cubes.

    Parameters
    ----------
    threshold_hu      : lower iso-surface value in HU (or raw units for XA)
    threshold_max_hu  : upper bound (0 = disabled, single-sided threshold)
    smooth_iterations : WindowedSinc iterations (0 = skip)
    smooth_pass_band  : pass-band [0–2], lower = smoother (default 0.06)
    target_reduction  : fraction of triangles to remove (default 0.70)
    gaussian_sigma    : pre-smoothing std-dev in voxels (0 = skip, default 0.5)
    min_component_verts : discard fragments < this many vertices (0 = keep all)
    vessel_lower_hu   : secondary lower threshold for thin-vessel recovery (0 = off)
    vessel_dilation_mm: dilation radius around primary mask for thin-vessel recovery
    morpho_closing_mm : morphological closing radius in mm (0 = off)
    keep_top_n        : keep only N largest components (0 = use min_component_verts)
    """

    def __init__(
        self,
        threshold_hu:        float = 150.0,
        threshold_max_hu:    float = 0.0,
        smooth_iterations:   int   = 20,
        smooth_pass_band:    float = 0.06,
        target_reduction:    float = 0.70,
        gaussian_sigma:      float = 0.5,
        min_component_verts: int   = 100,
        vessel_lower_hu:     float = 0.0,
        vessel_dilation_mm:  float = 3.0,
        morpho_closing_mm:   float = 0.0,
        keep_top_n:          int   = 0,
        min_component_mm3:   float = 0.0,
    ) -> None:
        self.threshold_hu        = threshold_hu
        self.threshold_max_hu    = threshold_max_hu
        self.smooth_iterations   = smooth_iterations
        self.smooth_pass_band    = smooth_pass_band
        self.target_reduction    = target_reduction
        self.gaussian_sigma      = gaussian_sigma
        self.min_component_verts = min_component_verts
        self.vessel_lower_hu     = vessel_lower_hu
        self.vessel_dilation_mm  = vessel_dilation_mm
        self.morpho_closing_mm   = morpho_closing_mm
        self.keep_top_n          = keep_top_n
        # Physical-size cut-off; preferred over keep_top_n for vasculature.
        self.min_component_mm3   = min_component_mm3

    # ── Public API ─────────────────────────────────────────────────────────── #

    def run(
        self,
        volume:  np.ndarray,
        spacing: tuple[float, float, float],
    ) -> SegmentationResult:
        """Execute full pipeline on *volume* (z,y,x float32).

        Parameters
        ----------
        volume  : float32 array (z, y, x) in HU
        spacing : (sz, sy, sx) in mm

        Returns
        -------
        SegmentationResult with vtkPolyData and mesh statistics
        """
        use_dual = (
            self.vessel_lower_hu > 0
            and self.vessel_lower_hu < self.threshold_hu
        )
        use_max = self.threshold_max_hu > self.threshold_hu

        logger.info(
            "Segmentation started — threshold=%.0f HU  max=%.0f HU  "
            "dual=%s  closing=%.1f mm  top_n=%d  shape=%s",
            self.threshold_hu,
            self.threshold_max_hu if use_max else float("inf"),
            use_dual, self.morpho_closing_mm, self.keep_top_n, volume.shape,
        )

        # 1. Gaussian pre-smooth
        vol_f = volume.astype(np.float32)
        if self.gaussian_sigma > 0.0:
            vol_f = self._numpy_gaussian(vol_f, self.gaussian_sigma)

        # 2. Binary mask
        if use_dual:
            mask = self._dual_threshold_mask(
                vol_f, spacing, self.threshold_hu,
                self.vessel_lower_hu, self.vessel_dilation_mm,
            )
            if use_max:
                mask = mask * (vol_f <= self.threshold_max_hu).astype(np.float32)
        elif use_max:
            mask = ((vol_f >= self.threshold_hu) & (vol_f <= self.threshold_max_hu)).astype(np.float32)
        else:
            mask = (vol_f >= self.threshold_hu).astype(np.float32)

        # 3. Morphological closing
        if self.morpho_closing_mm > 0.0:
            mask = self._morpho_closing(mask, spacing, self.morpho_closing_mm)

        # 4. Connected-component filtering in mask space
        n_fragments_removed = 0
        kept_fraction       = 1.0
        largest_removed_mm3 = 0.0
        voxel_mm3 = float(np.prod(spacing))
        min_voxels = self.min_component_verts
        if self.min_component_mm3 > 0.0 and voxel_mm3 > 0.0:
            # A physical cut-off means the same thing whatever the resolution,
            # which matters because large volumes are segmented downsampled.
            min_voxels = max(1, int(round(self.min_component_mm3 / voxel_mm3)))
        if self.keep_top_n > 0 or min_voxels > 0:
            before = float(mask.sum())
            mask, n_fragments_removed, largest_removed_vox = self._filter_mask_components(
                mask, min_voxels, self.keep_top_n,
            )
            after = float(mask.sum())
            kept_fraction = (after / before) if before > 0 else 1.0
            largest_removed_mm3 = largest_removed_vox * voxel_mm3
            if kept_fraction < 0.9:
                logger.warning(
                    "Cleanup discarded %.0f%% of the thresholded volume "
                    "(%d fragments, largest %.1f mm3) — lower the cleanup level "
                    "if branches are missing",
                    100 * (1 - kept_fraction), n_fragments_removed, largest_removed_mm3,
                )

        # 5. Marching Cubes on binary mask at iso=0.5
        mc_input = self._to_vtk_image(mask, spacing)
        mc = vtk.vtkMarchingCubes()
        mc.SetInputData(mc_input)
        mc.SetValue(0, 0.5)
        mc.ComputeNormalsOff()
        mc.ComputeGradientsOff()
        mc.Update()

        n_raw = mc.GetOutput().GetNumberOfPolys()
        logger.info("Marching Cubes: %d triangles", n_raw)

        if n_raw == 0:
            n_sel = int(mask.sum())
            vmax  = float(vol_f.max())
            if n_sel == 0:
                raise ValueError(
                    f"Ningún vóxel supera el umbral inferior de {self.threshold_hu:.0f} HU "
                    f"(intensidad máxima del volumen = {vmax:.0f}). Baja el umbral inferior."
                )
            raise ValueError(
                f"El umbral de {self.threshold_hu:.0f} HU selecciona {n_sel} vóxeles, pero no "
                "forman una superficie (volumen demasiado fino o todo fragmentos pequeños). "
                "Prueba la serie principal del estudio o reduce la limpieza de fragmentos."
            )

        # 6. Smoothing, 7. Decimation, 8. Normals for smooth shading — mismos
        # tres pasos que usa mask_to_surface() más abajo, factorizados a
        # _smooth_surface/_decimate_surface/_with_normals para no mantener dos
        # copias del mismo vtkWindowedSincPolyDataFilter con los mismos cinco
        # flags. Los parámetros de este pipeline clásico (self.smooth_*,
        # self.target_reduction) no cambian.
        poly = _smooth_surface(mc.GetOutput(), self.smooth_iterations, self.smooth_pass_band)
        poly = _decimate_surface(poly, self.target_reduction)
        poly = _with_normals(poly)

        n_verts = poly.GetNumberOfPoints()
        n_tris  = poly.GetNumberOfPolys()
        actual_reduction = 1.0 - n_tris / max(n_raw, 1)

        logger.info(
            "Segmentation done — %d verts, %d tris (%.0f%% reduction) "
            "%d fragments removed",
            n_verts, n_tris, actual_reduction * 100, n_fragments_removed,
        )

        return SegmentationResult(
            poly_data=poly,
            n_vertices=n_verts,
            n_triangles=n_tris,
            threshold_hu=self.threshold_hu,
            reduction_pct=actual_reduction * 100,
            n_fragments_removed=n_fragments_removed,
            kept_fraction=kept_fraction,
            largest_removed_mm3=largest_removed_mm3,
        )

    def run_fast_preview(
        self,
        volume:     np.ndarray,
        spacing:    tuple[float, float, float],
        downsample: int = 2,
    ) -> SegmentationResult:
        """Rapid preview: downsampled volume, no smoothing/decimation.

        ~8× faster than run() with downsample=2. Used for interactive
        threshold parameter tuning in the frontend.
        """
        s     = max(1, int(downsample))
        vol_d = volume[::s, ::s, ::s]
        sp_d  = tuple(sp * s for sp in spacing)

        _use_max = self.threshold_max_hu > self.threshold_hu
        if _use_max:
            mask = (
                (vol_d >= self.threshold_hu) & (vol_d <= self.threshold_max_hu)
            ).astype(np.float32)
        else:
            mask = (vol_d >= self.threshold_hu).astype(np.float32)

        kn = self.keep_top_n if self.keep_top_n > 0 else 20
        mask, _n, _largest = self._filter_mask_components(mask, 0, kn)

        img = self._to_vtk_image(mask, sp_d)
        mc  = vtk.vtkMarchingCubes()
        mc.SetInputData(img)
        mc.SetValue(0, 0.5)
        mc.ComputeNormalsOff()
        mc.ComputeGradientsOff()
        mc.Update()

        n_raw = mc.GetOutput().GetNumberOfPolys()
        if n_raw == 0:
            raise ValueError(
                f"No iso-surface at {self.threshold_hu:.0f} HU in preview. "
                "Try lowering the threshold."
            )

        smoother = vtk.vtkWindowedSincPolyDataFilter()
        smoother.SetInputConnection(mc.GetOutputPort())
        smoother.SetNumberOfIterations(5)
        smoother.SetPassBand(0.10)
        smoother.NormalizeCoordinatesOn()
        smoother.Update()

        normals = vtk.vtkPolyDataNormals()
        normals.SetInputConnection(smoother.GetOutputPort())
        normals.ComputePointNormalsOn()
        normals.ComputeCellNormalsOff()
        normals.SplittingOff()
        normals.ConsistencyOn()
        normals.AutoOrientNormalsOn()
        normals.Update()

        poly = normals.GetOutput()
        return SegmentationResult(
            poly_data=poly,
            n_vertices=poly.GetNumberOfPoints(),
            n_triangles=poly.GetNumberOfPolys(),
            threshold_hu=self.threshold_hu,
            reduction_pct=0.0,
            n_fragments_removed=0,
            is_preview=True,
        )

    # ── Static helpers ─────────────────────────────────────────────────────── #

    @staticmethod
    def _morpho_closing(
        mask:       np.ndarray,
        spacing:    tuple[float, float, float],
        closing_mm: float,
    ) -> np.ndarray:
        min_sp = min(float(spacing[0]), float(spacing[1]), float(spacing[2]))
        radius = max(1, round(closing_mm / min_sp))
        try:
            import SimpleITK as sitk
            sz, sy, sx = spacing
            sitk_mask = sitk.GetImageFromArray(mask.astype(np.uint8))
            sitk_mask.SetSpacing((float(sx), float(sy), float(sz)))
            closed = sitk.BinaryMorphologicalClosing(sitk_mask, [radius, radius, radius])
            return sitk.GetArrayFromImage(closed).astype(np.float32)
        except Exception:
            pass
        try:
            from scipy.ndimage import binary_closing, generate_binary_structure
            struct = generate_binary_structure(3, 1)
            closed = binary_closing(mask.astype(bool), structure=struct, iterations=radius)
            return closed.astype(np.float32)
        except Exception as exc:
            logger.warning("Morphological closing skipped: %s", exc)
            return mask.astype(np.float32)

    @staticmethod
    def _filter_mask_components(
        mask:        np.ndarray,
        min_voxels:  int,
        keep_top_n:  int,
    ) -> tuple[np.ndarray, int, int]:
        """Returns (mask, n_removed, largest_removed_voxels).

        The third value matters clinically: a few thousand discarded specks are
        noise, but one discarded component of a few hundred voxels is a vessel
        branch that silently vanished from the mesh.
        """
        try:
            from scipy.ndimage import label as scipy_label
        except ImportError:
            logger.warning("scipy not available — component filtering skipped")
            return mask.astype(np.float32), 0, 0

        labeled, n_labels = scipy_label(mask.astype(bool))
        if n_labels <= 1:
            return mask.astype(np.float32), 0, 0

        sizes = np.bincount(labeled.ravel())
        component_list = [(int(sizes[i + 1]), i + 1) for i in range(n_labels)]

        if keep_top_n > 0:
            component_list.sort(key=lambda x: x[0], reverse=True)
            keep_set = {idx for _, idx in component_list[:keep_top_n]}
        else:
            keep_set = {idx for sz, idx in component_list if sz >= min_voxels}
            if not keep_set:
                keep_set = {max(component_list, key=lambda x: x[0])[1]}

        n_removed = n_labels - len(keep_set)
        if n_removed == 0:
            return mask.astype(np.float32), 0, 0
        largest_removed = max((sz for sz, idx in component_list if idx not in keep_set),
                              default=0)

        result = np.isin(labeled, list(keep_set)).astype(np.float32)
        logger.info(
            "Component filter: kept %d/%d components (%s)",
            len(keep_set), n_labels,
            f"top-{keep_top_n}" if keep_top_n > 0 else f"≥{min_voxels} voxels",
        )
        return result, n_removed, largest_removed

    @staticmethod
    def _dual_threshold_mask(
        volume:        np.ndarray,
        spacing:       tuple[float, float, float],
        main_hu:       float,
        vessel_hu:     float,
        dilation_mm:   float,
    ) -> np.ndarray:
        try:
            import SimpleITK as sitk
        except ImportError:
            logger.warning("SimpleITK not found — dual threshold skipped")
            return (volume >= main_hu).astype(np.float32)

        main_mask   = (volume >= main_hu).astype(np.uint8)
        vessel_mask = (volume >= vessel_hu).astype(np.uint8)

        sz, sy, sx = spacing
        sitk_main  = sitk.GetImageFromArray(main_mask)
        sitk_main.SetSpacing((float(sx), float(sy), float(sz)))

        radius  = max(1, round(dilation_mm / min(float(sz), float(sy), float(sx))))
        dilated = sitk.BinaryDilate(sitk_main, [radius, radius, radius])
        dil_np  = sitk.GetArrayFromImage(dilated).astype(bool)

        combined = main_mask.astype(bool) | (vessel_mask.astype(bool) & dil_np)
        return combined.astype(np.float32)

    @staticmethod
    def _numpy_gaussian(volume: np.ndarray, sigma: float) -> np.ndarray:
        try:
            from scipy.ndimage import gaussian_filter
            return gaussian_filter(volume.astype(np.float32), sigma=sigma)
        except ImportError:
            pass
        try:
            import SimpleITK as sitk
            img     = sitk.GetImageFromArray(volume.astype(np.float32))
            blurred = sitk.SmoothingRecursiveGaussian(img, sigma)
            return sitk.GetArrayFromImage(blurred)
        except Exception:
            pass
        logger.warning("No Gaussian library — skipping pre-smooth")
        return volume.astype(np.float32)

    @staticmethod
    def _to_vtk_image(
        volume:  np.ndarray,
        spacing: tuple[float, float, float],
    ) -> vtk.vtkImageData:
        z, y, x = volume.shape
        sz, sy, sx = spacing

        img = vtk.vtkImageData()
        img.SetDimensions(x, y, z)
        img.SetSpacing(sx, sy, sz)
        img.SetOrigin(0.0, 0.0, 0.0)

        flat = np.ascontiguousarray(volume, dtype=np.float32).ravel()
        arr  = ns.numpy_to_vtk(flat, deep=True, array_type=vtk.VTK_FLOAT)
        arr.SetName("HU")
        img.GetPointData().SetScalars(arr)
        return img


# ── Smoothing / cleanup level → pipeline parameter maps ───────────────────── #
# smoothing level 0–10 → smooth_iterations
_SMOOTH_ITER = [0, 5, 10, 20, 25, 30, 35, 40, 45, 50, 60]
# cleanup level 0–10 → min_component_verts (or keep_top_n if 0)
_CLEANUP_VERTS = [0, 20, 50, 100, 200, 500, 800, 1200, 1500, 2000, 3000]

# Cleanup level 0–10 → (min_component_mm3, keep_top_n, morpho_closing_mm).
#
# Two regimes, because no single rule gives both a clean mesh and a complete one
# — measured over the three angiographic studies in `Archivos DICOM/`:
#
#   · An angiographic tree is NOT one connected component. After thresholding and
#     a 0.5 mm closing the largest component holds only 40–47% of the volume, in
#     1300–2700 pieces.
#   · Keeping the N largest gives the clean look, but discards 20–40% of the
#     volume, and among it single connected pieces of 66, 175 and 255 mm³. A
#     255 mm³ piece is a 3 mm vessel some 36 mm long, not noise.
#   · Keeping everything above a physical volume retains 89–94%, but leaves
#     65–270 visible islands.
#   · Closing harder reconnects the tree (largest component 42% → 75% at 3 mm)
#     by fattening it: the mask grows up to 2.3×, which would corrupt the
#     diameters morphometry reads off it.
#
# So levels 1–4 filter by physical volume — nothing vessel-sized is ever dropped,
# at the cost of speckle — and levels 5–10 keep the N largest for a clean mesh.
# Whichever regime is active, the run reports how much volume it discarded and
# how big the largest discarded piece was, so the loss is visible instead of
# silent and the clinician can drop a level when a branch is missing.
_CLEANUP_MAP_V2: list[tuple[float, int, float]] = [
    (0.0,   0, 0.0),  # 0  — Ninguna
    (0.5,   0, 0.0),  # 1  ┐
    (1.0,   0, 0.0),  # 2  │ por volumen físico: conserva todo lo que puede ser vaso
    (2.0,   0, 0.0),  # 3  │
    (5.0,   0, 0.5),  # 4  ┘ ~90% del volumen, descarta solo motas < 5 mm³
    (0.0,  20, 0.5),  # 5  ┐
    (0.0,  15, 0.5),  # 6  │ por número de componentes: malla limpia
    (0.0,  10, 0.5),  # 7  │ ← por defecto en la interfaz
    (0.0,   7, 1.0),  # 8  │
    (0.0,   5, 1.0),  # 9  │
    (0.0,   3, 1.0),  # 10 ┘ Máxima: solo las 3 estructuras mayores
]


def level_to_cleanup_mm3(level: int) -> tuple[float, int, float]:
    """Cleanup level 0–10 → (min_component_mm3, keep_top_n, morpho_closing_mm)."""
    return _CLEANUP_MAP_V2[max(0, min(10, level))]


def level_to_smooth_iters(level: int) -> int:
    return _SMOOTH_ITER[max(0, min(10, level))]


def level_to_cleanup_verts(level: int) -> int:
    return _CLEANUP_VERTS[max(0, min(10, level))]


# ── Mesh I/O ───────────────────────────────────────────────────────────────── #

def write_vtp(poly_data: vtk.vtkPolyData, path: str | Path) -> None:
    """Write *poly_data* to an XML VTP file (vtk.js compatible, binary mode).

    Se escribe a un temporal y se reemplaza de golpe. Sin eso, dos peticiones
    que guarden la MISMA malla a la vez entrelazan sus escrituras y dejan un
    fichero que ya no parsea: 3,9 MB con el cierre XML correcto y basura en
    medio. Pasó en vivo con el borrador de región —dos clics seguidos, y el
    borrado tarda ~1,6 s en una malla de 128 000 vértices, así que solaparlos
    es lo normal, no lo raro—. A partir de ahí la sesión lee 0 vértices y todas
    las herramientas dicen «no se borró nada» sin explicar por qué.

    `os.replace` es atómico dentro del mismo volumen, de ahí el temporal al
    lado del destino y no en el directorio temporal del sistema.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")

    writer = vtk.vtkXMLPolyDataWriter()
    writer.SetFileName(str(tmp))
    writer.SetInputData(poly_data)
    writer.SetDataModeToBinary()   # smaller than ASCII
    ok = writer.Write()
    if not ok or not tmp.exists():
        tmp.unlink(missing_ok=True)
        raise IOError(f"No se pudo escribir la malla en {path}")

    # En Windows `os.replace` falla si otro proceso tiene el destino abierto —el
    # navegador descargando la malla, o el propio lector de un paso anterior—.
    # El escritor de VTK no fallaba porque sobrescribía en sitio; a cambio dejaba
    # colas del fichero viejo. Se reintenta un poco antes de rendirse: la ventana
    # en que un lector tiene el .vtp abierto es de milisegundos.
    ultimo: Exception | None = None
    for intento in range(10):
        try:
            os.replace(tmp, path)
            break
        except PermissionError as exc:          # pragma: no cover - depende del SO
            ultimo = exc
            time.sleep(0.05 * (intento + 1))
    else:
        tmp.unlink(missing_ok=True)
        raise IOError(f"No se pudo reemplazar la malla {path}: {ultimo}")

    logger.info("Wrote VTP: %s (%d verts, %d tris)",
                path, poly_data.GetNumberOfPoints(), poly_data.GetNumberOfPolys())


def write_stl(poly_data: vtk.vtkPolyData, path: str | Path) -> None:
    """Write *poly_data* to a binary STL file (3D printing)."""
    writer = vtk.vtkSTLWriter()
    writer.SetFileName(str(path))
    writer.SetInputData(poly_data)
    writer.SetFileTypeToBinary()
    writer.Write()
    logger.info("Wrote STL: %s", path)


def read_vtp(path: str | Path) -> vtk.vtkPolyData:
    """Read a .vtp (VTK XML PolyData) file and return the vtkPolyData.

    Used by detection, morphometry and perforator routers to reload
    meshes that were written during segmentation or detection.
    """
    reader = vtk.vtkXMLPolyDataReader()
    reader.SetFileName(str(path))
    reader.Update()
    poly = reader.GetOutput()
    logger.info(
        "Read VTP: %s (%d verts, %d tris)",
        path, poly.GetNumberOfPoints(), poly.GetNumberOfPolys(),
    )
    return poly


# ── Superficie estanca a partir de una máscara ─────────────────────────────── #
#
# La malla antigua salía de marching cubes sobre un binario: escalones, 67
# aristas de borde y triángulos alargados. Aquí la máscara se suaviza a float
# antes (superficie sub-vóxel), se cierra lo que quede abierto y se decima con
# normales. Criterio del diseño: 0 aristas de borde, aspecto mediano < 1,45.
#
# _smooth_surface/_with_normals viven aquí porque SegmentationPipeline.run()
# (el pipeline clásico, más arriba) y mask_to_surface (esta superficie
# estanca) necesitan exactamente los mismos filtros con los mismos flags —
# antes eran dos copias del suavizado y tres de las normales (una en run(),
# una en mask_to_surface, otra en decimate_to). La decimación NO se comparte:
# el pipeline clásico y decimate_to usan _decimate_surface (cuadrática) y
# mask_to_surface usa _decimate_preserving, que no abre la malla.

def _smooth_surface(poly: vtk.vtkPolyData, iters: int, pass_band: float) -> vtk.vtkPolyData:
    """Suaviza con windowed sinc; la misma malla si `iters <= 0`.

    `BoundarySmoothingOff` deja fijos los puntos de cualquier borde abierto,
    que es lo que permite a mask_to_surface suavizar antes de rellenar
    agujeros (ver esa función) sin deformar el perímetro que luego lee
    vtkFillHolesFilter.
    """
    if iters <= 0:
        return poly
    sm = vtk.vtkWindowedSincPolyDataFilter()
    sm.SetInputData(poly)
    sm.SetNumberOfIterations(iters)
    sm.SetPassBand(pass_band)
    sm.BoundarySmoothingOff()
    sm.FeatureEdgeSmoothingOff()
    sm.NonManifoldSmoothingOn()
    sm.NormalizeCoordinatesOn()
    sm.Update()
    return sm.GetOutput()


def _decimate_surface(poly: vtk.vtkPolyData, reduction: float) -> vtk.vtkPolyData:
    """Decima con la métrica cuadrática; la misma malla si `reduction <= 0`."""
    if reduction <= 0:
        return poly
    dec = vtk.vtkQuadricDecimation()
    dec.SetInputData(poly)
    dec.SetTargetReduction(reduction)
    dec.Update()
    return dec.GetOutput()


def _decimate_preserving(poly: vtk.vtkPolyData, reduction: float) -> vtk.vtkPolyData:
    """Decima sin cambiar la topología; la misma malla si `reduction <= 0`.

    Por qué no la cuadrática en mask_to_surface: sobre una malla de tubos
    abre aristas de borde y no-variedad y alarga los triángulos. Medido en
    Case 3 con la máscara tubular: la malla llega CERRADA a la decimación
    (0 aristas de borde, aspecto 1,20) y vtkQuadricDecimation al 60 % la deja
    con 38 de borde, 24 no-variedad y aspecto 1,58. vtkDecimatePro con
    PreserveTopology, sin partir la malla y sin quitar vértices de borde, al
    45 % la deja con 0 de borde, 2 no-variedad y aspecto 1,43, a cambio de
    ~35 % más vértices (107 000 frente a 80 000, que el visor pinta a ritmo
    normal según lo medido en Task 10). PreserveTopology no siempre alcanza
    la reducción pedida —por eso decimate_to, que necesita un tope de
    vértices para la detección, sigue con la cuadrática—.
    """
    if reduction <= 0:
        return poly
    dec = vtk.vtkDecimatePro()
    dec.SetInputData(poly)
    dec.SetTargetReduction(reduction)
    dec.PreserveTopologyOn()
    dec.SplittingOff()
    dec.BoundaryVertexDeletionOff()
    dec.Update()
    return dec.GetOutput()


def _with_normals(poly: vtk.vtkPolyData) -> vtk.vtkPolyData:
    """Normales de punto suaves, consistentes y orientadas hacia afuera."""
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputData(poly)
    nrm.ComputePointNormalsOn()
    nrm.ComputeCellNormalsOff()
    nrm.SplittingOff()
    nrm.ConsistencyOn()
    nrm.AutoOrientNormalsOn()
    nrm.Update()
    return nrm.GetOutput()


def mask_to_surface(
    mask: np.ndarray,
    spacing: tuple[float, float, float],
    *,
    smooth_iters: int = 40,
    pass_band: float = 0.05,
    decimation: float = 0.45,
    fill_holes_mm: float = 4.0,
    min_island_mm3: float = 2.0,
    gauss_sigma_vox: float = 0.7,
    on_progress=None,
) -> vtk.vtkPolyData:
    from scipy import ndimage

    def say(phase: str, pct: float) -> None:
        if on_progress:
            on_progress(phase, pct)

    say("superficie", 0)
    # Un vóxel vacío alrededor de la máscara tapa los vasos que salen por una
    # cara del volumen: sin él marching cubes deja allí un tubo abierto (Case 3:
    # 65 aristas de borde, más grandes de lo que cierra fill_holes_mm). Se
    # rellena la máscara bool antes del gaussiano —un float32 de 384³ copiado
    # costaría 230 MB más— y el origen se corre un espaciado hacia atrás para
    # que las coordenadas sigan en el marco del volumen.
    padded = np.pad(np.asarray(mask, dtype=bool), 1)
    field = ndimage.gaussian_filter(padded.astype(np.float32), gauss_sigma_vox)
    del padded
    img = SegmentationPipeline._to_vtk_image(field, spacing)
    del field
    img.SetOrigin(-float(spacing[2]), -float(spacing[1]), -float(spacing[0]))
    mc = vtk.vtkMarchingCubes()
    mc.SetInputData(img); mc.SetValue(0, 0.5)
    mc.ComputeNormalsOff(); mc.ComputeGradientsOff(); mc.Update()
    if mc.GetOutput().GetNumberOfPolys() == 0:
        raise ValueError("La máscara no contiene ninguna superficie.")

    # Se suaviza ANTES de rellenar: con BoundarySmoothingOff() el sinc filter
    # deja fijos los puntos del borde de un agujero, así que el agujero llega a
    # vtkFillHolesFilter con la misma forma (perímetro real) que tenía en la
    # malla cruda. Si se rellenara primero, el parche recién creado entraría
    # al suavizado como superficie normal y el sinc filter lo movería junto al
    # resto — perdiendo el control sobre qué tan grande era el hueco que se
    # cerró y arriesgando triángulos degenerados en la costura del parche.
    say("suavizado", 25)
    poly = _smooth_surface(mc.GetOutput(), smooth_iters, pass_band)

    if fill_holes_mm > 0:
        fh = vtk.vtkFillHolesFilter()
        fh.SetInputData(poly); fh.SetHoleSize(fill_holes_mm); fh.Update(); poly = fh.GetOutput()

    # vtkFillHolesFilter tapa cada hueco con un abanico de triángulos a partir
    # del punto medio del borde — sale ya triangulado — pero el filtro
    # siguiente (decimación) exige explícitamente una malla de triángulos, y
    # surface_quality() mide el aspecto por triángulo. Un vtkTriangleFilter
    # aquí es barato cuando ya son triángulos y evita que un polígono suelto
    # (una tapa con forma rara, o una entrada ya no triangulada) se cuele.
    tf = vtk.vtkTriangleFilter()
    tf.SetInputData(poly); tf.Update(); poly = tf.GetOutput()

    say("decimación", 55)
    poly = _decimate_preserving(poly, decimation)

    say("normales", 75)
    poly = _with_normals(poly)

    say("islas", 90)
    if min_island_mm3 > 0:
        poly = _drop_small_islands(poly, min_island_mm3)
    say("superficie lista", 100)
    return poly


# Una isla real de min_island_mm3=2 mm³ a la resolución con la que trabaja
# esta función tiene decenas de triángulos. La decimación (paso previo) no
# garantiza una salida 2-variedad —con vtkQuadricDecimation, la de antes, y
# con la que decimate_to sigue usando—: puede
# dejar sueltos uno o unos pocos triángulos sin vecinos —confirmado en el caso
# 3, un triángulo suelto de la decimación colaba como "componente" de 2,68 mm³—.
# Un fragmento así no encierra nada, así que cualquier "volumen" que salga de
# él es ruido de la fórmula, no una medida física; exigir un mínimo de
# triángulos lo descarta sin importar cuánto volumen aparente tenga.
_MIN_ISLAND_TRIANGLES = 16


def _drop_small_islands(poly: vtk.vtkPolyData, min_mm3: float) -> vtk.vtkPolyData:
    """Quita las piezas conexas con menos de `min_mm3` de volumen encerrado
    o con menos de `_MIN_ISLAND_TRIANGLES` triángulos.

    Un umbral en número de vértices premia a la isla peor triangulada (más
    puntos por mm³ de superficie irregular) y castiga a una isla lisa; el
    volumen encerrado es lo único que corresponde a "¿esto podría ser un
    vaso?" sin importar cómo se malló. Con ~150 islas (caso 3) correr un
    vtkPolyDataConnectivityFilter POR isla —cada uno reetiquetando la malla
    entera— cuesta ~15 s. Aquí el filtro de conectividad corre una sola vez
    en modo AllRegions para etiquetar todo, el volumen de cada región sale de
    una sola pasada de NumPy (suma del volumen con signo del tetraedro
    apoyado en el CENTROIDE de la propia región, agrupado por RegionId), y
    solo se vuelve a llamar al filtro UNA vez más para extraer de golpe todas
    las regiones que se conservan.

    El apoyo del tetraedro es el centroide de la región y no el origen: para
    una región cerrada (2-variedad) el volumen por teorema de la divergencia
    no depende de qué punto se use como apoyo, así que da el mismo resultado
    que con el origen. Para un fragmento SIN cerrar —un triángulo suelto, un
    abanico de dos o tres triángulos— el centroide cae sobre (o casi sobre) su
    propio plano, y el "volumen" sale exactamente 0 o casi, en vez de un
    número arbitrario que depende de dónde esté ese fragmento respecto al
    origen (0,0,0) de la malla.
    """
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.Update()
    triangulated = tri.GetOutputPort()

    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputConnection(triangulated)
    cf.SetExtractionModeToAllRegions(); cf.ColorRegionsOn(); cf.Update()
    colored = cf.GetOutput()
    n = cf.GetNumberOfExtractedRegions()
    if n <= 1:
        return poly

    region_id_arr = colored.GetPointData().GetArray("RegionId")
    if region_id_arr is None:
        return poly
    region_id = ns.vtk_to_numpy(region_id_arr)
    points = ns.vtk_to_numpy(colored.GetPoints().GetData())
    # GetData() está obsoleto desde VTK 9.6 para vtkCellArray; la conectividad
    # ya no trae el conteo de puntos por celda intercalado (solo tenemos
    # triángulos tras el vtkTriangleFilter de arriba, así que un reshape(-1,3)
    # directo basta).
    cells = ns.vtk_to_numpy(colored.GetPolys().GetConnectivityArray()).reshape(-1, 3)

    cell_region = region_id[cells[:, 0]]
    tri_count_by_region = np.bincount(cell_region, minlength=n)

    # Centroide por región: promedio de los puntos que le pertenecen.
    counts = np.maximum(np.bincount(region_id, minlength=n), 1)
    centroid = np.stack([
        np.bincount(region_id, weights=points[:, axis], minlength=n) / counts
        for axis in range(3)
    ], axis=1)

    c = centroid[cell_region]
    p0 = points[cells[:, 0]] - c
    p1 = points[cells[:, 1]] - c
    p2 = points[cells[:, 2]] - c
    tri_vol = np.einsum("ij,ij->i", p0, np.cross(p1, p2)) / 6.0
    vol_by_region = np.bincount(cell_region, weights=tri_vol, minlength=n)

    keep_ids = np.flatnonzero(
        (np.abs(vol_by_region) >= min_mm3) & (tri_count_by_region >= _MIN_ISLAND_TRIANGLES)
    )
    if keep_ids.size == 0 or keep_ids.size == n:
        return poly

    keep = vtk.vtkPolyDataConnectivityFilter()
    keep.SetInputConnection(triangulated)
    keep.SetExtractionModeToSpecifiedRegions()
    for r in keep_ids:
        keep.AddSpecifiedRegion(int(r))
    keep.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(keep.GetOutputPort())
    cl.Update()
    return cl.GetOutput()


def decimate_to(poly: vtk.vtkPolyData, max_vertices: int) -> vtk.vtkPolyData:
    """La malla con como mucho `max_vertices` puntos, o la misma si ya cabe.

    La detección desactiva sus canales de calibre por encima de 40 000 vértices
    (medido: 52 s en 79 000). Decimar EN MEMORIA para detectar deja la malla
    completa en disco para medir.
    """
    n = poly.GetNumberOfPoints()
    if n <= max_vertices:
        return poly
    return _with_normals(_decimate_surface(poly, 1.0 - max_vertices / float(n)))


def surface_quality(poly: vtk.vtkPolyData) -> dict:
    fe = vtk.vtkFeatureEdges()
    fe.SetInputData(poly); fe.BoundaryEdgesOn(); fe.FeatureEdgesOff(); fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly); cf.SetExtractionModeToAllRegions(); cf.Update()
    # Las no-variedad (una arista compartida por 3+ triángulos) no son borde,
    # así que «0 aristas de borde» no basta para decir que la malla es una
    # 2-variedad: se cuentan aparte. Case 3 acepta 2 (ver _decimate_preserving).
    nm = vtk.vtkFeatureEdges()
    nm.SetInputData(poly); nm.BoundaryEdgesOff(); nm.FeatureEdgesOff(); nm.NonManifoldEdgesOn(); nm.ManifoldEdgesOff(); nm.Update()
    q = vtk.vtkMeshQuality()
    q.SetInputData(poly); q.SetTriangleQualityMeasureToAspectRatio(); q.Update()
    ar = ns.vtk_to_numpy(q.GetOutput().GetCellData().GetArray("Quality"))
    return {
        "boundary_edges": int(fe.GetOutput().GetNumberOfLines()),
        "non_manifold_edges": int(nm.GetOutput().GetNumberOfLines()),
        "components": int(cf.GetNumberOfExtractedRegions()),
        "aspect_ratio_median": float(np.median(ar)) if ar.size else 0.0,
        "n_vertices": int(poly.GetNumberOfPoints()),
        "n_triangles": int(poly.GetNumberOfPolys()),
    }


def voxel_fraction(
    volume: np.ndarray,
    lower:  float,
    upper:  float,
) -> float:
    """Return the fraction of voxels in [lower, upper] (0–1).

    `upper <= lower` means "no ceiling", the same convention the pipeline uses
    (`threshold_max_hu = upper if upper > lower else 0.0`). Without this the
    fraction came back as 0 for an uncapped band, which the UI shows as the
    percentage of the volume captured — reading 0 % while the mesh was fine.
    """
    flat = volume.ravel().astype("float32")
    if upper <= lower:
        return float(np.mean(flat >= lower))
    return float(np.mean((flat >= lower) & (flat <= upper)))
