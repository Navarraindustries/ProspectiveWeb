"""UIATS — Unruptured Intracranial Aneurysm Treatment Score.

Etminan et al., Neurology 2015;85(10):881-889, figura 2. Consenso Delphi de 69
especialistas: dos sumas independientes, una A FAVOR DE TRATAR (reparación
quirúrgica o endovascular) y otra A FAVOR DE VIGILAR (seguimiento y control
de factores de riesgo). Con 3 puntos o más de diferencia, recomienda la
columna mayor; con 2 o menos, «no concluyente»: cualquiera de las dos se puede
defender con factores que la escala no recoge.

Transcrito de la figura 2 del PDF del artículo, factor por factor; cada uno
tiene su test (test_uiats.py). Dos detalles del original:
- la edad de la columna de vigilancia salta de «< 40» a «41-60», así que los
  40 años exactos no caen en ningún tramo: se cuentan con 41-60 (1 punto),
  el tramo que pesa más hacia vigilar, y se dice;
- el riesgo de la intervención es una constante de 5 que se suma siempre a
  vigilar.

Es una escala de consenso, no un modelo ajustado a desenlaces, y en series
externas discrimina mal (ver el aviso de PHASES). No decide: ordena la
conversación.
"""
from __future__ import annotations

from dataclasses import dataclass

SRC_UIATS = ("Etminan et al., Neurology 2015;85(10):881-889 — UIATS (consenso Delphi, "
             "figura 2)")

# ── A favor de TRATAR ──────────────────────────────────────────────────────── #
RISK_FACTORS = {                 # múltiple
    "previous_sah": 4,           # HSA previa por otro aneurisma
    "familial": 3,               # aneurismas o HSA familiares (≥ 2 familiares de 1.er grado)
    "ethnicity": 2,              # japonesa, finlandesa o inuit
    "smoking": 3,                # fumador actual
    "hypertension": 2,           # PAS > 140 mm Hg
    "adpkd": 2,                  # poliquistosis renal autosómica dominante
    "drug_abuse": 2,             # cocaína, anfetaminas
    "alcohol_abuse": 1,
}
SYMPTOMS = {                     # múltiple
    "cranial_nerve_deficit": 4,
    "mass_effect": 4,            # clínico o radiológico
    "thromboembolic": 3,         # eventos tromboembólicos desde el aneurisma
    "epilepsy": 1,
}
PATIENT_OTHER = {                # múltiple
    "fear_of_rupture": 2,        # calidad de vida reducida por miedo a la rotura
    "multiplicity": 1,           # varios aneurismas
}
MORPHOLOGY = {                   # múltiple
    "irregular": 3,              # irregularidad o lobulación
    "sr_ar": 1,                  # SR > 3 o AR > 1,6
}
LOCATION = {                     # única
    "basilar_bifurcation": 5,
    "vertebrobasilar": 4,
    "acom_pcom": 2,
    "other": 0,
}
ANEURYSM_OTHER = {               # múltiple
    "growth": 4,                 # crecimiento en imagen seriada
    "de_novo": 3,                # formación de novo en imagen seriada
    "contralateral_stenoocclusive": 1,
}

# ── A favor de VIGILAR ─────────────────────────────────────────────────────── #
LIFE_EXPECTANCY = {"lt5": 4, "5to10": 3, "gt10": 1}   # única (enfermedad crónica o maligna)
COMORBID = {                     # múltiple
    "neurocognitive": 3,
    "coagulopathy": 2,           # coagulopatías, trombofilias
    "psychiatric": 2,
}
COMPLEXITY = {"high": 3, "low": 0}
INTERVENTION_CONSTANT = 5


#: Cómo se nombra cada factor en el informe y en la pantalla.
LABELS = {
    "previous_sah": "HSA previa por otro aneurisma", "familial": "Aneurismas o HSA familiares",
    "ethnicity": "Etnia japonesa, finlandesa o inuit", "smoking": "Fumador actual",
    "hypertension": "Hipertensión (PAS > 140 mm Hg)", "adpkd": "Poliquistosis renal (ADPKD)",
    "drug_abuse": "Consumo de drogas (cocaína, anfetaminas)", "alcohol_abuse": "Abuso de alcohol",
    "cranial_nerve_deficit": "Déficit de par craneal", "mass_effect": "Efecto masa clínico o radiológico",
    "thromboembolic": "Eventos tromboembólicos desde el aneurisma", "epilepsy": "Epilepsia",
    "fear_of_rupture": "Calidad de vida reducida por miedo a la rotura", "multiplicity": "Aneurismas múltiples",
    "irregular": "Irregularidad o lobulación", "sr_ar": "SR > 3 o AR > 1,6",
    "basilar_bifurcation": "Bifurcación basilar", "vertebrobasilar": "Arteria vertebral o basilar",
    "acom_pcom": "AComA o AComP", "other": "Otra localización",
    "growth": "Crecimiento en imagen seriada", "de_novo": "Formación de novo en imagen seriada",
    "contralateral_stenoocclusive": "Enfermedad estenooclusiva contralateral",
    "lt5": "Esperanza de vida < 5 años", "5to10": "Esperanza de vida 5-10 años",
    "gt10": "Esperanza de vida > 10 años", "neurocognitive": "Trastorno neurocognitivo",
    "coagulopathy": "Coagulopatía o trombofilia", "psychiatric": "Trastorno psiquiátrico",
    "high": "Complejidad alta", "low": "Complejidad baja",
}


def age_repair_points(age: int) -> int:
    if age < 40:
        return 4
    if age <= 60:
        return 3
    if age <= 70:
        return 2
    if age <= 80:
        return 1
    return 0


def age_conservative_points(age: int) -> int:
    """< 40 → 0; 41-60 → 1 (y 40, que la figura no incluye); … > 80 → 5."""
    if age < 40:
        return 0
    if age <= 60:
        return 1
    if age <= 70:
        return 3
    if age <= 80:
        return 4
    return 5


def diameter_points(mm: float) -> int:
    if mm < 4.0:
        return 0
    if mm < 7.0:
        return 1
    if mm < 13.0:
        return 2
    if mm < 25.0:
        return 3
    return 4


def size_risk_points(mm: float) -> int:
    if mm < 6.0:
        return 0
    if mm <= 10.0:
        return 1
    if mm <= 20.0:
        return 3
    return 5


@dataclass
class UiatsScore:
    repair: int
    conservative: int
    difference: int
    recommendation: str      # "repair" | "conservative" | "not_definitive"
    repair_items: list[tuple[str, int]]
    conservative_items: list[tuple[str, int]]


def _sum(selected: list[str], table: dict[str, int], label: str, out: list):
    for k in selected:
        if k not in table:
            raise ValueError(f"«{k}» no es un valor de {label}.")
        if table[k]:
            out.append((LABELS.get(k, k), table[k]))


def compute_uiats(*, age: int, risk_factors: list[str], symptoms: list[str],
                  patient_other: list[str], diameter_mm: float, morphology: list[str],
                  location: str, aneurysm_other: list[str], life_expectancy: str | None,
                  comorbid: list[str], complexity: str) -> UiatsScore:
    rep: list[tuple[str, int]] = [(f"Edad ({age} años)", age_repair_points(age))]
    _sum(risk_factors, RISK_FACTORS, "factor de riesgo", rep)
    _sum(symptoms, SYMPTOMS, "síntoma", rep)
    _sum(patient_other, PATIENT_OTHER, "otro (paciente)", rep)
    rep.append((f"Diámetro máximo ({diameter_mm:.1f} mm)", diameter_points(diameter_mm)))
    _sum(morphology, MORPHOLOGY, "morfología", rep)
    if location not in LOCATION:
        raise ValueError(f"«{location}» no es una localización.")
    rep.append((LABELS[location], LOCATION[location]))
    _sum(aneurysm_other, ANEURYSM_OTHER, "otro (aneurisma)", rep)

    con: list[tuple[str, int]] = []
    if life_expectancy is not None:
        if life_expectancy not in LIFE_EXPECTANCY:
            raise ValueError(f"«{life_expectancy}» no es una esperanza de vida.")
        con.append((LABELS[life_expectancy], LIFE_EXPECTANCY[life_expectancy]))
    _sum(comorbid, COMORBID, "comorbilidad", con)
    con.append(("Riesgo del tratamiento por la edad", age_conservative_points(age)))
    con.append(("Riesgo del tratamiento por el tamaño", size_risk_points(diameter_mm)))
    if complexity not in COMPLEXITY:
        raise ValueError(f"«{complexity}» no es una complejidad.")
    con.append((LABELS[complexity], COMPLEXITY[complexity]))
    con.append(("Riesgo de la intervención (constante)", INTERVENTION_CONSTANT))

    r = sum(p for _, p in rep)
    c = sum(p for _, p in con)
    diff = r - c
    rec = "repair" if diff >= 3 else "conservative" if diff <= -3 else "not_definitive"
    return UiatsScore(repair=r, conservative=c, difference=diff, recommendation=rec,
                      repair_items=[x for x in rep if x[1]], conservative_items=[x for x in con if x[1]])
