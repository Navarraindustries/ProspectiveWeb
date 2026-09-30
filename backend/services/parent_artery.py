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
        d = _cut_nearest_contour_diameter(vessel_poly, origin, axis, reach)
        if d > 0:
            diameters.append(d)

    if not diameters:
        return 0.0
    result = float(np.median(diameters))
    logger.info("parent_artery: Ø = %.2f mm (from %d samples)", result, len(diameters))
    return result


def _cut_nearest_contour_diameter(poly_data, origin, normal, reach_mm: float) -> float:
    plane = vtk.vtkPlane()
    plane.SetOrigin(float(origin[0]), float(origin[1]), float(origin[2]))
    plane.SetNormal(float(normal[0]), float(normal[1]), float(normal[2]))

    cutter = vtk.vtkCutter()
    cutter.SetCutFunction(plane)
    cutter.SetInputData(poly_data)
    cutter.Update()
    cut = cutter.GetOutput()
    if cut.GetNumberOfPoints() < 3:
        return 0.0

    conn = vtk.vtkConnectivityFilter()
    conn.SetInputData(cut)
    conn.SetExtractionModeToClosestPointRegion()
    conn.SetClosestPoint(float(origin[0]), float(origin[1]), float(origin[2]))
    conn.Update()
    nearest = vtk.vtkGeometryFilter()
    nearest.SetInputConnection(conn.GetOutputPort())
    nearest.Update()
    region = nearest.GetOutput()
    if region.GetNumberOfPoints() < 3:
        return 0.0
    pts = vtk_to_numpy(region.GetPoints().GetData()).astype(float)
    if float(np.min(np.linalg.norm(pts - np.asarray(origin, float), axis=1))) > reach_mm:
        return 0.0

    stripper = vtk.vtkStripper()
    stripper.SetInputData(region)
    stripper.JoinContiguousSegmentsOn()
    stripper.Update()
    stripped = stripper.GetOutput()
    if stripped.GetNumberOfPoints() < 3:
        return 0.0

    all_pts = vtk_to_numpy(stripped.GetPoints().GetData())
    lines = stripped.GetLines()
    if lines is None or lines.GetNumberOfCells() == 0:
        return 0.0
    best: list[int] = []
    lines.InitTraversal()
    id_list = vtk.vtkIdList()
    while lines.GetNextCell(id_list):
        m = id_list.GetNumberOfIds()
        if m > len(best):
            best = [id_list.GetId(i) for i in range(m)]
    if len(best) < 3:
        return 0.0

    area = _shoelace(all_pts[best], np.asarray(origin, float), np.asarray(normal, float))
    if area <= 0:
        return 0.0
    return 2.0 * math.sqrt(area / math.pi)


def _shoelace(pts: np.ndarray, origin: np.ndarray, normal: np.ndarray) -> float:
    n = normal / (np.linalg.norm(normal) + 1e-12)
    helper = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.8 else np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper); u /= np.linalg.norm(u)
    v = np.cross(n, u)
    rel = pts.astype(float) - origin.astype(float)
    x = rel @ u
    y = rel @ v
    cx, cy = x.mean(), y.mean()
    order = np.argsort(np.arctan2(y - cy, x - cx))
    x, y = x[order], y[order]
    return float(0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
