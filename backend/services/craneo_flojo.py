"""¿Tiene el paciente un cráneo flojo? Decide si se aplica la regla de la corteza.

La corteza (services.head_mask.SHELL_MM, MaskParams.shell_hu) quita como hueso
lo que supera 300 HU en los 12 mm exteriores de la cabeza. Hace falta en los
pacientes cuyo cráneo no llega a los 700 HU de la máscara de hueso (Zenodo 084:
máximo 650; 123: tabla interna a 530–620), porque la bóveda entera entraba en
el modelo 3D. Aplicada a los 172 estudios limpiaba el modelo pero movía la
detección (71 → 61 entre 5; sin quitarle superficie a ninguna lesión, dentro
de lo que oscila la cifra con cualquier cambio de malla: Informe §4.22), así
que se revirtió (01-11). Desde el 08-11 solo se aplica donde hace falta.

El indicador: en la bóveda (los BOVEDA_MM superiores de la cabeza), la
fracción de vóxeles > TEJIDO_HU en el anillo de 1,5–3 mm alrededor del hueso
denso (> HUESO_HU). Con cráneo normal ese anillo cae sobre cuero cabelludo, LCR
o cerebro (< 100 HU); con cráneo flojo cae sobre las tablas y el diploe que no
llegan a 700. Medido el 08-11 sobre los 172 volúmenes de Zenodo a la resolución
de la máscara gruesa: mediana 0,056; ≥ 0,2 en 11 (123, 180, 127, 084, 188, 072,
112, 090, 174, 130, 119); los cuatro primeros, los que tenían la bóveda dentro
del modelo. El umbral de 0,2 es el de octubre, no se ajustó a la detección.
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from scipy import ndimage

#: Los mm superiores de la cabeza donde se mide (la bóveda, por encima de la
#: base del cráneo, donde las arterias no tocan el hueso).
BOVEDA_MM = 60.0
#: Hueso denso: el mismo umbral que la máscara de hueso (routers.segment.CT_BONE_HU).
HUESO_HU = 700.0
#: Lo que cuenta como tejido duro en el anillo (el suelo de la segmentación de TC).
TEJIDO_HU = 150.0
#: El anillo alrededor del hueso denso, en mm.
ANILLO_MM = (1.5, 3.0)
#: A partir de aquí el cráneo es flojo y se aplica la corteza.
UMBRAL = 0.2
#: Con menos vóxeles de hueso denso que esto no hay bóveda que medir.
MIN_HUESO_VOX = 100


def indicador(volume: np.ndarray, spacing: Sequence[float], cabeza: np.ndarray) -> float | None:
    """Fracción de tejido duro junto al hueso denso de la bóveda (0–1).

    `volume` (z, y, x) en HU con `spacing` en mm; `cabeza`, la envolvente con
    su misma forma. El eje z crece hacia arriba (la banda de la cabeza va del
    cuello al vértice). None si no hay bóveda o hueso denso que medir.
    """
    if volume.shape != cabeza.shape:
        raise ValueError(f"`cabeza` tiene forma {cabeza.shape} y el volumen {volume.shape}")
    zs = np.flatnonzero(cabeza.any(axis=(1, 2)))
    if zs.size == 0:
        return None
    sp = tuple(float(s) for s in spacing)
    z_top = int(zs.max())
    z_bov = max(int(z_top - BOVEDA_MM / sp[0]), 0)
    v = volume[z_bov: z_top + 1]
    c = cabeza[z_bov: z_top + 1]
    denso = (v > HUESO_HU) & c
    if np.count_nonzero(denso) < MIN_HUESO_VOX:
        return None
    dist = ndimage.distance_transform_edt(~denso, sampling=sp)
    anillo = (dist >= ANILLO_MM[0]) & (dist <= ANILLO_MM[1]) & c
    n = int(np.count_nonzero(anillo))
    if n == 0:
        return None
    return float(np.count_nonzero(anillo & (v > TEJIDO_HU))) / n


def es_flojo(valor: float | None) -> bool:
    return valor is not None and valor >= UMBRAL
