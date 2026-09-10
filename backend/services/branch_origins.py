# -*- coding: utf-8 -*-
"""Orígenes de rama: dónde un vaso fino nace de uno grueso.

Por qué existe este módulo
--------------------------
`perforator_risk.py` buscaba bifurcaciones por ANOMALÍA DE VALENCIA — cuántos
triángulos inciden en cada vértice — sobre la premisa, escrita en su docstring,
de que «branching points have significantly higher vertex valence than straight
vessel segments». Medida sobre una isosuperficie de marching cubes con tres
bifurcaciones reales, esa premisa no se sostiene:

    valencia:  mediana 6.00 · desviación 0.31 · rango 4-8

En una malla manifold triangulada todo vértice tiene ~6 triángulos esté donde
esté: la valencia describe la triangulación, no la forma del vaso. Con el umbral
que usaba (z ≥ 1.5) el resultado era peor que el azar:

    cerca de una unión ......  30.3 % de la superficie
    de los vértices MARCADOS   20.9 %      -> enriquecimiento x0.69

Qué mide esto en su lugar
-------------------------
El calibre. Una rama es un tubo fino pegado a uno grueso, y eso es geometría, no
topología de triángulos:

1. Rasterizar el interior de la malla (`vtkPolyDataToImageStencil`, ~0.1 s
   incluso a 42 M de vóxeles).
2. Transformada de distancia euclídea → distancia al borde en cada vóxel
   interior.
3. Desde cada vértice, marchar hacia DENTRO por su normal y quedarse con la
   mayor distancia al borde que se encuentre: el radio del tubo al que ese
   vértice pertenece.
5. Los vértices finos que forman una región conectada son una rama; se acepta
   sólo si aquello a lo que se pega es al menos `MIN_PARENT_RATIO` veces más
   grueso, que es lo que distingue una rama de un vaso que simplemente adelgaza.

Lo que sigue sin ser
--------------------
Una perforante de verdad mide 0,1–0,5 mm y una angio-TC no la resuelve: no llega
a la malla y por tanto no puede detectarse aquí. Esto encuentra ORÍGENES DE RAMA
VISIBLES, que es lo máximo que la imagen permite. Una lista vacía no es prueba
de que no haya perforantes; es que no se ven.

El tamaño de vóxel fija el suelo: por debajo de unos dos vóxeles de diámetro un
vaso no se resuelve. Ese suelo viaja en el resultado en lugar de quedar
implícito.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import vtk
from scipy.ndimage import distance_transform_edt
from vtk.util.numpy_support import vtk_to_numpy

logger = logging.getLogger(__name__)

#: Resolución por defecto. A 0.5 mm la EDT de una caja craneal tarda ~3 s y ocupa
#: ~120 MB, y resuelve un vaso de 1 mm de diámetro con dos vóxeles de ancho.
DEFAULT_VOXEL_MM: float = 0.5

#: Tope de vóxeles. Por encima se engorda el vóxel: más vale un suelo de calibre
#: peor y declarado que agotar la memoria del servidor.
MAX_VOXELS: int = 60_000_000

#: Radio por encima del cual un vaso ya no es «una rama fina» (mm).
BRANCH_MAX_RADIUS_MM: float = 1.0

#: Cuánto más gruesa tiene que ser la madre. Sin esto, el extremo de cualquier
#: vaso que se estrecha se cuenta como rama.
MIN_PARENT_RATIO: float = 1.6

#: Regiones más pequeñas que esto son ruido de la malla, no un vaso.
MIN_BRANCH_VERTICES: int = 10


@dataclass
class BranchOrigin:
    """Un punto donde un vaso fino se une a uno más grueso."""

    index: int
    position: tuple[float, float, float]   # mundo, mm
    calibre_mm: float                      # DIÁMETRO de la rama
    parent_calibre_mm: float               # diámetro de aquello de lo que nace
    n_vertices: int

    @property
    def calibre_ratio(self) -> float:
        return self.parent_calibre_mm / self.calibre_mm if self.calibre_mm > 0 else 0.0


@dataclass
class BranchScan:
    """El barrido completo de una malla, con lo que la limita."""

    origins: list[BranchOrigin] = field(default_factory=list)
    voxel_mm: float = DEFAULT_VOXEL_MM
    #: Diámetro por debajo del cual esta pasada no puede resolver un vaso.
    calibre_floor_mm: float = 0.0
    #: Sobre qué malla se hizo. Se congela para sobrevivir a un recorte de ROI.
    mesh_points: int = 0
    elapsed_s: float = 0.0


# ── Rasterizado ────────────────────────────────────────────────────────────── #

def _rasterise(poly: vtk.vtkPolyData, voxel_mm: float):
    """Máscara booleana del interior de la malla, con su origen y su paso.

    `vtkPolyDataToImageStencil` en lugar de `vtkSelectEnclosedPoints`: medido,
    42 M de vóxeles en 0.1 s frente a minutos. La voxelización deja de ser el
    cuello de botella y el presupuesto se puede gastar en resolución.
    """
    b = poly.GetBounds()
    pad = voxel_mm * 3.0
    dims = [max(4, int((b[2 * i + 1] - b[2 * i] + 2 * pad) / voxel_mm) + 1) for i in range(3)]

    img = vtk.vtkImageData()
    img.SetDimensions(*dims)
    img.SetOrigin(b[0] - pad, b[2] - pad, b[4] - pad)
    img.SetSpacing(voxel_mm, voxel_mm, voxel_mm)
    img.AllocateScalars(vtk.VTK_UNSIGNED_CHAR, 1)
    img.GetPointData().GetScalars().Fill(1)

    stencil = vtk.vtkPolyDataToImageStencil()
    stencil.SetInputData(poly)
    stencil.SetOutputOrigin(img.GetOrigin())
    stencil.SetOutputSpacing(img.GetSpacing())
    stencil.SetOutputWholeExtent(img.GetExtent())
    stencil.Update()

    cut = vtk.vtkImageStencil()
    cut.SetInputData(img)
    cut.SetStencilData(stencil.GetOutput())
    cut.ReverseStencilOff()
    cut.SetBackgroundValue(0)
    cut.Update()

    flat = vtk_to_numpy(cut.GetOutput().GetPointData().GetScalars())
    # VTK entrega el volumen con el eje X variando más rápido.
    mask = flat.reshape(dims[::-1]).astype(bool).transpose(2, 1, 0)
    return mask, np.array(img.GetOrigin(), dtype=float)


def _fit_voxel_size(poly: vtk.vtkPolyData, wanted: float) -> float:
    """Engorda el vóxel hasta caber en el presupuesto, y lo dice."""
    b = poly.GetBounds()
    span = [max(1.0, b[2 * i + 1] - b[2 * i]) for i in range(3)]
    vs = wanted
    while (span[0] / vs) * (span[1] / vs) * (span[2] / vs) > MAX_VOXELS:
        vs *= 1.25
    if vs > wanted:
        logger.info("Branch scan: voxel %.2f → %.2f mm to fit the budget", wanted, vs)
    return vs


# ── Adyacencia de la superficie ────────────────────────────────────────────── #

def _vertex_neighbours(poly: vtk.vtkPolyData, n_pts: int) -> list[list[int]]:
    """Vecinos de cada vértice por arista de triángulo."""
    polys = poly.GetPolys()
    if polys is None or polys.GetNumberOfCells() == 0:
        return [[] for _ in range(n_pts)]
    conn = vtk_to_numpy(polys.GetConnectivityArray())
    offs = vtk_to_numpy(polys.GetOffsetsArray())
    nbrs: list[set[int]] = [set() for _ in range(n_pts)]
    for a, b in zip(offs[:-1], offs[1:]):
        cell = conn[a:b]
        for i, vi in enumerate(cell):
            for vj in cell:
                if vi != vj:
                    nbrs[int(vi)].add(int(vj))
    return [sorted(s) for s in nbrs]


def _boundary_vertices(poly: vtk.vtkPolyData, n_pts: int) -> np.ndarray:
    """Los vértices que caen en un borde abierto de la malla."""
    edges = vtk.vtkFeatureEdges()
    edges.SetInputData(poly)
    edges.BoundaryEdgesOn()
    edges.FeatureEdgesOff()
    edges.NonManifoldEdgesOff()
    edges.ManifoldEdgesOff()
    edges.Update()
    rim = edges.GetOutput()
    flags = np.zeros(n_pts, dtype=bool)
    if rim.GetNumberOfPoints() == 0:
        return flags
    loc = vtk.vtkPointLocator()
    loc.SetDataSet(poly)
    loc.BuildLocator()
    for i in range(rim.GetNumberOfPoints()):
        j = loc.FindClosestPoint(rim.GetPoint(i))
        if 0 <= j < n_pts:
            flags[j] = True
    return flags


def _components(seed: np.ndarray, nbrs: list[list[int]]) -> list[list[int]]:
    """Regiones conectadas entre los vértices marcados en `seed`."""
    seen = np.zeros(seed.shape[0], dtype=bool)
    out: list[list[int]] = []
    for start in np.where(seed)[0]:
        if seen[start]:
            continue
        stack, group = [int(start)], []
        seen[start] = True
        while stack:
            v = stack.pop()
            group.append(v)
            for w in nbrs[v]:
                if seed[w] and not seen[w]:
                    seen[w] = True
                    stack.append(w)
        out.append(group)
    return out


def _radius_along_normals(poly: vtk.vtkPolyData, pts: np.ndarray,
                          edt: np.ndarray, origin: np.ndarray, vs: float,
                          depth_mm: float = 6.0) -> np.ndarray:
    """El radio del tubo al que pertenece cada vértice.

    Un máximo sobre una ventana cúbica parecía lo natural y no lo es: la ventana
    tiene que ser al menos tan ancha como el radio propio —si no, un punto de la
    pared no llega a ver su propio eje y el calibre sale corto— y en cuanto es
    tan ancha, un punto de la rama alcanza el eje del TRONCO y deja de parecer
    fino. No hay tamaño de ventana que haga las dos cosas.

    Marchar hacia dentro por la normal no tiene ese problema: se entra en el
    tubo propio y se lee su radio, sin fugarse al vecino.
    """
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputData(poly)
    nrm.ComputePointNormalsOn()
    nrm.ComputeCellNormalsOff()
    nrm.SplittingOff()
    nrm.ConsistencyOn()
    nrm.AutoOrientNormalsOn()
    nrm.Update()
    arr = nrm.GetOutput().GetPointData().GetNormals()
    if arr is None or arr.GetNumberOfTuples() != pts.shape[0]:
        logger.warning("Branch scan: no usable point normals; falling back to the "
                       "distance at the vertex itself")
        idx = np.clip(np.round((pts - origin) / vs).astype(int), 0,
                      np.array(edt.shape) - 1)
        return edt[idx[:, 0], idx[:, 1], idx[:, 2]]

    normals = vtk_to_numpy(arr).astype(float)
    shape = np.array(edt.shape)
    best = np.zeros(pts.shape[0], dtype=float)
    steps = max(2, int(round(depth_mm / vs)))
    # Los dos sentidos, en lugar de fiarse de la orientación: el que sale de la
    # malla cae en vacío, donde la distancia al borde es 0, y no aporta nada al
    # máximo. Así el resultado no depende de si `AutoOrientNormals` acertó.
    for sign in (-1.0, 1.0):
        alive = np.ones(pts.shape[0], dtype=bool)
        for k in range(1, steps + 1):
            if not alive.any():
                break
            probe = pts + sign * normals * (k * vs)
            idx = np.clip(np.round((probe - origin) / vs).astype(int), 0, shape - 1)
            sample = edt[idx[:, 0], idx[:, 1], idx[:, 2]]
            # La marcha se detiene al SALIR del vaso. Sin esto, seguir andando
            # seis milímetros en un árbol denso entra en el vaso de al lado y le
            # presta su radio: un capilar pegado a la carótida se leería grueso.
            alive &= sample > 0.0
            np.maximum(best, np.where(alive, sample, 0.0), out=best)
    return best


# ── API pública ────────────────────────────────────────────────────────────── #

def scan_branch_origins(
    vessel_poly: vtk.vtkPolyData,
    voxel_mm: float = DEFAULT_VOXEL_MM,
    max_branch_radius_mm: float = BRANCH_MAX_RADIUS_MM,
    min_parent_ratio: float = MIN_PARENT_RATIO,
    min_vertices: int = MIN_BRANCH_VERTICES,
) -> BranchScan:
    """Barre la malla entera buscando vasos finos pegados a vasos gruesos.

    No necesita el cuello del aneurisma: es una propiedad de la malla. Por eso
    puede correr en cuanto existe el árbol vascular, ANTES de cualquier recorte
    de ROI — que es el único momento en que todas las ramas siguen ahí, porque
    el recorte sobrescribe `vessel_tree.vtp` y lo que queda fuera se pierde.
    """
    t0 = time.time()
    n_pts = vessel_poly.GetNumberOfPoints() if vessel_poly else 0
    if n_pts == 0:
        return BranchScan(voxel_mm=voxel_mm)

    vs = _fit_voxel_size(vessel_poly, voxel_mm)
    mask, origin = _rasterise(vessel_poly, vs)
    if not mask.any():
        logger.warning("Branch scan: the mesh rasterised to an empty interior")
        return BranchScan(voxel_mm=vs, calibre_floor_mm=2 * vs, mesh_points=n_pts)

    edt = distance_transform_edt(mask) * vs
    pts = vtk_to_numpy(vessel_poly.GetPoints().GetData()).astype(float)
    radius = _radius_along_normals(vessel_poly, pts, edt, origin, vs)

    thin = radius <= max_branch_radius_mm
    # Un borde abierto no es una rama. Recortar a una caja o una esfera deja un
    # aro de corte, y ese aro se lee fino y pegado a algo grueso: medido sobre el
    # árbol de prueba recortado, inventaba un origen en x=-4.3 donde no hay
    # ninguna unión. La malla completa no tiene bordes, así que esto no le quita
    # nada; a la recortada le quita justo lo que el corte añadió.
    thin[_boundary_vertices(vessel_poly, n_pts)] = False
    nbrs = _vertex_neighbours(vessel_poly, n_pts)
    origins: list[BranchOrigin] = []

    for group in _components(thin, nbrs):
        if len(group) < min_vertices:
            continue
        g = np.asarray(group)
        # La madre: lo más grueso que toca esta región sin ser parte de ella.
        parent = 0.0
        boundary: list[int] = []
        for v in group:
            for w in nbrs[v]:
                if not thin[w]:
                    boundary.append(v)
                    parent = max(parent, float(radius[w]))
        if not boundary or parent <= 0:
            continue                      # una rama suelta, sin nada de lo que nacer
        branch_r = float(np.median(radius[g]))
        if branch_r <= 0 or parent / branch_r < min_parent_ratio:
            continue                      # un vaso que se estrecha no es una rama

        # El origen es donde se pega, no la punta: el punto de la frontera.
        seat = pts[np.asarray(sorted(set(boundary)))].mean(axis=0)
        origins.append(BranchOrigin(
            index=len(origins),
            position=(float(seat[0]), float(seat[1]), float(seat[2])),
            calibre_mm=round(2.0 * branch_r, 2),
            parent_calibre_mm=round(2.0 * parent, 2),
            n_vertices=len(group),
        ))

    origins.sort(key=lambda o: o.calibre_mm)
    for i, o in enumerate(origins):
        o.index = i

    scan = BranchScan(
        origins=origins, voxel_mm=vs, calibre_floor_mm=round(2 * vs, 2),
        mesh_points=n_pts, elapsed_s=round(time.time() - t0, 2),
    )
    logger.info("Branch scan — %d origins on %d points at %.2f mm/voxel in %.1f s "
                "(calibre floor %.1f mm)", len(origins), n_pts, vs,
                scan.elapsed_s, scan.calibre_floor_mm)
    return scan


# ── Congelado en la sesión ─────────────────────────────────────────────────── #

STATE_KEY = "branches.scan_json"


def freeze_scan(session_id: str, scan: BranchScan) -> None:
    """Guarda el barrido para que sobreviva a un recorte de ROI.

    El recorte SOBRESCRIBE `vessel_tree.vtp` —su propia descripción dice «re-run
    segmentation to restore»— así que las ramas de fuera de la caja desaparecen
    del fichero para siempre. Barrer después de recortar no las encuentra
    porque ya no están; barrer antes y guardar las coordenadas de mundo sí, y
    esas coordenadas siguen valiendo sobre la malla recortada porque el sistema
    de referencia es el mismo. Por eso los marcadores se quedan donde estaban.
    """
    import json

    from services.sessions import write_state

    write_state(session_id, STATE_KEY, json.dumps({
        "voxel_mm": scan.voxel_mm,
        "calibre_floor_mm": scan.calibre_floor_mm,
        "mesh_points": scan.mesh_points,
        "elapsed_s": scan.elapsed_s,
        "origins": [
            {"index": o.index, "position": list(o.position),
             "calibre_mm": o.calibre_mm, "parent_calibre_mm": o.parent_calibre_mm,
             "n_vertices": o.n_vertices}
            for o in scan.origins
        ],
    }))


def thaw_scan(session_id: str) -> BranchScan | None:
    """El barrido congelado, o None si esta sesión no tiene ninguno."""
    import json

    from services.sessions import read_state

    raw = read_state(session_id, STATE_KEY, "")
    if not raw:
        return None
    try:
        d = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return BranchScan(
        origins=[BranchOrigin(index=o["index"], position=tuple(o["position"]),
                              calibre_mm=o["calibre_mm"],
                              parent_calibre_mm=o["parent_calibre_mm"],
                              n_vertices=o["n_vertices"])
                 for o in d.get("origins", [])],
        voxel_mm=float(d.get("voxel_mm", DEFAULT_VOXEL_MM)),
        calibre_floor_mm=float(d.get("calibre_floor_mm", 0.0)),
        mesh_points=int(d.get("mesh_points", 0)),
        elapsed_s=float(d.get("elapsed_s", 0.0)),
    )


def scan_and_freeze(session_id: str, vessel_poly: vtk.vtkPolyData) -> BranchScan:
    """Barre el árbol completo y lo congela. Pensado para justo tras segmentar."""
    scan = scan_branch_origins(vessel_poly)
    freeze_scan(session_id, scan)
    return scan


# ── Contra el clip colocado ────────────────────────────────────────────────── #

#: Hasta dónde se mira. Más allá de esto una rama no está en la línea de cierre,
#: está en otro sitio del campo.
NEAR_CLIP_MM: float = 3.0


@dataclass
class BranchUnderClip:
    """Una rama que el clip colocado alcanza, y a qué distancia."""

    index: int
    position: tuple[float, float, float]
    calibre_mm: float
    distance_to_clip_mm: float


def branches_under_clip(session_id: str, clips_world: vtk.vtkPolyData,
                        within_mm: float = NEAR_CLIP_MM) -> list[BranchUnderClip]:
    """Ramas a menos de `within_mm` de la GEOMETRÍA del clip ya colocado.

    Contra la malla del clip, no contra el centro del cuello. La longitud de la
    mordaza es justo lo que decide hasta dónde llega la línea de cierre, así que
    medir contra el cuello daría la misma respuesta para una mordaza de 7 mm y
    otra de 22, que es la pregunta que se está haciendo.

    Sigue sin ser una perforante: son orígenes de rama visibles, con el suelo de
    calibre que el barrido declara. Lo que esto añade es que el aviso deje de
    vivir en una tarjeta plegable de morfometría y llegue al sitio donde se
    elige la pieza.
    """
    scan = thaw_scan(session_id)
    if scan is None or not scan.origins or clips_world is None:
        return []
    if clips_world.GetNumberOfPoints() == 0:
        return []

    # Distancia a la SUPERFICIE, no al vértice más cercano. Un localizador de
    # puntos mide contra la teselación: sobre una hoja de pocos vértices —o
    # sobre cualquier zona de malla gruesa— la esquina más próxima puede estar
    # varios milímetros más lejos que la cara, y una rama que el clip cruza se
    # queda fuera del aviso.
    dist = vtk.vtkImplicitPolyDataDistance()
    dist.SetInput(clips_world)

    out: list[BranchUnderClip] = []
    for o in scan.origins:
        d = abs(float(dist.EvaluateFunction(*o.position)))
        if d <= within_mm:
            out.append(BranchUnderClip(
                index=o.index, position=o.position, calibre_mm=o.calibre_mm,
                distance_to_clip_mm=round(d, 2),
            ))
    out.sort(key=lambda b: b.distance_to_clip_mm)
    return out
