# -*- coding: utf-8 -*-
"""Tres criterios independientes, y un consenso entre ellos.

Por qué hacía falta
-------------------
El detector de `aneurysm_detector.py` busca **curvatura**: regiones de la
superficie que se abomban. Sobre case 3 devolvía cinco candidatos y los cinco
caían en la chapa de la parte inferior de la malla —bordes dentados, que dan
curvatura alta— mientras que la lesión que el usuario confirma, en el tronco,
no salía en ninguno.

Medido sobre esa malla: la lesión es **el punto de mayor calibre de todo el
árbol** (radio 2,33 mm contra una mediana de 0,57). No destaca por curvatura;
destaca por grosor. Un solo criterio no podía encontrarla.

Los tres canales
----------------
- **curvatura** — el detector de siempre, tal cual. Encuentra cúpulas.
- **calibre** — radio local por marcha de normales sobre la transformada de
  distancia, la misma máquina que `branch_origins`. Encuentra bultos gruesos.
- **cociente** — calibre local dividido por el del anillo de 6 a 14 mm
  alrededor. Encuentra lo que es gordo *para su vecindario*, que es como se
  distingue un saco de una arteria que simplemente es ancha.

Cómo se ordena, y por qué así
-----------------------------
Con **un solo punto anotado** no se pueden ajustar pesos: cualquier fórmula que
inventase estaría afinada a un caso. Así que el orden es por reglas declaradas
y sin aritmética inventada:

1. **mejor puesto** que el candidato consigue en cualquier canal, ascendente;
2. a igualdad, **cuántos canales** lo encuentran, descendente;
3. a igualdad, la **suma de puestos**, ascendente.

Ordenar por «mejor puesto» y no por acuerdo es deliberado. Esto es una lista
corta para que un clínico la recorra, así que importa más no perder la lesión
que acertar la primera: en case 3 la lesión confirmada la encuentra **un solo
canal**, y un consenso que premiara el acuerdo la habría enterrado.

Qué NO se promete
-----------------
Que el primero sea el bueno. Hay un punto anotado, no un conjunto de
validación. Lo que estos tres canales cambian es que la lesión **entra** en la
lista, que antes no entraba.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import vtk
from scipy import ndimage, spatial

from services.aneurysm_detector import AneurysmCandidate, AneurysmDetector
from services.branch_origins import _fit_voxel_size, _rasterise
from services.mesh_components import describe_components, looks_like_tree

logger = logging.getLogger(__name__)

# ── Parámetros de los canales geométricos ─────────────────────────────────── #

#: Vóxel de la rasterización. Medido: 0.4 mm resuelve un vaso de 1 mm de
#: diámetro sin disparar la memoria en una malla de 12 000 vértices.
VOXEL_MM: float = 0.4

#: Hasta dónde se marcha hacia dentro buscando el eje. Un saco de 20 mm de
#: diámetro ya es gigante, así que 12 mm de radio sobra.
MARCH_MM: float = 12.0

#: El anillo con el que se compara el calibre local. Dentro de 6 mm todavía es
#: el propio bulto; más allá de 14 mm ya es otra parte del árbol.
RING_INNER_MM: float = 6.0
RING_OUTER_MM: float = 14.0

#: Separación mínima entre dos picos del mismo canal. Por debajo son el mismo
#: sitio contado dos veces.
PEAK_SEP_MM: float = 10.0

#: Distancia a la que dos canales se consideran de acuerdo sobre un sitio.
AGREE_MM: float = 8.0

#: Cuántos picos pide cada canal geométrico antes de fusionar.
PEAKS_PER_CHANNEL: int = 6

#: Por encima de esto los canales geométricos no se ejecutan. En una malla de
#: 79 000 vértices tardaban 52 s, y ese tamaño solo lo alcanza una angio-TC —
#: donde además no significan nada, porque la malla es la cabeza entera.
MAX_VERTS_GEOMETRIC: int = 40_000

CH_CURVATURE = "curvatura"
CH_CALIBRE = "calibre"
CH_RATIO = "cociente"


@dataclass
class ConsensusHit:
    """Un sitio propuesto, con lo que cada canal opina de él."""

    position: tuple[float, float, float]
    #: Canal → puesto (1 = el mejor de ese canal).
    ranks: dict[str, int] = field(default_factory=dict)
    radius_mm: float = 0.0
    ratio: float = 0.0
    #: El candidato del detector de curvatura, si algún canal fue ese.
    candidate: AneurysmCandidate | None = None

    @property
    def channels(self) -> list[str]:
        return sorted(self.ranks)

    @property
    def best_rank(self) -> int:
        return min(self.ranks.values()) if self.ranks else 10_000

    @property
    def rank_sum(self) -> int:
        return sum(self.ranks.values()) if self.ranks else 10_000


def local_calibre(poly: vtk.vtkPolyData,
                  voxel_mm: float = VOXEL_MM) -> tuple[np.ndarray, np.ndarray]:
    """Radio local de cada vértice, en mm.

    Rasteriza la malla, saca la transformada de distancia y para cada vértice
    marcha hacia dentro siguiendo su normal, quedándose con la mayor distancia
    al borde que encuentra. Se prueban las dos direcciones porque la normal
    puede salir orientada hacia fuera: la que sale al vacío lee cero y no
    aporta.
    """
    vs = _fit_voxel_size(poly, voxel_mm)
    mask, origin = _rasterise(poly, vs)
    edt = ndimage.distance_transform_edt(mask, sampling=(vs, vs, vs))
    shape = np.array(edt.shape) - 1

    nf = vtk.vtkPolyDataNormals()
    nf.SetInputData(poly)
    nf.ComputePointNormalsOn()
    nf.SplittingOff()
    nf.AutoOrientNormalsOn()
    nf.Update()
    out = nf.GetOutput()

    n = out.GetNumberOfPoints()
    pts = np.asarray([out.GetPoint(i) for i in range(n)])
    arr = out.GetPointData().GetNormals()
    nrm = np.asarray([arr.GetTuple3(i) for i in range(n)])

    best = np.zeros(n)
    steps = max(1, int(round(MARCH_MM / vs)))
    for sign in (-1.0, 1.0):
        alive = np.ones(n, dtype=bool)
        for k in range(1, steps + 1):
            if not alive.any():
                break
            probe = pts + sign * nrm * (k * vs)
            idx = np.clip(np.round((probe - origin) / vs).astype(int), 0, shape)
            sample = edt[idx[:, 0], idx[:, 1], idx[:, 2]]
            alive &= sample > 0.0
            np.maximum(best, np.where(alive, sample, 0.0), out=best)
    return pts, best


def calibre_ratio(pts: np.ndarray, radius: np.ndarray,
                  floor: float = 0.0) -> np.ndarray:
    """Calibre local dividido por el del anillo que lo rodea.

    Una arteria ancha es ancha también a su alrededor, así que da ~1. Un saco
    sobresale de su vecindario y da más.

    Solo se calcula para los vértices que superan `floor`: los finos no van a
    ser candidatos y consultar el árbol k-d para todos multiplicaba el tiempo
    por diez sin cambiar el resultado.
    """
    tree = spatial.cKDTree(pts)
    out = np.ones(len(pts))
    interesantes = np.where(radius >= floor)[0]
    if interesantes.size == 0:
        return out
    outer = tree.query_ball_point(pts[interesantes], RING_OUTER_MM)
    inner = tree.query_ball_point(pts[interesantes], RING_INNER_MM)
    for k, i in enumerate(interesantes):
        ring = np.setdiff1d(np.asarray(outer[k]), np.asarray(inner[k]))
        if ring.size < 20:
            continue
        base = float(np.median(radius[ring]))
        if base > 0.05:
            out[i] = radius[i] / base
    return out


def _peaks(pts: np.ndarray, value: np.ndarray, radius: np.ndarray,
           min_radius: float, n: int = PEAKS_PER_CHANNEL) -> list[int]:
    """Los `n` máximos de `value`, separados entre sí y con calibre mínimo."""
    chosen: list[int] = []
    for i in np.argsort(-value):
        if radius[i] < min_radius:
            continue
        if all(float(np.linalg.norm(pts[i] - pts[j])) > PEAK_SEP_MM
               for j in chosen):
            chosen.append(int(i))
        if len(chosen) >= n:
            break
    return chosen


def consensus(poly: vtk.vtkPolyData, detector: AneurysmDetector,
              top: int = 5) -> list[ConsensusHit]:
    """Los `top` sitios mejor puntuados por el consenso de los tres canales."""
    hits: list[ConsensusHit] = []

    # ── Canal 1: curvatura ────────────────────────────────────────────── #
    det = detector.detect(poly)
    for rank, c in enumerate(det.candidates, start=1):
        hits.append(ConsensusHit(position=tuple(float(v) for v in c.centroid),
                                 ranks={CH_CURVATURE: rank}, candidate=c))

    # ── Canales 2 y 3: calibre y cociente ─────────────────────────────── #
    #
    # Solo si la malla es un árbol vascular. En angio-TC el contraste toca el
    # hueso y la malla es la cabeza entera: allí «lo más grueso» son 12,6 mm de
    # radio de cráneo, no un saco. Y encima tarda 52 s.
    if _geometric_channels_apply(poly):
        try:
            pts, rad = local_calibre(poly)
        except Exception as exc:  # noqa: BLE001 — sin calibre queda la curvatura
            logger.warning("Canal de calibre no disponible: %s", exc)
            pts = rad = None

        if pts is not None and len(pts):
            # El suelo de calibre es RELATIVO al árbol: uno de carótida es más
            # grueso que uno de vertebral, y un umbral en mm favorecería a uno.
            floor = max(0.8, float(np.percentile(rad, 90)))
            ratio = calibre_ratio(pts, rad, floor)
            for channel, value in ((CH_CALIBRE, rad), (CH_RATIO, ratio)):
                for rank, i in enumerate(_peaks(pts, value, rad, floor), start=1):
                    _merge(hits, tuple(float(v) for v in pts[i]), channel, rank,
                           float(rad[i]), float(ratio[i]))

    # Puestos bajos primero; a igualdad, más canales; luego menor suma.
    hits.sort(key=lambda h: (h.best_rank, -len(h.ranks), h.rank_sum))
    return hits[:top]


def _geometric_channels_apply(poly: vtk.vtkPolyData) -> bool:
    """¿Tiene sentido medir calibre en esta malla?

    Dos motivos para que no: que sea enorme (una angio-TC, donde tarda casi un
    minuto) o que no sea un árbol vascular (la misma angio-TC, donde la malla
    es un bloque de cabeza y el calibre mide cráneo).
    """
    n = poly.GetNumberOfPoints()
    if n == 0 or n > MAX_VERTS_GEOMETRIC:
        logger.info("Canales geométricos omitidos: %d vértices", n)
        return False
    comps = describe_components(poly)
    if not comps:
        return False
    ok, motivo = looks_like_tree(comps[0])
    if not ok:
        logger.info("Canales geométricos omitidos: %s", motivo)
    return ok


def _merge(hits: list[ConsensusHit], position, channel: str, rank: int,
           radius_mm: float, ratio: float) -> None:
    """Suma un pico a un sitio ya propuesto, o lo añade como sitio nuevo."""
    p = np.asarray(position)
    for h in hits:
        if float(np.linalg.norm(p - np.asarray(h.position))) <= AGREE_MM:
            # Un canal no vota dos veces el mismo sitio: se queda su mejor puesto.
            h.ranks[channel] = min(rank, h.ranks.get(channel, rank))
            h.radius_mm = max(h.radius_mm, radius_mm)
            h.ratio = max(h.ratio, ratio)
            return
    hits.append(ConsensusHit(position=position, ranks={channel: rank},
                             radius_mm=radius_mm, ratio=ratio))


def hit_patch(poly: vtk.vtkPolyData, hit: ConsensusHit) -> vtk.vtkPolyData:
    """Un trozo de malla alrededor del sitio, para poder dibujarlo.

    Los canales geométricos proponen un PUNTO, no una región: el visor necesita
    algo que pintar. Se recorta la esfera de radio proporcional al calibre
    estimado, con un mínimo para que un bulto pequeño siga siendo visible.
    """
    if hit.candidate is not None:
        return hit.candidate.poly_data

    r = max(3.0, hit.radius_mm * 1.8)
    sphere = vtk.vtkSphere()
    sphere.SetCenter(*hit.position)
    sphere.SetRadius(r)
    clip = vtk.vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(sphere)
    clip.InsideOutOn()
    clip.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(clip.GetOutputPort())
    cl.Update()
    return cl.GetOutput()


def hit_diameter_mm(hit: ConsensusHit) -> float:
    """Diámetro estimado del sitio, venga del canal que venga."""
    if hit.candidate is not None:
        return float(hit.candidate.diameter_mm)
    return float(hit.radius_mm * 2.0)


def hit_confidence(hit: ConsensusHit) -> float:
    """Una cifra para la barra de la pantalla, declarada como lo que es.

    No es una probabilidad y no está calibrada contra nada: es el puesto
    convertido en [0, 1] y subido un poco cuando más de un canal coincide.
    Sirve para ordenar visualmente, y la pantalla dice que no es más que eso.
    """
    if hit.candidate is not None and len(hit.ranks) == 1:
        return float(hit.candidate.score)
    base = 1.0 / (1.0 + 0.45 * (hit.best_rank - 1))
    acuerdo = 0.10 * (len(hit.ranks) - 1)
    return float(min(1.0, base + acuerdo))
