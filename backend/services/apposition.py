"""Aposición del stent a la pared: dónde toca y dónde queda separado.

El stent sobre la línea central es un tubo de diámetro NOMINAL constante. La
pared del vaso no: se estrecha, se ensancha y no es redonda. Hasta ahora eso
se resumía en una sola cifra (Ø stent / Ø vaso medio); aquí se mira punto a
punto, que es lo que enseñan Ankyras o Sim&Size como «aposición a la pared».

Para cada punto del stent, la distancia a la pared más cercana, con signo:

  +  el punto queda DENTRO de la luz, separado de la pared: a su diámetro
     nominal el dispositivo no llega a tocarla ahí (riesgo de mala aposición;
     no puede abrirse más que su nominal);
  −  el punto queda FUERA de la luz: el nominal es mayor que el vaso ahí, así
     que el dispositivo real quedaría comprimido contra la pared (hay contacto;
     es el sobredimensionado local que abre la trenza, ver endovascular.py).

Sobre el CUELLO no hay pared (es la boca del aneurisma): esos puntos se dejan
a 0 y no entran en las cifras. Es lo esperado, no mala aposición.

Qué NO es: no simula cómo se adapta la trenza (un dispositivo real se
estrecha y se alarga al comprimirse, y eso mueve sus extremos). Es la
geometría del tubo nominal contra la malla, con el ruido de la imagen como
suelo: una separación menor que un vóxel no se distingue.

El signo sale de contar cruces de rayos, no de las normales (ver followup.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import vtk
from vtkmodules.util.numpy_support import numpy_to_vtk

from services.followup import _closed_box, _inside_parity, _pts, _unsigned_distance

#: Nombre del campo, en mm (+ separado de la pared, − comprimido).
SCALAR = "aposicion_mm"
#: Tramo de cada extremo que se resume por separado: es donde el dispositivo
#: tiene que anclar.
END_MM = 3.0
#: Suelo de lo distinguible cuando no se conoce el vóxel.
DEFAULT_NOISE_MM = 0.3


@dataclass
class Apposition:
    noise_mm: float
    gap_area_pct: float          # % del stent (fuera del cuello) separado más que el ruido
    compressed_area_pct: float   # % comprimido más que el ruido
    max_gap_mm: float            # p99 de la separación
    proximal_gap_mm: float       # p90 en los primeros END_MM
    distal_gap_mm: float         # p90 en los últimos END_MM
    neck_excluded: bool
    notes: list[str] = field(default_factory=list)


def _arc_of(points: np.ndarray, centerline: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(longitud de arco del punto de la línea más cercano, distancia a él)."""
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(centerline, axis=0), axis=1))])
    s, dist = np.empty(len(points)), np.empty(len(points))
    for i in range(0, len(points), 2000):               # por trozos: N × M distancias
        chunk = points[i:i + 2000]
        d = np.linalg.norm(chunk[:, None, :] - centerline[None, :, :], axis=2)
        j = np.argmin(d, axis=1)
        s[i:i + 2000], dist[i:i + 2000] = arc[j], d[np.arange(len(chunk)), j]
    return s, dist


def annotate(
    stent: vtk.vtkPolyData, vessel: vtk.vtkPolyData, centerline_segment: np.ndarray,
    neck_center=None, neck_mm: float = 0.0, voxel_mm: float = 0.0,
) -> Apposition:
    """Añade el campo `aposicion_mm` a la malla del stent y devuelve el resumen."""
    P = _pts(stent)
    if len(P) == 0 or vessel is None or vessel.GetNumberOfPoints() == 0:
        raise ValueError("No hay stent o vaso que comparar.")
    noise = voxel_mm if voxel_mm > 0 else DEFAULT_NOISE_MM

    b = np.array(stent.GetBounds()).reshape(3, 2)
    center = b.mean(axis=1)
    half = float((b[:, 1] - b[:, 0]).max()) / 2 + 6.0
    closed = _closed_box(vessel, center, half)
    mag = _unsigned_distance(P, vessel)
    inside = _inside_parity(P, closed)
    gap = np.where(inside, mag, -mag)

    # Los centros de las tapas del tubo están en el eje, no en la superficie
    # del stent: a 2 mm de la pared «por dentro» sin ser nada. Fuera.
    s_all, d_axis = _arc_of(P, np.asarray(centerline_segment, float))
    en_el_eje = d_axis < 0.5 * float(np.median(d_axis))
    gap[en_el_eje] = 0.0

    en_cuello = np.zeros(len(P), dtype=bool)
    if neck_center is not None and neck_mm > 0:
        # La boca del aneurisma: una esfera del ancho del cuello sobre su centro.
        en_cuello = np.linalg.norm(P - np.asarray(neck_center, float), axis=1) <= neck_mm * 0.75
    gap[en_cuello] = 0.0

    arr = numpy_to_vtk(gap.astype(np.float32), deep=True)
    arr.SetName(SCALAR)
    stent.GetPointData().AddArray(arr)
    stent.GetPointData().SetActiveScalars(SCALAR)

    cuenta = ~en_cuello & ~en_el_eje
    val = gap[cuenta]
    notes: list[str] = []
    if len(val) == 0:
        return Apposition(noise_mm=round(noise, 2), gap_area_pct=0.0, compressed_area_pct=0.0,
                          max_gap_mm=0.0, proximal_gap_mm=0.0, distal_gap_mm=0.0,
                          neck_excluded=True, notes=["Todo el stent queda sobre el cuello."])

    s = s_all[cuenta]
    total = float(s.max()) if len(s) else 0.0

    def _p90(mask) -> float:
        v = val[mask]
        return round(float(max(np.percentile(v, 90), 0.0)), 2) if len(v) else 0.0

    prox, dist = _p90(s <= END_MM), _p90(s >= total - END_MM)
    pos = val[val > 0]
    if not en_cuello.any():
        notes.append("Sin cuello medido no se puede apartar la boca del aneurisma: "
                     "la separación ahí cuenta como si hubiera pared.")
    return Apposition(
        noise_mm=round(noise, 2),
        gap_area_pct=round(float(100.0 * np.mean(val > noise)), 1),
        compressed_area_pct=round(float(100.0 * np.mean(val < -noise)), 1),
        max_gap_mm=round(float(np.percentile(pos, 99)), 2) if len(pos) else 0.0,
        proximal_gap_mm=prox, distal_gap_mm=dist,
        neck_excluded=bool(en_cuello.any()), notes=notes,
    )
