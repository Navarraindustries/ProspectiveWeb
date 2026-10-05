"""Cobertura metálica de un desviador de flujo, punto a punto.

Un desviador de flujo es una trenza: hilos en hélice, la mitad en cada
sentido. Lo que desvía el flujo es cuánto metal hay delante del cuello (la
cobertura metálica; la porosidad es lo que falta hasta 100). Y esa cifra NO es
la del catálogo: depende de a qué diámetro quede abierto el dispositivo en
cada punto.

El modelo es el geométrico de una trenza, sin ajustar nada:

- Los hilos no se estiran. Un hilo que da la vuelta a un tubo de diámetro D con
  ángulo α respecto al eje cumple  sin α = sin α₀ · D / D₀  (α₀ y D₀, los
  nominales). Si el vaso obliga a D < D₀, el ángulo baja: los hilos se tumban
  hacia el eje y el dispositivo se ALARGA en  cos α / cos α₀.
- La fracción de superficie que tapa una familia de hilos es proporcional a
  1 / (D·cos α), y con las dos familias cruzadas la cobertura es 2f − f².
- D·cos α es máximo con α = 45°: ahí los rombos son cuadrados, el poro es el
  mayor posible y la cobertura la menor. Es lo que se mide al sobredimensionar
  (ver SRC_BRAID en endovascular.py).
- En una curva, el mismo metal se reparte sobre más superficie por fuera y
  sobre menos por dentro: la cobertura baja en la convexidad y sube en la
  concavidad en la proporción 1 − κ·r (κ, curvatura; r, hacia fuera negativo).

Hacen falta dos datos del dispositivo: la cobertura al diámetro nominal, que
da el catálogo, y el ángulo nominal de los hilos, que no lo da. Ese se despeja
de cuánto se alarga el dispositivo dentro del microcatéter (ver PIPELINE).
No se usa el número de hilos por su grosor: el ancho que tapa de verdad un
hilo no es su diámetro nominal, y con él las cifras no cuadraban con ninguna
medida publicada.

Con esos dos datos, y sin ajustar nada más, el modelo reproduce las dos
medidas independientes que ya citaba el proyecto:
- 25,5 % de cobertura con 1,0 mm de sobredimensionado (Sci Rep 2024): da
  entre 24 y 26 % según el diámetro;
- un tercio más largo desplegado que en la etiqueta, de media (AneuGuide,
  J NeuroIntervent Surg 2023): da de un 24 a un 43 % más con 0,25 mm de
  sobredimensionado, que es lo que se suele dejar.

Qué NO es:
- No simula el despliegue. Supone que el dispositivo se suelta sin empujar ni
  tirar; el operador compacta la trenza sobre el cuello a propósito para subir
  la cobertura, y eso aquí no existe.
- Supone sección redonda y que el dispositivo no se abre más que su nominal.
- No reproduce el 48 % medido con el dispositivo infradimensionado: por encima
  de su nominal la trenza no se abre más, y lo que queda es mala aposición.
- Solo está calibrado para la familia Pipeline. Se enseña como estimación,
  redondeada al entero.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import vtk
from vtkmodules.util.numpy_support import numpy_to_vtk, vtk_to_numpy

from services.apposition import SCALAR as GAP_SCALAR
from services.apposition import ZONE, ZONE_AXIS, ZONE_NECK, ZONE_WALL, _arc_of

#: Diferencia de cobertura respecto a la nominal, en puntos porcentuales
#: (− = poros más abiertos que en el catálogo).
SCALAR = "cobertura_delta_pct"


@dataclass(frozen=True)
class Braid:
    name: str
    nominal_coverage: float       # cobertura metálica al diámetro nominal (0–1)
    nominal_angle_deg: float      # ángulo de los hilos con el eje al nominal
    min_diameter_mm: float
    max_diameter_mm: float
    source: str


#: Dentro del microcatéter (0,027", 0,69 mm) un Pipeline mide unas 2,5 veces
#: su longitud nominal. Como los hilos no se estiran, eso fija su ángulo:
#: cos α₀ = cos α_catéter / 2,5, y dentro del catéter los hilos van casi
#: paralelos al eje (cos ≈ 0,99).
CATHETER_ELONGATION = 2.5

#: Familia Pipeline (Medtronic): 30–35 % de cobertura al diámetro nominal.
PIPELINE = Braid(
    name="Pipeline", nominal_coverage=0.325,
    nominal_angle_deg=round(math.degrees(math.acos(0.99 / CATHETER_ELONGATION)), 0),   # 67°
    min_diameter_mm=2.5, max_diameter_mm=5.0,
    source=("Familia Pipeline: 30–35 % de cobertura metálica al diámetro nominal y unas "
            "2,5 veces más largo dentro del microcatéter (ficha del fabricante; "
            "Shapiro et al., AJNR 2014;35:727)"),
)

SRC_MODEL = (
    "Makoyeva et al., AJNR 2013;34:596 y Shapiro et al., AJNR 2014;35:727 — la "
    "porosidad de una trenza cambia con el diámetro al que queda abierta y con "
    "la curva del vaso, y se deduce de la geometría de los hilos"
)

#: Ventana para suavizar la línea central antes de medir su curvatura: punto a
#: punto, el ruido de la línea da curvaturas que no existen.
CURVATURE_WINDOW_MM = 3.0
#: Lo más que se deja corregir a la curva. Más allá el tubo ya se habría
#: acodado y el modelo no vale.
CURVE_SCALE_LIMITS = (0.6, 1.6)
#: Anillos de este largo para leer a qué diámetro queda abierto cada tramo.
RING_MM = 0.75


def _fraction(coverage: float) -> float:
    """Fracción tapada por UNA familia de hilos, dada la cobertura de las dos."""
    return 1.0 - math.sqrt(max(0.0, 1.0 - coverage))


def coverage_at(braid: Braid, nominal_mm: float, local_mm) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(cobertura 0–1, ángulo en grados, alargamiento) al diámetro `local_mm`.

    El dispositivo no se abre más que su nominal: por encima de él queda al
    nominal (y separado de la pared, que es cosa del mapa de aposición).
    """
    D = np.minimum(np.asarray(local_mm, dtype=float), nominal_mm)
    D = np.maximum(D, 0.25 * nominal_mm)                    # un tubo aplastado no es una trenza
    a0 = math.radians(braid.nominal_angle_deg)
    sin_a = np.clip(math.sin(a0) * D / nominal_mm, 0.0, 1.0)
    cos_a = np.sqrt(1.0 - sin_a ** 2)
    f0 = _fraction(braid.nominal_coverage)
    f = np.clip(f0 * (nominal_mm * math.cos(a0)) / (D * np.maximum(cos_a, 1e-6)), 0.0, 1.0)
    return 2 * f - f ** 2, np.degrees(np.arcsin(sin_a)), cos_a / math.cos(a0)


@dataclass
class Coverage:
    device: str
    nominal_coverage_pct: float
    nominal_angle_deg: float
    neck_coverage_pct: float | None      # media sobre el cuello; None si no hay cuello medido
    min_coverage_pct: float              # p5 sobre el tramo en contacto con el vaso
    max_coverage_pct: float              # p95
    min_local_diameter_mm: float
    deployed_length_mm: float            # el tramo dibujado
    labelled_length_mm: float            # longitud de catálogo que, ya alargada, lo cubre
    notes: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


def _smooth(points: np.ndarray, arc: np.ndarray, window_mm: float) -> np.ndarray:
    out = np.empty_like(points)
    for i, s in enumerate(arc):
        m = np.abs(arc - s) <= window_mm / 2
        out[i] = points[m].mean(axis=0)
    return out


def _curvature_vectors(centerline: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(longitud de arco, vector de curvatura dT/ds en cada punto de la línea).
    El vector apunta al centro de la curva y mide 1/radio."""
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(centerline, axis=0), axis=1))])
    if len(centerline) < 5 or arc[-1] <= 0:
        return arc, np.zeros_like(centerline)
    P = _smooth(centerline, arc, CURVATURE_WINDOW_MM)
    T = np.gradient(P, arc, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    return arc, _smooth(np.gradient(T, arc, axis=0), arc, CURVATURE_WINDOW_MM)


def annotate(stent: vtk.vtkPolyData, centerline_segment: np.ndarray, nominal_mm: float,
             braid: Braid = PIPELINE) -> Coverage:
    """Añade `cobertura_delta_pct` a la malla del stent y devuelve el resumen.

    Necesita el mapa de aposición ya hecho (services/apposition.annotate): de
    él sale a qué diámetro queda abierto el dispositivo en cada tramo.
    """
    pd = stent.GetPointData()
    gap_arr, zone_arr = pd.GetArray(GAP_SCALAR), pd.GetArray(ZONE)
    if gap_arr is None or zone_arr is None:
        raise ValueError("Falta el mapa de aposición: la cobertura sale de él.")
    if not (braid.min_diameter_mm <= nominal_mm <= braid.max_diameter_mm):
        raise ValueError(f"{braid.name} se fabrica de {braid.min_diameter_mm:g} a "
                         f"{braid.max_diameter_mm:g} mm; con {nominal_mm:g} mm no hay construcción que aplicar.")
    gap, zone = vtk_to_numpy(gap_arr).astype(float), vtk_to_numpy(zone_arr)
    P = vtk_to_numpy(stent.GetPoints().GetData()).astype(float)
    cl = np.asarray(centerline_segment, dtype=float)
    s, _ = _arc_of(P, cl)
    arc, K = _curvature_vectors(cl)
    total = float(arc[-1])
    R0 = nominal_mm / 2

    # A qué diámetro queda abierto cada tramo: el radio nominal más la holgura
    # media del anillo (negativa donde el vaso es más estrecho). Sobre el
    # cuello no hay pared que lo sujete: cuenta solo la que haya alrededor, y
    # si no hay ninguna queda al nominal.
    wall = zone == ZONE_WALL
    n_rings = max(1, int(math.ceil(total / RING_MM)))
    ring = np.minimum((s / RING_MM).astype(int), n_rings - 1)
    D_ring = np.full(n_rings, nominal_mm)
    for r in range(n_rings):
        m = wall & (ring == r)
        if m.sum() >= 6:
            D_ring[r] = min(nominal_mm, 2 * (R0 + float(np.mean(gap[m]))))
    D_ring = np.maximum(D_ring, 0.25 * nominal_mm)
    cov_ring, ang_ring, elong_ring = coverage_at(braid, nominal_mm, D_ring)

    # La curva: el mismo metal sobre más superficie por fuera, menos por dentro.
    j = np.argmin(np.abs(arc[None, :] - s[:, None]), axis=1) if len(P) * len(arc) < 4e7 else \
        np.searchsorted(arc, s).clip(0, len(arc) - 1)
    escala = np.clip(1.0 - np.einsum("ij,ij->i", K[j], P - cl[j]), *CURVE_SCALE_LIMITS)
    f = np.clip(np.array([_fraction(c) for c in cov_ring])[ring] / escala, 0.0, 1.0)
    cov = 2 * f - f ** 2
    cov[zone == ZONE_AXIS] = braid.nominal_coverage          # los centros de las tapas no son trenza

    delta = (cov - braid.nominal_coverage) * 100.0
    arr = numpy_to_vtk(delta.astype(np.float32), deep=True)
    arr.SetName(SCALAR)
    pd.AddArray(arr)

    notes: list[str] = []
    cuello = zone == ZONE_NECK
    neck_cov = round(float(np.mean(cov[cuello])) * 100.0, 0) if cuello.sum() >= 6 else None
    if neck_cov is None:
        notes.append("Sin cuello medido no se puede decir la cobertura delante del aneurisma, "
                     "que es la que importa.")
    en_vaso = cov[wall] if wall.any() else cov
    # La longitud de catálogo que, alargada por el vaso, cubre el tramo dibujado.
    labelled = float(np.sum((total / n_rings) / elong_ring))
    if float(D_ring.min()) < nominal_mm - 0.25:
        notes.append(f"El vaso baja a {D_ring.min():.2f} mm bajo un dispositivo de {nominal_mm:.2f}: "
                     f"ahí los hilos se tumban, los poros se abren y el dispositivo se alarga.")
    if float(np.abs(1 - escala).max()) > 0.15:
        notes.append("En la curva la cobertura baja por fuera y sube por dentro; si el cuello "
                     "está en la convexidad, queda del lado de menos metal.")
    notes.append("Estimación geométrica con el dispositivo suelto sin empujar: compactar la "
                 "trenza sobre el cuello sube la cobertura y aquí no se simula.")
    return Coverage(
        device=braid.name,
        nominal_coverage_pct=round(braid.nominal_coverage * 100.0, 1),
        nominal_angle_deg=braid.nominal_angle_deg,
        neck_coverage_pct=neck_cov,
        min_coverage_pct=round(float(np.percentile(en_vaso, 5)) * 100.0, 0),
        max_coverage_pct=round(float(np.percentile(en_vaso, 95)) * 100.0, 0),
        min_local_diameter_mm=round(float(D_ring.min()), 2),
        deployed_length_mm=round(total, 1),
        labelled_length_mm=round(labelled, 1),
        notes=notes, sources=[braid.source, SRC_MODEL],
    )
