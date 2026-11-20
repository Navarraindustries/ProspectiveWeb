"""Curvatura y torsión del vaso portador sobre la línea central (P13, Dalmer 2026).

Se dan las MEDIAS a lo largo del eje, nunca el máximo: en la tabla de Dalmer
2026 (Neuroradiology 68:2683) la curvatura máxima de la ACA sale 99 /mm frente
a una media de 0,36, porque el máximo lo pone el punto más ruidoso del eje, no
el vaso.

Cómo se calcula
---------------
1. La línea se vuelve a muestrear cada `PASO_MM` por longitud de arco.
2. Las derivadas salen de filtros gaussianos de derivada con `SIGMA_MM`: es el
   suavizado moderado de la línea antes de derivar, como en VMTK. Lo fijaron
   los fantomas de tubos (P14, services/fantoma_tubos.py) sobre la línea que
   extrae la app: con 1,5 mm un arco plano daba una torsión falsa de hasta
   0,03 /mm; con 2 mm, 0,02 como mucho, la de las hélices sale exacta y la
   curvatura queda un 1–5 % alta (el suavizado encoge un poco las curvas).
3. Se recortan `RECORTE_SIGMAS` sigmas en cada extremo, donde el filtro no
   tiene línea a los dos lados.
4. κ = |r' × r''| / |r'|³ y τ = (r' × r'') · r''' / |r' × r''|².
5. La curvatura media es la media de κ por longitud de arco. La torsión media
   es la media de |τ| solo donde κ ≥ `KAPPA_MIN`: en un tramo casi recto el
   plano de la curva no está definido y τ es ruido. Si no hay tramo curvo,
   la torsión no se da.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import gaussian_filter1d

PASO_MM = 0.25
SIGMA_MM = 2.0
RECORTE_SIGMAS = 2.0
KAPPA_MIN = 0.02          # 1/mm: radio de curvatura de 50 mm; por debajo, casi recto
LONGITUD_MIN_MM = 5.0     # tramo medido mínimo tras el recorte


@dataclass
class GeometriaEje:
    """Medias a lo largo del tramo medido."""

    curvatura_media: float            # 1/mm
    torsion_media: float | None       # 1/mm, |τ| medio en el tramo curvo; None si es casi recto
    longitud_medida_mm: float         # tramo usado, sin los extremos recortados
    fraccion_curva: float             # parte del tramo con κ ≥ KAPPA_MIN (donde se mide la torsión)

    @property
    def radio_curvatura_mm(self) -> float | None:
        """El radio del arco con la curvatura media (1 / κ medio)."""
        return 1.0 / self.curvatura_media if self.curvatura_media > 1e-9 else None


def remuestrear(puntos: np.ndarray, paso_mm: float = PASO_MM) -> np.ndarray:
    """Puntos a `paso_mm` exactos por longitud de arco (el primero y el último se conservan)."""
    p = np.asarray(puntos, dtype=np.float64)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    keep = np.concatenate([[True], seg > 1e-9])
    p = p[keep]
    if len(p) < 2:
        return p
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    n = max(2, int(round(s[-1] / paso_mm)) + 1)
    t = np.linspace(0.0, s[-1], n)
    return np.column_stack([np.interp(t, s, p[:, a]) for a in range(3)])


def perfil(puntos: np.ndarray, sigma_mm: float = SIGMA_MM, paso_mm: float = PASO_MM):
    """Curvatura y torsión punto a punto en la línea remuestreada.

    Devuelve (s, κ, τ) con s la longitud de arco en mm, ya sin los extremos
    recortados, o None si el tramo que queda es demasiado corto."""
    if len(puntos) < 3:
        return None
    q = remuestrear(puntos, paso_mm)
    if len(q) < 3:
        return None
    h = float(np.linalg.norm(q[1] - q[0])) or paso_mm
    sig = sigma_mm / h

    def der(orden: int) -> np.ndarray:
        return np.column_stack([
            gaussian_filter1d(q[:, a], sig, order=orden, mode="nearest") for a in range(3)
        ]) / h ** orden

    d1, d2, d3 = der(1), der(2), der(3)
    cruz = np.cross(d1, d2)
    nc = np.linalg.norm(cruz, axis=1)
    v = np.linalg.norm(d1, axis=1)
    kappa = nc / np.maximum(v ** 3, 1e-12)
    tau = np.einsum("ij,ij->i", cruz, d3) / np.maximum(nc ** 2, 1e-12)
    s = np.arange(len(q)) * h
    corte = int(np.ceil(RECORTE_SIGMAS * sig))
    if len(q) - 2 * corte < 2 or (len(q) - 2 * corte - 1) * h < LONGITUD_MIN_MM:
        return None
    sl = slice(corte, len(q) - corte)
    return s[sl] - s[sl][0], kappa[sl], tau[sl]


def geometria_eje(puntos: np.ndarray, sigma_mm: float = SIGMA_MM) -> GeometriaEje | None:
    """Curvatura y torsión medias del eje, o None si la línea es demasiado corta."""
    pr = perfil(puntos, sigma_mm)
    if pr is None:
        return None
    s, kappa, tau = pr
    curva = kappa >= KAPPA_MIN
    return GeometriaEje(
        curvatura_media=float(kappa.mean()),
        torsion_media=float(np.abs(tau[curva]).mean()) if curva.any() else None,
        longitud_medida_mm=float(s[-1]),
        fraccion_curva=float(curva.mean()),
    )


def tramo_portador(puntos: np.ndarray, radios: np.ndarray, lesion: np.ndarray) -> int:
    """Cuántos puntos del principio de la línea son vaso portador.

    Una línea que termina dentro de la lesión entra en el saco al final, y ese
    giro no es del vaso. El tramo acaba en el primer punto cuya esfera
    inscrita toca la lesión (distancia a la superficie de la lesión ≤ su radio
    más medio milímetro): en el cuello la esfera del vaso ya roza el saco."""
    from scipy.spatial import cKDTree

    p = np.asarray(puntos, dtype=np.float64)
    if len(lesion) == 0 or len(p) == 0:
        return len(p)
    d, _ = cKDTree(np.asarray(lesion, dtype=np.float64)).query(p)
    toca = np.flatnonzero(d <= np.asarray(radios, dtype=np.float64) + 0.5)
    return int(toca[0]) if len(toca) else len(p)
