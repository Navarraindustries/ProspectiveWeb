"""Suelo de HU: un candidato que está en aire o en grasa no es un aneurisma.

Medido en Zenodo (informe 18-10, §4.5) sobre los 860 candidatos de la pasada
con recorte: ningún acierto (51 candidatos a menos de 10 mm de una lesión
anotada) tiene HU medio por debajo de −74 ni HU máximo por debajo de 251 en
una bola de 2 mm; 50 candidatos falsos están por debajo de −100 HU medio
(aire de los senos, grasa orbitaria) y 15 más por debajo de 200 HU máximo
(partes blandas sin contraste). Quitarlos de la lista no pierde ningún
acierto, sube 1 lesión a los 5 y 2 al primer puesto; NO deja a los controles
sin candidatos (el consenso rellena los huecos con el resto de la cabeza).

El suelo vale para TC: en 3DRA los valores del volumen no son HU y no se
aplica (`modality` lo decide quien llama). La bola se mide en el volumen con
el que se segmentó, en el marco de la malla (índice × espaciado, como hace la
morfometría), y un candidato que cae fuera del volumen pasa sin mirarse.
"""
from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np

logger = logging.getLogger(__name__)

#: HU medio de la bola por debajo del cual el candidato está en aire o grasa.
#: El acierto más bajo medido está a −74 (una gigante trombosada).
HU_FLOOR_MEAN = -100.0
#: HU máximo de la bola por debajo del cual no hay ni vaso con contraste ni
#: hueso: partes blandas. El acierto más bajo medido está a 251.
HU_FLOOR_MAX = 200.0
#: Radio de la bola en mm (o 1,5 espaciados si el volumen es más grueso).
HU_BALL_MM = 2.0

Point = tuple[float, float, float]


def hu_stats(volume: np.ndarray, spacing: Sequence[float], point: Point,
             radius_mm: float) -> tuple[float, float] | None:
    """(media, máximo) de HU en la bola alrededor de un punto de malla (x, y, z).

    El volumen es (z, y, x) y el punto está en el marco de la malla: índice ×
    espaciado. None si la bola cae fuera del volumen.
    """
    sz, sy, sx = (float(v) for v in spacing)
    x, y, z = point
    ci = (z / sz, y / sy, x / sx)
    rad = (radius_mm / sz, radius_mm / sy, radius_mm / sx)
    lo = [math.floor(c - r) for c, r in zip(ci, rad)]
    hi = [math.ceil(c + r) + 1 for c, r in zip(ci, rad)]
    if any(h <= 0 for h in hi) or any(l >= n for l, n in zip(lo, volume.shape)):
        return None
    lo = [max(0, v) for v in lo]
    hi = [min(n, v) for v, n in zip(hi, volume.shape)]
    sub = volume[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    if sub.size == 0:
        return None
    zz, yy, xx = np.mgrid[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    d2 = ((zz - ci[0]) * sz) ** 2 + ((yy - ci[1]) * sy) ** 2 + ((xx - ci[2]) * sx) ** 2
    inside = d2 <= radius_mm ** 2 + 1e-9
    if not inside.any():
        return None
    vals = sub[inside]
    return float(vals.mean()), float(vals.max())


def in_air(hu_mean: float | None, hu_max: float | None) -> bool:
    """Verdadero si la bola está en aire/grasa o en partes blandas sin contraste."""
    if hu_mean is None or hu_max is None:
        return False
    return hu_mean < HU_FLOOR_MEAN or hu_max < HU_FLOOR_MAX


@dataclass
class HuFloor:
    """Qué hizo el suelo: para el registro del banco y el diagnóstico."""
    applied: bool
    checked: int = 0
    dropped: int = 0
    #: HU (medio, máximo) de cada candidato quitado, en el orden en que iban.
    dropped_hu: list[tuple[float, float]] | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def drop_air(hits: list, volume: np.ndarray, spacing: Sequence[float]):
    """Los candidatos que no están en aire, en el mismo orden; y lo que se quitó.

    Cada `hit` tiene `.position` (x, y, z) de mundo. La bola es de `HU_BALL_MM`
    o 1,5 espaciados, lo mismo que mide el banco.
    """
    radius = max(HU_BALL_MM, 1.5 * max(float(v) for v in spacing))
    kept, dropped = [], []
    for h in hits:
        r = hu_stats(volume, spacing, tuple(float(v) for v in h.position), radius)
        if r is not None and in_air(*r):
            dropped.append((round(r[0], 1), round(r[1], 1)))
        else:
            kept.append(h)
    if dropped:
        logger.info("Suelo de HU: %d de %d candidatos en aire o sin contraste, fuera (%s)",
                    len(dropped), len(hits), dropped)
    return kept, HuFloor(applied=True, checked=len(hits), dropped=len(dropped),
                         dropped_hu=dropped or None)
