"""Parent artery diameter estimation → Size Ratio (SR).

Ported from the desktop prospective/processing/parent_artery.py. Estimates the
parent-artery diameter at the aneurysm neck by cutting the *full vessel* mesh
with several planes just below the neck and taking the median equivalent-circle
diameter of the contour there. SR = max_aneurysm_diameter / parent_diameter
(Dhar 2008, ISUIA) — the most strongly validated morphometric rupture predictor.

Dos errores del port, arreglados (2026-09-29)
---------------------------------------------
1. **Marco equivocado.** La posición del cuello llegaba como fracción a lo largo
   del eje del SACO (0 = base del saco cuando el cuello se marca a mano) y se
   aplicaba a lo largo del ÁRBOL entero. Con 0, los cortes caían en el extremo
   más lejano del árbol, a centímetros del aneurisma. Ahora quien llama pasa el
   punto del cuello en coordenadas de mundo.
2. **Contorno de cualquier sitio.** De cada corte se quedaba el contorno con
   más puntos, estuviera donde estuviera: un plano infinito corta decenas de
   vasos en la malla tubular. Ahora se queda el más cercano al eje, y solo si
   está cerca.

Medido en IM_0055 (3DRA con lesión anotada): SR 13,2 → la arteria madre salía
de 0,7 mm.

Aneurismas laterales (2026-09-30)
---------------------------------
El método suponía que la arteria madre sigue el eje del aneurisma (aneurisma
de punta). En uno lateral —el saco sale del costado del tronco— los planos
perpendiculares a ese eje cortan la arteria A LO LARGO: el contorno sale 4–5
veces más largo que ancho y su «diámetro» es el de una loncha. En la sesión de
Hernandez (cuello marcado a mano, basilar) daba 9,67 mm y un SR de 0,87.

Ahora cada corte se juzga por su forma. Una sección transversal es casi
redonda; si el contorno es alargado (> 1,6), su eje largo ES la dirección del
vaso, y se vuelve a cortar perpendicular a ella por su centro. Solo cuentan
los contornos redondos, y sin al menos tres no se da cifra: un SR «no medido»
es mejor que uno equivocado. En la misma sesión: 3,87 mm.

Percentil 25, no mediana (2026-10-02)
-------------------------------------
Lo que estropea un corte casi siempre lo ENSANCHA: un plano algo oblicuo da
una elipse más larga que el vaso, y junto al cuello el contorno arrastra parte
del saco. La mediana se quedaba con esos cortes. Contrastado con el calibre
medido sobre una línea central del mismo vaso (cortes perpendiculares a ella,
services/fd_sizing.py), en tres sesiones reales:

    sesión           línea central   mediana   percentil 25
    Cerón (×2)       ≈ 4,25 mm       4,94/4,78   4,48/4,49
    Hernández        ≈ 4,15 mm       5,00        4,32

Con la mediana el SR salía un 15–20 % bajo. La anchura del eje menor de cada
contorno, que es inmune a la oblicuidad, acertaba en Cerón (4,1) pero daba
4,83 en Hernández, donde los cortes junto al cuello están mezclados con el
saco: no se usa. El percentil 25 tolera un corte de una rama pequeña entre
ocho; dos ya no.
"""
from __future__ import annotations

import logging
import math

import numpy as np
import vtk

try:
    from vtkmodules.util.numpy_support import vtk_to_numpy
except ImportError:  # pragma: no cover
    from vtk.util.numpy_support import vtk_to_numpy  # type: ignore[no-redef]

logger = logging.getLogger(__name__)

_N_SAMPLES = 8
_OFFSET_START = 1.0   # begin 1 × neck_radius below the neck
_OFFSET_END = 3.5     # end   3.5 × neck_radius below the neck


def neck_point_on_axis(sac_poly: vtk.vtkPolyData, centroid, principal_axis,
                       neck_plane_pos: float):
    """El punto del cuello en mundo: `neck_plane_pos` es fracción a lo largo del
    eje del SACO (`sac_poly`), de su extremo proximal (0) al distal (1)."""
    c = np.asarray(centroid, dtype=float)
    axis = np.asarray(principal_axis, dtype=float)
    n = float(np.linalg.norm(axis))
    if n < 1e-9 or sac_poly is None or sac_poly.GetNumberOfPoints() == 0:
        return None
    axis /= n
    proj = (vtk_to_numpy(sac_poly.GetPoints().GetData()).astype(float) - c) @ axis
    p_min, p_max = float(proj.min()), float(proj.max())
    return c + axis * (p_min + float(neck_plane_pos) * (p_max - p_min))


def estimate_parent_artery_diameter(
    vessel_poly: vtk.vtkPolyData,
    neck_point,
    principal_axis,
    neck_mm: float,
) -> float:
    """Estimate the parent-artery outer diameter (mm) just below the neck, or 0.0.

    `neck_point` is the neck in world coordinates; `principal_axis` points
    from the neck to the dome, so the parent artery lies towards −axis.
    """
    if vessel_poly is None or vessel_poly.GetNumberOfPoints() == 0 or neck_point is None:
        return 0.0
    p0 = np.asarray(neck_point, dtype=float)
    axis = np.asarray(principal_axis, dtype=float)
    n = float(np.linalg.norm(axis))
    if n < 1e-9:
        return 0.0
    axis /= n

    neck_r = max(float(neck_mm) / 2.0, 1.0)
    # Un contorno cuyo punto más cercano quede más lejos que esto no es la
    # arteria madre sino otro vaso que el plano cruza.
    reach = 2.0 * neck_r + 2.0
    diameters: list[float] = []
    for t in np.linspace(_OFFSET_START, _OFFSET_END, _N_SAMPLES):
        origin = p0 - axis * (t * neck_r)
        d = _cross_section_diameter(vessel_poly, origin, axis, reach)
        if d > 0:
            diameters.append(d)

    if len(diameters) < _MIN_ROUND_SECTIONS:
        logger.info("parent_artery: solo %d secciones transversales válidas; sin cifra", len(diameters))
        return 0.0
    result = float(np.percentile(diameters, _PERCENTILE))
    logger.info("parent_artery: Ø = %.2f mm (from %d samples)", result, len(diameters))
    return result


#: Una sección transversal de un vaso es casi redonda. Por encima de esto el
#: plano corta el vaso en oblicuo o a lo largo.
_MAX_ELONGATION = 1.6
#: Sin al menos tantas secciones redondas no se da cifra.
_MIN_ROUND_SECTIONS = 3
#: Ver el docstring del módulo: los cortes estropeados ensanchan, no estrechan.
_PERCENTILE = 25


def _cross_section_diameter(poly, origin, normal, reach_mm: float) -> float:
    """Diámetro de la sección TRANSVERSAL del vaso más cercano a `origin`.

    Corta con `normal`; si el contorno sale alargado, vuelve a cortar
    perpendicular a su eje largo (la dirección del vaso), por su centro.
    Devuelve 0 si no hay contorno cerca o si ni así sale redondo.
    """
    pts = _nearest_contour(poly, origin, normal)
    if pts is None or float(np.min(np.linalg.norm(pts - np.asarray(origin, float), axis=1))) > reach_mm:
        return 0.0
    diam, elong = _section_shape(pts, normal)
    if elong > _MAX_ELONGATION:
        centro = pts.mean(axis=0)
        _w, vecs = np.linalg.eigh(np.cov((pts - centro).T))
        eje_vaso = vecs[:, 2]
        pts = _nearest_contour(poly, centro, eje_vaso)
        if pts is None:
            return 0.0
        diam, elong = _section_shape(pts, eje_vaso)
    return diam if elong <= _MAX_ELONGATION else 0.0


def _nearest_contour(poly, origin, normal) -> "np.ndarray | None":
    """Puntos del contorno del corte más cercano a `origin`, o None."""
    plane = vtk.vtkPlane()
    plane.SetOrigin(*(float(v) for v in origin))
    plane.SetNormal(*(float(v) for v in normal))
    cutter = vtk.vtkCutter()
    cutter.SetCutFunction(plane)
    cutter.SetInputData(poly)
    cutter.Update()
    if cutter.GetOutput().GetNumberOfPoints() < 3:
        return None
    conn = vtk.vtkConnectivityFilter()
    conn.SetInputData(cutter.GetOutput())
    conn.SetExtractionModeToClosestPointRegion()
    conn.SetClosestPoint(*(float(v) for v in origin))
    conn.Update()
    geo = vtk.vtkGeometryFilter()
    geo.SetInputConnection(conn.GetOutputPort())
    geo.Update()
    if geo.GetOutput().GetNumberOfPoints() < 8:
        return None
    return vtk_to_numpy(geo.GetOutput().GetPoints().GetData()).astype(float)


def _section_shape(pts: np.ndarray, normal) -> tuple[float, float]:
    """(diámetro del círculo de igual área, alargamiento) del contorno en su plano."""
    n = np.asarray(normal, float)
    n = n / (np.linalg.norm(n) + 1e-12)
    helper = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.8 else np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper); u /= np.linalg.norm(u)
    v = np.cross(n, u)
    rel = pts - pts.mean(axis=0)
    x, y = rel @ u, rel @ v
    ev = np.sqrt(np.maximum(np.linalg.eigvalsh(np.cov(np.vstack([x, y]))), 1e-12))
    order = np.argsort(np.arctan2(y, x))
    x, y = x[order], y[order]
    area = float(0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
    return 2.0 * math.sqrt(area / math.pi), float(ev[1] / ev[0])
