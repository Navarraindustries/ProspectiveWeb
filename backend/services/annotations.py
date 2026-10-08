"""Medidas de las anotaciones persistentes.

Mismas fórmulas que frontend/src/vtk/annotations.ts: el informe las recalcula en
el servidor y no se fía del valor que mande el cliente. El redondeo solo ocurre
al formatear, para que el número siga siendo comparable entre ambos lados.
"""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal

_NEEDED = {"regla": 2, "angulo": 3, "region": 3, "marcador": 1}


def polygon_area(points, normal_axis: int) -> float:
    """Fórmula del cordón sobre los dos ejes del plano; el eje normal no cuenta."""
    i, j = [k for k in (0, 1, 2) if k != normal_axis]
    s = 0.0
    for k, p in enumerate(points):
        q = points[(k + 1) % len(points)]
        s += p[i] * q[j] - q[i] * p[j]
    return abs(s) / 2


def _normal_axis(points) -> int:
    # El eje que menos varía: una región se dibuja dentro de un corte.
    best, best_spread = 2, math.inf
    for k in (2, 1, 0):
        vals = [p[k] for p in points]
        spread = max(vals) - min(vals)
        if spread < best_spread:
            best, best_spread = k, spread
    return best


def measure(kind: str, points) -> tuple[str, float] | None:
    """(unidad, valor sin redondear), o None si el tipo no mide o faltan puntos."""
    if len(points) < _NEEDED.get(kind, 1 << 30):
        return None
    if kind == "regla":
        return ("mm", math.dist(points[0], points[1]))
    if kind == "angulo":
        p, v, q = points[:3]
        u = [p[k] - v[k] for k in range(3)]
        w = [q[k] - v[k] for k in range(3)]
        nu, nw = math.hypot(*u), math.hypot(*w)
        if nu == 0 or nw == 0:
            return None
        c = sum(a * b for a, b in zip(u, w)) / (nu * nw)
        # Acotado: el redondeo puede dejar c en 1,0000000002 y acos daría error.
        return ("°", math.degrees(math.acos(max(-1.0, min(1.0, c)))))
    if kind == "region":
        return ("mm²", polygon_area(points, _normal_axis(points)))
    return None


def _round_half_up(value: float, step: str) -> str:
    # f"{v:.0f}" redondea el empate al par (2,5 -> 2) y toFixed del visor hacia arriba (-> 3):
    # un área de 12,5 mm² saldría distinta en el informe y en el visor.
    return str(Decimal(repr(value)).quantize(Decimal(step), rounding=ROUND_HALF_UP))


def format_measure(m: tuple[str, float] | None) -> str:
    """«12,4 mm», «63°», «48 mm²»: igual que formatMeasure en el visor."""
    if m is None:
        return ""
    unit, value = m
    if unit == "mm":
        return _round_half_up(value, "0.1").replace(".", ",") + " mm"
    if unit == "°":
        return _round_half_up(value, "1") + "°"
    return _round_half_up(value, "1") + " mm²"
