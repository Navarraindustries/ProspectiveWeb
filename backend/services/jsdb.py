# -*- coding: utf-8 -*-
"""Japan Stroke Data Bank — cómo le iría a ESTE paciente por cada vía.

Qué es, y por qué está aparte
-----------------------------
`treatment.py` contesta «¿por qué vía?» con una diferencia de puntos heurísticos.
Esto contesta otra pregunta y la contesta con un modelo ajustado: **cuál es el
riesgo de mal resultado si se clipa, y cuál si se emboliza**, por separado.

Derivado sobre 3 547 pacientes con HSA aneurismática del Japan Stroke Data Bank
(2 666 clipados, 881 embolizados, 1998–2013), por regresión logística
multivariante sobre mal resultado al alta (mRS > 2) y mortalidad intrahospitalaria.
Los puntos se asignaron según el valor de las OR, tomando OR ≥ 2 como una unidad
de riesgo; para la edad, calculando los años que duplican la OR. Validado sobre
una serie independiente de 269 pacientes del hospital de los autores.

Por qué NO vota
---------------
Porque sus variables ya estaban en el motor: los factores 9, 10 y 11 de
`treatment.py` —edad, WFNS y Fisher— son una copia a mano de este modelo. Los
cortes de 72 y 80 años salen literalmente de aquí. Sumar las dos cosas sería
contar las mismas variables dos veces, el mismo defecto que el cuello y el DNR.

Así que el reparto queda: el JSDB se queda con lo clínico en los rotos, el motor
con la geometría —que este modelo no mira en absoluto— y con lo clínico de los
NO rotos, donde el JSDB no aplica.

Lo que este modelo puede decir y el motor no
--------------------------------------------
El motor devuelve una diferencia. Un saldo de 0 significa «empate», nunca «las
dos vías van mal». Al dar **dos puntuaciones separadas**, esto sí puede decir
«clipaje malo Y coiling malo», que es la señal que de verdad manda un caso a
sesión multidisciplinar.

Límites, dichos aquí y repetidos en pantalla
--------------------------------------------
- **Solo aneurismas rotos.** Toda la cohorte es HSA. Sobre un incidental no dice
  nada, y devolver `None` es lo correcto, no un hueco.
- **El desenlace es mRS > 2 AL ALTA**, no oclusión ni resultado a un año.
- Los autores **no publican bandas ni un AUC**: validan que la tasa de mal
  resultado correlaciona con los puntos (p < 0,001). Por eso aquí no se traduce
  a porcentajes: se dan los puntos y su comparación, que es como los autores
  dicen que se use.
- Cohorte japonesa, 1998–2013. La práctica endovascular ha cambiado desde
  entonces, y la transportabilidad a otra población no está demostrada.

Fuente
------
Development and Validation of Scoring Indication of Surgical Clipping and
Endovascular Coiling for Aneurysmal Subarachnoid Hemorrhage from the Post Hoc
Analysis of Japan Stroke Data Bank. Neurol Med Chir (Tokyo) 2021;61(2):89-98.
PMC7905300.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SOURCE = (
    "Japan Stroke Data Bank, post hoc — Neurol Med Chir (Tokyo) 2021;61(2). "
    "Regresión logística sobre 3 547 HSA aneurismáticas; validado en 269. "
    "Desenlace: mRS > 2 al alta."
)

#: Edad desde la que el modelo penaliza cada vía. Estos dos números son el
#: origen de los cortes 72/80 que el motor lleva copiados a mano.
AGE_CLIP = 72
AGE_COIL = 80

#: Tamaño desde el que el modelo penaliza el clipaje. El coiling no tiene
#: término de tamaño en este modelo.
LARGE_MM_CLIP = 15.0

#: Localizaciones que cada vía penaliza, en los términos del propio modelo.
VBA_LOCATIONS = ("Basilar (punta, tronco o AICA)", "PICA / Vertebral")
ANTERIOR_LOCATIONS = ("ACM — Arteria Cerebral Media",
                      "ACA / ACoA — Arteria Comunicante Anterior")

#: Máximo alcanzable por cada puntuación, con todas las variables conocidas.
#: Sirve para decir qué parte del modelo se ha podido rellenar.
MAX_CLIP = 7   # edad 1 + ictus 1 + WFNS 3 + tamaño 1 + VBA 1
MAX_COIL = 7   # edad 1 + ictus 1 + WFNS 3 + Fisher 1 + ACM/ACA 1


@dataclass
class JsdbItem:
    """Una variable del modelo, con lo que aportó y por qué."""

    label: str
    points: int
    detail: str


@dataclass
class JsdbArm:
    """Una de las dos puntuaciones: la del clipaje o la del coiling."""

    arm: str            # "clip" | "coil"
    label: str
    points: int
    max_points: int
    items: list[JsdbItem] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


@dataclass
class JsdbResult:
    """Las dos puntuaciones y lo único que los autores dicen hacer con ellas."""

    clip: JsdbArm
    coil: JsdbArm
    #: "clip" | "coil" | "tie" — cuál sale MENOS penalizado. No es una
    #: recomendación: es el signo de una resta entre dos riesgos estimados.
    favours: str
    verdict: str
    both_poor: bool
    known_pct: int
    missing: list[str]
    source: str = SOURCE


# ── Términos compartidos por las dos puntuaciones ─────────────────────────── #

def _wfns_points(grade: int | None, arm: str) -> tuple[int, str] | None:
    """WFNS. Es la variable de más peso del modelo, y la única que llega a 3.

    Las dos vías se penalizan igual en IV y V; difieren en el grado bajo: el
    clipaje ya suma en II–III y el coiling solo desde III.
    """
    if not grade:
        return None
    if grade >= 5:
        return 3, "WFNS V"
    if grade == 4:
        return 2, "WFNS IV"
    if arm == "clip" and grade in (2, 3):
        return 1, f"WFNS {'II' if grade == 2 else 'III'}"
    if arm == "coil" and grade == 3:
        return 1, "WFNS III"
    return None


def _clip_arm(age: int | None, prior_stroke: int | None, wfns: int | None,
              max_diameter_mm: float, location: str) -> JsdbArm:
    items: list[JsdbItem] = []
    missing: list[str] = []
    pts = 0

    if age is None or age <= 0:
        missing.append("edad")
    elif age >= AGE_CLIP:
        pts += 1
        items.append(JsdbItem(f"Edad ≥ {AGE_CLIP} años ({age})", 1,
                              "Desde los 72 el modelo penaliza el clipaje."))

    if prior_stroke is None:
        missing.append("ictus previo")
    elif prior_stroke > 1:
        pts += 1
        items.append(JsdbItem(f"Más de un ictus previo ({prior_stroke})", 1,
                              "El clipaje se penaliza a partir del segundo, no del primero."))

    w = _wfns_points(wfns, "clip")
    if wfns is None:
        missing.append("grado WFNS")
    elif w:
        pts += w[0]
        items.append(JsdbItem(w[1], w[0],
                              "Variable de mayor peso del modelo."))

    if max_diameter_mm <= 0:
        missing.append("diámetro máximo")
    elif max_diameter_mm > LARGE_MM_CLIP:
        pts += 1
        items.append(JsdbItem(f"Aneurisma > {LARGE_MM_CLIP:.0f} mm "
                              f"({max_diameter_mm:.1f} mm)", 1,
                              "El tamaño solo penaliza a esta vía en el modelo."))

    loc = (location or "").strip()
    if not loc or loc == "Desconocida / No especificada":
        missing.append("localización")
    elif loc in VBA_LOCATIONS:
        pts += 1
        items.append(JsdbItem("Territorio vertebrobasilar", 1,
                              "La circulación posterior penaliza al clipaje."))

    return JsdbArm("clip", "Clipaje quirúrgico", pts, MAX_CLIP, items, missing)


def _coil_arm(age: int | None, prior_stroke: int | None, wfns: int | None,
              fisher: int | None, location: str) -> JsdbArm:
    items: list[JsdbItem] = []
    missing: list[str] = []
    pts = 0

    if age is None or age <= 0:
        missing.append("edad")
    elif age >= AGE_COIL:
        pts += 1
        items.append(JsdbItem(f"Edad ≥ {AGE_COIL} años ({age})", 1,
                              "El coiling aguanta ocho años más que el clipaje "
                              "antes de penalizar."))

    if prior_stroke is None:
        missing.append("ictus previo")
    elif prior_stroke >= 1:
        pts += 1
        items.append(JsdbItem(f"Ictus previo ({prior_stroke})", 1,
                              "Al coiling le penaliza ya el primero."))

    w = _wfns_points(wfns, "coil")
    if wfns is None:
        missing.append("grado WFNS")
    elif w:
        pts += w[0]
        items.append(JsdbItem(w[1], w[0], "Variable de mayor peso del modelo."))

    if fisher is None:
        missing.append("grado de Fisher")
    elif fisher == 4:
        pts += 1
        items.append(JsdbItem("Fisher 4", 1,
                              "La sangre voluminosa penaliza a esta vía, no a la "
                              "quirúrgica, que puede evacuarla."))

    loc = (location or "").strip()
    if not loc or loc == "Desconocida / No especificada":
        missing.append("localización")
    elif loc in ANTERIOR_LOCATIONS:
        pts += 1
        items.append(JsdbItem("ACM o ACA", 1,
                              "Estas dos penalizan a la vía endovascular."))

    return JsdbArm("coil", "Tratamiento endovascular", pts, MAX_COIL, items, missing)


#: Desde cuántos puntos se considera que una vía pinta mal. Los autores no
#: publican bandas, así que esto NO es suyo: es el umbral con el que esta
#: aplicación decide cuándo avisar, y se declara como tal. Tres puntos es un
#: WFNS V solo, o dos factores cualesquiera más un mal grado.
POOR_THRESHOLD = 3


def jsdb_scores(
    ruptured: bool,
    age: int | None = None,
    prior_stroke: int | None = None,
    wfns_grade: int | None = None,
    fisher_grade: int | None = None,
    max_diameter_mm: float = 0.0,
    location: str = "",
) -> JsdbResult | None:
    """Las dos puntuaciones, o `None` si el modelo no aplica.

    No aplica en un aneurisma no roto: la cohorte entera es hemorragia
    subaracnoidea. Devolver `None` dice eso; devolver ceros diría que las dos
    vías salen impecables, que es una afirmación que este modelo no hace.
    """
    if not ruptured:
        return None

    clip = _clip_arm(age, prior_stroke, wfns_grade, max_diameter_mm, location)
    coil = _coil_arm(age, prior_stroke, wfns_grade, fisher_grade, location)

    # Qué parte del modelo se ha podido rellenar. Se cuentan las variables, no
    # los puntos: una variable desconocida no es una variable en cero.
    all_vars = {"edad", "ictus previo", "grado WFNS", "diámetro máximo",
                "localización", "grado de Fisher"}
    missing = sorted(set(clip.missing) | set(coil.missing))
    known_pct = round((len(all_vars - set(missing)) / len(all_vars)) * 100)

    both_poor = clip.points >= POOR_THRESHOLD and coil.points >= POOR_THRESHOLD

    if clip.points < coil.points:
        favours = "clip"
    elif coil.points < clip.points:
        favours = "coil"
    else:
        favours = "tie"

    if both_poor:
        verdict = (
            f"Las DOS vías puntúan alto ({clip.points} y {coil.points}): el "
            f"modelo no está diciendo cuál es mejor, está diciendo que espera "
            f"mal resultado por cualquiera de las dos. Es la señal para sesión "
            f"multidisciplinar, no para elegir."
        )
    elif favours == "tie":
        verdict = (
            f"Las dos puntuaciones empatan en {clip.points}. Sobre lo clínico "
            f"este modelo no separa las vías; la diferencia, si la hay, está en "
            f"la geometría, que este modelo no mira."
        )
    else:
        menor = clip if favours == "clip" else coil
        mayor = coil if favours == "clip" else clip
        verdict = (
            f"{menor.label} sale menos penalizado ({menor.points} frente a "
            f"{mayor.points}). Es una diferencia de riesgo estimado al alta, no "
            f"una indicación: la geometría la decide aparte."
        )

    return JsdbResult(clip=clip, coil=coil, favours=favours, verdict=verdict,
                      both_poor=both_poor, known_pct=known_pct, missing=missing)


def _arm_to_dict(a: JsdbArm) -> dict[str, Any]:
    return {
        "arm": a.arm,
        "label": a.label,
        "points": a.points,
        "max_points": a.max_points,
        "items": [{"label": i.label, "points": i.points, "detail": i.detail}
                  for i in a.items],
        "missing": list(a.missing),
    }


def result_to_dict(r: JsdbResult) -> dict[str, Any]:
    return {
        "clip": _arm_to_dict(r.clip),
        "coil": _arm_to_dict(r.coil),
        "favours": r.favours,
        "verdict": r.verdict,
        "both_poor": r.both_poor,
        "known_pct": r.known_pct,
        "missing": list(r.missing),
        "source": r.source,
    }
