"""Recorte a la región intracraneal antes de detectar: lo alto de la malla.

Por qué
-------
En una angio-TC de cabeza y cuello la malla lleva el árbol del cuello entero,
y a veces el cayado: 345 mm de alto de mediana en Zenodo (cabeza sola, 141).
Los aneurismas intracraneales no están ahí. Medido sobre las 122 lesiones
anotadas de los 172 estudios (`docs/Informe-Zenodo-Completa-2026-10-18.md`,
§4.4): todas quedan entre 9 y 121 mm por debajo del techo de la malla (la más
honda, una carótida petrosa). Los candidatos que el detector daba en los 90
controles estaban, en cambio, a 284 mm del techo de mediana: 424 de 450 por
debajo de 130 mm. Es la bifurcación carotídea, el cayado y los bulbos del
cuello compitiendo por cinco puestos con un saco de 5 mm.

Qué hace
--------
Antes de detectar, se queda con lo que está a menos de `HEAD_DEPTH_MM` del
techo de la malla, medido a lo largo del eje superior-inferior. El techo se
toma como el percentil `TOP_PERCENTILE` de la coordenada, no el máximo: una
mota de ruido por encima de la cabeza subiría el techo y con él el corte, y
dejaría fuera una lesión honda. Errar el techo por abajo es seguro (el corte
baja); por arriba no.

Cuando la malla no llega a esa altura (3DRA, cabeza sola) no se toca nada y
se devuelve el MISMO objeto: la detección es exactamente la de antes.

Qué asume
---------
Que el eje z de la malla es el superior-inferior y crece hacia la cabeza:
es el eje de corte de una serie axial cargada con su `direction` (en los
172 estudios de Zenodo, identidad en todos). Una adquisición coronal o
sagital no se recorta bien; no se ha visto ninguna angio-TC así.

Simulado desde las listas largas de la pasada del 18-10 (quitar los
candidatos a más de 140 mm del techo, sin volver a detectar): lesiones entre
los 5 de 31 a 39, en primer puesto de 4 a 13, ninguna perdida; 47 de los 90
controles se quedan con menos de 5 candidatos. Recortar ANTES de detectar es
lo que se mide en la pasada `zenodo_eval_full_p3_crop`.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass

import numpy as np
import vtk
from vtkmodules.util.numpy_support import vtk_to_numpy

from services.mesh_crop import clip_plane

logger = logging.getLogger(__name__)

#: Hasta dónde se busca por debajo del techo de la malla. La lesión más honda
#: de Zenodo está a 121 mm; el margen son 19 mm (una vértebra). A 130 la
#: simulación daba un puesto más y un 1.º más, con 9 mm de margen: no.
HEAD_DEPTH_MM: float = 140.0

#: El techo es este percentil de la coordenada superior-inferior de los
#: vértices, no el máximo: en una malla de 1,5 M de vértices el 0,5 % son
#: 7 500, una mota de ruido no llega.
TOP_PERCENTILE: float = 99.5

#: Eje superior-inferior de la malla (z, el de corte de una serie axial).
SUPERIOR_AXIS: int = 2


@dataclass(frozen=True)
class HeadCrop:
    """Lo que se hizo, para el registro y el diagnóstico."""

    applied: bool
    top_mm: float
    cut_mm: float
    extent_mm: float
    n_before: int
    n_after: int

    def as_dict(self) -> dict:
        return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in asdict(self).items()}


def head_window(poly: vtk.vtkPolyData, depth_mm: float = HEAD_DEPTH_MM,
                axis: int = SUPERIOR_AXIS) -> tuple[float, float, float]:
    """(techo, corte, alto) de la malla a lo largo del eje superior-inferior."""
    pts = vtk_to_numpy(poly.GetPoints().GetData())
    coord = np.asarray(pts[:, axis], dtype=float)
    top = float(np.percentile(coord, TOP_PERCENTILE))
    extent = float(coord.max() - coord.min())
    return top, top - depth_mm, extent


def crop_to_head(poly: vtk.vtkPolyData, depth_mm: float = HEAD_DEPTH_MM,
                 axis: int = SUPERIOR_AXIS) -> tuple[vtk.vtkPolyData, HeadCrop]:
    """La malla con solo lo que queda a menos de `depth_mm` del techo.

    Si la malla no llega a esa altura se devuelve el mismo objeto, sin copiar.
    """
    n = poly.GetNumberOfPoints() if poly is not None else 0
    if n == 0:
        return poly, HeadCrop(False, 0.0, 0.0, 0.0, 0, 0)
    top, cut, extent = head_window(poly, depth_mm, axis)
    if extent <= depth_mm:
        return poly, HeadCrop(False, top, cut, extent, n, n)
    origin = [0.0, 0.0, 0.0]
    normal = [0.0, 0.0, 0.0]
    origin[axis] = cut
    normal[axis] = 1.0
    out = clip_plane(poly, tuple(origin), tuple(normal))
    info = HeadCrop(True, top, cut, extent, n, out.GetNumberOfPoints())
    logger.info("Recorte intracraneal: techo %.1f, corte %.1f (%.0f mm de alto): %d → %d vértices",
                top, cut, extent, n, info.n_after)
    return out, info
