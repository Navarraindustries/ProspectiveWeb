# -*- coding: utf-8 -*-
"""Vetos con motivo para los sitios que propone el consenso.

El consenso junta lo que dicen los canales (curvatura, calibre, cociente) y
devuelve una lista ordenada de sitios. Varios falsos positivos se repiten con
una causa geométrica clara que ningún canal ve: el extremo de un vaso cortado
por el borde del volumen, un resto suelto de la segmentación, la unión de
ramas de una bifurcación, un trozo de vaso curvo sin cuello. Este módulo mira
cada sitio y, si una de esas causas lo explica, devuelve el MOTIVO (un `Veto`)
en vez de borrarlo: la pantalla puede enseñar los descartados y por qué.

Orden fijado: borde → isla → bifurcación → forma. Se devuelve el primero que
aplique; el orden va de lo más seguro (aristas abiertas, componentes) a lo
más interpretativo (la forma).

Nada de esto toca la lesión de Case 3: está en el tronco basilar, dentro del
árbol principal, lejos de la caja de la malla, y tiene cuello. Cada veto
explica abajo por qué no la caza.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy

#: Un parche «toca» una cara de la caja del árbol si queda a menos de esto.
BORDER_TOL_MM: float = 1.0
#: Aristas abiertas mínimas en el parche para leerlo como un corte de la malla.
OPEN_EDGE_MM: float = 3.0
#: Por debajo de esta fracción de vértices un componente que no es el mayor es
#: un resto de la segmentación.
ISLAND_FRAC: float = 0.02
#: Radio de la esfera de la bifurcación, en radios del sitio…
BIF_RADIUS_K: float = 1.5
#: …y nunca menor que esto: con radios pequeños la esfera no llegaría a las ramas.
BIF_MIN_RADIUS_MM: float = 3.0
#: Sección mínima / máxima a partir de la cual no hay cuello.
NECK_RATIO: float = 0.85
#: Cortes a lo largo del eje principal del parche.
NECK_SLICES: int = 10

LABELS: dict[str, str] = {
    "borde": "Recorte de la malla",
    "isla": "Resto de segmentación",
    "bifurcacion": "Unión de ramas",
    "forma": "No es sacular",
}

#: Menos puntos que esto es un parche vacío o degenerado: no se juzga.
_MIN_PATCH_POINTS = 3
#: Un corte con menos puntos no tiene diámetro medible.
_MIN_SLICE_POINTS = 3
#: Un contorno de la esfera cuyos puntos estén a menos de esto de una arista
#: abierta del árbol es ese borde abierto, no una salida de la esfera.
_SAME_POINT_MM = 1e-3
#: Para el diámetro de un corte basta una muestra: el máximo por pares es
#: cuadrático.
_MAX_DIAM_POINTS = 600


@dataclass(frozen=True)
class Veto:
    reason: Literal["borde", "isla", "bifurcacion", "forma"]
    label: str        # «Recorte de la malla» | «Resto de segmentación» | «Unión de ramas» | «No es sacular»
    detail: str       # una frase con la cifra que lo decidió


def _veto(reason: str, detail: str) -> Veto:
    return Veto(reason=reason, label=LABELS[reason], detail=detail)  # type: ignore[arg-type]


def _mm(x: float, nd: int = 1) -> str:
    """Cifra con coma decimal: el detalle se lee en la pantalla."""
    return f"{x:.{nd}f}".replace(".", ",")


def _is_tiny(poly) -> bool:
    return (poly is None or poly.GetNumberOfPoints() < _MIN_PATCH_POINTS
            or poly.GetNumberOfCells() == 0)


def _points(poly) -> np.ndarray:
    pts = poly.GetPoints()
    if pts is None or pts.GetNumberOfPoints() == 0:
        return np.zeros((0, 3))
    return vtk_to_numpy(pts.GetData()).astype(float)


def _boundary_edges(poly) -> vtk.vtkPolyData:
    fe = vtk.vtkFeatureEdges()
    fe.SetInputData(poly)
    fe.BoundaryEdgesOn()
    fe.FeatureEdgesOff()
    fe.NonManifoldEdgesOff()
    fe.ManifoldEdgesOff()
    fe.Update()
    return fe.GetOutput()


# ── Medidas ──────────────────────────────────────────────────────────────── #

def open_edge_length_mm(poly) -> float:
    """Longitud total de las aristas de borde (las que solo tiene un triángulo)."""
    if _is_tiny(poly):
        return 0.0
    edges = _boundary_edges(poly)
    if edges.GetNumberOfCells() == 0:
        return 0.0
    pts = _points(edges)
    lines = edges.GetLines()
    total = 0.0
    ids = vtk.vtkIdList()
    lines.InitTraversal()
    while lines.GetNextCell(ids):
        for k in range(ids.GetNumberOfIds() - 1):
            total += float(np.linalg.norm(pts[ids.GetId(k + 1)] - pts[ids.GetId(k)]))
    return total


def _tree_open_edge_mm_in(patch, tree) -> float:
    """Longitud de las aristas abiertas del ÁRBOL que caen dentro del parche.

    No vale `open_edge_length_mm(patch)` a secas: todo parche es un trozo
    recortado de la malla (una región de curvatura, o una bola alrededor del
    punto) y su propio contorno de recorte ya son aristas abiertas — medido
    en los sintéticos, entre 10 y 30 mm en CUALQUIER sitio, también en el
    saco. Lo que delata un corte de la segmentación es que el árbol mismo
    esté abierto ahí: se cuentan solo las aristas de borde del parche cuyos
    dos extremos son vértices de un borde abierto del árbol (los vértices
    originales sobreviven al recorte sin moverse).
    """
    if _is_tiny(patch) or _is_tiny(tree):
        return 0.0
    tree_open = _boundary_edges(tree)
    if tree_open.GetNumberOfPoints() == 0:
        return 0.0
    edges = _boundary_edges(patch)
    if edges.GetNumberOfCells() == 0:
        return 0.0
    loc = vtk.vtkPointLocator()
    loc.SetDataSet(tree_open)
    loc.BuildLocator()
    pts = _points(edges)
    on_border = np.zeros(len(pts), dtype=bool)
    for i, p in enumerate(pts):
        q = np.asarray(tree_open.GetPoint(loc.FindClosestPoint(p)))
        on_border[i] = np.linalg.norm(q - p) < _SAME_POINT_MM
    total = 0.0
    ids = vtk.vtkIdList()
    lines = edges.GetLines()
    lines.InitTraversal()
    while lines.GetNextCell(ids):
        for k in range(ids.GetNumberOfIds() - 1):
            a, b = ids.GetId(k), ids.GetId(k + 1)
            if on_border[a] and on_border[b]:
                total += float(np.linalg.norm(pts[b] - pts[a]))
    return total


def touches_bbox_face(patch, tree, tol_mm: float) -> bool:
    """Alguna cara de la caja del parche está a menos de *tol_mm* de la misma
    cara de la caja del árbol."""
    if _is_tiny(patch) or _is_tiny(tree):
        return False
    p = patch.GetBounds()
    t = tree.GetBounds()
    for axis in range(3):
        lo, hi = 2 * axis, 2 * axis + 1
        if p[lo] - t[lo] < tol_mm or t[hi] - p[hi] < tol_mm:
            return True
    return False


def component_fraction(tree, point) -> tuple[float, bool]:
    """(fracción de vértices del componente que contiene el vértice más
    cercano a *point*, si ese componente es el mayor).

    Una sola pasada de conectividad que colorea todos los componentes: da el
    del punto y el mayor a la vez. Un empate cuenta como mayor.
    """
    if _is_tiny(tree):
        return 1.0, True
    conn = vtk.vtkPolyDataConnectivityFilter()
    conn.SetInputData(tree)
    conn.SetExtractionModeToAllRegions()
    conn.ColorRegionsOn()
    conn.Update()
    out = conn.GetOutput()
    region = out.GetPointData().GetArray("RegionId")
    if region is None or out.GetNumberOfPoints() == 0:
        return 1.0, True
    ids = vtk_to_numpy(region).astype(np.int64)
    pts = _points(out)
    nearest = int(np.argmin(np.einsum("ij,ij->i", pts - np.asarray(point, float),
                                      pts - np.asarray(point, float))))
    sizes = np.bincount(ids)
    own = int(sizes[ids[nearest]])
    return own / float(len(ids)), own >= int(sizes.max())


def crossing_count(tree, center, radius_mm: float) -> int:
    """Cuántas veces sale la malla de la esfera (*center*, *radius_mm*).

    Se recorta el árbol por dentro de la esfera, se queda el trozo conectado
    al sitio (un vaso vecino que pase por la esfera no es una salida de ESTE
    sitio) y se cuentan los contornos de borde del recorte: un tubo que la
    atraviesa da 2, una Y da 3. Los bordes abiertos que el árbol ya tenía
    (un vaso cortado) no son salidas y se descartan.
    """
    if _is_tiny(tree) or radius_mm <= 0:
        return 0
    sphere = vtk.vtkSphere()
    sphere.SetCenter(*[float(v) for v in center])
    sphere.SetRadius(float(radius_mm))
    clip = vtk.vtkClipPolyData()
    clip.SetInputData(tree)
    clip.SetClipFunction(sphere)
    clip.InsideOutOn()
    clip.Update()
    if clip.GetOutput().GetNumberOfCells() == 0:
        return 0
    piece = vtk.vtkPolyDataConnectivityFilter()
    piece.SetInputConnection(clip.GetOutputPort())
    piece.SetExtractionModeToClosestPointRegion()
    piece.SetClosestPoint(*[float(v) for v in center])
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(piece.GetOutputPort())
    clean.Update()
    cut = clean.GetOutput()
    if _is_tiny(cut):
        return 0

    edges = _boundary_edges(cut)
    if edges.GetNumberOfCells() == 0:
        return 0
    loops = vtk.vtkPolyDataConnectivityFilter()
    loops.SetInputData(edges)
    loops.SetExtractionModeToAllRegions()
    loops.ColorRegionsOn()
    loops.Update()
    lo = loops.GetOutput()
    n_loops = loops.GetNumberOfExtractedRegions()
    region = lo.GetPointData().GetArray("RegionId")
    if region is None or n_loops == 0:
        return 0

    # Bordes que el árbol ya traía abiertos: sus vértices sobreviven al
    # recorte sin moverse, así que se reconocen por posición.
    tree_open = _boundary_edges(tree)
    if tree_open.GetNumberOfPoints() == 0:
        return int(n_loops)
    loc = vtk.vtkPointLocator()
    loc.SetDataSet(tree_open)
    loc.BuildLocator()
    ids = vtk_to_numpy(region).astype(np.int64)
    pts = _points(lo)
    count = 0
    for r in range(int(n_loops)):
        sel = pts[ids == r]
        if len(sel) == 0:
            continue
        on_tree_border = 0
        for p in sel:
            q = tree_open.GetPoint(loc.FindClosestPoint(p))
            if np.linalg.norm(np.asarray(q) - p) < _SAME_POINT_MM:
                on_tree_border += 1
        if on_tree_border <= len(sel) / 2:
            count += 1
    return count


def _diameter(pts: np.ndarray) -> float:
    if len(pts) > _MAX_DIAM_POINTS:
        pts = pts[np.linspace(0, len(pts) - 1, _MAX_DIAM_POINTS).astype(int)]
    d = pts[:, None, :] - pts[None, :, :]
    return float(np.sqrt(np.einsum("ijk,ijk->ij", d, d).max()))


def neck_ratio(patch) -> float | None:
    """Sección mínima / diámetro máximo a lo largo del eje principal.

    El eje principal sale del PCA de los puntos del parche; se corta con
    `NECK_SLICES` planos perpendiculares entre el 10 % y el 90 % de su
    extensión y el diámetro de cada corte es la mayor distancia entre sus
    puntos. Un saco con cuello se estrecha (ratio bajo); un trozo de tubo
    mantiene la sección (ratio cerca de 1). `None` si hay menos de 3 cortes
    válidos.
    """
    if _is_tiny(patch):
        return None
    pts = _points(patch)
    c = pts.mean(axis=0)
    cov = np.cov((pts - c).T)
    if not np.all(np.isfinite(cov)):
        return None
    _, vecs = np.linalg.eigh(cov)
    axis = vecs[:, -1]
    proj = (pts - c) @ axis
    lo, hi = float(proj.min()), float(proj.max())
    if hi - lo <= 1e-9:
        return None

    diams: list[float] = []
    for t in np.linspace(0.1, 0.9, NECK_SLICES):
        plane = vtk.vtkPlane()
        plane.SetOrigin(*(c + axis * (lo + t * (hi - lo))))
        plane.SetNormal(*axis)
        cutter = vtk.vtkCutter()
        cutter.SetInputData(patch)
        cutter.SetCutFunction(plane)
        cutter.Update()
        sec = _points(cutter.GetOutput())
        if len(sec) < _MIN_SLICE_POINTS:
            continue
        d = _diameter(sec)
        if d > 0:
            diams.append(d)
    if len(diams) < 3:
        return None
    return min(diams) / max(diams)


# ── Vetos ────────────────────────────────────────────────────────────────── #

def veto_border(tree, hit, patch) -> Veto | None:
    """El extremo de un vaso cortado por el borde del volumen.

    Caza: el corte de la segmentación deja un tubo abierto, y su boca, vista
    por los canales, parece un cuello con una cúpula detrás. Se exigen las
    dos cosas: que el parche llegue a una cara de la caja del árbol Y que
    contenga aristas abiertas DEL ÁRBOL (no las de su propio recorte, ver
    `_tree_open_edge_mm_in`) — un saco que solo esté CERCA del borde, o la
    tapa cerrada de un vaso, no se veta.

    No caza la lesión de Case 3: está en el tronco basilar, en el interior
    de la malla; su parche no toca la caja, y la malla nativa de Case 3 es
    cerrada (0 mm de aristas abiertas), así que este veto no puede actuar
    sobre ella.
    """
    if _is_tiny(patch):
        return None
    if not touches_bbox_face(patch, tree, BORDER_TOL_MM):
        return None
    open_mm = _tree_open_edge_mm_in(patch, tree)
    if open_mm <= OPEN_EDGE_MM:
        return None
    return _veto("borde", f"El parche llega al borde de la malla con {_mm(open_mm)} mm "
                          f"de aristas abiertas (más de {_mm(OPEN_EDGE_MM)} mm).")


def veto_island(tree, hit, patch) -> Veto | None:
    """Un resto suelto de la segmentación.

    Caza: motas y trozos de hueso o de vena que quedan separados del árbol;
    un objeto pequeño y redondo es justo lo que buscan los canales. Se veta
    si el componente del sitio tiene menos del `ISLAND_FRAC` de los vértices
    y no es el mayor — un árbol pequeño de una sola pieza nunca se veta.

    No caza la lesión de Case 3: está soldada al árbol principal, que es el
    componente mayor (fracción 1,0 medida sobre la malla nativa).
    """
    if _is_tiny(patch):
        return None
    frac, largest = component_fraction(tree, hit.position)
    if largest or frac >= ISLAND_FRAC:
        return None
    return _veto("isla", f"El sitio está en un trozo suelto con el {_mm(frac * 100)} % "
                         f"de los vértices (menos del {_mm(ISLAND_FRAC * 100)} %).")


def veto_bifurcation(tree, hit, patch) -> Veto | None:
    """La unión de ramas de una bifurcación sin saco.

    Caza: en una Y, la zona donde se juntan las ramas es más ancha que cada
    rama y los canales de calibre y cociente la leen como un bulto. Se veta
    si la malla sale por 3 o más sitios de una esfera alrededor del sitio
    (el trozo conectado al sitio, ver `crossing_count`) y no hay un cuello
    que lo salve: un saco en el ápice de la Y se estrecha hacia su cuello y
    se queda.

    El cuello solo cuenta si el parche es una región de curvatura. El de un
    localizador es una bola recortada alrededor de un punto (`hit_patch`):
    en una Y esa bola recoge el tronco y el arranque de las dos ramas, así
    que su sección «se estrecha» por pura geometría del recorte — medido en
    la Y sintética, 0,48 en la unión sin saco. Es el mismo motivo por el que
    `veto_shape` no mira localizadores. Sobre un localizador decide el número
    de salidas: el saco en el ápice de la Y sintética, con su centro sobre la
    cúpula, sale por 2.

    No caza la lesión de Case 3: su sitio es una región de curvatura con una
    sola salida (la cúpula) y cuello 0,68, medidos sobre la malla nativa.
    """
    if _is_tiny(patch):
        return None
    r = max(BIF_MIN_RADIUS_MM, BIF_RADIUS_K * float(hit.radius_mm))
    n = crossing_count(tree, hit.position, r)
    if n < 3:
        return None
    # Mismo criterio que `hit_patch`: hay región si el canal de curvatura
    # aportó un candidato.
    is_region = getattr(hit, "candidate", None) is not None
    ratio = neck_ratio(patch) if is_region else None
    if ratio is not None and ratio < NECK_RATIO:
        return None
    if not is_region:
        detalle = "el parche es un localizador, sin medida de cuello"
    elif ratio is None:
        detalle = "sin cortes suficientes para medir el cuello"
    else:
        detalle = f"sección mín./máx. {_mm(ratio, 2)}, sin cuello"
    return _veto("bifurcacion", f"La malla sale por {n} sitios de una esfera de "
                                f"{_mm(r)} mm ({detalle}).")


def veto_shape(tree, hit, patch, patch_kind) -> Veto | None:
    """Una región de curvatura que no es un saco.

    Caza: la curvatura marca trozos de vaso curvo o de pared ondulada; su
    sección no cambia a lo largo del eje (ratio ≥ `NECK_RATIO`). Solo se
    aplica a parches de tipo «region»: el de un localizador es una bola
    recortada alrededor de un punto e incluye pared de vaso, así que su forma
    no dice nada de la lesión.

    No caza la lesión de Case 3: su región incluye la cúpula y el arranque
    del cuello, y la sección cae hacia el cuello (0,68 medido sobre la malla
    nativa, por debajo de `NECK_RATIO`).
    """
    if patch_kind != "region" or _is_tiny(patch):
        return None
    ratio = neck_ratio(patch)
    if ratio is None or ratio < NECK_RATIO:
        return None
    return _veto("forma", f"La sección apenas cambia a lo largo del parche "
                          f"(mín./máx. {_mm(ratio, 2)}, sin cuello por debajo de {_mm(NECK_RATIO, 2)}).")


def evaluate(tree, hit, patch, patch_kind) -> Veto | None:
    """El primer veto que aplique, en el orden borde → isla → bifurcación → forma."""
    for check in (veto_border, veto_island, veto_bifurcation):
        v = check(tree, hit, patch)
        if v is not None:
            return v
    return veto_shape(tree, hit, patch, patch_kind)
