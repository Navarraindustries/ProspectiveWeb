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
# Holgura radial del disco del cuello (en su plano); independiente de la de profundidad.
DISC_TOL_MM = 0.6

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
    # Marco de diseño: ambas familias centran la mordaza en el origen local, con
    # las hojas a lo largo de X y la apertura en Y, pero no hacia el mismo lado: el
    # sintético apunta la mordaza a +X y la pieza NAVARRO™ a −X (cuerpo en +X). El
    # sentido se lee de la malla: el lado largo desde el origen es el del cuerpo o
    # la barra, la mordaza va hacia el corto. Con el sentido al revés, «detrás de la
    # bisagra» y «más allá de la punta» se intercambian y residual y no alcanzado
    # salen cambiados. La punta queda en ±L/2 (anclada en la punta, como el camino
    # leído); no se mide el extremo porque en un ANGLED lo marca el codo, no la hoja.
    b = local.GetOutput().GetBounds()
    sgn = -1.0 if b[1] > -b[0] else 1.0
    analytic = (np.array([-sgn * float(length_mm) / 2.0, 0.0, 0.0]),
                np.array([sgn, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]))
    try:
        hinge_l, long_l, open_l = _frame_in_mesh_coords(local.GetOutput())
    except ValueError:
        # Una malla que no se puede analizar (muy pocos puntos) no debe tumbar el
        # mapa entero: la pose dice exactamente dónde está el clip y manda el
        # marco de diseño.
        hinge_l, long_l, open_l = analytic
    else:
        # Todos los clips se modelan con las hojas a lo largo de X local y la
        # apertura en Y. `jaw_geometry` elige los ejes por extensión y pasillo, y en
        # los ANGLED cortos la rama doblada en Z gana a la hoja: devuelve la
        # apertura en X y el «a través de la mordaza» se mediría a lo largo de la
        # hoja. Si lo leído no cuadra con el diseño local, manda el diseño.
        if abs(float(long_l[0])) <= 0.9 or abs(float(open_l[1])) <= 0.9:
            hinge_l, long_l, open_l = analytic
        else:
            # El marco se ancla en la PUNTA de la mordaza, no en la barra de bisagra:
            # la mordaza NAVARRO™ termina en una garganta abierta antes de la barra,
            # así que la barra no es donde empiezan las hojas. El largo útil viene de
            # la ficha y la punta es un extremo medible en ambas familias de clip
            # (en el sintético, punta en +L/2 → bisagra en −L/2, como antes).
            P = points_of(local.GetOutput())
            tip = float(((P - hinge_l) @ long_l).max())
            hinge_l = hinge_l + (tip - float(length_mm)) * long_l
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


def neck_disc(points: np.ndarray, *, neck_origin, neck_axis, neck_mm: float) -> np.ndarray:
    """Máscara de los vértices dentro del disco del cuello (en su plano).

    Distancia al eje del cuello ≤ cuello/2 + tolerancia: es la población de la
    que hablan «cuello cubierto», «residual» y «no alcanzado».
    """
    pts = np.asarray(points, dtype=float).reshape(-1, 3)
    rel = pts - np.asarray(neck_origin, dtype=float)
    n = _unit(neck_axis)
    in_plane = rel - np.outer(rel @ n, n)
    return np.linalg.norm(in_plane, axis=1) <= float(neck_mm) / 2.0 + DISC_TOL_MM


def classify(points: np.ndarray, frame: BladeFrame, *, neck_origin, neck_axis,
             neck_mm: float) -> np.ndarray:
    """Categoría por vértice para UN clip (ver constantes COV_*).

    Dentro de la banda y del disco del cuello todo vértice recibe veredicto: lo
    que las hojas cierran es cubierto, lo que queda más allá de la punta es no
    alcanzado y todo lo demás (detrás de la bisagra o al lado de la mordaza) es
    residual. Un clip desplazado a través de la mordaza deja el cuello a un lado
    de las hojas, y ese cuello tiene que leerse abierto, nunca «no evaluado»:
    era la falsa tranquilidad de un clip que no pinzaba nada.

    Fuera del disco la banda corta la pared de la arteria madre: un clip paralelo
    a la arteria (la orientación habitual) vería esa pared más allá de la punta
    como cuello sin cerrar, así que ahí solo se marca lo que las hojas pinzan
    (cubierto, para el área de contacto) y el resto queda sin evaluar. La cúpula,
    fuera de la banda, tampoco cuenta.

    Limitaciones conocidas: la banda de profundidad es una losa plana alrededor
    del plano de la bisagra, y una hoja curva (CURVED, ANGLED) se sale de ella
    hacia la punta, así que el cuello bajo la parte doblada queda sin evaluar.
    Con dos clips a distinta altura, un trozo de cuello en la banda de B pero al
    lado de su mordaza sale residual aunque A lo cierre más abajo: es
    conservador (magenta, no verde). Todo es parte de la estimación geométrica;
    la simulación mecánica lo sustituirá.
    """
    pts = np.asarray(points, dtype=float).reshape(-1, 3)
    rel = pts - frame.hinge
    l = rel @ frame.long_axis            # a lo largo de la hoja, desde la bisagra
    g = rel @ frame.open_axis            # a través de la mordaza
    d = rel @ frame.depth_axis           # profundidad respecto al plano de las hojas
    out = np.full(len(pts), COV_NONE, dtype=np.uint8)
    band = np.abs(d) <= frame.half_height_mm + DEPTH_TOL_MM
    near = np.abs(g) <= frame.close_half_mm
    behind = l < 0.0
    beyond = l > frame.length_mm
    within = ~behind & ~beyond
    in_disc = neck_disc(pts, neck_origin=neck_origin, neck_axis=neck_axis, neck_mm=neck_mm)
    # Dentro del disco la holgura lateral se iguala a la del disco: la del disco
    # (0,6 mm) es más ancha que la de la mordaza (0,3 mm), y sin igualarlas un clip
    # centrado dejaría un halo de «residual» en el borde del cuello.
    closes_neck = (np.abs(g) <= frame.close_half_mm + (DISC_TOL_MM - GAP_TOL_MM)) & within
    neck = band & in_disc
    out[band & near & within] = COV_COVERED
    out[neck & closes_neck] = COV_COVERED
    out[neck & beyond] = COV_UNREACHED
    out[neck & ~beyond & ~closes_neck] = COV_RESIDUAL
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


PRESSURE_COLORS = {
    "insuficiente": (59, 130, 246), "optima": (34, 197, 94), "aceptable": (245, 158, 11),
    "exceso": (239, 68, 68), "sin_contacto": (148, 163, 184),
    # Sin fuerza conocida el cubierto no tiene presión que colorear: gris neutro.
    "sin_fuerza": (148, 163, 184),
}
CATEGORY_COLORS = {COV_NONE: (120, 112, 124), COV_RESIDUAL: (217, 70, 239), COV_UNREACHED: (107, 114, 128)}
GEOMETRIC_NOTE = ("Estimación geométrica: fuerza de catálogo repartida sobre el área de contacto; "
                  "no modela pared, deformación ni deslizamiento.")


def contact_area_mm2(mesh: vtk.vtkPolyData, coverage: np.ndarray) -> float:
    """Área de los triángulos cuyos tres vértices quedan entre las hojas.

    Un triángulo con un vértice fuera cubre solo en parte: contarlo entero
    inflaría el área y rebajaría la presión estimada, así que se exige el trío.
    """
    if mesh.GetNumberOfCells() == 0:
        return 0.0
    # field_mesh ya triangula; los índices de celda se leen por celda para no
    # depender de que la malla venga solo con triángulos.
    polys = ns.vtk_to_numpy(mesh.GetPolys().GetConnectivityArray())
    offsets = ns.vtk_to_numpy(mesh.GetPolys().GetOffsetsArray())
    if len(polys) == 0 or not np.all(np.diff(offsets) == 3):
        tri = vtk.vtkTriangleFilter(); tri.SetInputData(mesh); tri.PassLinesOff(); tri.PassVertsOff(); tri.Update()
        mesh = tri.GetOutput()
        polys = ns.vtk_to_numpy(mesh.GetPolys().GetConnectivityArray())
    polys = polys.reshape(-1, 3)
    cov = np.asarray(coverage) == COV_COVERED
    covered = cov[polys].all(axis=1)
    if not covered.any():
        return 0.0
    pts = points_of(mesh)
    a, b, c = pts[polys[covered, 0]], pts[polys[covered, 1]], pts[polys[covered, 2]]
    return float(0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum())


def pressure_verdict(pressure_g_mm2: float, window_g_mm2, *, has_force: bool = True) -> str:
    """Presión de UN clip frente a la ventana del cuello repartida sobre su área.

    Presión y ventana se dividen por la misma área, así que el veredicto es en el
    fondo «fuerza del clip frente a la ventana de fuerza del cuello». Una ventana
    nula significa que no hay área de contacto.
    """
    acc_lo, opt_lo, opt_hi, acc_hi = window_g_mm2
    # La ventana solo es positiva si hay área de contacto. Con contacto pero sin
    # fuerza conocida (clip importado sin ficha) la presión es desconocida, no
    # nula: decir «sin contacto» negaría el cuello que el clip sí pinza.
    if acc_hi > 0.0 and not has_force:
        return "sin_fuerza"
    if acc_hi <= 0.0 or pressure_g_mm2 <= 0.0:
        return "sin_contacto"
    if pressure_g_mm2 < acc_lo:
        return "insuficiente"
    if pressure_g_mm2 > acc_hi:
        return "exceso"
    if opt_lo <= pressure_g_mm2 <= opt_hi:
        return "optima"
    return "aceptable"


# Gravedad para quedarse con el peor clip. «sin_fuerza» va por debajo de todo: un
# importado sin ficha no puede tapar el veredicto de un clip que sí la tiene, y
# solo manda cuando ningún clip tiene fuerza conocida.
_VERDICT_RANK = {"sin_fuerza": 0, "optima": 1, "aceptable": 2, "insuficiente": 3,
                 "exceso": 4, "sin_contacto": 5}


@dataclass(frozen=True)
class ClipLoad:
    """La fuerza de UN clip frente a la ventana del cuello."""
    force_g: float
    contact_area_mm2: float
    pressure_g_mm2: float
    window_g_mm2: tuple[float, float, float, float]
    verdict: str


def clip_load(mesh, coverage: np.ndarray, *, force_g: float, neck_mm: float) -> ClipLoad:
    """Cada clip se juzga con su propia fuerza: dos clips en tándem no suman.

    Sumar las fuerzas y compararlas con la ventana de UN clip pintaba de rojo
    («exceso») cualquier pareja, un montaje habitual en cuellos anchos.
    """
    from services.clip_selection import force_window
    area = contact_area_mm2(mesh, coverage)
    pressure = float(force_g / area) if area > 0 and force_g > 0 else 0.0
    window = tuple(float(w / area) if area > 0 else 0.0 for w in force_window(neck_mm))
    return ClipLoad(force_g=float(force_g), contact_area_mm2=area, pressure_g_mm2=pressure,
                    window_g_mm2=window,  # type: ignore[arg-type]
                    verdict=pressure_verdict(pressure, window, has_force=force_g > 0))


def worst_load(loads: list[ClipLoad]) -> int:
    """Índice del clip con el peor veredicto de fuerza (el primero si empatan)."""
    return max(range(len(loads)), key=lambda i: (_VERDICT_RANK.get(loads[i].verdict, 5), -i))


@dataclass
class FieldSummary:
    covered_pct: float; residual_pct: float; unreached_pct: float
    contact_area_mm2: float; force_g: float; force_is_band_min: bool; force_provisional: bool
    pressure_g_mm2: float; window_g_mm2: tuple[float, float, float, float]; pressure_verdict: str
    force_window_g: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    neck_evaluated: bool = True
    note: str = GEOMETRIC_NOTE


def summarize(mesh, coverage: np.ndarray, *, in_neck: np.ndarray, loads: list[ClipLoad],
              force_is_band_min: bool, force_provisional: bool, neck_mm: float) -> FieldSummary:
    """Cifras del campo: porcentajes sobre el cuello y la fuerza del peor clip.

    Los porcentajes se reparten solo entre los vértices evaluados DENTRO del
    disco del cuello: la pared del anillo que las hojas pinzan se pinta cubierta
    (es lo que aprietan) pero no es cuello, y contarla inflaba «cuello cubierto».
    Si ningún vértice del cuello cae en la banda (clip lejos a lo largo del eje)
    no hay cuello evaluado y los porcentajes no significan nada: se marca para
    que la tarjeta muestre «—» y no 0/0/0.
    """
    from services.clip_selection import force_window
    coverage = np.asarray(coverage)
    neck = (coverage != COV_NONE) & np.asarray(in_neck, dtype=bool)
    n = int(neck.sum())

    def pct(cat: int) -> float:
        return float(100.0 * ((coverage == cat) & neck).sum() / n) if n else 0.0

    worst = (loads[worst_load(loads)] if loads
             else ClipLoad(0.0, 0.0, 0.0, (0.0, 0.0, 0.0, 0.0), "sin_contacto"))
    return FieldSummary(
        covered_pct=pct(COV_COVERED), residual_pct=pct(COV_RESIDUAL), unreached_pct=pct(COV_UNREACHED),
        contact_area_mm2=contact_area_mm2(mesh, coverage), force_g=worst.force_g,
        force_is_band_min=force_is_band_min, force_provisional=force_provisional,
        pressure_g_mm2=worst.pressure_g_mm2, window_g_mm2=worst.window_g_mm2,
        pressure_verdict=worst.verdict,
        force_window_g=tuple(float(w) for w in force_window(neck_mm)),  # type: ignore[arg-type]
        neck_evaluated=n > 0,
    )


def vertex_loads(per_clip: list[np.ndarray], loads: list[ClipLoad]) -> tuple[np.ndarray, np.ndarray]:
    """(veredicto, presión) por vértice: los del peor clip de los que lo cubren.

    Fuera de lo cubierto el veredicto es «» y la presión cero.
    """
    n = len(per_clip[0]) if per_clip else 0
    verdicts = np.full(n, "", dtype=object)
    pressure = np.zeros(n, dtype=np.float32)
    rank = np.full(n, -1, dtype=int)
    for cov, load in zip(per_clip, loads):
        r = _VERDICT_RANK.get(load.verdict, 5)
        hit = (np.asarray(cov) == COV_COVERED) & (r > rank)
        verdicts[hit] = load.verdict
        pressure[hit] = np.float32(load.pressure_g_mm2)
        rank[hit] = r
    return verdicts, pressure


def colorize(coverage: np.ndarray, pressure_verdict) -> np.ndarray:
    """RGB por vértice: el cubierto lleva el color del veredicto de presión.

    `pressure_verdict` es un veredicto para todo lo cubierto o uno por vértice
    (`vertex_loads`): con varios clips cada zona lleva el del clip que la pinza.
    """
    coverage = np.asarray(coverage)
    rgb = np.empty((len(coverage), 3), dtype=np.uint8)
    for cat, col in CATEGORY_COLORS.items():
        rgb[coverage == cat] = col
    covered = coverage == COV_COVERED
    if isinstance(pressure_verdict, str):
        rgb[covered] = PRESSURE_COLORS.get(pressure_verdict, PRESSURE_COLORS["sin_contacto"])
        return rgb
    per = np.asarray(pressure_verdict, dtype=object)
    rgb[covered] = PRESSURE_COLORS["sin_contacto"]
    for name, col in PRESSURE_COLORS.items():
        rgb[covered & (per == name)] = col
    return rgb


def write_field(mesh: vtk.vtkPolyData, coverage: np.ndarray, pressure_g_mm2, colors: np.ndarray, path) -> None:
    """Escribe el .vtp con `coverage`, `pressure_g_mm2` y `colors` (escalar activo)."""
    from services.segmentation import write_vtp
    coverage = np.asarray(coverage)
    out = vtk.vtkPolyData(); out.ShallowCopy(mesh)
    cov = ns.numpy_to_vtk(coverage.astype(np.uint8), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR); cov.SetName("coverage")
    # La presión es la del clip que pinza cada vértice (una cifra o una por vértice); fuera, cero.
    pres_v = np.broadcast_to(np.asarray(pressure_g_mm2, dtype=np.float32), coverage.shape)
    pres = ns.numpy_to_vtk(np.where(coverage == COV_COVERED, pres_v, np.float32(0.0)).astype(np.float32),
                           deep=True, array_type=vtk.VTK_FLOAT); pres.SetName("pressure_g_mm2")
    col = ns.numpy_to_vtk(np.ascontiguousarray(colors, dtype=np.uint8), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR)
    col.SetNumberOfComponents(3); col.SetName("colors")
    pd = out.GetPointData(); pd.AddArray(cov); pd.AddArray(pres); pd.SetScalars(col)
    write_vtp(out, path)
