# -*- coding: utf-8 -*-
"""Quedarse con el árbol y tirar el hueso, por conectividad y no por brillo.

El problema, medido sobre case 3
--------------------------------
La malla que sale de segmentar trae, además del árbol, una decena de bloques
sueltos que el usuario lee como «ruido». No lo son. Medidos:

    pieza          vértices   volumen    extensión   espesor
    #1 (árbol)       12 776   4 314 mm³    149 mm     0,90 mm
    #2 (lámina)       2 230     281 mm³     70 mm     0,25 mm
    #3 … #10       464–1 641  248–2 948    25–44 mm   ~1,2 mm

La más pequeña son **228 mm³**, y el filtro por tamaño descarta por debajo de 5.
Ningún filtro de motas los va a tocar: no son motas, son hueso.

Por qué el umbral HU no puede separarlos
----------------------------------------
Se midió la intensidad del volumen dentro de cada pieza de case 3:

    ÁRBOL   mediana 3049   p5–p95 [-318, 6896]
    HUESO   mediana 1590   p5–p95 [  531, 2192]

El **99 % del hueso cae dentro del rango del propio árbol**. El mejor umbral
global posible (2199) conservaría el 61 % del árbol y aún dejaría el 4,9 % del
hueso: subirlo para matar el hueso mata los vasos distales, que es exactamente
la queja de «la malla sale rota». No es falta de calibración — comparten brillo.

Lo que sí los separa es que **no se tocan**: las piezas están a 37–92 mm del
árbol. El discriminante es la conectividad.

Dónde esto NO vale, y por qué falla en voz alta
-----------------------------------------------
En angiografía el componente mayor es el árbol (case 3: 60,3 %; case 9: 63,7 %,
esfericidad 0,13–0,15, extensión 149–200 mm). En TC no:

    BETANCO   mayor 89,4 %   1 220 000 mm³
    CAMACHO   mayor 81,0 %     795 000 mm³

Más de un litro: es la cabeza entera, porque el contraste toca el hueso y todo
es un solo bloque. Quedarse con el mayor ahí no quita nada y da la falsa
impresión de haber limpiado. Por eso `looks_like_tree` existe y por eso
`keep_main_tree` devuelve un aviso en vez de aplicarse en silencio.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import numpy as np
import vtk

logger = logging.getLogger(__name__)

# ── Umbrales del guardarraíl ───────────────────────────────────────────────── #
#
# Estos números son de esta aplicación, no de la literatura, y separan «un árbol
# vascular» de «la cabeza entera». Se eligieron con el margen más ancho que
# distingue los cuatro casos medidos, no ajustados a ellos:
#
#   árboles medidos:  4 314 y 6 543 mm³ · esfericidad 0,13 y 0,15
#   bloques de TC:  795 000 y 1 220 000 mm³ · esfericidad 0,12 y 0,16
#
# La esfericidad NO los separa (un bloque irregular también la tiene baja). El
# volumen sí, por dos órdenes de magnitud.

#: Por encima de esto, el componente mayor no es un árbol vascular: es un bloque
#: de tejido con el vaso dentro. El árbol más grande medido son 6 543 mm³.
MAX_TREE_VOLUME_MM3: float = 100_000.0

#: Un árbol es delgado. Un bloque de TC da 4,6–6,9 mm de espesor equivalente.
MAX_TREE_THICKNESS_MM: float = 3.0

#: Y es largo: los medidos van de 149 a 200 mm de diagonal.
MIN_TREE_EXTENT_MM: float = 20.0


@dataclass(frozen=True)
class ComponentInfo:
    """Un componente conexo, con lo que hace falta para decidir si es un vaso."""

    index: int               # 0 = el mayor
    n_points: int
    volume_mm3: float
    area_mm2: float
    #: Esfericidad de Wadell. 1 = esfera; un tubo o una lámina bajan.
    sphericity: float
    #: Espesor equivalente 2V/A. Una lámina de hueso da ~0,3 mm; un árbol, ~1.
    thickness_mm: float
    #: Diagonal de la caja envolvente.
    extent_mm: float
    centroid: tuple[float, float, float]


def _extract(poly: vtk.vtkPolyData, region: int) -> vtk.vtkPolyData:
    c = vtk.vtkPolyDataConnectivityFilter()
    c.SetInputData(poly)
    c.SetExtractionModeToSpecifiedRegions()
    c.AddSpecifiedRegion(region)
    c.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(c.GetOutputPort())
    cl.Update()
    return cl.GetOutput()


def _measure(piece: vtk.vtkPolyData, index: int) -> ComponentInfo:
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(piece)
    tri.Update()
    mp = vtk.vtkMassProperties()
    mp.SetInputData(tri.GetOutput())
    try:
        volume = abs(float(mp.GetVolume()))
        area = float(mp.GetSurfaceArea())
    except Exception:  # noqa: BLE001 — una pieza degenerada no puede romper el barrido
        volume, area = 0.0, 0.0

    pts = np.asarray([piece.GetPoint(i) for i in range(piece.GetNumberOfPoints())])
    centroid = pts.mean(axis=0) if pts.size else np.zeros(3)
    bbox = (pts.max(axis=0) - pts.min(axis=0)) if pts.size else np.zeros(3)

    sphericity = (math.pi ** (1 / 3) * (6 * volume) ** (2 / 3) / area) if area > 0 else 0.0
    thickness = (2.0 * volume / area) if area > 0 else 0.0

    return ComponentInfo(
        index=index,
        n_points=piece.GetNumberOfPoints(),
        volume_mm3=volume,
        area_mm2=area,
        sphericity=sphericity,
        thickness_mm=thickness,
        extent_mm=float(np.linalg.norm(bbox)),
        centroid=tuple(float(v) for v in centroid),
    )


def describe_components(poly: vtk.vtkPolyData) -> list[ComponentInfo]:
    """Cada pieza conexa, ordenada de mayor a menor por número de vértices."""
    if poly is None or poly.GetNumberOfPoints() == 0:
        return []

    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly)
    cf.SetExtractionModeToAllRegions()
    cf.Update()
    n = cf.GetNumberOfExtractedRegions()

    pieces = []
    for i in range(n):
        p = _extract(poly, i)
        if p.GetNumberOfPoints():
            pieces.append((i, p))
    # El índice de región de VTK no sigue el tamaño; se reordena aquí para que
    # «el mayor» sea siempre el 0 y el resto quede en orden descendente.
    pieces.sort(key=lambda t: t[1].GetNumberOfPoints(), reverse=True)
    return [_measure(p, rank) for rank, (_orig, p) in enumerate(pieces)]


def looks_like_tree(info: ComponentInfo) -> tuple[bool, str]:
    """¿Este componente es un árbol vascular, o un bloque con el vaso dentro?

    Devuelve (sí/no, motivo). El motivo se enseña al usuario cuando la respuesta
    es «no», porque un botón que no hace nada es peor que un botón que explica.
    """
    if info.volume_mm3 > MAX_TREE_VOLUME_MM3:
        return False, (
            f"La estructura mayor ocupa {info.volume_mm3 / 1000:.0f} cm³: no es un "
            f"árbol vascular, es un bloque de tejido con el vaso dentro. Pasa en "
            f"angio-TC, donde el contraste toca el hueso y todo queda conectado. "
            f"Quedarse con ella no quitaría nada — usa «Crecer desde semillas» "
            f"para salir solo por el vaso."
        )
    if info.thickness_mm > MAX_TREE_THICKNESS_MM:
        return False, (
            f"La estructura mayor tiene {info.thickness_mm:.1f} mm de espesor "
            f"equivalente: es maciza, no tubular. Probablemente sea hueso o "
            f"tejido, no el árbol."
        )
    if info.extent_mm < MIN_TREE_EXTENT_MM:
        return False, (
            f"La estructura mayor mide {info.extent_mm:.0f} mm de diagonal: es "
            f"demasiado pequeña para ser el árbol. Baja el umbral inferior o el "
            f"nivel de limpieza."
        )
    return True, ""


@dataclass
class MainTreeResult:
    """Lo que salió de quedarse con el árbol principal."""

    poly: vtk.vtkPolyData
    applied: bool
    warning: str
    n_before: int
    n_after: int
    components_before: int
    removed: list[ComponentInfo]


def keep_main_tree(poly: vtk.vtkPolyData) -> MainTreeResult:
    """Conserva el componente conexo mayor, si de verdad parece un árbol.

    Cuando no lo parece **no recorta nada** y devuelve el motivo. Es deliberado:
    en angio-TC esta operación no separa el vaso del hueso, y aplicarla igual
    daría la impresión de haber limpiado algo.
    """
    comps = describe_components(poly)
    if len(comps) <= 1:
        return MainTreeResult(poly, False, "", poly.GetNumberOfPoints(),
                              poly.GetNumberOfPoints(), len(comps), [])

    ok, motivo = looks_like_tree(comps[0])
    if not ok:
        return MainTreeResult(poly, False, motivo, poly.GetNumberOfPoints(),
                              poly.GetNumberOfPoints(), len(comps), [])

    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly)
    cf.SetExtractionModeToLargestRegion()
    cf.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(cf.GetOutputPort())
    cl.Update()
    out = cl.GetOutput()

    logger.info("Main tree: %d → %d vértices, %d piezas descartadas",
                poly.GetNumberOfPoints(), out.GetNumberOfPoints(), len(comps) - 1)
    return MainTreeResult(out, True, "", poly.GetNumberOfPoints(),
                          out.GetNumberOfPoints(), len(comps), comps[1:])


def remove_component_at(
    poly: vtk.vtkPolyData,
    point: tuple[float, float, float],
    max_distance_mm: float = 5.0,
) -> tuple[vtk.vtkPolyData, ComponentInfo | None, str]:
    """Borra la pieza conexa que contiene el punto señalado.

    El borrador que pidió el jefe, con la granularidad que el dato ya tiene: el
    ruido viene en piezas enteras, así que pintar sobre él no hace falta y
    dejaría bordes a medio borrar. Un clic quita la pieza entera.

    Devuelve (malla, pieza borrada, aviso). Si el clic cae lejos de toda
    geometría no borra nada y lo dice, en vez de borrar la pieza más cercana.
    """
    if poly is None or poly.GetNumberOfPoints() == 0:
        return poly, None, "La malla está vacía."

    # ColorRegions etiqueta cada punto con su región y conserva la numeración de
    # puntos, así que el punto señalado se traduce a un id de región directamente.
    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(poly)
    cf.SetExtractionModeToAllRegions()
    cf.ColorRegionsOn()
    cf.Update()
    colored = cf.GetOutput()
    n_regions = cf.GetNumberOfExtractedRegions()

    loc = vtk.vtkPointLocator()
    loc.SetDataSet(colored)
    loc.BuildLocator()
    pid = loc.FindClosestPoint(point)
    if pid < 0:
        return poly, None, "No hay geometría cerca del punto señalado."

    hit = np.asarray(colored.GetPoint(pid))
    dist = float(np.linalg.norm(hit - np.asarray(point, float)))
    if dist > max_distance_mm:
        return poly, None, (
            f"El punto señalado está a {dist:.1f} mm de la malla más cercana. "
            f"Pincha sobre la superficie de la pieza que quieres quitar."
        )

    if n_regions <= 1:
        return poly, None, (
            "La malla es una sola pieza conexa: borrarla la dejaría vacía. Para "
            "quitar parte de una pieza usa el recorte por caja o esfera."
        )

    ids = colored.GetPointData().GetArray("RegionId")
    target = int(ids.GetTuple1(pid))

    removed = _measure(_extract(poly, target), -1)

    keep = vtk.vtkPolyDataConnectivityFilter()
    keep.SetInputData(poly)
    keep.SetExtractionModeToSpecifiedRegions()
    for r in range(n_regions):
        if r != target:
            keep.AddSpecifiedRegion(r)
    keep.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(keep.GetOutputPort())
    cl.Update()
    out = cl.GetOutput()

    if out.GetNumberOfPoints() == 0:
        return poly, None, "Borrar esa pieza dejaría la malla vacía."

    logger.info("Borrada pieza de %d vértices (%.0f mm³); quedan %d",
                removed.n_points, removed.volume_mm3, out.GetNumberOfPoints())
    return out, removed, ""


def component_to_dict(c: ComponentInfo) -> dict:
    return {
        "index": c.index,
        "n_points": c.n_points,
        "volume_mm3": round(c.volume_mm3, 2),
        "area_mm2": round(c.area_mm2, 2),
        "sphericity": round(c.sphericity, 4),
        "thickness_mm": round(c.thickness_mm, 3),
        "extent_mm": round(c.extent_mm, 2),
    }


# ── Borrador por región (sobre la superficie, no por el espacio) ───────────── #
#
# `remove_component_at` borra una PIEZA ENTERA, que es lo que sirve cuando el
# hueso viene suelto. No sirve cuando viene PEGADO: en 3DRA a resolución
# completa el peñasco y la base del cráneo tocan el árbol, así que forman parte
# del componente mayor y «solo el árbol principal» los conserva. La interfaz lo
# dice sola: «la malla es una sola pieza: no hay nada suelto que borrar».
#
# Se midieron dos vías automáticas para distinguirlos y NINGUNA funcionó, así
# que esto es deliberadamente manual:
#
#   · Forma local (PCA + rugosidad de normales, case 3 a resolución completa):
#     la rugosidad de la chapa es 0,742 y la del resto del árbol 0,717. No
#     separa; a resolución completa TODA la malla es rugosa.
#   · Calibre local: chapa 0,69 mm de mediana, resto del árbol 0,69 mm.
#     Idénticos. El aneurisma sí destaca (1,20) pero ese no es el problema.
#
# Por qué la distancia va SOBRE LA SUPERFICIE y no por el espacio: la esfera de
# recorte que ya existe borra todo lo que cae dentro de una bola, así que un
# vaso que pasa por detrás de la chapa se va con ella. Medido en la superficie,
# ese vaso está lejísimos —hay que rodear todo el árbol para llegar— y sobrevive.

def _points(poly: vtk.vtkPolyData) -> np.ndarray:
    """Los vértices como array (N, 3)."""
    try:
        from vtkmodules.util.numpy_support import vtk_to_numpy
    except ImportError:                                   # pragma: no cover
        from vtk.util.numpy_support import vtk_to_numpy   # type: ignore
    return vtk_to_numpy(poly.GetPoints().GetData()).astype(float)


def _adjacency(poly: vtk.vtkPolyData) -> list[list[int]]:
    """Vecinos de cada vértice, por aristas de la malla."""
    adj: list[list[int]] = [[] for _ in range(poly.GetNumberOfPoints())]
    ids = vtk.vtkIdList()
    polys = poly.GetPolys()
    polys.InitTraversal()
    while polys.GetNextCell(ids):
        n = ids.GetNumberOfIds()
        for k in range(n):
            a = ids.GetId(k)
            b = ids.GetId((k + 1) % n)
            adj[a].append(b)
            adj[b].append(a)
    return adj


def erase_region_at(
    poly: vtk.vtkPolyData,
    point: tuple[float, float, float],
    radius_mm: float = 6.0,
    max_pick_distance_mm: float = 5.0,
) -> tuple[vtk.vtkPolyData, int, str]:
    """Borra la superficie que rodea al punto, midiendo POR LA SUPERFICIE.

    Devuelve `(malla, vértices borrados, aviso)`. Si el clic cae lejos de toda
    geometría no borra nada y lo dice, igual que el borrador de piezas: borrar
    «lo más cercano» a un clic perdido es justo lo que no se espera.

    No intenta adivinar dónde acaba la chapa. El radio lo pone quien mira.
    """
    from collections import deque

    if poly is None or poly.GetNumberOfPoints() == 0:
        return poly, 0, "La malla está vacía."
    if radius_mm <= 0:
        return poly, 0, "El radio tiene que ser mayor que cero."

    loc = vtk.vtkPointLocator()
    loc.SetDataSet(poly)
    loc.BuildLocator()
    pid = loc.FindClosestPoint(point)
    if pid < 0:
        return poly, 0, "No hay geometría donde has pinchado."

    pts = _points(poly)
    if float(np.linalg.norm(pts[pid] - np.asarray(point, dtype=float))) > max_pick_distance_mm:
        return poly, 0, (
            "Has pinchado lejos de la malla. Acércate a la superficie que "
            "quieres borrar."
        )

    # Propagación POR LA SUPERFICIE, acotada por distancia EUCLÍDEA al clic.
    #
    # La primera versión medía distancia geodésica (longitud del camino sobre la
    # malla) y resultó inservible: en la malla rugosa de resolución completa,
    # recorrer 1 mm en el espacio cuesta varios por la superficie. Medido en
    # case 3: un radio de 30 mm borraba el 0,4 % de la malla, y tardaba 4,5 s.
    #
    # Acotar por distancia euclídea hace que el radio signifique lo que se ve.
    # Y propagar por la superficie —en vez de borrar la bola entera, como hace
    # el recorte esférico que ya existía— respeta la conectividad: un vaso que
    # cruza la bola pero se une al árbol por fuera de ella no se toca.
    centro = pts[pid]
    r2 = float(radius_mm) ** 2
    cerca = np.einsum("ij,ij->i", pts - centro, pts - centro) <= r2

    adj = _adjacency(poly)
    dentro = np.zeros(poly.GetNumberOfPoints(), dtype=bool)
    dentro[pid] = True
    cola = deque([pid])
    while cola:
        v = cola.popleft()
        for w in adj[v]:
            if not dentro[w] and cerca[w]:
                dentro[w] = True
                cola.append(w)
    n_dentro = int(dentro.sum())
    if n_dentro == 0:
        return poly, 0, "No se ha seleccionado nada; prueba con un radio mayor."
    # Por fracción y no por igualdad: los vértices sin celda nunca entran en
    # el recorrido, así que «lo ha cogido todo» no llega a ser todo —en el tubo
    # de prueba, 976 de 1008— y el guardia por igualdad no saltaba nunca.
    if n_dentro >= 0.90 * poly.GetNumberOfPoints():
        return poly, 0, (
            "Ese radio se lleva la malla entera. Baja el radio: el borrador "
            "quita una zona, no todo."
        )

    # Se conserva la celda que tenga ALGÚN vértice fuera. Quitar solo las que
    # están enteras dentro deja el borde limpio en vez de un diente de sierra.
    #
    # Se construye a mano en vez de con `vtkThreshold`: su API de umbral ha
    # cambiado entre versiones de VTK y la primera versión de esto se llevó la
    # malla entera sin avisar. Recorrer celdas es más largo de leer y no tiene
    # ese riesgo.
    salida = vtk.vtkPolyData()
    puntos = vtk.vtkPoints()
    puntos.SetDataTypeToFloat()
    celdas = vtk.vtkCellArray()
    remap = np.full(poly.GetNumberOfPoints(), -1, dtype=np.int64)

    ids = vtk.vtkIdList()
    polys = poly.GetPolys()
    polys.InitTraversal()
    while polys.GetNextCell(ids):
        n = ids.GetNumberOfIds()
        vs = [ids.GetId(k) for k in range(n)]
        if all(dentro[v] for v in vs):
            continue
        celdas.InsertNextCell(n)
        for v in vs:
            if remap[v] < 0:
                remap[v] = puntos.InsertNextPoint(*pts[v])
            celdas.InsertCellPoint(int(remap[v]))

    salida.SetPoints(puntos)
    salida.SetPolys(celdas)

    limpio = vtk.vtkCleanPolyData()
    limpio.SetInputData(salida)
    limpio.Update()
    out = limpio.GetOutput()

    borrados = poly.GetNumberOfPoints() - out.GetNumberOfPoints()
    return out, int(borrados), ""
