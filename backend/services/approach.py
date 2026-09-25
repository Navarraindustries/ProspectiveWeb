# -*- coding: utf-8 -*-
"""Qué hay dentro del corredor de abordaje, y qué se pondría por delante.

Lo que había
------------
La trayectoria eran dos puntos y un cilindro pintado: se guardaba la entrada y
la diana, se devolvía la profundidad y el ángulo, y eso llegaba al informe.
Nada miraba qué atraviesa el corredor, así que no podía decir si el abordaje es
viable ni influir en la elección del clip.

Lo que mide esto
----------------
El corredor es un cilindro de `radius_mm` entre los dos puntos. Se lanza un haz
de rayos paralelos por su sección y se cruzan contra la malla vascular y contra
el volumen:

- **Vasos atravesados.** Cada rayo entra y sale de la malla; los tramos que
  quedan FUERA de la esfera de exclusión alrededor de la diana son vasos que el
  corredor cruza de camino. El aneurisma y su cuello no cuentan: son el
  objetivo, no un obstáculo.
- **Calibre de cada cruce.** La cuerda más larga que un rayo hace dentro de esa
  pieza aproxima su diámetro. Es una estimación de la malla y se dice así; si el
  barrido de ramas congelado tiene un origen cerca, manda su calibre medido.
- **Ramas próximas.** Lo que el corredor no cruza pero roza: la distancia al
  origen de rama más cercano, con su calibre.
- **Tejido denso fuera de la vasculatura.** Aquí hay que tener cuidado con lo
  que se promete. El hueso NO se puede separar del contraste por intensidad —
  medido en case 3, el 99 % del hueso cae dentro del rango del propio árbol— y
  en una DSA sustraída directamente no hay ni hueso ni tejido en la imagen. Así
  que no se mide «hueso»: se miden vóxeles densos que caen FUERA de la malla
  vascular, que es lo que la conectividad sí sabe separar, y se etiquetan como
  lo que son.

Lo que NO hace
--------------
No dice qué craneotomía hacer. Para eso haría falta el cráneo y la piel
segmentados, que no están, y nombrar un abordaje —pterional, subtemporal— sin
esa geometría sería ponerle a un corredor un nombre que no ha calculado.

Tampoco puntúa. El veredicto es de tres estados y sale de reglas explícitas
sobre lo medido, no de una suma de pesos: la misma razón por la que el motor de
tratamiento dejó de enseñar cifras.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import vtk

logger = logging.getLogger(__name__)

#: Radio del corredor de trabajo. El clip entra en la punta de un aplicador, y
#: alrededor hace falta sitio para la mano y para ver. SUPUESTO de este
#: software: nadie ha firmado cuánto espacio pide un abordaje, así que se
#: publica con el resultado para que se pueda discutir y cambiar.
DEFAULT_CORRIDOR_RADIUS_MM: float = 5.0

#: Alrededor de la diana no se cuentan obstáculos: ahí está el aneurisma y su
#: cuello, que son el objetivo. Se amplía con el tamaño del saco cuando se
#: conoce.
TARGET_CLEARANCE_MM: float = 6.0

#: Un vaso de este calibre o más en mitad del corredor no se aparta: el
#: abordaje tiene que ir por otro sitio. Por debajo puede ser una vena o una
#: rama fina que se moviliza, y eso ya es juicio del cirujano.
BLOCKING_VESSEL_MM: float = 1.5

#: Rozar un origen de rama a menos de esto es motivo para mirarlo dos veces.
BRANCH_WARN_MM: float = 2.0

Verdict = Literal["viable", "revisar", "no_viable"]


@dataclass
class VesselCrossing:
    """Un vaso que el corredor atraviesa antes de llegar a la diana."""

    distance_from_entry_mm: float
    position: tuple[float, float, float]
    calibre_mm: float
    #: "malla" (cuerda medida sobre la superficie) o "barrido" (rama congelada).
    calibre_source: str


@dataclass
class CorridorAssessment:
    """Lo que hay dentro del corredor, y qué se concluye de ello."""

    depth_mm: float
    angle_deg: float
    radius_mm: float
    vessels_crossed: list[VesselCrossing] = field(default_factory=list)
    nearest_branch_mm: float | None = None
    nearest_branch_calibre_mm: float = 0.0
    dense_tissue_mm: float = 0.0
    dense_tissue_measurable: bool = True
    verdict: Verdict = "viable"
    verdict_reason: str = ""
    findings: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)


# ── Geometría del haz ─────────────────────────────────────────────────────── #

def _basis(axis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Dos direcciones perpendiculares al eje, para repartir los rayos."""
    ref = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(axis, ref))) > 0.9:
        ref = np.array([1.0, 0.0, 0.0])
    u = np.cross(axis, ref)
    u /= np.linalg.norm(u) or 1.0
    v = np.cross(axis, u)
    v /= np.linalg.norm(v) or 1.0
    return u, v


def _ray_origins(entry: np.ndarray, axis: np.ndarray, radius_mm: float,
                 rings: int = 2, per_ring: int = 8) -> list[np.ndarray]:
    """El eje más varios anillos: un solo rayo central no ve un vaso de lado."""
    u, v = _basis(axis)
    puntos = [entry.copy()]
    for k in range(1, rings + 1):
        r = radius_mm * k / rings
        for i in range(per_ring):
            a = 2.0 * math.pi * i / per_ring
            puntos.append(entry + u * (r * math.cos(a)) + v * (r * math.sin(a)))
    return puntos


def _segments_along_ray(tree: vtk.vtkOBBTree, p0: np.ndarray, p1: np.ndarray
                        ) -> list[tuple[float, float]]:
    """Tramos [t_entrada, t_salida] en mm donde el rayo va DENTRO de la malla."""
    pts = vtk.vtkPoints()
    if tree.IntersectWithLine(p0.tolist(), p1.tolist(), pts, None) == 0:
        return []
    n = pts.GetNumberOfPoints()
    if n == 0:
        return []
    d = [float(np.linalg.norm(np.asarray(pts.GetPoint(i)) - p0)) for i in range(n)]
    d.sort()
    # Las intersecciones vienen en pares entrada/salida. Un número impar
    # significa que un extremo del rayo cae dentro de la malla; se cierra con el
    # extremo para no perder ese tramo.
    if len(d) % 2 == 1:
        d.append(float(np.linalg.norm(p1 - p0)))
    return [(d[i], d[i + 1]) for i in range(0, len(d) - 1, 2)]


def _cluster(valores: list[tuple[float, float]], tol_mm: float = 3.0
             ) -> list[tuple[float, float]]:
    """Agrupa tramos de rayos vecinos que son el MISMO vaso.

    Sin esto, un vaso cruzado por diez rayos del haz se contaba diez veces.
    """
    if not valores:
        return []
    valores = sorted(valores, key=lambda s: s[0])
    grupos: list[list[tuple[float, float]]] = [[valores[0]]]
    for s in valores[1:]:
        if s[0] - grupos[-1][-1][0] <= tol_mm:
            grupos[-1].append(s)
        else:
            grupos.append([s])
    salida = []
    for g in grupos:
        centro = float(np.mean([s[0] for s in g]))
        # La cuerda MÁS LARGA del grupo aproxima el diámetro: un rayo que pasa
        # rozando da una cuerda corta, el que pasa por el centro da el diámetro.
        cuerda = max(s[1] - s[0] for s in g)
        salida.append((centro, cuerda))
    return salida


# ── Medida ────────────────────────────────────────────────────────────────── #

def assess_corridor(
    entry: tuple[float, float, float],
    target: tuple[float, float, float],
    vessel_poly: vtk.vtkPolyData | None,
    *,
    radius_mm: float = DEFAULT_CORRIDOR_RADIUS_MM,
    target_clearance_mm: float = TARGET_CLEARANCE_MM,
    neck_axis: tuple[float, float, float] | None = None,
    branches: list = (),
    volume: np.ndarray | None = None,
    spacing: tuple[float, float, float] | None = None,
    dense_threshold: float = 0.0,
    is_subtracted: bool = False,
    obb_tree: "vtk.vtkOBBTree | None" = None,
) -> CorridorAssessment:
    """Mide el corredor y concluye si el abordaje es viable.

    `obb_tree` permite reutilizar el localizador entre llamadas. Construirlo
    cuesta lo mismo que una malla entera, y proponer corredores llama a esto
    cientos de veces: medido sobre case 3, rehacerlo cada vez eran 100 s.
    """
    p_in = np.asarray(entry, dtype=float)
    p_end = np.asarray(target, dtype=float)
    largo = float(np.linalg.norm(p_end - p_in))
    if largo < 1e-6:
        return CorridorAssessment(
            depth_mm=0.0, angle_deg=0.0, radius_mm=radius_mm,
            verdict="revisar",
            verdict_reason="La entrada y la diana son el mismo punto.",
        )
    eje = (p_end - p_in) / largo

    angulo = 0.0
    if neck_axis is not None:
        na = np.asarray(neck_axis, dtype=float)
        n = float(np.linalg.norm(na))
        if n > 1e-6:
            cos = float(np.clip(np.dot(eje, na / n), -1.0, 1.0))
            angulo = math.degrees(math.acos(abs(cos)))

    res = CorridorAssessment(depth_mm=round(largo, 2), angle_deg=round(angulo, 1),
                             radius_mm=radius_mm)
    res.assumptions.append(
        f"Corredor de {radius_mm:.0f} mm de radio: es el espacio de trabajo que "
        f"supone este software, no una medida tomada de nadie."
    )

    # ── Vasos atravesados ─────────────────────────────────────────────────── #
    if vessel_poly is not None and vessel_poly.GetNumberOfPoints() > 0:
        tree = obb_tree
        if tree is None:
            tree = vtk.vtkOBBTree()
            tree.SetDataSet(vessel_poly)
            tree.BuildLocator()
        tramos: list[tuple[float, float]] = []
        for o in _ray_origins(p_in, eje, radius_mm):
            for t0, t1 in _segments_along_ray(tree, o, o + eje * largo):
                # Lo que cae en la bola de la diana es el propio aneurisma.
                if largo - t0 <= target_clearance_mm:
                    continue
                tramos.append((t0, t1))

        for centro, cuerda in _cluster(tramos):
            pos = p_in + eje * centro
            calibre, fuente = round(cuerda, 2), "malla"
            # Un origen de rama medido cerca manda sobre la cuerda estimada.
            for b in branches:
                if float(np.linalg.norm(np.asarray(b.position) - pos)) <= 3.0:
                    calibre, fuente = round(float(b.calibre_mm), 2), "barrido"
                    break
            res.vessels_crossed.append(VesselCrossing(
                distance_from_entry_mm=round(centro, 2),
                position=(float(pos[0]), float(pos[1]), float(pos[2])),
                calibre_mm=calibre, calibre_source=fuente,
            ))

    # ── Ramas que el corredor roza sin cruzar ─────────────────────────────── #
    for b in branches:
        q = np.asarray(b.position, dtype=float) - p_in
        t = float(np.dot(q, eje))
        if t <= 0.0 or t >= largo - target_clearance_mm:
            continue
        d = float(np.linalg.norm(q - eje * t))
        if res.nearest_branch_mm is None or d < res.nearest_branch_mm:
            res.nearest_branch_mm = round(d, 2)
            res.nearest_branch_calibre_mm = round(float(b.calibre_mm), 2)

    # ── Tejido denso fuera de la vasculatura ──────────────────────────────── #
    #
    # No se llama hueso. El hueso no se separa del contraste por intensidad —el
    # 99 % cae dentro del rango del propio árbol— así que lo único que se puede
    # afirmar es que hay material denso donde la malla vascular no llega.
    if is_subtracted:
        res.dense_tissue_measurable = False
        res.findings.append(
            "Estudio sustraído: la imagen no contiene hueso ni tejido, solo el "
            "contraste. De este corredor únicamente se puede medir qué vasos "
            "cruza; lo que atraviesa por fuera de ellos no está en la imagen."
        )
    elif volume is not None and spacing is not None and dense_threshold > 0:
        sp = np.asarray(spacing, dtype=float)
        paso = 0.5
        n = max(2, int(largo / paso))
        dentro = 0
        enc = None
        if vessel_poly is not None and vessel_poly.GetNumberOfPoints() > 0:
            enc = vtk.vtkSelectEnclosedPoints()
            enc.Initialize(vessel_poly)
        for i in range(n):
            t = largo * i / (n - 1)
            p = p_in + eje * t
            idx = np.round(p[::-1] / sp).astype(int)   # mundo (x,y,z) → (z,y,x)
            if np.any(idx < 0) or np.any(idx >= np.asarray(volume.shape)):
                continue
            if float(volume[tuple(idx)]) < dense_threshold:
                continue
            if enc is not None and enc.IsInsideSurface(*p.tolist()):
                continue                      # es vaso, y los vasos ya se cuentan
            dentro += 1
        if enc is not None:
            enc.Complete()
        res.dense_tissue_mm = round(dentro * (largo / max(n - 1, 1)), 1)

    # ── Veredicto, por reglas y no por una suma ───────────────────────────── #
    bloqueantes = [v for v in res.vessels_crossed if v.calibre_mm >= BLOCKING_VESSEL_MM]
    if bloqueantes:
        peor = max(bloqueantes, key=lambda v: v.calibre_mm)
        res.verdict = "no_viable"
        res.verdict_reason = (
            f"El corredor atraviesa {len(bloqueantes)} vaso(s) antes de llegar al "
            f"aneurisma; el mayor mide ⌀ {peor.calibre_mm:.1f} mm, a "
            f"{peor.distance_from_entry_mm:.0f} mm de la entrada. Un vaso así no "
            f"se aparta: el abordaje tiene que entrar por otro sitio."
        )
    elif res.vessels_crossed:
        res.verdict = "revisar"
        res.verdict_reason = (
            f"El corredor roza {len(res.vessels_crossed)} estructura(s) vascular(es) "
            f"fina(s) (la mayor, ⌀ "
            f"{max(v.calibre_mm for v in res.vessels_crossed):.1f} mm). Puede ser "
            f"una vena o una rama movilizable; hay que verlo."
        )
    elif res.nearest_branch_mm is not None and res.nearest_branch_mm <= BRANCH_WARN_MM:
        res.verdict = "revisar"
        res.verdict_reason = (
            f"No cruza ningún vaso, pero pasa a {res.nearest_branch_mm:.1f} mm del "
            f"origen de una rama de ⌀ {res.nearest_branch_calibre_mm:.1f} mm."
        )
    else:
        res.verdict = "viable"
        res.verdict_reason = (
            "El corredor no atraviesa ningún vaso de la malla antes del aneurisma"
            + (f", y la rama más próxima queda a {res.nearest_branch_mm:.1f} mm."
               if res.nearest_branch_mm is not None else ".")
        )

    # ── Lo que se ve, dicho en palabras ───────────────────────────────────── #
    for v in res.vessels_crossed:
        res.findings.append(
            f"Vaso de ⌀ {v.calibre_mm:.1f} mm a {v.distance_from_entry_mm:.0f} mm de "
            f"la entrada ({'calibre medido en el barrido de ramas' if v.calibre_source == 'barrido' else 'calibre estimado sobre la malla'})."
        )
    if res.dense_tissue_measurable and res.dense_tissue_mm > 0:
        res.findings.append(
            f"{res.dense_tissue_mm:.0f} mm del recorrido pasan por material denso "
            f"que no es vasculatura — casi siempre hueso. El software no puede "
            f"distinguir la craneotomía de un obstáculo profundo: eso lo pone el "
            f"cirujano, y por eso no entra en el veredicto."
        )
    res.assumptions.append(
        "Solo se ve lo que está en la malla. Las perforantes de 0,1–0,5 mm no "
        "llegan a ella, así que un corredor limpio aquí no es un corredor sin "
        "perforantes."
    )
    return res


# ── Proponer un corredor ──────────────────────────────────────────────────── #
#
# Que el software sugiera por dónde entrar, no solo que valore lo que dibuja el
# médico. Dos reglas mandan aquí, y las dos vienen de que un abordaje tiene que
# poder hacerse:
#
#   1. Solo bloquea el tejido VASCULAR. Es lo único que la imagen separa con
#      garantías —el hueso comparte intensidad con el contraste— y es lo que se
#      pidió que contara.
#   2. No se propone entrar por donde el paciente tiene la cara, ni desde abajo.
#      Eso no es un abordaje peor: es uno que no existe. Para descartarlo hace
#      falta saber qué dirección es anterior, que sale de la orientación del
#      DICOM (`services.head_axes`); sin ella no se propone nada.
#
# Lo que se propone es una DIRECCIÓN, no una craneotomía. Nombrar un abordaje
# —pterional, subtemporal— exige el cráneo y la piel segmentados, y en una 3DRA
# el campo reconstruido ni siquiera llega al cuero cabelludo.

#: Por debajo de esto se entraría desde el cuello o la base: no existe.
MAX_INFERIOR_DEG: float = 15.0

#: El sector de la cara. Una dirección francamente anterior que además viene por
#: debajo de la horizontal entra por la órbita, la nariz o el macizo facial. Una
#: craneotomía frontal también es anterior, pero llega POR ENCIMA del reborde
#: orbitario, y por eso el filtro pide las dos condiciones a la vez.
FACE_ANTERIOR_DOT: float = 0.5      # dentro de 60 grados del frente
FACE_MAX_ELEVATION_DEG: float = 20.0

#: Hasta dónde se busca la entrada si no se encuentra la piel.
DEFAULT_MAX_DEPTH_MM: float = 120.0


@dataclass
class ProposedCorridor:
    """Un corredor que el software propone, con lo que se midió dentro."""

    entry: tuple[float, float, float]
    direction: tuple[float, float, float]
    depth_mm: float
    description: str
    assessment: CorridorAssessment
    #: False cuando la entrada es el borde del volumen reconstruido, no la piel.
    entry_on_skin: bool = False


def _fibonacci_directions(n: int) -> list[np.ndarray]:
    """`n` direcciones repartidas por la esfera, sin acumularse en los polos."""
    salida = []
    phi = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        z = 1.0 - 2.0 * i / max(n - 1, 1)
        r = math.sqrt(max(0.0, 1.0 - z * z))
        a = phi * i
        salida.append(np.array([math.cos(a) * r, math.sin(a) * r, z]))
    return salida


def _head_threshold(volume: np.ndarray) -> float:
    """Dónde acaba la cabeza en ESTE volumen, sin suponer unidades Hounsfield.

    Una 3DRA no está calibrada —en case 3 los valores van de −15 000 a 33 000—
    así que un umbral de aire escrito a mano no vale. Se calibra con el propio
    volumen: las ocho esquinas son lo de fuera, el centro lo de dentro, y el
    corte va a medio camino.
    """
    z, y, x = volume.shape
    k = max(4, min(z, y, x) // 20)
    esquinas = [
        volume[:k, :k, :k], volume[:k, :k, -k:], volume[:k, -k:, :k], volume[:k, -k:, -k:],
        volume[-k:, :k, :k], volume[-k:, :k, -k:], volume[-k:, -k:, :k], volume[-k:, -k:, -k:],
    ]
    fuera = float(np.median([float(np.median(c)) for c in esquinas]))
    # «Dentro» es el percentil 75, y las dos alternativas evidentes fallan:
    #
    #   · el bloque CENTRAL cae encima del contraste (en case 3 da −19), el
    #     corte se iba a −553 y dejaba fuera el parénquima, que en esa 3DRA sin
    #     calibrar vive en −400: el rayo «salía de la cabeza» a 13 mm del
    #     aneurisma y lo llamaba piel. Una entrada de piel a 13 mm de una lesión
    #     intracraneal no existe, y el software la daba por buena;
    #   · la MEDIANA GLOBAL se hunde cuando la cabeza ocupa menos de medio
    #     campo, que es lo normal en una TC;
    #   · Otsu, probado, separa el CONTRASTE de todo lo demás y no la cabeza del
    #     aire: en case 3 corta en −33 y deja fuera el 82 % de la cabeza.
    #
    # El p75 es tejido en los dos regímenes: −150 en case 3, −400 en un volumen
    # con mucho aire alrededor.
    dentro = float(np.percentile(volume, 75))
    return fuera + 0.15 * (dentro - fuera)


def _entry_along(target: np.ndarray, d: np.ndarray, volume, spacing,
                 max_depth_mm: float,
                 umbral: float | None = None) -> tuple[np.ndarray, float, bool]:
    """Sale del aneurisma en dirección `d` hasta encontrar la piel o el borde.

    Devuelve (entrada, profundidad, ¿es piel?). Cuando el campo reconstruido no
    llega al cuero cabelludo —lo normal en una 3DRA, que reconstruye un cilindro
    alrededor de los vasos— se devuelve el borde y se dice que NO es piel:
    proponer un punto de piel que la imagen no contiene sería inventarlo.
    """
    if volume is None or spacing is None:
        return target + d * max_depth_mm, max_depth_mm, False

    sp = np.asarray(spacing, dtype=float)
    forma = np.asarray(volume.shape)
    # El umbral se calcula UNA vez por volumen y se pasa: es un percentil sobre
    # 56 millones de vóxeles, y rehacerlo por dirección era el 90 % del tiempo
    # de proponer (90 s de los 100 que tardaba case 3).
    if umbral is None:
        umbral = _head_threshold(volume)
    fuera_seguidos = 0
    ultimo_dentro = 0.0
    t = 0.0
    while t < max_depth_mm:
        t += 1.0
        p = target + d * t
        idx = np.round(p[::-1] / sp).astype(int)
        if np.any(idx < 0) or np.any(idx >= forma):
            return target + d * ultimo_dentro, ultimo_dentro, False
        if float(volume[tuple(idx)]) >= umbral:
            ultimo_dentro = t
            fuera_seguidos = 0
        else:
            fuera_seguidos += 1
            if fuera_seguidos >= 3:      # tres milímetros de aire: se salió
                return target + d * ultimo_dentro, ultimo_dentro, True
    return target + d * max_depth_mm, max_depth_mm, False


def propose_corridors(
    target: tuple[float, float, float],
    vessel_poly: vtk.vtkPolyData | None,
    axes,
    *,
    radius_mm: float = DEFAULT_CORRIDOR_RADIUS_MM,
    target_clearance_mm: float = TARGET_CLEARANCE_MM,
    neck_axis: tuple[float, float, float] | None = None,
    branches: list = (),
    volume: np.ndarray | None = None,
    spacing: tuple[float, float, float] | None = None,
    max_depth_mm: float = DEFAULT_MAX_DEPTH_MM,
    n_directions: int = 300,
    top: int = 3,
) -> list[ProposedCorridor]:
    """Los corredores despejados que además se pueden operar, mejor primero."""
    from services.head_axes import describe_direction

    if axes is None or not getattr(axes, "usable", False):
        return []

    p_obj = np.asarray(target, dtype=float)
    ant = np.asarray(axes.anterior, dtype=float)
    sup = np.asarray(axes.superior, dtype=float)
    seno_inferior = -math.sin(math.radians(MAX_INFERIOR_DEG))
    seno_cara = math.sin(math.radians(FACE_MAX_ELEVATION_DEG))

    # El localizador, UNA vez. Es lo que convierte esto en un botón: con un
    # árbol nuevo por dirección, case 3 tardaba 100 s.
    tree = None
    if vessel_poly is not None and vessel_poly.GetNumberOfPoints() > 0:
        tree = vtk.vtkOBBTree()
        tree.SetDataSet(vessel_poly)
        tree.BuildLocator()

    # ── Primera pasada: un solo rayo por dirección ────────────────────────── #
    #
    # El haz de diecisiete rayos es lo que da la medida buena, pero para
    # DESCARTAR basta el rayo central. Se paga el haz completo solo por las
    # direcciones que sobreviven, que es el mismo patrón de las dos etapas de la
    # vista previa de segmentación.
    umbral_cabeza = _head_threshold(volume) if volume is not None else None

    preseleccion: list[tuple[float, np.ndarray, np.ndarray, float, bool]] = []
    for d in _fibonacci_directions(n_directions):
        elevacion = float(np.dot(d, sup))
        if elevacion < seno_inferior:
            continue                                   # desde el cuello o la base
        if float(np.dot(d, ant)) > FACE_ANTERIOR_DOT and elevacion < seno_cara:
            continue                                   # por la cara

        entrada, profundidad, piel = _entry_along(p_obj, d, volume, spacing,
                                                  max_depth_mm, umbral_cabeza)
        if profundidad < target_clearance_mm + 5.0:
            continue                                   # no hay corredor que medir

        estorbo = 0.0
        if tree is not None:
            for t0, t1 in _segments_along_ray(tree, entrada, entrada + (p_obj - entrada)):
                if profundidad - t0 > target_clearance_mm:
                    estorbo += t1 - t0
        preseleccion.append((estorbo, entrada, d, profundidad, piel))

    preseleccion.sort(key=lambda r: (r[0], r[3]))

    candidatos: list[ProposedCorridor] = []
    for _estorbo, entrada, d, profundidad, piel in preseleccion[:max(12, top * 5)]:
        a = assess_corridor(
            tuple(entrada), target, vessel_poly,
            radius_mm=radius_mm, target_clearance_mm=target_clearance_mm,
            neck_axis=neck_axis, branches=branches,
            # Solo bloquea el tejido vascular: el resto no se mide aquí.
            volume=None, spacing=None, is_subtracted=False, obb_tree=tree,
        )
        if a.verdict == "no_viable":
            continue

        candidatos.append(ProposedCorridor(
            entry=(float(entrada[0]), float(entrada[1]), float(entrada[2])),
            direction=(float(d[0]), float(d[1]), float(d[2])),
            depth_mm=round(float(profundidad), 1),
            description=describe_direction(d, axes),
            assessment=a, entry_on_skin=piel,
        ))

    # Primero los que no rozan nada, y entre ellos el más corto: cada milímetro
    # de profundidad es campo que hay que mantener abierto.
    candidatos.sort(key=lambda c: (len(c.assessment.vessels_crossed), c.depth_mm))

    # Direcciones casi iguales son el mismo abordaje contado tres veces.
    elegidos: list[ProposedCorridor] = []
    for c in candidatos:
        v = np.asarray(c.direction)
        if any(float(np.dot(v, np.asarray(e.direction))) > 0.94 for e in elegidos):
            continue
        elegidos.append(c)
        if len(elegidos) >= top:
            break
    return elegidos
