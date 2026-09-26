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

0. los sitios de **borde** (una región de curvatura que toca una cara de la
   caja de la malla) van detrás de todos los demás — ver `region_on_border`;
1. **mejor puesto** que el candidato consigue en cualquier canal, ascendente;
2. a igualdad, **cuántos canales** lo encuentran, descendente;
3. a igualdad, la **suma de puestos**, ascendente;
4. a igualdad total, el **orden de los canales**: curvatura, calibre, cociente
   (el canal más prioritario que lo encuentra). Es el orden en que `consensus`
   los añade, así que no cambia nada: lo hace explícito. Y decide casos reales:
   en la malla de umbral de Case 3 la lesión (calibre 1.º) empata en todo con
   el 1.º de curvatura y va 3.ª por esta regla.

Ordenar por «mejor puesto» y no por acuerdo es deliberado. Esto es una lista
corta para que un clínico la recorra, así que importa más no perder la lesión
que acertar la primera: en case 3 la lesión confirmada la encuentra **un solo
canal**, y un consenso que premiara el acuerdo la habría enterrado.

Ordenar por mejor puesto es, además, una **cuota por canal**: todo sitio que
es 1.º o 2.º de algún canal va por delante de cualquiera que no lo sea, así que
los dos primeros de cada canal entran siempre en la lista (con 5 plazas y tres
canales, todos menos a lo sumo un 2.º). Task 11 bis midió las alternativas
sobre Case 3 —malla tubular nativa con «solo el árbol», la completa, y la de
umbral de 12 800 vértices— con la curvatura ya sobre la copia de 80 000:

- mejor puesto (esta regla): lesión 3.ª, 2.ª y 3.ª;
- acuerdo primero (≥ 2 canales delante): 5.ª, 2.ª y 6.ª — en la tubular la
  lesión la apoya un solo canal (curvatura 2.º) y en la de umbral otro
  (calibre 1.º), y por delante se cuelan acuerdos de puestos 3 a 6;
- veto de sitios planos de calibre/cociente (relación λ3/λ2 de la vecindad,
  radios de 4 a 8 mm): ningún umbral separa la placa que va 1.ª de la lesión,
  que en la malla de umbral da valores dentro del mismo rango.

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

from services.aneurysm_detector import (AneurysmCandidate, AneurysmDetector,
                                       DetectionResult)
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

#: Distancia a una cara de la caja de la malla por debajo de la cual una región
#: de curvatura es de borde. Por qué 1 mm y no un vóxel: la tapa que deja el
#: relleno de un vóxel donde un vaso sale del volumen quedó, en Case 3, a
#: 0,36 mm de la cara z (vóxel de 0,32 mm), porque el preset XA suaviza su
#: copia antes de buscar; las regiones interiores de Case 3 quedaron a ≥ 6 mm
#: de toda cara, así que 1 mm separa las dos cosas con margen.
BORDER_TOL_MM: float = 1.0

#: El 4.º desempate de `order_hits`: el canal más prioritario que encuentra el sitio.
_CHANNEL_ORDER = {"curvatura": 0, "calibre": 1, "cociente": 2}

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
    #: La región de curvatura toca una cara de la caja de la malla: la tapa de
    #: un vaso cortado por el borde del volumen, no anatomía.
    on_border: bool = False

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
              top: int = 5, *,
              geometric_poly: vtk.vtkPolyData | None = None,
              curvature_result: "DetectionResult | None" = None) -> list[ConsensusHit]:
    """Los `top` sitios mejor puntuados por el consenso de los tres canales.

    La curvatura se busca sobre `poly`. Calibre y cociente, sobre
    `geometric_poly` si se da (y si no, sobre la misma `poly`): los canales
    geométricos se apagan por encima de 40 000 vértices, mientras que la
    curvatura necesita más resolución —sobre la malla tubular de Case 3
    decimada a 40 000 perdía la región de la lesión; `routers.detect` le pasa
    una copia de hasta 80 000—. Sus sitios son
    coordenadas de mundo, así que se fusionan igual vengan de una malla o de
    la otra.

    `curvature_result`, si se da, es `detector.detect(poly)` ya calculado:
    quien necesita también los diagnósticos no tiene por qué pagar la
    curvatura dos veces.
    """
    hits: list[ConsensusHit] = []
    geo = poly if geometric_poly is None else geometric_poly

    # ── Canal 1: curvatura ────────────────────────────────────────────── #
    det = curvature_result if curvature_result is not None else detector.detect(poly)
    bounds = poly.GetBounds()
    for rank, c in enumerate(det.candidates, start=1):
        hits.append(ConsensusHit(position=tuple(float(v) for v in c.centroid),
                                 ranks={CH_CURVATURE: rank}, candidate=c,
                                 on_border=region_on_border(c.poly_data, bounds)))

    # ── Canales 2 y 3: calibre y cociente ─────────────────────────────── #
    #
    # Solo si la malla es un árbol vascular. En angio-TC el contraste toca el
    # hueso y la malla es la cabeza entera: allí «lo más grueso» son 12,6 mm de
    # radio de cráneo, no un saco. Y encima tarda 52 s.
    if _geometric_channels_apply(geo):
        try:
            pts, rad = local_calibre(geo)
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

    return order_hits(hits)[:top]


def order_hits(hits: list[ConsensusHit]) -> list[ConsensusHit]:
    """El orden de la lista corta: borde al final; mejor puesto; más canales;
    menor suma; y el orden de los canales.

    Es una cuota por canal y no un premio al acuerdo: ver «Cómo se ordena» en
    el docstring del módulo, con las cifras de Case 3 que lo decidieron.

    Los sitios de borde van al final, pero se quedan en la lista: las tapas
    que el relleno de un vóxel pone donde un vaso sale del volumen son
    artefactos del borde del volumen, no anatomía, y su anillo tiene mucha
    curvatura. En Case 3 (malla tubular, «solo el árbol») la tapa de z ≈ 2 mm
    era el 1.º de curvatura y dejaba la lesión 3.ª.

    Salvedad: «borde» se mide contra la caja de la MALLA, que solo coincide
    con el borde del volumen en las caras por donde sale algún vaso (dos de
    seis en Case 3: y mínima y z mínima). En las demás la caja es anatomía, y
    una cúpula real en el extremo del árbol en esa cara iría al final de la
    lista (nunca fuera de ella). El arreglo exacto es pasar la extensión del
    volumen a `routers.detect._detect_hits`; es un cambio de interfaz y queda
    pendiente.
    """
    return sorted(hits, key=lambda h: (
        h.on_border, h.best_rank, -len(h.ranks), h.rank_sum,
        min((_CHANNEL_ORDER.get(c, len(_CHANNEL_ORDER)) for c in h.ranks),
            default=len(_CHANNEL_ORDER))))


def region_on_border(region: vtk.vtkPolyData, mesh_bounds,
                     tol_mm: float = BORDER_TOL_MM) -> bool:
    """¿Toca la caja de la región una cara de la caja de la malla?

    En cualquier eje y en cualquiera de las dos caras, a menos de `tol_mm`.
    Con el relleno de un vóxel de `mask_to_surface`, una cara de la caja de la
    malla es borde del volumen SOLO si por ella sale algún vaso (en Case 3,
    dos de seis); allí tocarla es estar en la tapa de un vaso cortado. En las
    otras caras la caja es anatomía y una cúpula real en el extremo del árbol
    también la toca: se degradaría al final de la lista, nunca se quitaría.
    Lo exacto sería comparar con la extensión del volumen, pasándola a
    `routers.detect._detect_hits` (cambio de interfaz, pendiente).
    """
    if region is None or region.GetNumberOfPoints() == 0:
        return False
    rb = region.GetBounds()
    return any(rb[2 * k] - mesh_bounds[2 * k] <= tol_mm
               or mesh_bounds[2 * k + 1] - rb[2 * k + 1] <= tol_mm
               for k in range(3))


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


#: Qué es lo que se pinta de azul en el visor.
PATCH_REGION = "region"     # la región que el canal de curvatura detectó
PATCH_LOCATOR = "locator"   # una bola alrededor del punto: dice DÓNDE, no QUÉ


def hit_patch(poly: vtk.vtkPolyData,
              hit: ConsensusHit) -> tuple[vtk.vtkPolyData, str]:
    """Lo que se dibuja para este sitio, y qué significa.

    Hay dos cosas distintas y conviene no confundirlas:

    - **region** — el canal de curvatura detecta una REGIÓN de superficie, y
      eso es lo que se pinta. El azul es entonces lo que el detector marcó.
    - **locator** — los canales geométricos proponen un PUNTO. Para poder
      pintarlo se recorta una bola a su alrededor, así que el azul enseña
      **dónde mirar, no qué parte es la lesión**: incluye pared de vaso
      alrededor.

    Se intentó delimitar el bulto de verdad creciendo por calibre desde el
    punto mientras superase el del vaso vecino. **No funciona**: el tronco es
    genuinamente grueso, así que la región se derrama por él — medido sobre
    case 3, 31 mm de extensión para una lesión de unos 5. Separar saco de
    arteria gruesa necesita el cuello, que es justo lo que el usuario marca a
    mano en Morfometría.

    En ninguno de los dos casos esto altera la morfometría: sobre un parche
    abierto `MorphometricAnalyzer` devuelve `reliable=False` y anula volumen,
    cuello e índices. La medida sale del plano de cuello marcado, que vuelve a
    aislar el saco desde el VOLUMEN.
    """
    if hit.candidate is not None:
        return hit.candidate.poly_data, PATCH_REGION

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
    return cl.GetOutput(), PATCH_LOCATOR


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
