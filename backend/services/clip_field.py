"""Mapa de calor del clip: qué cubre, qué deja y qué presión estima.

ESTIMACIÓN GEOMÉTRICA. La fuerza de catálogo se reparte sobre el área de
contacto; no se modela pared, deformación ni deslizamiento. La simulación
mecánica vendrá después y sustituirá los escalares sin tocar el visor.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import vtk
from vtkmodules.util import numpy_support as ns

RING_RATIO = 1.5
RING_MIN_MM = 3.0
RING_MAX_MM = 12.0
DEPTH_TOL_MM = 0.6
GAP_TOL_MM = 0.3

COV_NONE, COV_COVERED, COV_RESIDUAL, COV_UNREACHED = 0, 1, 2, 3


@dataclass(frozen=True)
class BladeFrame:
    hinge: np.ndarray        # punto (3,) en coordenadas de mundo
    long_axis: np.ndarray    # unitario, de la bisagra a la punta
    open_axis: np.ndarray    # unitario, de una hoja a la otra
    depth_axis: np.ndarray   # unitario = long × open, orientado hacia el domo
    length_mm: float
    half_gap_mm: float
    half_height_mm: float
    close_half_mm: float


def points_of(mesh: vtk.vtkPolyData) -> np.ndarray:
    """Los vértices de una malla como matriz (N, 3) de float."""
    if mesh.GetPoints() is None or mesh.GetNumberOfPoints() == 0:
        return np.zeros((0, 3), dtype=float)
    return ns.vtk_to_numpy(mesh.GetPoints().GetData()).astype(float)


_points = points_of


def _unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    return v / (float(np.linalg.norm(v)) or 1.0)


def _cells_near(mesh: vtk.vtkPolyData, centre: np.ndarray, radius: float) -> vtk.vtkPolyData:
    """Las celdas cuya caja toca la esfera, en triángulos de lado acotado.

    vtkClipPolyData decide por vértices: una celda larga que cruza la esfera sin
    tener ningún vértice dentro desaparece entera, y el mapa se pinta por
    vértice, así que un anillo con cuatro vértices no mostraría nada. Se
    subdivide solo lo cercano (el árbol entero sería caro) hasta un lado de
    radio/12, y una malla ya densa de segmentación pasa sin cambios.
    """
    lo, hi = centre - radius, centre + radius
    bounds = [float(lo[0]), float(hi[0]), float(lo[1]), float(hi[1]), float(lo[2]), float(hi[2])]
    locator = vtk.vtkCellLocator(); locator.SetDataSet(mesh); locator.BuildLocator()
    ids = vtk.vtkIdList(); locator.FindCellsWithinBounds(bounds, ids)
    out = vtk.vtkPolyData()
    if ids.GetNumberOfIds() == 0:
        out.SetPoints(vtk.vtkPoints())
        return out
    pick = vtk.vtkExtractCells(); pick.SetInputData(mesh); pick.SetCellList(ids); pick.Update()
    surf = vtk.vtkGeometryFilter(); surf.SetInputData(pick.GetOutput()); surf.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(surf.GetOutput()); tri.PassLinesOff(); tri.PassVertsOff(); tri.Update()
    sub = vtk.vtkAdaptiveSubdivisionFilter(); sub.SetInputData(tri.GetOutput())
    sub.SetMaximumEdgeLength(max(0.2, radius / 12.0)); sub.Update()
    out.DeepCopy(sub.GetOutput())
    return out


def vessel_ring(vessel: vtk.vtkPolyData, neck_origin, neck_axis, neck_mm: float) -> vtk.vtkPolyData:
    """El vaso alrededor del cuello: dentro de 1,5 × cuello y del lado de la arteria.

    Acotado: un cuello ancho no debe tragarse medio árbol, y uno diminuto debe
    dejar algo de pared que pintar.
    """
    o = np.asarray(neck_origin, dtype=float)
    n = _unit(neck_axis)
    radius = float(min(RING_MAX_MM, max(RING_MIN_MM, RING_RATIO * float(neck_mm))))
    near = _cells_near(vessel, o, radius)
    sphere = vtk.vtkSphere(); sphere.SetCenter(*o); sphere.SetRadius(radius)
    inside = vtk.vtkClipPolyData(); inside.SetInputData(near); inside.SetClipFunction(sphere)
    inside.InsideOutOn(); inside.Update()
    # El plano de cuello separa saco y vaso: con la normal hacia el domo, lo que
    # queda «detrás» es la arteria.
    plane = vtk.vtkPlane(); plane.SetOrigin(*o); plane.SetNormal(*n)
    below = vtk.vtkClipPolyData(); below.SetInputData(inside.GetOutput()); below.SetClipFunction(plane)
    below.InsideOutOn(); below.Update()
    out = vtk.vtkPolyData(); out.DeepCopy(below.GetOutput())
    return out


def _hinge_along_corridor(mesh: vtk.vtkPolyData, P: np.ndarray, long_i: int, open_i: int,
                          jaw_dir: int, mid_open: float) -> float | None:
    """Coordenada (eje largo) donde el pasillo entre hojas choca con material.

    `jaw_geometry` busca la bisagra con vértices sobre el plano medio, pero el clip
    sintético y muchas piezas no tienen ninguno ahí (la barra de bisagra es un cubo
    de 8 esquinas): entonces devuelve el extremo de la malla y, en una pieza con
    cuerpo detrás, la bisagra se iría a la cola. Una recta por el pasillo, desde la
    punta hacia atrás, choca con la barra justo donde empiezan las hojas, sea cual
    sea la densidad de la malla. Se lanzan varias a distintas profundidades porque
    las hojas curvas suben el centro de la caja por encima de la barra.
    """
    depth_i = 3 - long_i - open_i
    lo, hi = float(P[:, long_i].min()), float(P[:, long_i].max())
    span = hi - lo
    dlo, dhi = float(P[:, depth_i].min()), float(P[:, depth_i].max())
    tip, back = (hi, lo) if jaw_dir > 0 else (lo, hi)
    # vtkOBBTree no ve las caras planas y finas de estas piezas; el localizador de
    # celdas sí.
    locator = vtk.vtkCellLocator(); locator.SetDataSet(mesh); locator.BuildLocator()
    best: float | None = None
    for depth in np.linspace(dlo, dhi, 9)[1:-1]:
        a = [0.0, 0.0, 0.0]; b = [0.0, 0.0, 0.0]
        a[long_i] = tip + jaw_dir * 0.01 * span; b[long_i] = back - jaw_dir * 0.01 * span
        a[open_i] = b[open_i] = mid_open
        a[depth_i] = b[depth_i] = float(depth)
        hits = vtk.vtkPoints(); ids = vtk.vtkIdList()
        if locator.IntersectWithLine(a, b, 1e-6, hits, ids) == 0 or hits.GetNumberOfPoints() == 0:
            continue
        # El primer choque viniendo desde la punta es la cara interior de la bisagra.
        xs = [hits.GetPoint(k)[long_i] for k in range(hits.GetNumberOfPoints())]
        first = max(xs) if jaw_dir > 0 else min(xs)
        if best is None or (first - best) * jaw_dir > 0:
            best = float(first)
    return best


def _frame_in_mesh_coords(mesh: vtk.vtkPolyData):
    """(bisagra, eje largo, eje de apertura) en las coordenadas de la propia malla.

    `jaw_geometry` trabaja con ÍNDICES de eje y una coordenada escalar de bisagra:
    solo sirve con la malla alineada con sus ejes y el pasillo en el plano medio,
    es decir, en el sistema local del clip.
    """
    from services.clip_animation import jaw_geometry

    g = jaw_geometry(mesh)                     # ValueError con < 20 puntos
    long_i, open_i, jaw_dir = int(g["long_axis"]), int(g["open_axis"]), int(g["jaw_direction"])
    P = points_of(mesh)
    lo, hi = P.min(axis=0), P.max(axis=0)
    centre = (lo + hi) / 2.0
    hinge_l = _hinge_along_corridor(mesh, P, long_i, open_i, jaw_dir, float(centre[open_i]))
    if hinge_l is None:
        hinge_l = float(g["hinge"])
    depth_i = 3 - long_i - open_i
    hinge = centre.copy()
    hinge[long_i] = hinge_l
    # La profundidad de la bisagra se lee en la propia bisagra, no en la caja: una
    # hoja curva desplaza el centro de la caja fuera de la barra.
    slab = P[np.abs(P[:, long_i] - hinge_l) <= max(0.5, 0.05 * float(hi[long_i] - lo[long_i]))]
    if len(slab):
        hinge[depth_i] = float((slab[:, depth_i].min() + slab[:, depth_i].max()) / 2.0)
    long_axis = np.zeros(3); long_axis[long_i] = float(jaw_dir)
    open_axis = np.zeros(3); open_axis[open_i] = 1.0
    return hinge, long_axis, open_axis


def blade_frame(clip_world: vtk.vtkPolyData, *, length_mm: float, blade_width_mm: float,
                blade_height_mm: float, neck_mm: float, neck_axis, pose: vtk.vtkTransform,
                jaw_mm: float = 1.2) -> BladeFrame:
    """El marco de las hojas, leído de la malla colocada.

    `jaw_geometry` ya sabe dónde empieza el pasillo entre hojas y hacia dónde
    apunta: sirve igual para el clip sintético (bisagra en el extremo) y para la
    pieza NAVARRO™ (bisagra a media pieza, cuerpo detrás).

    La pose es obligatoria: la malla se devuelve a su sistema local antes de
    leerla. En el mundo el clip está girado y desplazado (coordenadas de paciente
    como (62, 64, 63)) y el análisis por ejes de `jaw_geometry`, que busca el
    pasillo en la coordenada 0, daría un marco equivocado, incluso con la hoja
    apuntando al revés, sin avisar.
    """
    inverse = vtk.vtkTransform(); inverse.SetMatrix(pose.GetMatrix()); inverse.Inverse()
    # vtkTransformFilter: vtkTransformPolyDataFilter está obsoleto en VTK 9.7.
    local = vtk.vtkTransformFilter(); local.SetInputData(clip_world)
    local.SetTransform(inverse); local.Update()
    analytic = (np.array([-float(length_mm) / 2.0, 0.0, 0.0]),
                np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]))
    try:
        hinge_l, long_l, open_l = _frame_in_mesh_coords(local.GetOutput())
    except ValueError:
        # Una malla que no se puede analizar (muy pocos puntos) no debe tumbar el
        # mapa entero: la pose dice exactamente dónde está el clip y su modelo
        # local fija la bisagra en x = −L/2, las hojas en +X y la apertura en +Y.
        hinge_l, long_l, open_l = analytic
    else:
        # Todos los clips se modelan con las hojas a lo largo de X local y la
        # apertura en Y. `jaw_geometry` elige los ejes por extensión y pasillo, y en
        # los ANGLED cortos la rama doblada en Z gana a la hoja: devuelve la
        # apertura en X y el «a través de la mordaza» se mediría a lo largo de la
        # hoja. Si lo leído no cuadra con el diseño local, manda el diseño.
        if abs(float(long_l[0])) <= 0.9 or abs(float(open_l[1])) <= 0.9:
            hinge_l, long_l, open_l = analytic
    hinge = np.array(pose.TransformPoint(*map(float, hinge_l)))
    long_axis = np.array(pose.TransformVector(*map(float, long_l)))
    open_axis = np.array(pose.TransformVector(*map(float, open_l)))

    long_axis = _unit(long_axis)
    open_axis = _unit(open_axis)
    depth_axis = _unit(np.cross(long_axis, open_axis))
    # La profundidad se orienta hacia el domo: así «más allá de la punta» distingue
    # saco (d > 0) de arteria (d < 0).
    if float(np.dot(depth_axis, np.asarray(neck_axis, dtype=float))) < 0:
        depth_axis = -depth_axis
    half_gap = float(jaw_mm) / 2.0 + float(blade_width_mm)
    return BladeFrame(
        hinge=np.asarray(hinge, dtype=float), long_axis=long_axis, open_axis=open_axis,
        depth_axis=depth_axis, length_mm=float(length_mm), half_gap_mm=half_gap,
        half_height_mm=float(blade_height_mm) / 2.0,
        # Las hojas cerradas pinzan el cuello entero que alcanzan, no solo la
        # ranura: todo el ancho del cuello (medio cuello + holgura) se colapsa.
        close_half_mm=max(half_gap + GAP_TOL_MM, float(neck_mm) / 2.0 + GAP_TOL_MM),
    )


def classify(points: np.ndarray, frame: BladeFrame) -> np.ndarray:
    """Categoría por vértice para UN clip (ver constantes COV_*).

    Limitación conocida: la banda de profundidad es una losa plana alrededor del
    plano de la bisagra. Una hoja curva (CURVED, ANGLED) se sale de ella hacia la
    punta, así que el cuello bajo la parte doblada queda sin evaluar. Es parte
    de la estimación geométrica; la simulación mecánica lo sustituirá.
    """
    pts = np.asarray(points, dtype=float).reshape(-1, 3)
    rel = pts - frame.hinge
    l = rel @ frame.long_axis            # a lo largo de la hoja, desde la bisagra
    g = rel @ frame.open_axis            # a través de la mordaza
    d = rel @ frame.depth_axis           # profundidad respecto al plano de las hojas
    out = np.full(len(pts), COV_NONE, dtype=np.uint8)
    band = np.abs(d) <= frame.half_height_mm + DEPTH_TOL_MM
    dome_side = d > frame.half_height_mm + DEPTH_TOL_MM
    near = np.abs(g) <= frame.close_half_mm
    behind = l < 0.0
    beyond = l > frame.length_mm
    within = ~behind & ~beyond
    out[band & near & within] = COV_COVERED
    out[band & near & behind] = COV_RESIDUAL
    out[(band | dome_side) & near & beyond] = COV_UNREACHED
    return out


# Prioridad al combinar clips: cubierto > residual > no alcanzado > sin evaluar.
_RANK = np.zeros(4, dtype=np.uint8)
_RANK[COV_NONE], _RANK[COV_UNREACHED], _RANK[COV_RESIDUAL], _RANK[COV_COVERED] = 0, 1, 2, 3


def combine_coverage(per_clip: list[np.ndarray]) -> np.ndarray:
    """Con varios clips manda la mejor categoría de cada vértice."""
    if not per_clip:
        # Sin clips colocados no hay nada que clasificar; el llamador decide el tamaño.
        return np.zeros(0, dtype=np.uint8)
    best = np.asarray(per_clip[0], dtype=np.uint8).copy()
    for cov in per_clip[1:]:
        cov = np.asarray(cov, dtype=np.uint8)
        best = np.where(_RANK[cov] > _RANK[best], cov, best).astype(np.uint8)
    return best


def field_mesh(sac: vtk.vtkPolyData, ring: vtk.vtkPolyData) -> vtk.vtkPolyData:
    """Saco + anillo en una sola malla de triángulos (lo que se pinta)."""
    app = vtk.vtkAppendPolyData(); app.AddInputData(sac); app.AddInputData(ring); app.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(app.GetOutput()); tri.Update()
    clean = vtk.vtkCleanPolyData(); clean.SetInputData(tri.GetOutput()); clean.Update()
    out = vtk.vtkPolyData(); out.DeepCopy(clean.GetOutput())
    return out
