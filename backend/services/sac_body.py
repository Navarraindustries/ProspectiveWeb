"""El cuerpo del saco, sin las partes finas que se le quedan pegadas.

El saco aislado es lo que queda por encima del cuello marcado. Si al cortar se
quedan pegados vasos finos o ruido de segmentación, la morfometría los cuenta
como aneurisma y el Ø máximo se mide hasta la punta de esos tentáculos. En la
sesión guardada de Hernández (25 sep) el cuerpo medía ~4,5 mm y el Ø máximo
salió 8,69; con el borde marcado de nuevo, 8,37 frente a 7,7 del cuerpo.

Aquí se quita lo más fino que una bola de `OPEN_RADIUS_MM` de radio (apertura
morfológica sobre el interior del saco en vóxeles) y se mide el cuerpo con la
MISMA definición que el Ø máximo: el lado mayor de la caja que lo envuelve.
No sustituye la cifra: dice cuándo está inflada, para que se revise el borde.
Una bleb de verdad (≥ 1 mm) sobrevive a la apertura; una rama de 0,5 mm no.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi

#: Radio de la bola de la apertura: quita lo más fino de 1 mm de diámetro.
OPEN_RADIUS_MM = 0.5
#: Tamaño del vóxel con que se rasteriza el saco.
VOXEL_MM = 0.1
#: Se avisa si el Ø máximo supera al del cuerpo en esta proporción Y en al
#: menos `MIN_EXCESS_MM`: medido en las dos sesiones reales, 8,69 frente a ~4,5
#: (avisa) y 8,37 frente a 7,7 (no).
MAX_RATIO = 1.15
MIN_EXCESS_MM = 1.0


@dataclass
class SacBody:
    full_max_mm: float     # lado mayor de la caja del saco completo
    body_max_mm: float     # lo mismo, del cuerpo
    body_volume_mm3: float
    inflated: bool


def _bbox_longest(points: np.ndarray) -> float:
    return float(np.max(points.max(0) - points.min(0))) if len(points) else 0.0


def sac_body(poly) -> SacBody | None:
    """None si el saco no se puede rasterizar (vacío o sin interior)."""
    from services.branch_origins import _rasterise
    if poly is None or poly.GetNumberOfPoints() == 0:
        return None
    mask, origin = _rasterise(poly, VOXEL_MM)
    if not mask.any():
        return None
    k = max(1, int(round(OPEN_RADIUS_MM / VOXEL_MM)))
    zz, yy, xx = np.ogrid[-k:k + 1, -k:k + 1, -k:k + 1]
    ball = zz * zz + yy * yy + xx * xx <= k * k
    opened = ndi.binary_opening(mask, structure=ball)
    lab, n = ndi.label(opened)
    if n == 0:
        return None
    sizes = ndi.sum(opened, lab, range(1, n + 1))
    body = lab == (int(np.argmax(sizes)) + 1)
    full_pts = origin + np.argwhere(mask) * VOXEL_MM
    body_pts = origin + np.argwhere(body) * VOXEL_MM
    full, core = _bbox_longest(full_pts), _bbox_longest(body_pts)
    return SacBody(
        full_max_mm=round(full, 2), body_max_mm=round(core, 2),
        body_volume_mm3=round(float(body.sum()) * VOXEL_MM ** 3, 1),
        inflated=core > 0 and full >= core * MAX_RATIO and full - core >= MIN_EXCESS_MM,
    )
