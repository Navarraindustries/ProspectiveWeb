"""Resolución nativa en la banda del árbol: lo que la reducción se come, baldosa a baldosa.

Medido en Zenodo (172 angio-TC, informe 2026-10-12): 157 estudios superan el
tope de 90 M de vóxeles y se segmentan reducidos por 2 a 6 en cada eje (vóxel
mediano 2,26 mm). Una lesión de 3 mm queda en uno o dos vóxeles: de 122
lesiones, 44 no tienen región en la malla y la superficie anotada se recupera
en menos del 20 % en 26. El oráculo que segmenta una caja de ±30 mm alrededor
de la lesión a resolución nativa pasa de 3 a 29 lesiones entre los 5
candidatos (de 82).

Aquí la caja no la da la anotación: la da el propio árbol. Dos pasadas:

1. gruesa   la máscara tubular de siempre sobre el volumen reducido
            (`build_vascular_mask`), que localiza el árbol con poco coste;
2. nativa   una banda de BAND_MM alrededor de esa máscara, vista a resolución
            nativa y recorrida por baldosas de TILE_VOX con un halo de
            HALO_VOX. En cada baldosa se vuelve a construir la máscara con la
            misma receta, pero SEMBRADA por el tubo grueso (`seed_mask`): el
            crecimiento por histéresis y la recuperación a 3 mm devuelven la
            pared fina y los sacos que la reducción se comió.

Por qué baldosas: el pico de memoria del método es ~40 B/vóxel (vesselness,
laminaridad, etiquetas y máscaras a la vez); el volumen entero a resolución
nativa pediría hasta 14 GB y una baldosa de 152³ con halo, 140 MB. El
resultado no depende del tamaño del volumen, solo de la banda.

Por qué el tubo grueso siembra: dentro de una baldosa no hay con qué elegir
semillas (el percentil 90 de una baldosa sin tronco sembraría ruido), y el
árbol ya está localizado. Los percentiles de crecimiento sí son locales a la
baldosa, como en el oráculo.
"""
from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from services.vascular_mask import MaskParams, build_vascular_mask

logger = logging.getLogger(__name__)

#: Anchura de la banda alrededor del tubo grueso, en mm. Un saco pegado al
#: vaso queda a ≤ reclaim_mm (3 mm) del tubo; a eso se suma el error de
#: posición del tubo grueso, de hasta un vóxel reducido (2,3 mm a factor 5).
BAND_MM = 5.0
#: Lado de la baldosa a resolución nativa, sin halo.
TILE_VOX = 128
#: Halo por cara: el alcance de Frangi en su escala mayor más la recuperación
#: a 3 mm (8 vóxeles de 0,4 mm), para que la costura entre baldosas no se note.
HALO_VOX = 12


@dataclass
class RefineResult:
    #: Máscara nativa (z, y, x), recortada a la caja de la banda.
    mask: np.ndarray
    #: Índice nativo (z0, y0, x0) del vóxel mask[0, 0, 0].
    offset: tuple[int, int, int]
    stats: dict


def band_from_coarse(coarse: np.ndarray, factor: int,
                     spacing_native: tuple[float, float, float],
                     band_mm: float = BAND_MM) -> np.ndarray:
    """La máscara gruesa dilatada `band_mm`, en vóxeles gruesos."""
    coarse_sp = min(float(s) * factor for s in spacing_native)
    it = max(1, math.ceil(band_mm / coarse_sp))
    return ndimage.binary_dilation(coarse, iterations=it)


def upsample_slice(coarse: np.ndarray, factor: int,
                   sl: tuple[slice, slice, slice]) -> np.ndarray:
    """La máscara gruesa vista en la rebanada nativa `sl` (vecino más cercano).

    No se construye la máscara nativa entera: para una angio-TC de 340 M de
    vóxeles serían 340 MB solo de banda, y cada baldosa solo necesita su trozo.
    """
    idx = [np.minimum(np.arange(s.start, s.stop) // factor, n - 1)
           for s, n in zip(sl, coarse.shape)]
    return coarse[np.ix_(*idx)]


def _tiles(lo: int, hi: int, tile: int) -> list[tuple[int, int]]:
    return [(a, min(hi, a + tile)) for a in range(lo, hi, tile)]


def refine_in_band(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    coarse_mask: np.ndarray,
    factor: int,
    params: MaskParams,
    *,
    band_mm: float = BAND_MM,
    tile_vox: int = TILE_VOX,
    halo_vox: int = HALO_VOX,
    inside: Callable[[tuple[slice, slice, slice]], np.ndarray] | None = None,
    on_progress: Callable[[str, float], None] | None = None,
) -> RefineResult:
    """Máscara a resolución nativa en la banda del árbol grueso.

    `volume` es el volumen nativo (z, y, x) y `coarse_mask` la máscara
    tubular del mismo volumen reducido por `factor` en cada eje (la forma
    `ceil(shape / factor)`, como hace `volume[::f, ::f, ::f]`). `params` es la
    misma receta (suelo, techo, recuperación) que hizo la máscara gruesa.
    `inside(caja)`, si se da, devuelve para una caja de cortes del volumen
    nativo la máscara de lo que está dentro de la cabeza (`services.head_mask`);
    cada baldosa restringe su M0 a ella, igual que hizo la pasada gruesa.
    """
    t0 = time.perf_counter()
    shape = tuple(int(v) for v in volume.shape)
    expected = tuple(math.ceil(s / factor) for s in shape)
    if tuple(coarse_mask.shape) != expected:
        raise ValueError(f"coarse_mask tiene forma {coarse_mask.shape}; para {shape} "
                         f"a factor {factor} se esperaba {expected}")
    band = band_from_coarse(coarse_mask, factor, spacing, band_mm)
    nz = np.nonzero(band)
    stats = {"factor": int(factor), "band_mm": float(band_mm), "tile_vox": int(tile_vox),
             "halo_vox": int(halo_vox), "tiles_total": 0, "tiles_active": 0, "tiles_empty": 0,
             "band_vox": 0, "mask_vox": 0, "seconds": 0.0}
    if len(nz[0]) == 0:
        return RefineResult(np.zeros((0, 0, 0), dtype=bool), (0, 0, 0), stats)
    lo = [int(n.min()) * factor for n in nz]
    hi = [min(shape[i], (int(nz[i].max()) + 1) * factor) for i in range(3)]
    del nz
    out = np.zeros([h - l for l, h in zip(lo, hi)], dtype=bool)

    # Las baldosas con banda en su núcleo, decididas sobre la máscara gruesa.
    active = []
    for tz in _tiles(lo[0], hi[0], tile_vox):
        for ty in _tiles(lo[1], hi[1], tile_vox):
            for tx in _tiles(lo[2], hi[2], tile_vox):
                stats["tiles_total"] += 1
                core = tuple(slice(a, b) for a, b in (tz, ty, tx))
                if upsample_slice(band, factor, core).any():
                    active.append((tz, ty, tx))
    stats["tiles_active"] = len(active)
    n_active = max(1, len(active))

    for i, (tz, ty, tx) in enumerate(active, start=1):
        if on_progress:
            on_progress(f"banda {i - 1}/{len(active)}", 100.0 * (i - 1) / n_active)
        halo = tuple(slice(max(0, a - halo_vox), min(shape[k], b + halo_vox))
                     for k, (a, b) in enumerate((tz, ty, tx)))
        vol_t = np.ascontiguousarray(volume[halo], dtype=np.float32)
        seed_t = upsample_slice(coarse_mask, factor, halo)
        band_t = upsample_slice(band, factor, halo)
        stats["band_vox"] += int(np.count_nonzero(
            band_t[tuple(slice(a - h.start, b - h.start) for (a, b), h in zip((tz, ty, tx), halo))]))
        within_t = inside(halo) if inside is not None else None
        mr = build_vascular_mask(vol_t, spacing, params, seed_mask=seed_t, within=within_t)
        del vol_t, seed_t, within_t
        if mr.stats.get("final_vox", 0) == 0:
            stats["tiles_empty"] += 1
            continue
        m = mr.mask & band_t
        rel = tuple(slice(a - h.start, b - h.start) for (a, b), h in zip((tz, ty, tx), halo))
        dst = tuple(slice(a - l, b - l) for (a, b), l in zip((tz, ty, tx), lo))
        out[dst] = m[rel]
        del m, band_t, mr
    stats["mask_vox"] = int(np.count_nonzero(out))
    stats["seconds"] = round(time.perf_counter() - t0, 1)
    if on_progress:
        on_progress(f"banda {len(active)}/{len(active)}", 100.0)
    logger.info("Banda nativa: %s", stats)
    return RefineResult(out, (lo[0], lo[1], lo[2]), stats)


def translate_poly(poly, offset_mm: tuple[float, float, float]):
    """La misma malla desplazada `offset_mm` (x, y, z): de la caja al volumen."""
    import vtk
    t = vtk.vtkTransform()
    t.Translate(*[float(v) for v in offset_mm])
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(poly)
    f.SetTransform(t)
    f.Update()
    return f.GetOutput()
