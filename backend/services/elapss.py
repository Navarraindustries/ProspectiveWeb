"""ELAPSS (Backes et al., Neurology 2017): riesgo de crecimiento a 3 y 5 años.

Earlier SAH · Location · Age · Population · Size · Shape. Tabla de puntos y de
riesgo por banda tal como la reproducen la validación externa (J Stroke 2019)
y el Stroke Manual, que coinciden punto por punto. Un detalle contraintuitivo
pero así publicado: la HSA previa por otro aneurisma resta, «sí» = 0, «no» = 1.

Predice CRECIMIENTO, no rotura: es para decidir cada cuánto repetir la imagen.
Y como PHASES, discrimina mal fuera de sus cohortes (ver el aviso del informe);
las poblaciones de las cohortes fueron Norteamérica, China, Europa, Japón y
Finlandia: cualquier otra queda fuera de lo que se midió.
"""
from __future__ import annotations

from models.elapss import ElapssRequest, ElapssResult

SRC_ELAPSS = "Backes et al., Neurology 2017;88:1600-1606 — ELAPSS"
SRC_VALIDATION = ("J Stroke 2019 (validación externa en 11 cohortes) — reproduce la "
                  "tabla de puntos; discriminación moderada")

_LOCATION = {"ica_aca_acom": 0, "mca": 3, "pcom_posterior": 5}
_POPULATION = {"other": 0, "japan": 1, "finland": 7}

#: (puntuación mínima de la banda, etiqueta, crecimiento a 3 años %, a 5 años %)
_BANDS = (
    (25, "≥25", 42.7, 60.8),
    (20, "20-24", 25.8, 39.9),
    (15, "15-19", 17.5, 28.1),
    (10, "10-14", 11.7, 19.3),
    (5, "5-9", 7.8, 13.0),
    (0, "<5", 5.0, 8.4),
)


def size_points(size_mm: float) -> int:
    if size_mm < 3.0:
        return 0
    if size_mm < 5.0:
        return 4
    if size_mm < 7.0:
        return 10
    if size_mm < 10.0:
        return 13
    return 22


def age_points(age: int) -> int:
    """0 hasta 60; luego 1 punto por cada tramo de 5 años, hasta 8 (>95)."""
    if age <= 60:
        return 0
    return min(8, (age - 61) // 5 + 1)


def compute_elapss(req: ElapssRequest) -> ElapssResult:
    pts = {
        "sah": 0 if req.earlier_sah else 1,
        "loc": _LOCATION[req.location],
        "age": age_points(req.age_years),
        "pop": _POPULATION[req.population],
        "size": size_points(req.size_mm),
        "shape": 4 if req.irregular else 0,
    }
    total = sum(pts.values())
    _, band, g3, g5 = next(b for b in _BANDS if total >= b[0])
    notes = [
        "Predice CRECIMIENTO, no rotura: orienta cada cuánto repetir la imagen.",
        "Fuera de sus cohortes discrimina mal, como PHASES: es una referencia "
        "poblacional, no una predicción para este paciente.",
    ]
    if req.size_mm < 1.0:
        notes.append("La tabla empieza en 1,0 mm: por debajo no está medido.")
    if req.population == "other":
        notes.append("«Otra» población es Norteamérica, China o Europa (salvo Finlandia). "
                     "Otras poblaciones no estaban en las cohortes.")
    return ElapssResult(
        earlier_sah_pts=pts["sah"], location_pts=pts["loc"], age_pts=pts["age"],
        population_pts=pts["pop"], size_pts=pts["size"], shape_pts=pts["shape"],
        total_score=total, score_band=band, growth_3yr_pct=g3, growth_5yr_pct=g5,
        notes=notes, sources=[SRC_ELAPSS, SRC_VALIDATION],
    )
