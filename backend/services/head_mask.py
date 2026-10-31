"""La envolvente de la cabeza: lo que no está dentro de la cabeza no es vaso.

Visto el 26-10 al enseñar los casos y medido el 27-10 sobre las 172 mallas
guardadas de Zenodo (renders fuera de pantalla + máscara sobre los volúmenes):
el SOPORTE DE CABEZA del escáner (una cuna curva o dos placas laterales, de
2–5 mm de grosor, que superan los 150 HU del umbral) entra en la malla en la
mayoría de los estudios y en una cuarta parte es la pieza MAYOR (004, 005, 011,
015, 016, 017, 025, 039, 041…); en 016 y 017 además está conectado al propio
árbol. El detector quita las piezas de menos del 5 % de la mayor, así que con
el soporte como pieza mayor borra ramas reales, y la prueba de árbol («pieza
mayor ≤ 100 cm³ y ≤ 3 mm») falla por él. Ninguna medida de detección lo
arregla: es segmentación.

La regla es geométrica y no tiene pesos: la cabeza es todo lo que no es aire
(> −300 HU), la componente mayor de eso tras una apertura de 4 mm (que separa
el soporte, una lámina, de la cabeza, un bloque; medido en 016: las dos placas
de 71 y 43 cm³ desaparecen y la cabeza se queda en 2 532 cm³), y su ENVOLVENTE
CONVEXA corte a corte: convexa porque los senos paranasales, las celdas
mastoideas y las órbitas son aire abierto al exterior que el relleno de
agujeros no cierra, y dentro de ellos hay tabiques de hueso fino que la máscara
de hueso no quita (036: el 10 % de la pieza mayor). El soporte está fuera de
la piel y queda fuera de la envolvente; los vasos están bajo el cráneo y quedan
dentro (las 122 lesiones, al 100 %). La máscara vascular se RESTRINGE a la
envolvente (`build_vascular_mask(within=…)`: M0 ∧ dentro, también en cada
baldosa de la banda nativa) DESPUÉS de calcular sus percentiles de
tubularidad sobre todo M0; el volumen no se toca. Las dos formas que se
probaron antes vaciaban la máscara (004: semillas 52 → 4, máscara 146 → 3 cm³,
lesión fuera de la malla): poner aire (−1 024 HU) fuera en el volumen, y
restringir M0 antes de los percentiles. La causa es la misma: los umbrales de
semilla y crecimiento son percentiles de la tubularidad dentro de M0, y el
soporte (112 de los 146 cm³ de M0 en 004, tubularidad baja) los mantenía
bajos; sin él en la población suben y los vasos no los alcanzan. Con los
percentiles de siempre y la restricción después, 004 queda en 30,7 cm³ con 47
semillas, pieza mayor árbol de 17,6 cm³ y la lesión en la malla (4.º puesto,
antes fuera de la lista). Se calcula a ~3 mm de vóxel: a esa escala la cabeza es la misma y
cuesta décimas de segundo. Solo en TC.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np
from scipy import ndimage

#: Todo lo que no es aire. Espuma y reposacabezas pasan de −300: por eso hace
#: falta la apertura y la envolvente, no basta el umbral.
HEAD_HU = -300.0
#: Apertura que separa del bloque de la cabeza una lámina (soporte, cuna).
OPEN_MM = 4.0
#: Vóxel al que se calcula la envolvente.
COARSE_MM = 3.0
#: Por debajo de esto no es una cabeza (un fantoma, un recorte): no se aplica.
MIN_HEAD_CM3 = 400.0


@dataclass
class HeadMask:
    applied: bool
    stride: tuple[int, int, int] = (1, 1, 1)
    head_cm3: float = 0.0
    removed_cm3: float = 0.0      # vóxeles > HEAD_HU fuera de la envolvente
    mask: np.ndarray | None = None  # bool (z, y, x) a la resolución gruesa

    def as_dict(self) -> dict:
        d = asdict(self)
        d.pop("mask", None)
        d["stride"] = list(self.stride)
        d["head_cm3"] = round(self.head_cm3, 1)
        d["removed_cm3"] = round(self.removed_cm3, 1)
        return d

    def inside_box(self, box: tuple[slice, slice, slice], factor: int = 1) -> np.ndarray:
        """La envolvente dentro de una caja de cortes (z, y, x) de un volumen
        reducido por `factor` respecto al que la calculó (índice × factor /
        stride, vecino más cercano). Sin envolvente, todo dentro."""
        if self.mask is None:
            return np.ones(tuple(int(sl.stop - sl.start) for sl in box), dtype=bool)
        idx = []
        for sl, s, m in zip(box, self.stride, self.mask.shape):
            i = np.rint(np.arange(int(sl.start), int(sl.stop)) * factor / s).astype(int)
            idx.append(np.clip(i, 0, m - 1))
        return self.mask[np.ix_(*idx)]

    def inside(self, shape: Sequence[int], factor: int = 1) -> np.ndarray:
        """La envolvente con la forma de un volumen entero reducido por `factor`."""
        return self.inside_box(tuple(slice(0, int(n)) for n in shape), factor)


def _none() -> HeadMask:
    return HeadMask(applied=False)


def _convex_hull_slices(m: np.ndarray) -> np.ndarray:
    """Envolvente convexa de cada corte (z, y, x) con `scipy.spatial.Delaunay`."""
    from scipy.spatial import Delaunay, QhullError
    out = m.copy()
    yy, xx = np.mgrid[0:m.shape[1], 0:m.shape[2]]
    grid = np.c_[yy.ravel(), xx.ravel()]
    for k in range(m.shape[0]):
        sl = m[k]
        if sl.sum() < 4:
            continue
        edge = sl & ~ndimage.binary_erosion(sl)
        pts = np.argwhere(edge)
        try:
            out[k] = (Delaunay(pts).find_simplex(grid) >= 0).reshape(sl.shape)
        except (QhullError, ValueError):
            out[k] = ndimage.binary_fill_holes(sl)   # corte degenerado (una línea)
    return out


def head_mask(volume: np.ndarray, spacing: Sequence[float], modality: str | None,
              head_hu: float = HEAD_HU, open_mm: float = OPEN_MM,
              coarse_mm: float = COARSE_MM) -> HeadMask:
    """La envolvente de la cabeza de un volumen (z, y, x). Solo en TC."""
    if not (modality or "").upper().startswith("CT"):
        return _none()
    sp = tuple(float(v) for v in spacing)
    stride = tuple(max(1, int(round(coarse_mm / s))) for s in sp)
    coarse = volume[::stride[0], ::stride[1], ::stride[2]]
    vox_cm3 = float(np.prod([s * k for s, k in zip(sp, stride)])) / 1000.0
    tissue = coarse > head_hu
    r = [max(1, int(round(open_mm / (s * k)))) for s, k in zip(sp, stride)]
    opened = ndimage.binary_opening(tissue, structure=np.ones((2 * r[0] + 1, 2 * r[1] + 1, 2 * r[2] + 1), dtype=bool))
    lab, n = ndimage.label(opened)
    if n == 0:
        return _none()
    sizes = ndimage.sum(opened, lab, range(1, n + 1))
    head = lab == (int(np.argmax(sizes)) + 1)
    if float(head.sum()) * vox_cm3 < MIN_HEAD_CM3:
        return _none()
    hull = _convex_hull_slices(head)
    removed = int(np.count_nonzero(tissue & ~hull))
    return HeadMask(applied=True, stride=stride, head_cm3=float(hull.sum()) * vox_cm3,
                    removed_cm3=removed * vox_cm3, mask=hull)
