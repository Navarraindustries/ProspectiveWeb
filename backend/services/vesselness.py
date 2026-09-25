"""Tubularidad (y laminaridad) de Frangi, calculada por lonchas.

Por qué existe: el umbral no separa el hueso del contraste —comparten brillo—,
pero un vaso es un tubo y el peñasco es una lámina o un bloque. El Hessiano lo
distingue. SimpleITK trae el filtro (ObjectnessMeasureImageFilter), que espera
la imagen ya suavizada a cada escala y calcula el Hessiano por diferencias
centrales; no hay HessianRecursiveGaussianImageFilter en este build, por eso
se suaviza antes con SmoothingRecursiveGaussian.

Por qué por lonchas: sobre 384³ en float32 cada copia son 226 MB y el filtro
hace varias; en el servidor de 2 GB eso no cabe. Con lonchas de 64 cortes y 12
de solape (σ máx 2 mm ≈ 6 vóxeles a 0,32 mm, el triple de margen) la memoria
queda acotada y el resultado es el mismo que entero — hay un test que lo
comprueba.
"""
from __future__ import annotations

from typing import Callable

import numpy as np

SCALES_MM: tuple[float, ...] = (0.4, 0.7, 1.2, 2.0)
ALPHA, BETA = 0.5, 0.5


def auto_gamma(volume: np.ndarray) -> float:
    """γ de Frangi a partir del rango de intensidad: 0,1 × (p99,9 − p50).

    Medido en Case 3 (rango ≈ 5 100): γ ≈ 510 separa vasos de ruido; el 5,0 de
    ITK está pensado para imágenes normalizadas y aquí lo saturaba todo.
    """
    flat = volume.reshape(-1)
    if flat.size > 4_000_000:
        flat = flat[:: int(flat.size // 4_000_000) + 1]
    span = float(np.percentile(flat, 99.9) - np.percentile(flat, 50.0))
    return max(1.0, 0.1 * span)


def _objectness_slab(slab: np.ndarray, spacing_xyz: tuple[float, float, float],
                      dimension: int, scales_mm: tuple[float, ...], gamma: float) -> np.ndarray:
    import SimpleITK as sitk

    img = sitk.GetImageFromArray(np.ascontiguousarray(slab, dtype=np.float32))
    img.SetSpacing(spacing_xyz)
    best: np.ndarray | None = None
    for sigma in scales_mm:
        smooth = sitk.SmoothingRecursiveGaussian(img, float(sigma))
        f = sitk.ObjectnessMeasureImageFilter()
        f.SetObjectDimension(int(dimension))
        f.SetBrightObject(True)
        f.SetAlpha(ALPHA)
        f.SetBeta(BETA)
        f.SetGamma(float(gamma))
        f.SetScaleObjectnessMeasure(True)
        v = sitk.GetArrayFromImage(f.Execute(smooth)).astype(np.float32, copy=False)
        best = v if best is None else np.maximum(best, v, out=best)
        del smooth, v
    assert best is not None
    return best


def objectness_max(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    *,
    dimension: int,
    scales_mm: tuple[float, ...] = SCALES_MM,
    gamma: float | None = None,
    slab: int = 64,
    overlap: int = 12,
    on_progress: Callable[[int, int], None] | None = None,
) -> np.ndarray:
    """Máximo entre escalas de la medida de objeto `dimension`, por lonchas en z.

    `spacing` es (sz, sy, sx) como en el resto del backend; SimpleITK quiere
    (sx, sy, sz). Cada loncha se calcula con `overlap` cortes de margen a cada
    lado (recortados en los bordes del volumen) para que el suavizado
    recursivo, que mira más allá del corte actual, no deje una costura visible
    donde una loncha termina y la siguiente empieza.
    """
    if gamma is None:
        gamma = auto_gamma(volume)
    nz = int(volume.shape[0])
    out = np.zeros(volume.shape, dtype=np.float32)
    starts = list(range(0, nz, slab))
    n = len(starts)
    spacing_xyz = (float(spacing[2]), float(spacing[1]), float(spacing[0]))
    for i, z0 in enumerate(starts, start=1):
        z1 = min(nz, z0 + slab)
        a, b = max(0, z0 - overlap), min(nz, z1 + overlap)
        v = _objectness_slab(np.asarray(volume[a:b]), spacing_xyz, dimension, scales_mm, gamma)
        out[z0:z1] = v[z0 - a:z1 - a]
        del v
        if on_progress:
            on_progress(i, n)
    return out
