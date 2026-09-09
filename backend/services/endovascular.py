# -*- coding: utf-8 -*-
"""Qué forma tiene la vía endovascular para esta geometría.

No es un segundo motor de decisión. El de `treatment.py` elige ENTRE dos
tratamientos; esto describe uno de ellos: si se va por dentro, con qué técnica
se haría y qué cabe esperar de la oclusión a largo plazo.

Por qué existe
--------------
Cuatro de los ocho factores del motor eran índices de forma —aspect ratio,
bottleneck factor, undulation index— sacados de literatura de RIESGO DE ROTURA
(Dhar 2008, Raghavan 2005). Ninguno de esos trabajos estudia la elección entre
clipaje y coiling, y ninguno de los dos modelos validados que sí la estudian
—Japan Stroke Data Bank 2020, SHARP— usa un índice de forma.

Donde la morfología sí tiene respaldo publicado es en esta otra pregunta:

- **La técnica.** «Cuello ancho» está definido como cuello ≥ 4 mm o relación
  domo-cuello < 2, y esa definición existe precisamente porque predice la
  necesidad de técnicas adyuvantes —balón o stent— (Brinjikji, AJNR 2009). El
  mismo trabajo mide el gradiente: por encima de 1.6 no suelen hacer falta; por
  debajo de 1.2 casi siempre.
- **La durabilidad.** Un aspect ratio alto se asocia a recanalización tras
  coiling: AR ≥ 1.6, OR 4.15 (IC 95 % 1.57–11.00), sobre 307 aneurismas no rotos
  con 79 meses de seguimiento medio (Neurol Med Chir 2022).

Ese segundo dato apunta al revés que el motor, que daba +20 a endovascular por
un AR alto llamándolo «geometría favorable para coiling». Las dos cosas son
ciertas y hablan de momentos distintos: un domo profundo sobre un cuello
estrecho retiene bien los coils el día de la intervención, y recanaliza más
después. Colapsarlas en un voto perdía justo esa distinción; aquí se dicen las
dos.

Lo que esto NO hace
-------------------
No dice si el caso es endovascular. No sustituye al cateterismo diagnóstico, que
es donde se decide de verdad la técnica. Y no puntúa: describe.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ── Umbrales publicados ────────────────────────────────────────────────────── #

#: Cuello ancho, en la definición que usan los ensayos de dispositivos.
WIDE_NECK_MM: float = 4.0
WIDE_DNR: float = 2.0

#: El gradiente de Brinjikji: por encima de 1.6 no suele hacer falta adyuvante,
#: por debajo de 1.2 casi siempre.
DNR_NO_ADJUNCT: float = 1.6
DNR_ALWAYS_ADJUNCT: float = 1.2

#: AR desde el que se dispara la recanalización tras coiling.
AR_RECANALIZATION: float = 1.6
AR_RECANALIZATION_OR: str = "OR 4.15 (IC 95 % 1.57–11.00)"

#: Desde donde la literatura de diversión de flujo habla de «grande».
LARGE_MM: float = 12.0
GIANT_MM: float = 25.0

SRC_WIDE_NECK = "Brinjikji et al., AJNR 2009 — definición de cuello ancho y necesidad de adyuvantes"
SRC_RECANALIZATION = "Neurol Med Chir 2022 — el AR alto predice recanalización tras coiling"
SRC_DIVERTER = "Metaanálisis 2026 sobre 1 893 pacientes — diversión de flujo en grandes y gigantes"


@dataclass
class EndovascularProfile:
    """Cómo sería la vía endovascular aquí, y con qué respaldo se dice."""

    technique: str          # simple | assisted | diverter | unknown
    technique_label: str
    rationale: str
    durability: str = ""
    cautions: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


def endovascular_profile(
    neck_mm: float = 0.0,
    dnr: float = 0.0,
    aspect_ratio: float = 0.0,
    max_diameter_mm: float = 0.0,
    undulation_index: float = 0.0,
) -> EndovascularProfile:
    """Describe la vía endovascular a partir de la geometría medida.

    Con cuello y DNR a cero no hay nada que decir: se devuelve `unknown` en vez
    de una técnica supuesta. Es la misma disciplina que el resto del módulo de
    decisión — un dato que falta no es un dato neutro.
    """
    sources: list[str] = []
    cautions: list[str] = []

    # ── La técnica ────────────────────────────────────────────────────── #
    if neck_mm <= 0 and dnr <= 0:
        return EndovascularProfile(
            technique="unknown",
            technique_label="Sin datos para estimarla",
            rationale=(
                "Hace falta el cuello o la relación domo-cuello para decir algo "
                "sobre la técnica. Marca el plano del cuello en Morfometría."
            ),
        )

    wide = (neck_mm >= WIDE_NECK_MM) or (0 < dnr < WIDE_DNR)
    sources.append(SRC_WIDE_NECK)

    if not wide:
        technique, label = "simple", "Coiling simple"
        rationale = (
            f"Cuello de {neck_mm:.1f} mm y relación domo-cuello {dnr:.2f}: fuera "
            f"de la definición de cuello ancho (≥ {WIDE_NECK_MM:.0f} mm o DNR "
            f"< {WIDE_DNR:.0f}), donde no suelen hacer falta técnicas adyuvantes."
        )
    elif 0 < dnr < DNR_ALWAYS_ADJUNCT:
        technique, label = "assisted", "Coiling asistido (balón o stent)"
        rationale = (
            f"Relación domo-cuello {dnr:.2f}, por debajo de {DNR_ALWAYS_ADJUNCT}: "
            f"en esa franja casi siempre hace falta balón o stent para retener "
            f"los coils."
        )
    else:
        technique, label = "assisted", "Coiling asistido (balón o stent)"
        motivo = (f"cuello de {neck_mm:.1f} mm" if neck_mm >= WIDE_NECK_MM
                  else f"relación domo-cuello {dnr:.2f}")
        rationale = (
            f"Cuello ancho por {motivo}. Es la definición que se usa justo porque "
            f"predice la necesidad de adyuvante; por encima de una relación de "
            f"{DNR_NO_ADJUNCT} suele bastar el coiling simple."
        )

    # ── Grandes y gigantes: otra familia de dispositivo ───────────────── #
    if max_diameter_mm >= GIANT_MM:
        technique, label = "diverter", "Valorar diversor de flujo"
        rationale = (
            f"Aneurisma gigante ({max_diameter_mm:.1f} mm). La diversión de flujo "
            f"es la vía endovascular habitual a este tamaño, pero no es una "
            f"elección automática: en gigantes de carótida interna se describen "
            f"complicaciones de hasta el 25 %."
        )
        cautions.append(
            "En grandes y gigantes el volumen permeable baja con el diversor, pero "
            "el volumen total del aneurisma no se reduce en la misma medida: el "
            "efecto de masa puede persistir."
        )
        sources.append(SRC_DIVERTER)
    elif max_diameter_mm >= LARGE_MM:
        cautions.append(
            f"Aneurisma grande ({max_diameter_mm:.1f} mm): a este tamaño entra en "
            f"juego la diversión de flujo, sola o combinada con coils — combinada "
            f"logra mejor oclusión completa (OR 1.59)."
        )
        sources.append(SRC_DIVERTER)

    # ── La durabilidad ────────────────────────────────────────────────── #
    durability = ""
    if aspect_ratio > 0:
        if aspect_ratio >= AR_RECANALIZATION:
            durability = (
                f"Aspect ratio {aspect_ratio:.2f}: por encima de "
                f"{AR_RECANALIZATION}, que se asocia a recanalización tras "
                f"coiling — {AR_RECANALIZATION_OR} sobre 307 aneurismas con 79 "
                f"meses de seguimiento medio. No contraindica la vía: pide "
                f"empaquetado alto y seguimiento por imagen previsto de antemano."
            )
            sources.append(SRC_RECANALIZATION)
        else:
            durability = (
                f"Aspect ratio {aspect_ratio:.2f}, por debajo del umbral de "
                f"{AR_RECANALIZATION} asociado a más recanalización tras coiling."
            )
            sources.append(SRC_RECANALIZATION)

    # ── Lo que no tiene respaldo, dicho como tal ──────────────────────── #
    if undulation_index >= 0.20:
        cautions.append(
            f"Domo irregular (UI {undulation_index:.2f}). Es un índice de riesgo "
            f"de ROTURA, no de resultado del tratamiento: el llenado incompleto de "
            f"un saco lobulado es un argumento mecánico razonable y no se ha "
            f"encontrado validación de que prediga el resultado del coiling."
        )

    return EndovascularProfile(
        technique=technique, technique_label=label, rationale=rationale,
        durability=durability, cautions=cautions,
        sources=list(dict.fromkeys(sources)),
    )


def profile_to_dict(p: EndovascularProfile) -> dict[str, Any]:
    return {
        "technique": p.technique,
        "technique_label": p.technique_label,
        "rationale": p.rationale,
        "durability": p.durability,
        "cautions": list(p.cautions),
        "sources": list(p.sources),
    }
