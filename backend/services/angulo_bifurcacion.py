"""Ángulo de bifurcación junto a un aneurisma, guiado: el usuario marca la
arteria madre y las dos ramas hijas.

Por qué guiado
--------------
Se intentó en automático sobre la red de vasos (services/red_vasos.py) en 5
aneurismas de bifurcación de Zenodo 15697196 y 3 de pared lateral (26-11):
la red cruza el saco por caminos arbitrarios; trazada sin el saco, la unión
más cercana tenía 2 o 6 ramas; con una esfera en el cuello, en angio-TC salían
5 a 11 vasos (los vecinos) y dos de los tres laterales daban «bifurcación».
Elegir cuál es la madre y cuáles las hijas es justo lo que sabe quien mira la
anatomía; con tres clics, lo demás es fiable.

Cómo
----
1. Dos líneas centrales (services/centerline.py) desde la madre hasta cada
   hija, con el saco fuera de la máscara si se da: el camino de mínimo coste
   ataja por el saco, que es ancho.
2. Separación: el primer punto de la línea 1 que se aleja de la línea 2 más
   de medio radio; la bifurcación es el último punto común.
3. Direcciones a `_DIAMETROS` diámetros de la madre desde la bifurcación: cada
   hija hacia delante y la madre hacia atrás (de donde viene).
4. Ángulos: entre las dos hijas, y de cada hija respecto a la prolongación de
   la madre (0° = sigue recta).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import vtk
from scipy.spatial import cKDTree

from services.centerline import extract_centerline

#: A cuántos diámetros de la madre desde la bifurcación se mide cada dirección.
_DIAMETROS = 2.0
#: Una línea se separa de la otra cuando se aleja más de esto × su radio.
_SEPARA = 0.5
#: Mínimo que tiene que recorrer cada rama tras la bifurcación (mm).
_RAMA_MIN_MM = 2.0

Punto = tuple[float, float, float]


@dataclass
class Bifurcacion:
    punto: Punto                      # donde se separan las líneas
    angulo_hijas_deg: float           # entre las dos hijas
    angulo_hija1_deg: float           # hija 1 respecto a la prolongación de la madre
    angulo_hija2_deg: float
    diametro_madre_mm: float
    diametro_hija1_mm: float
    diametro_hija2_mm: float
    medido_a_mm: float                # a qué distancia de la bifurcación se tomaron las direcciones
    linea1: np.ndarray                # madre → hija 1
    linea2: np.ndarray                # madre → hija 2
    sin_saco: bool                    # las líneas se trazaron con el saco fuera


def _largo(p: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])


def _punto_a(p: np.ndarray, s: np.ndarray, s_obj: float) -> np.ndarray:
    s_obj = float(np.clip(s_obj, 0.0, s[-1]))
    return np.array([np.interp(s_obj, s, p[:, k]) for k in range(3)])


def _unit(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    if n < 1e-9:
        raise ValueError("Dos de los puntos marcados están demasiado juntos para dar una dirección.")
    return v / n


def _angulo(u: np.ndarray, v: np.ndarray) -> float:
    return float(np.degrees(np.arccos(np.clip(float(u @ v), -1.0, 1.0))))


def medir_bifurcacion(malla: vtk.vtkPolyData, madre: Punto, hija1: Punto, hija2: Punto,
                      saco: vtk.vtkPolyData | None = None) -> Bifurcacion:
    sin_saco = saco is not None and saco.GetNumberOfCells() > 0
    try:
        l1 = extract_centerline(malla, madre, hija1, excluir=saco if sin_saco else None)
        l2 = extract_centerline(malla, madre, hija2, excluir=saco if sin_saco else None)
    except ValueError:
        if not sin_saco:
            raise
        # Sin el saco no había camino (el saco medido entra en el vaso madre):
        # se traza con él, como la línea central de siempre.
        sin_saco = False
        l1 = extract_centerline(malla, madre, hija1)
        l2 = extract_centerline(malla, madre, hija2)
    a, ra = np.asarray(l1.points, float), np.asarray(l1.radii, float)
    b, rb = np.asarray(l2.points, float), np.asarray(l2.radii, float)

    # Las dos hijas en el mismo vaso: el final de una línea cae sobre la otra.
    fin_b_en_a = cKDTree(a).query(b[-1])[0] < max(float(rb[-1]), 0.5)
    fin_a_en_b = cKDTree(b).query(a[-1])[0] < max(float(ra[-1]), 0.5)
    if fin_a_en_b or fin_b_en_a:
        raise ValueError("Las dos hijas marcadas están en el mismo vaso: marca cada una en una rama distinta, "
                         "pasada la bifurcación.")
    # Separación: primer punto de la línea 1 a más de medio radio de la línea 2.
    d, _ = cKDTree(b).query(a)
    lejos = d > _SEPARA * np.maximum(ra, 0.3)
    if not lejos.any():
        raise ValueError("Las dos hijas marcadas están en el mismo vaso: marca cada una en una rama distinta, "
                         "pasada la bifurcación.")
    i = max(int(np.argmax(lejos)) - 1, 0)
    j = int(cKDTree(b).query(a[i])[1])
    p = 0.5 * (a[i] + b[j])
    sa, sb = _largo(a), _largo(b)
    diam_madre = 2.0 * float(np.median(ra[max(0, i - 5):i + 1]))
    L = _DIAMETROS * max(diam_madre, 1.0)
    if sa[-1] - sa[i] < _RAMA_MIN_MM or sb[-1] - sb[j] < _RAMA_MIN_MM:
        raise ValueError("Una de las hijas está marcada demasiado cerca de la bifurcación: márcala más lejos, "
                         "a unos milímetros siguiendo su rama.")
    if sa[i] < _RAMA_MIN_MM:
        raise ValueError("La madre está marcada demasiado cerca de la bifurcación: márcala más atrás, en el vaso del "
                         "que salen las ramas.")
    h1 = _unit(_punto_a(a, sa, sa[i] + L) - a[i])
    h2 = _unit(_punto_a(b, sb, sb[j] + L) - b[j])
    m = _unit(a[i] - _punto_a(a, sa, sa[i] - L))           # hacia delante: lo que sería seguir recto

    def diam_tras(r: np.ndarray, s: np.ndarray, k: int) -> float:
        sel = (s > s[k] + 0.5 * L) & (s <= s[k] + 1.5 * L)
        return 2.0 * float(np.median(r[sel])) if sel.any() else 2.0 * float(r[min(k + 1, len(r) - 1)])

    return Bifurcacion(
        punto=tuple(float(x) for x in p),
        angulo_hijas_deg=_angulo(h1, h2),
        angulo_hija1_deg=_angulo(m, h1),
        angulo_hija2_deg=_angulo(m, h2),
        diametro_madre_mm=diam_madre,
        diametro_hija1_mm=diam_tras(ra, sa, i),
        diametro_hija2_mm=diam_tras(rb, sb, j),
        medido_a_mm=float(L),
        linea1=a, linea2=b, sin_saco=sin_saco,
    )
