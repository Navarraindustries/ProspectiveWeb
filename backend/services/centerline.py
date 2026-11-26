"""Vessel centerline extraction — port of the desktop processing/centerline.py.

Algorithm
---------
1. **Voxelise** the vessel mesh with ``vtkPolyDataToImageStencil`` at a
   configurable resolution (default 0.8 mm/voxel).
2. **Euclidean Distance Transform** (scipy EDT) on the binary mask → local
   vessel radius at every interior voxel.
3. **Dijkstra shortest path** on the EDT-weighted grid (cost = step / radius) —
   the minimum-cost path follows the medial axis (tube centre).
4. **Smooth** the raw voxel path (Gaussian) and re-sample at a fixed arc-length
   interval, computing a per-point radius.
5. Return geometry + clinical metrics (arc length, tortuosity, radii) and a
   vtkPolyData tube of varying radius for the 3D viewer.
"""
from __future__ import annotations

import heapq
import logging
import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import vtk
from scipy.ndimage import distance_transform_edt, gaussian_filter1d
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy

from services.distancia_malla import DistanciaFirmada

logger = logging.getLogger(__name__)


@dataclass
class CenterlineResult:
    """Output of :func:`extract_centerline`."""

    points: np.ndarray       # (N, 3) world-space mm coordinates
    radii:  np.ndarray       # (N,)   local radius in mm

    arc_length_mm:    float = 0.0
    chord_length_mm:  float = 0.0
    tortuosity:       float = 1.0   # arc / chord (>= 1)
    tortuosity_index: float = 0.0   # (arc - chord) / chord (>= 0)
    mean_radius_mm:   float = 0.0
    min_radius_mm:    float = 0.0
    max_radius_mm:    float = 0.0

    # Vaso portador (P13): los primeros `n_portador` puntos; si la línea entra
    # en la lesión, sin ese tramo final. Medias sobre la línea suavizada.
    n_portador:            int | None = None
    curvatura_media:       float | None = None   # 1/mm
    torsion_media:         float | None = None   # 1/mm (|τ| en el tramo curvo)
    longitud_curvatura_mm: float | None = None   # tramo medido, sin extremos

    # La rejilla con la que se midió (P15): el radio sale de la transformada de
    # distancia sobre ella, así que el Ø inscrito va a saltos de ese tamaño.
    # Es 0,8 mm salvo que la malla sea grande y `_clamp_voxel_size` la suba.
    voxel_mm:              float | None = None

    poly_data: vtk.vtkPolyData | None = field(default=None, repr=False)


class CenterlineExtractor:
    """Extract the medial-axis centreline of a vessel mesh between two points."""

    def __init__(
        self,
        voxel_size_mm: float = 0.8,
        smooth_sigma: float = 1.5,
        resample_spacing_mm: float = 0.5,
        progress_cb: Callable[[float], None] | None = None,
    ) -> None:
        self.voxel_size_mm       = voxel_size_mm
        self.smooth_sigma        = smooth_sigma
        self.resample_spacing_mm = resample_spacing_mm
        self._progress           = progress_cb or (lambda _: None)

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    # Cap the probe grid so a large mesh at a fine voxel size can't blow up
    # memory / the voxelisation pass. If exceeded, the voxel size is
    # raised (coarser but bounded).
    _MAX_VOXELS = 12_000_000

    # Perpendicular margin (mm) added around the source→target box when cropping
    # the voxel grid. Must cover realistic vessel bowing off the straight line.
    _CROP_MARGIN_MM = 20.0

    def extract(
        self,
        poly_data: vtk.vtkPolyData,
        source_mm: tuple[float, float, float],
        target_mm: tuple[float, float, float] | None = None,
        target_region: vtk.vtkPolyData | None = None,
    ) -> CenterlineResult:
        """`target_region` (el saco medido, cerrado, o la zona del candidato,
        abierta) pone el destino DENTRO de la lesión, en su punto más hondo, en
        vez de pegarlo al eje del vaso más grueso de alrededor: junto a la
        basilar de case 3 el destino caía en la arteria madre, a 1,7 mm del
        saco, y el recorrido por dentro nunca entraba en él (17-11)."""
        region_pts = None
        if target_region is not None and target_region.GetNumberOfPoints() > 0:
            region_pts = vtk_to_numpy(target_region.GetPoints().GetData()).astype(np.float64)
            if target_mm is None:
                target_mm = tuple(float(v) for v in region_pts.mean(axis=0))
        if target_mm is None:
            raise ValueError("Falta el destino: márcalo sobre el vaso o elige un candidato.")
        mesh_bounds = poly_data.GetBounds()

        # First try a grid cropped to the region of interest (fast for local
        # picks); fall back to the full mesh bounds if no path is found there.
        crop_bounds = self._crop_bounds(source_mm, target_mm, mesh_bounds)
        raw_path = mask = dt = origin = None
        vs = self.voxel_size_mm
        for bounds in (crop_bounds, mesh_bounds):
            self._clamp_voxel_size(bounds)
            self._progress(0.05)
            mask, origin, vs = self._voxelise(poly_data, bounds)
            if not mask.any():
                continue
            self._progress(0.25)
            dt = distance_transform_edt(mask).astype(np.float32) * vs   # mm
            src_idx = self._world_to_idx(source_mm, origin, vs, mask.shape)
            tgt_idx = self._world_to_idx(target_mm, origin, vs, mask.shape)
            src_idx = self._snap_to_best_center(src_idx, mask, dt, vs)
            dentro = (self._lesion_center(mask, dt, origin, vs, target_region, region_pts)
                      if region_pts is not None else None)
            tgt_idx = dentro if dentro is not None else self._snap_to_best_center(tgt_idx, mask, dt, vs)
            self._progress(0.35)
            raw_path = self._dijkstra(dt, mask, src_idx, tgt_idx)
            if len(raw_path) >= 2:
                break

        if not mask.any():
            raise ValueError(
                "La malla no encierra volumen (¿superficie abierta?). "
                "No se puede extraer la línea central."
            )
        if not raw_path or len(raw_path) < 2:
            raise ValueError(_sin_camino(poly_data, source_mm, target_mm, vs))

        self._progress(0.80)
        pts_world  = self._path_to_world(raw_path, origin, vs)
        pts_smooth = self._smooth_path(pts_world)
        self._progress(0.85)
        dist_pared = DistanciaFirmada(poly_data) if poly_data.GetNumberOfCells() else None
        if dist_pared is not None:
            # Antes de centrar: así el centrado arregla también los puntos de
            # al lado del extremo, que venían del vóxel de la punta.
            pts_smooth = llevar_extremos_a_lo_marcado(
                pts_smooth, dist_pared, source_mm,
                None if region_pts is not None else target_mm)
        pts_smooth = centrar_en_malla(pts_smooth, poly_data, dist_pared)
        pts_final, radii = self._resample_with_radii(pts_smooth, dt, origin, vs, mask.shape, dist_pared)

        self._progress(0.95)
        n_portador = None
        if region_pts is not None:
            from services.curvatura import tramo_portador
            n_portador = tramo_portador(pts_final, radii, region_pts)
        result = self._compute_metrics(pts_final, radii, n_portador)
        result.voxel_mm = float(vs)
        result.poly_data = build_tube(pts_final, radii)
        self._progress(1.0)
        logger.info(
            "Centerline: arc=%.1fmm tort=%.3f Ø_mean=%.2fmm",
            result.arc_length_mm, result.tortuosity, result.mean_radius_mm * 2,
        )
        return result

    # ------------------------------------------------------------------ #
    # Step 1 — voxelisation                                                #
    # ------------------------------------------------------------------ #

    def _crop_bounds(self, src, tgt, mesh_bounds):
        """AABB of source+target expanded by the crop margin, clamped to mesh."""
        m = self._CROP_MARGIN_MM
        lo = [min(src[i], tgt[i]) - m for i in range(3)]
        hi = [max(src[i], tgt[i]) + m for i in range(3)]
        return (
            max(lo[0], mesh_bounds[0]), min(hi[0], mesh_bounds[1]),
            max(lo[1], mesh_bounds[2]), min(hi[1], mesh_bounds[3]),
            max(lo[2], mesh_bounds[4]), min(hi[2], mesh_bounds[5]),
        )

    def _clamp_voxel_size(self, bds) -> None:
        pad = self.voxel_size_mm * 2
        while True:
            vs = self.voxel_size_mm
            nx = max(4, int((bds[1] - bds[0] + 2 * pad) / vs) + 1)
            ny = max(4, int((bds[3] - bds[2] + 2 * pad) / vs) + 1)
            nz = max(4, int((bds[5] - bds[4] + 2 * pad) / vs) + 1)
            if nx * ny * nz <= self._MAX_VOXELS or vs >= 3.0:
                break
            self.voxel_size_mm = round(vs * 1.25, 2)
            pad = self.voxel_size_mm * 2
            logger.info("Centerline: grid too large, voxel size raised to %.2f mm", self.voxel_size_mm)

    def _voxelise(self, poly_data: vtk.vtkPolyData, bds):
        """Máscara del interior de la malla en la rejilla de `bds`.

        Relleno por cortes (`vtkPolyDataToImageStencil`), como
        `branch_origins._rasterise`. `vtkSelectEnclosedPoints` fallaba en
        mallas reales: en la de case 3 marcaba «dentro» 16 cm³ para un vaso de
        5,6 (vóxeles a 24 mm de la pared, con 0 cortes de rayo en los seis
        ejes), y la línea central pasaba por fuera del vaso hasta 7 mm. Además
        tardaba casi un minuto en la malla entera; esto, menos de un segundo.
        """
        vs  = self.voxel_size_mm
        pad = vs * 2

        origin = np.array([bds[0] - pad, bds[2] - pad, bds[4] - pad])
        nx = max(4, int((bds[1] - bds[0] + 2 * pad) / vs) + 1)
        ny = max(4, int((bds[3] - bds[2] + 2 * pad) / vs) + 1)
        nz = max(4, int((bds[5] - bds[4] + 2 * pad) / vs) + 1)

        img = vtk.vtkImageData()
        img.SetDimensions(nx, ny, nz)
        img.SetOrigin(*origin)
        img.SetSpacing(vs, vs, vs)
        img.AllocateScalars(vtk.VTK_UNSIGNED_CHAR, 1)
        img.GetPointData().GetScalars().Fill(1)

        stencil = vtk.vtkPolyDataToImageStencil()
        stencil.SetInputData(poly_data)
        stencil.SetOutputOrigin(img.GetOrigin())
        stencil.SetOutputSpacing(img.GetSpacing())
        stencil.SetOutputWholeExtent(img.GetExtent())
        stencil.Update()

        cut = vtk.vtkImageStencil()
        cut.SetInputData(img)
        cut.SetStencilData(stencil.GetOutput())
        cut.ReverseStencilOff()
        cut.SetBackgroundValue(0)
        cut.Update()

        flat = vtk_to_numpy(cut.GetOutput().GetPointData().GetScalars())
        # VTK entrega el volumen con el eje X variando más rápido.
        mask = flat.reshape((nz, ny, nx)).astype(bool).transpose(2, 1, 0)
        return np.ascontiguousarray(mask), origin, vs

    # ------------------------------------------------------------------ #
    # Coordinate helpers                                                   #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _world_to_idx(pt_mm, origin, vs, shape):
        i = int(round((pt_mm[0] - origin[0]) / vs))
        j = int(round((pt_mm[1] - origin[1]) / vs))
        k = int(round((pt_mm[2] - origin[2]) / vs))
        i = max(0, min(i, shape[0] - 1))
        j = max(0, min(j, shape[1] - 1))
        k = max(0, min(k, shape[2] - 1))
        return (i, j, k)

    @staticmethod
    def _snap_to_best_center(idx, mask, dt, vs: float = 1.0):
        """Lleva *idx* al eje del vaso, a la altura de lo marcado.

        Se elige el vóxel cuya esfera inscrita (radio = su distancia a la pared,
        `dt`, en mm) CONTIENE el punto marcado y, de esos, el más hondo; a
        igualdad, el más cercano. Así el punto solo se mueve de lado, hasta el
        eje. Antes se elegía «lo más hondo de un cubo de ±8 vóxeles»: cerca de
        la punta de un vaso eso queda vaso adentro, y el extremo se corría hasta
        7,85 mm (o hacia otra rama más gruesa); la longitud salía mal."""
        inside = np.argwhere(mask)
        if len(inside) == 0:
            raise ValueError("Interior de la malla vacío — revise la calidad de la malla.")

        idx_arr = np.array(idx, dtype=np.float64)
        for radius in (8, 20):
            chebyshev = np.max(np.abs(inside - idx_arr), axis=1)
            candidates = inside[chebyshev <= radius]
            if len(candidates) == 0:
                continue
            dt_vals = dt[candidates[:, 0], candidates[:, 1], candidates[:, 2]]
            d_mm = np.linalg.norm(candidates - idx_arr, axis=1) * vs
            contiene = d_mm <= dt_vals + 0.5 * vs
            if not contiene.any():
                continue
            c, dv, dd = candidates[contiene], dt_vals[contiene], d_mm[contiene]
            hondos = dv >= dv.max() * 0.98
            return tuple(c[hondos][np.argmin(dd[hondos])])

        dists = np.sum((inside - idx_arr) ** 2, axis=1)
        return tuple(inside[np.argmin(dists)])

    @staticmethod
    def _lesion_center(mask, dt, origin, vs, region: vtk.vtkPolyData, region_pts: np.ndarray):
        """El vóxel interior más hondo DE LA LESIÓN, o None si no se encuentra.

        - Saco cerrado (morfometría): entre los vóxeles del vaso que caen dentro
          del saco, el más alejado de la superficie del saco: el centro de la
          mayor esfera que cabe en él. No se mide contra la pared del vaso: en
          un saco de cuello ancho el más hondo según el vaso queda en el cuello,
          pegado a la arteria madre.
        - Zona abierta (candidato sin medir): entre los vóxeles cuya pared más
          cercana es la zona, el más hondo según el vaso. La arteria madre
          tiene su propia pared más cerca y no entra."""
        from scipy.spatial import cKDTree

        shape = np.array(mask.shape)
        lo = np.clip(np.floor((region_pts.min(axis=0) - 2.0 - origin) / vs).astype(int), 0, shape - 1)
        hi = np.clip(np.ceil((region_pts.max(axis=0) + 2.0 - origin) / vs).astype(int) + 1, 1, shape)
        sub = mask[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
        idx = np.argwhere(sub) + lo
        if len(idx) == 0:
            return None
        world = idx * vs + origin
        d_region, _ = cKDTree(region_pts).query(world)
        fe = vtk.vtkFeatureEdges()
        fe.SetInputData(region)
        fe.BoundaryEdgesOn(); fe.FeatureEdgesOff(); fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff()
        fe.Update()
        if fe.GetOutput().GetNumberOfCells() == 0:
            pts = vtk.vtkPoints()
            pts.SetData(numpy_to_vtk(world.astype(np.float64), deep=True))
            probe = vtk.vtkPolyData(); probe.SetPoints(pts)
            enc = vtk.vtkSelectEnclosedPoints()
            enc.SetInputData(probe); enc.SetSurfaceData(region); enc.SetTolerance(0.001); enc.Update()
            inside = vtk_to_numpy(enc.GetOutput().GetPointData().GetArray("SelectedPoints")).astype(bool)
            if inside.any():
                k = np.flatnonzero(inside)[np.argmax(d_region[inside])]
                return tuple(int(v) for v in idx[k])
        prof = dt[idx[:, 0], idx[:, 1], idx[:, 2]]
        ok = d_region <= prof + max(vs, 0.5)
        if not ok.any():
            return None
        k = np.flatnonzero(ok)[np.argmax(prof[ok])]
        return tuple(int(v) for v in idx[k])

    # ------------------------------------------------------------------ #
    # Dijkstra on EDT-weighted grid                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _dijkstra(dt, mask, src, tgt):
        shape = dt.shape
        INF   = float("inf")
        EPS   = 0.1

        cost = np.full(shape, INF, dtype=np.float32)
        cost[src] = 0.0

        stride = (shape[1] * shape[2], shape[2], 1)
        def flat(idx):
            return idx[0] * stride[0] + idx[1] * stride[1] + idx[2]

        prev = np.full(shape[0] * shape[1] * shape[2], -1, dtype=np.int32)
        heap = [(0.0, src)]

        offsets = [
            (di, dj, dk)
            for di in (-1, 0, 1) for dj in (-1, 0, 1) for dk in (-1, 0, 1)
            if not (di == dj == dk == 0)
        ]
        step_d = {o: math.sqrt(o[0] ** 2 + o[1] ** 2 + o[2] ** 2) for o in offsets}

        while heap:
            c, cur = heapq.heappop(heap)
            if c > cost[cur]:
                continue
            if cur == tgt:
                break
            ci, cj, ck = cur
            for di, dj, dk in offsets:
                ni, nj, nk = ci + di, cj + dj, ck + dk
                if not (0 <= ni < shape[0] and 0 <= nj < shape[1] and 0 <= nk < shape[2]):
                    continue
                if not mask[ni, nj, nk]:
                    continue
                r = float(dt[ni, nj, nk])
                new_c = c + step_d[(di, dj, dk)] / (r + EPS)
                if new_c < cost[ni, nj, nk]:
                    cost[ni, nj, nk] = new_c
                    prev[flat((ni, nj, nk))] = flat(cur)
                    heapq.heappush(heap, (new_c, (ni, nj, nk)))

        if cost[tgt] == INF:
            return []

        path = []
        cur_flat = flat(tgt)
        while cur_flat >= 0:
            i = cur_flat // stride[0]
            j = (cur_flat % stride[0]) // stride[1]
            k = cur_flat % stride[1]
            path.append((i, j, k))
            cur_flat = int(prev[cur_flat])
        path.reverse()
        return path

    # ------------------------------------------------------------------ #
    # Smooth & resample                                                    #
    # ------------------------------------------------------------------ #

    def _path_to_world(self, path, origin, vs):
        arr = np.array(path, dtype=np.float32)
        return arr * vs + origin

    def _smooth_path(self, pts):
        sigma_voxels = self.smooth_sigma / self.voxel_size_mm
        smoothed = np.column_stack([
            gaussian_filter1d(pts[:, ax], sigma_voxels, mode="nearest")
            for ax in range(3)
        ])
        smoothed[0]  = pts[0]
        smoothed[-1] = pts[-1]
        return smoothed

    def _resample_with_radii(self, pts, dt, origin, vs, shape, dist_pared=None):
        spacing = self.resample_spacing_mm
        diffs   = np.diff(pts, axis=0)
        segs    = np.linalg.norm(diffs, axis=1)
        cumlen  = np.concatenate([[0.0], np.cumsum(segs)])
        total   = cumlen[-1]
        if total < 1e-3:
            return pts, np.zeros(len(pts))

        n_out = max(2, int(total / spacing) + 1)
        t_out = np.linspace(0.0, total, n_out)
        resampled = np.column_stack([
            np.interp(t_out, cumlen, pts[:, ax]) for ax in range(3)
        ])

        radii = np.zeros(n_out, dtype=np.float32)
        if dist_pared is not None:
            # La distancia exacta a la pared (la malla, no la rejilla). La de la
            # transformada en vóxeles iba a saltos de vóxel: con 0,8 mm, un
            # vaso de Ø 2 mm salía de Ø 1,6.
            for idx, pt in enumerate(resampled):
                radii[idx] = max(0.0, -dist_pared.EvaluateFunction(*pt))
            minimo = 0.05
        else:
            for idx, pt in enumerate(resampled):
                vi = max(0, min(int(round((pt[0] - origin[0]) / vs)), shape[0] - 1))
                vj = max(0, min(int(round((pt[1] - origin[1]) / vs)), shape[1] - 1))
                vk = max(0, min(int(round((pt[2] - origin[2]) / vs)), shape[2] - 1))
                radii[idx] = dt[vi, vj, vk]
            minimo = vs * 0.5

        nonzero = radii > 0.0
        if nonzero.any() and not nonzero.all():
            idxs = np.arange(n_out, dtype=float)
            radii = np.interp(idxs, idxs[nonzero], radii[nonzero])
        radii = np.maximum(radii, minimo)
        return resampled, radii

    # ------------------------------------------------------------------ #
    # Metrics                                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _compute_metrics(pts, radii, n_portador: int | None = None):
        """`n_portador`: cuántos puntos del principio son vaso portador (la
        línea que termina en la lesión entra en ella al final). None = toda."""
        from services.curvatura import geometria_eje
        segs       = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        arc        = float(segs.sum())
        chord      = float(np.linalg.norm(pts[-1] - pts[0]))
        tortuosity = arc / chord if chord > 1e-6 else 1.0
        ti         = (arc - chord) / chord if chord > 1e-6 else 0.0
        geo = geometria_eje(pts[:n_portador] if n_portador is not None else pts)
        return CenterlineResult(
            n_portador            = n_portador,
            curvatura_media       = geo.curvatura_media if geo else None,
            torsion_media         = geo.torsion_media if geo else None,
            longitud_curvatura_mm = geo.longitud_medida_mm if geo else None,
            points           = pts,
            radii            = radii,
            arc_length_mm    = arc,
            chord_length_mm  = chord,
            tortuosity       = tortuosity,
            tortuosity_index = ti,
            mean_radius_mm   = float(radii.mean()) if len(radii) else 0.0,
            min_radius_mm    = float(radii.min())  if len(radii) else 0.0,
            max_radius_mm    = float(radii.max())  if len(radii) else 0.0,
        )


# ──────────────────────────────────────────────────────────────────────────── #
# Centrado sobre la malla                                                        #
# ──────────────────────────────────────────────────────────────────────────── #

# El camino de Dijkstra va por centros de vóxel de 0,8 mm y el suavizado
# gaussiano le corta las curvas: en los vasos finos de una angio-TC la línea
# salía hasta 0,7 mm por fuera de la pared en las curvas cerradas (13-11,
# Zenodo 002: 12 de 175 puntos fuera, holgura mediana 0,83 mm), y el recorrido
# por dentro del vaso, que pone la cámara sobre la línea, se salía y volvía a
# entrar. Esto lleva cada punto al centro del vaso en la malla que se ve, no en
# la rejilla.
#
# Se probó antes centrar con rayos en el corte transversal: en una curva
# cerrada el corte sale oblicuo, el centro estimado se sesga y la línea seguía
# fuera. Subir por la profundidad (la distancia a la pared más cercana) no
# depende del corte: el máximo en el plano transversal es el centro del mayor
# círculo que cabe en el vaso, y se llega igual desde dentro que desde fuera.

_PASO_INICIAL_MM = 0.3   # primer paso de la subida; se parte en dos al pasarse
_PASO_MIN_MM = 0.02
_SUBIDAS = 40            # pasos por punto, como mucho
_DESVIO_MAX_MM = 2.5     # lo que puede apartarse de la línea suavizada en total
_MARGEN_DENTRO_MM = 0.15
_RONDAS_SUAVES = 4       # centrar + suavizar poco, alternados


def _tangentes(p: np.ndarray) -> np.ndarray:
    t = np.gradient(p, axis=0)
    t = np.column_stack([gaussian_filter1d(t[:, a], 3.0, mode="nearest") for a in range(3)])
    n = np.linalg.norm(t, axis=1, keepdims=True)
    return t / np.maximum(n, 1e-9)


def _suavizar(p: np.ndarray, sigma: float) -> np.ndarray:
    return np.column_stack([gaussian_filter1d(p[:, a], sigma, mode="nearest") for a in range(3)])


def _al_centro(q: np.ndarray, t: np.ndarray, dist: DistanciaFirmada) -> np.ndarray:
    """Sube por la profundidad desde `q` sin salirse del plano perpendicular a
    `t`: cada paso va contra el gradiente de la distancia firmada (que apunta
    hacia fuera) y solo se acepta si el punto queda más hondo."""
    g = [0.0, 0.0, 0.0]
    prof = dist.EvaluateFunction(*q)          # < 0 dentro
    paso = _PASO_INICIAL_MM
    for _ in range(_SUBIDAS):
        dist.EvaluateGradient(q, g)
        gv = np.array(g)
        # Fuera de la pared se entra por lo más corto, en cualquier dirección:
        # donde el vaso se estrecha por debajo de la rejilla, el camino corta
        # la esquina y el hueco no está en el plano transversal.
        if prof < 0.0:
            gv -= gv.dot(t) * t
        norma = float(np.linalg.norm(gv))
        if norma < 1e-9:
            break
        cand = q - gv / norma * paso
        pc = dist.EvaluateFunction(*cand)
        if pc < prof:
            q, prof = cand, pc
        else:
            paso *= 0.5
            if paso < _PASO_MIN_MM:
                break
    return q


def _meter_dentro(p: np.ndarray, dist: DistanciaFirmada) -> None:
    """Empuja hacia dentro (por el gradiente de la distancia) los puntos que
    quedan fuera de la pared o rozándola. Los extremos no se tocan."""
    g = [0.0, 0.0, 0.0]
    for i in range(1, len(p) - 1):
        for _ in range(4):
            d = dist.EvaluateFunction(*p[i])          # < 0 dentro
            if d < -_MARGEN_DENTRO_MM:
                break
            dist.EvaluateGradient(p[i], g)            # hacia fuera
            n = math.sqrt(g[0] ** 2 + g[1] ** 2 + g[2] ** 2)
            if n < 1e-9:
                break
            p[i] -= np.array(g) / n * (d + _MARGEN_DENTRO_MM + 0.05)


def centrar_en_malla(pts: np.ndarray, poly_data: vtk.vtkPolyData,
                     dist: "DistanciaFirmada | None" = None) -> np.ndarray:
    """Lleva cada punto interior de la línea al centro del vaso en la malla.

    Cada punto sube por la profundidad dentro de su plano transversal (la
    dirección de la marcha sale de la línea suavizada y no se recalcula). Los
    desplazamientos se suavizan a lo largo de la línea para que la cámara que
    va encima no tiemble, con un tope de `_DESVIO_MAX_MM`, y al final ningún
    punto queda fuera de la pared. Los extremos (origen y destino, ya llevados
    al eje por el ajuste a la rejilla) no se mueven."""
    p = np.asarray(pts, dtype=np.float64).copy()
    n = len(p)
    if n < 3 or poly_data is None or poly_data.GetNumberOfCells() == 0:
        return p
    base = p.copy()
    extremos = p[[0, -1]].copy()
    if dist is None:
        dist = DistanciaFirmada(poly_data)   # no vtkImplicitPolyDataDistance: services/distancia_malla.py
    # Centrar y suavizar poco, alternados, unas cuantas rondas: en cada una se
    # vuelve al centro desde la línea ya suavizada. Solo empujar hacia dentro
    # entre suavizados encogía la línea hacia la cara interior de las curvas
    # (pegada a la pared); centrar una vez y suavizar fuerte dejaba quiebros.
    for _ in range(_RONDAS_SUAVES):
        tang = _tangentes(p)
        for i in range(1, n - 1):
            p[i] = _al_centro(p[i], tang[i], dist)
        p = _suavizar(p, 1.0)
        p[[0, -1]] = extremos
        desvio = p - base
        largo = np.linalg.norm(desvio, axis=1)
        p = base + desvio * np.minimum(1.0, _DESVIO_MAX_MM / np.maximum(largo, 1e-9))[:, None]
    # Una última vuelta al centro sin suavizar: el suavizado de la última ronda
    # recorta hacia dentro el vértice de las curvas cerradas. Tras las rondas,
    # lo que queda por mover es poco y no deja quiebros.
    tang = _tangentes(p)
    centrada = p.copy()
    for i in range(1, n - 1):
        centrada[i] = _al_centro(p[i], tang[i], dist)
    # Ese último ajuste, suavizado a lo largo de la línea: punto a punto deja
    # pequeños quiebros que la cámara notaría como un temblor.
    ajuste = _suavizar(centrada - p, 1.0)
    ajuste[0] = ajuste[-1] = 0.0
    p = p + ajuste
    _meter_dentro(p, dist)
    return p


def misma_pieza(poly_data: vtk.vtkPolyData, a, b) -> bool:
    """Si los vértices más cercanos a `a` y a `b` están en la misma pieza
    conexa de la malla."""
    con = vtk.vtkPolyDataConnectivityFilter()
    con.SetInputData(poly_data)
    con.SetExtractionModeToAllRegions()
    con.ColorRegionsOn()
    con.Update()
    salida = con.GetOutput()
    region = vtk_to_numpy(salida.GetPointData().GetArray("RegionId"))
    loc = vtk.vtkStaticPointLocator()
    loc.SetDataSet(salida)
    loc.BuildLocator()
    return bool(region[loc.FindClosestPoint(a)] == region[loc.FindClosestPoint(b)])


def _sin_camino(poly_data: vtk.vtkPolyData, a, b, vs: float) -> str:
    """Por qué no hay camino, distinguiendo vasos separados de un paso fino.

    En la malla de case 3 (una sola pieza), el camino hasta el vaso más lejano
    pasaba por un estrechamiento de ~0,18 mm de diámetro: la rejilla de 0,8 mm
    no lo ve y la máscara queda partida. Afinar la rejilla lo conecta, pero la
    línea se salía del vaso hasta 3,9 mm en ese tramo y tardaba de 2 a 5 min;
    un paso así en una 3DRA suele ser un puente de la segmentación (25-11)."""
    if misma_pieza(poly_data, a, b):
        return (
            "No se encontró un camino por dentro del vaso entre los dos puntos. "
            "Están en la misma pieza de la malla, pero se unen por un paso de menos "
            f"de {vs:.1f} mm, que suele ser un puente de la segmentación y no un vaso. "
            "Marca el origen y el destino en el mismo vaso, más cerca uno del otro."
        )
    return (
        "No se encontró un camino entre los dos puntos: están en piezas separadas "
        "de la malla. Marca el origen y el destino en el mismo vaso."
    )


#: Un punto marcado que, llevado al eje, queda más lejos que esto del extremo
#: de la línea no es del mismo vaso: se deja el extremo que dio la rejilla.
_EXTREMO_MAX_MM = 4.0
#: Tramo de la punta de la línea en el que se busca la altura de lo marcado.
_TRAMO_EXTREMO_MM = 10.0


def _empezar_en(p: np.ndarray, e: np.ndarray) -> np.ndarray:
    """La línea `p` empezando en `e`: se corta donde `e` cae sobre ella (en
    su tramo inicial) o, si `e` queda antes del principio, se alarga hasta él."""
    largo = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    mejor = (math.inf, 0, 0.0)
    for i in range(len(p) - 1):
        if largo[i] > _TRAMO_EXTREMO_MM:
            break
        a, b = p[i], p[i + 1]
        ab = b - a
        n2 = float(ab @ ab)
        s = 0.0 if n2 < 1e-12 else float((e - a) @ ab) / n2
        s_lim = min(1.0, s) if i == 0 else min(1.0, max(0.0, s))
        d = float(np.linalg.norm(a + ab * s_lim - e))
        if d < mejor[0]:
            mejor = (d, i, s)
    _, i, s = mejor
    if i == 0 and s <= 0.0:
        return np.vstack([e, p])
    return np.vstack([e, p[i + 1:]])


def llevar_extremos_a_lo_marcado(pts: np.ndarray, dist: DistanciaFirmada,
                                 origen, destino=None) -> np.ndarray:
    """Pone los extremos de la línea en el eje del vaso A LA ALTURA de lo
    marcado: el punto marcado sube al centro dentro de su plano transversal
    (como el resto de la línea) y la línea se recorta o alarga hasta él.

    Los extremos que da la rejilla son centros de vóxel de 0,8 mm elegidos
    entre los más hondos de alrededor: caían hasta 2 mm vaso adentro o
    afuera, la longitud salía mal y el radio de la punta, bajo. `destino`
    None deja el final como está (el destino dentro de una lesión ya es su
    punto más hondo, no un punto del eje de un vaso)."""
    p = np.asarray(pts, dtype=np.float64)
    if len(p) < 3:
        return p
    for marcado, al_final in ((origen, False), (destino, True)):
        if marcado is None:
            continue
        q = p[::-1] if al_final else p
        t = q[min(2, len(q) - 1)] - q[0]
        t = t / max(float(np.linalg.norm(t)), 1e-9)
        e = _al_centro(np.asarray(marcado, dtype=np.float64), t, dist)
        if dist.EvaluateFunction(*e) >= 0.0 or np.linalg.norm(e - q[0]) > _EXTREMO_MAX_MM:
            continue
        q = _empezar_en(q, e)
        p = q[::-1] if al_final else q
    return np.ascontiguousarray(p)


# ──────────────────────────────────────────────────────────────────────────── #
# Rendering helpers                                                              #
# ──────────────────────────────────────────────────────────────────────────── #

def build_polyline(pts: np.ndarray, radii: np.ndarray) -> vtk.vtkPolyData:
    """A polyline vtkPolyData carrying a per-point 'Radius' scalar."""
    vtk_pts = vtk.vtkPoints()
    vtk_pts.SetData(numpy_to_vtk(pts.astype(np.float64), deep=True))

    lines = vtk.vtkCellArray()
    lines.InsertNextCell(len(pts))
    for i in range(len(pts)):
        lines.InsertCellPoint(i)

    pd = vtk.vtkPolyData()
    pd.SetPoints(vtk_pts)
    pd.SetLines(lines)

    r_arr = numpy_to_vtk(radii.astype(np.float32), deep=True)
    r_arr.SetName("Radius")
    pd.GetPointData().AddArray(r_arr)
    pd.GetPointData().SetActiveScalars("Radius")
    return pd


def build_tube(pts: np.ndarray, radii: np.ndarray) -> vtk.vtkPolyData:
    """A tube surface of varying radius (≈ vessel caliber) for the 3D viewer."""
    line_pd = build_polyline(pts, radii)

    rmin = float(radii.min()) if len(radii) else 0.5
    rmax = float(radii.max()) if len(radii) else 0.5

    tube = vtk.vtkTubeFilter()
    tube.SetInputData(line_pd)
    tube.SetNumberOfSides(14)
    tube.CappingOn()
    if rmax - rmin > 1e-3 and rmin > 1e-3:
        # Radius varies along the vessel → follow the caliber.
        tube.SetVaryRadiusToVaryRadiusByScalar()
        tube.SetRadius(rmin)
        tube.SetRadiusFactor(rmax / rmin)
    else:
        # Uniform caliber → constant-radius tube (avoids "scalar range is zero").
        tube.SetVaryRadiusToVaryRadiusOff()
        tube.SetRadius(max(rmin, 0.25))
    tube.Update()
    return tube.GetOutput()


def voxel_linea(data) -> float | None:
    """La rejilla guardada en `centerline_points.npz`; las líneas de antes de
    P15 no la llevan y dan None."""
    if "voxel_mm" in data.files:
        v = float(data["voxel_mm"])
        return v if v > 0 else None
    return None


def extract_centerline(
    poly_data: vtk.vtkPolyData,
    source_mm: tuple[float, float, float],
    target_mm: tuple[float, float, float] | None,
    voxel_size_mm: float = 0.8,
    progress_cb: Callable[[float], None] | None = None,
    target_region: vtk.vtkPolyData | None = None,
) -> CenterlineResult:
    """Convenience wrapper around :class:`CenterlineExtractor`."""
    return CenterlineExtractor(
        voxel_size_mm=voxel_size_mm,
        progress_cb=progress_cb,
    ).extract(poly_data, source_mm, target_mm, target_region=target_region)
