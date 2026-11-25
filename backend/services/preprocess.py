"""DICOM volume preprocessing — port of the desktop
prospective/dicom/preprocessor.py.

Optional pipeline applied to a session's cached HU volume:
  1. HU clipping   — clamp extreme outliers to [-1000, 3000]
  2. Isotropic resampling — resample to cubic voxels (target mm)
  3. Gaussian smoothing   — mild noise reduction

Plus a standalone bone-subtraction utility for cleaner CTA volume rendering.
Works on the (Z, Y, X) HU arrays the MPR service caches.
"""
from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)

HU_MIN = -1000.0
HU_MAX = 3000.0

# Modalities whose voxels are true Hounsfield units. Only on those does clamping
# to [HU_MIN, HU_MAX] mean "drop physically impossible outliers" — a 3DRA/XA
# reconstruction carries arbitrary intensities that routinely run past 3000, so
# the same clamp there flattens the contrast column instead of cleaning it.
HU_MODALITIES = {"CT", "CTA", "CTPA"}


def ops_params(clip_hu: bool, resample_isotropic: bool, target_spacing_mm: float,
               smooth: bool, smooth_sigma: float, *, n4: bool = False) -> dict:
    """Las operaciones aplicadas como datos (números crudos), para guardar y
    exportar. El texto de pantalla y el de máquina salen de aquí."""
    return {
        "n4": bool(n4),
        "hu_clip": bool(clip_hu),
        "target_spacing_mm": float(target_spacing_mm) if resample_isotropic else None,
        "smooth_sigma": float(smooth_sigma) if smooth else None,
    }


def ops_text(params: dict, *, persona: bool) -> str:
    """«recorte HU; remuestreo isotrópico 0,5 mm; suavizado σ=1,5».

    `persona=True` escribe las cifras con coma (pantalla); `persona=False`, con
    punto (la procedencia que se exporta con la verdad de terreno). Se separan
    con «; » para que la coma decimal no se lea como separador."""
    from services.numero import cifra_corta

    def num(v: float) -> str:
        return cifra_corta(v) if persona else cifra_corta(v).replace(",", ".")

    ops = []
    if params.get("n4"):
        ops.append("corrección N4")
    if params.get("hu_clip"):
        ops.append("recorte HU")
    if params.get("target_spacing_mm") is not None:
        ops.append(f"remuestreo isotrópico {num(params['target_spacing_mm'])} mm")
    if params.get("smooth_sigma") is not None:
        ops.append(f"suavizado σ={num(params['smooth_sigma'])}")
    return "; ".join(ops)


def is_hounsfield(modality: str | None) -> bool:
    return (modality or "").strip().upper() in HU_MODALITIES


def is_mr(modality: str | None) -> bool:
    """La corrección N4 es de resonancia: en TC y 3DRA no hay campo de antena."""
    return (modality or "").strip().upper() in {"MR", "MRA"}


#: El campo de sesgo es suave: se estima sobre el volumen reducido a unos 2 mm
#: de vóxel y se aplica, ya interpolado, a resolución nativa.
N4_SHRINK_MM = 2.0
#: Iteraciones por nivel (4 niveles): lo habitual de N4 en ITK/ANTs.
N4_ITERATIONS = (50, 50, 50, 50)


def n4_correct(volume: np.ndarray, spacing: tuple[float, float, float]) -> np.ndarray:
    """Quita el campo de sesgo de una angio-RM con N4 (Tustison 2010).

    El campo se estima dentro de la cabeza (umbral de Otsu) sobre el volumen
    reducido a ~`N4_SHRINK_MM` mm, y su logaritmo se evalúa a resolución nativa
    para dividir el volumen entero. Luego se reescala para que la mediana de la
    cabeza quede donde estaba: N4 corrige la forma del campo, no su nivel, y así
    los umbrales que ve el usuario siguen siendo comparables.

    volume: (Z, Y, X); spacing: (sz, sy, sx) en mm. Devuelve float32 (Z, Y, X).
    """
    import SimpleITK as sitk

    vol = np.ascontiguousarray(volume, dtype=np.float32)
    # N4 trabaja con el logaritmo: nada de ceros ni negativos dentro de la cabeza.
    desplazamiento = 1.0 - min(0.0, float(vol.min()))
    img = sitk.GetImageFromArray(vol + desplazamiento)
    sz, sy, sx = (float(s) for s in spacing)
    img.SetSpacing((sx, sy, sz))

    factores = [max(1, int(round(N4_SHRINK_MM / s))) for s in (sx, sy, sz)]
    factores = [min(f, max(1, n // 16)) for f, n in zip(factores, img.GetSize())]
    pequeno = sitk.Shrink(img, factores)
    cabeza = sitk.OtsuThreshold(pequeno, 0, 1, 200)

    n4 = sitk.N4BiasFieldCorrectionImageFilter()
    n4.SetMaximumNumberOfIterations(list(N4_ITERATIONS))
    n4.Execute(pequeno, cabeza)

    # La escala se fija sobre el volumen reducido: la mediana de la cabeza no
    # necesita la resolución nativa, y así no hace falta otra máscara del tamaño
    # del estudio (una TOF de 512 × 512 × 200 son 52 M vóxeles).
    p = sitk.GetArrayFromImage(pequeno).astype(np.float32)
    m = sitk.GetArrayFromImage(cabeza).astype(bool)
    corr_p = p / np.exp(sitk.GetArrayFromImage(n4.GetLogBiasFieldAsImage(pequeno)))
    escala = 1.0
    if m.any():
        antes, despues = float(np.median(p[m])) - desplazamiento, float(np.median(corr_p[m])) - desplazamiento
        if antes > 0 and despues > 0:
            escala = antes / despues
    del p, m, corr_p, pequeno, cabeza

    # A resolución nativa, en el sitio: el volumen, el campo y nada más.
    out = sitk.GetArrayFromImage(n4.GetLogBiasFieldAsImage(img)).astype(np.float32)
    del img
    np.negative(out, out=out)
    np.exp(out, out=out)                      # 1 / campo
    out *= vol + desplazamiento
    out -= desplazamiento
    out *= escala
    logger.info("N4: reducción %s, escala %.3f para conservar la mediana de la cabeza", factores, escala)
    return out


def preprocess_volume(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    clip_hu: bool = True,
    resample_isotropic: bool = False,
    target_spacing_mm: float = 0.5,
    smooth: bool = False,
    smooth_sigma: float = 0.5,
    n4: bool = False,
) -> tuple[np.ndarray, tuple[float, float, float]]:
    """Return (new_volume, new_spacing) after the requested preprocessing.

    volume:  (Z, Y, X) HU array.  spacing: (sz, sy, sx) in mm.
    La corrección N4 (`n4`, solo angio-RM) va primero, a resolución nativa.
    """
    import SimpleITK as sitk

    vol = np.ascontiguousarray(volume, dtype=np.float32)
    if n4:
        vol = n4_correct(vol, spacing)
    sz, sy, sx = (float(s) for s in spacing)
    img = sitk.GetImageFromArray(vol)          # (Z,Y,X) → ITK (X,Y,Z)
    img.SetSpacing((sx, sy, sz))

    if clip_hu:
        img = sitk.Clamp(img, sitk.sitkFloat32, HU_MIN, HU_MAX)

    if resample_isotropic:
        img = _resample(img, float(target_spacing_mm))

    if smooth and smooth_sigma > 0:
        img = sitk.SmoothingRecursiveGaussian(img, float(smooth_sigma))

    out = sitk.GetArrayFromImage(img).astype(np.float32)   # (Z,Y,X)
    osx, osy, osz = img.GetSpacing()
    logger.info(
        "Preprocess: %s @ %s → %s @ (%.3f,%.3f,%.3f) (n4=%s clip=%s iso=%s smooth=%s)",
        volume.shape, spacing, out.shape, osz, osy, osx,
        n4, clip_hu, resample_isotropic, smooth,
    )
    return out, (float(osz), float(osy), float(osx))


#: Tope de vóxeles del volumen remuestreado: unos 1,2 GB en float32. Un TC
#: normal a 0,2 mm pedía unos 6 GB y agotaba la memoria del servidor.
MAX_VOXELES_REMUESTREO = 300_000_000


def voxeles_tras_remuestreo(shape, spacing, target_mm: float) -> int:
    """Vóxeles del volumen tras remuestrearlo a `target_mm` (shape y spacing en z, y, x)."""
    n = 1
    for tam, esp in zip(shape, spacing):
        n *= max(1, int(round(tam * float(esp) / float(target_mm))))
    return n


def espaciado_minimo(shape, spacing, maximo: int = MAX_VOXELES_REMUESTREO) -> float:
    """El vóxel más fino (mm, redondeado arriba a 0,05) que cabe en `maximo`."""
    import math
    extension = 1.0
    for tam, esp in zip(shape, spacing):
        extension *= tam * float(esp)
    return math.ceil((extension / maximo) ** (1 / 3) * 20) / 20


def _resample(image, target_mm: float):
    import SimpleITK as sitk

    original_spacing = image.GetSpacing()
    original_size = image.GetSize()
    new_spacing = (target_mm, target_mm, target_mm)
    new_size = [int(round(osz * ospc / target_mm)) for osz, ospc in zip(original_size, original_spacing)]

    resampler = sitk.ResampleImageFilter()
    resampler.SetOutputSpacing(new_spacing)
    resampler.SetSize(new_size)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetTransform(sitk.Transform())
    resampler.SetDefaultPixelValue(-1000.0)
    resampler.SetInterpolator(sitk.sitkLinear)
    return resampler.Execute(image)


def subtract_bone(volume: np.ndarray, bone_threshold_hu: float = 300.0) -> np.ndarray:
    """Return a copy of *volume* with bone voxels (> threshold HU) set to air (-1000)."""
    result = volume.copy()
    result[result > bone_threshold_hu] = -1000.0
    return result
