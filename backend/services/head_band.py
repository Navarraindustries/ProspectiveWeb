"""La banda de la cabeza: segmentar solo lo que hay bajo el techo del cráneo.

Medido sobre los 172 estudios de Zenodo (2026-10-20, registros y volúmenes
reducidos de la pasada completa): 145 son angio-TC de cabeza y cuello de 350 mm
de alto, 157 de 172 superan el tope de 90 millones de vóxeles y se segmentan
reducidos por 2 a 6, y 16 lesiones no llegan a la malla. Las 122 lesiones
anotadas están a 54–120 mm por debajo del techo del cráneo; nada de lo que se
busca está en el cuello. Con una banda de 150 mm bajo ese techo se segmenta el
48 % de los vóxeles, 97 estudios pasan de factor 5–6 a factor 2 y 54 a
resolución nativa; 13 de las 16 lesiones fuera de la malla están en estudios
que ganan resolución.

El techo se busca en el VOLUMEN (antes de que exista ninguna malla): el primer
corte desde arriba con ≥ 2 cm² de hueso (> 200 HU). Hueso y no piel porque un
reposacabezas o una espuma pasan de −300 HU y la piel no distingue; medido,
hueso y piel coinciden (mediana 0 mm, máximo 14). Solo en TC: en 3DRA los
valores no son HU y el volumen ya es solo cabeza. Si el volumen no llega a la
banda, no se recorta nada. Se asume, como en `services.head_crop`, que +z es
craneal (DICOM LPS con dirección identidad).
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np

#: Altura de la banda bajo el techo del cráneo. La lesión más honda de Zenodo
#: está a 120 mm; 150 deja 30 mm de margen y, a 0,3 mm de corte, 500 cortes:
#: por debajo de los 512 del plano, así que el factor de reducción lo decide
#: el plano (512 / 256 = 2) y no el alto.
HEAD_BAND_MM = 150.0
#: Lo que cuenta como hueso para encontrar el techo del cráneo.
BONE_HU = 200.0
#: Área mínima de hueso en un corte para considerarlo el techo (vértex).
MIN_BONE_CM2 = 2.0


@dataclass
class HeadBand:
    applied: bool
    slices_total: int
    slices_kept: int
    z0: int = 0            # primer corte que se queda (índice en el volumen entero)
    top_mm: float = 0.0    # techo del cráneo (marco índice × espaciado)
    cut_mm: float = 0.0    # lo que se quita por abajo, en mm
    voxels_total: int = 0
    voxels_kept: int = 0

    def as_dict(self) -> dict:
        d = asdict(self)
        d["top_mm"] = round(d["top_mm"], 1)
        d["cut_mm"] = round(d["cut_mm"], 1)
        return d


def _none(volume: np.ndarray) -> HeadBand:
    n = int(np.prod(volume.shape))
    return HeadBand(applied=False, slices_total=int(volume.shape[0]),
                    slices_kept=int(volume.shape[0]), voxels_total=n, voxels_kept=n)


def skull_top_index(volume: np.ndarray, spacing: Sequence[float],
                    bone_hu: float = BONE_HU, min_cm2: float = MIN_BONE_CM2) -> int | None:
    """Índice del primer corte, desde arriba, con al menos *min_cm2* de hueso."""
    need = math.ceil(min_cm2 * 100.0 / (float(spacing[1]) * float(spacing[2])))
    for i in range(volume.shape[0] - 1, -1, -1):
        if np.count_nonzero(volume[i] > bone_hu) >= need:
            return i
    return None


def head_band(volume: np.ndarray, spacing: Sequence[float], modality: str | None,
              band_mm: float = HEAD_BAND_MM) -> HeadBand:
    """Qué cortes del volumen (z, y, x) se segmentan. Solo recorta en TC."""
    if not (modality or "").upper().startswith("CT"):
        return _none(volume)
    nz = int(volume.shape[0])
    dz = float(spacing[0])
    if nz * dz <= band_mm:
        return _none(volume)
    top = skull_top_index(volume, spacing)
    if top is None:
        return _none(volume)
    top_mm = (top + 0.5) * dz
    z0 = math.floor((top_mm - band_mm) / dz)
    if z0 <= 0:
        return _none(volume)
    kept = nz - z0
    per_slice = int(volume.shape[1]) * int(volume.shape[2])
    return HeadBand(applied=True, slices_total=nz, slices_kept=kept, z0=z0,
                    top_mm=top_mm, cut_mm=z0 * dz,
                    voxels_total=nz * per_slice, voxels_kept=kept * per_slice)
