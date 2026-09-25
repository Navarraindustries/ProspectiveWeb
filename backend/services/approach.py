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
) -> CorridorAssessment:
    """Mide el corredor y concluye si el abordaje es viable."""
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
