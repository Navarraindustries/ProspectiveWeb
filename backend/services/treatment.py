"""Treatment-strategy decision engine — CLIP vs ENDOVASCULAR.

Adapted from prospective/processing/treatment_decision.py — pure Python, zero Qt dependencies.
All logic is identical to the desktop version (same factor weights, thresholds and references).

What is published and what is not
---------------------------------
Two different things get called "evidence-based" here, and separating them is the
point of the `source` carried by every factor.

The **thresholds** mostly are published: a 4 mm neck and a dome-to-neck ratio of
2.0 are the standard definition of a wide neck, and the direction each factor
pushes reflects positions any review would recognise.

The **weights** are not. No published model assigns 25 points to a wide neck and
20 to an MCA location; those numbers were chosen by hand and no source in this
repository attributes them. They are stated as heuristic in each factor's
`source` rather than left to look derived.

Worth knowing about the shape of this engine: the two validated models that do
choose between clipping and coiling — the Japan Stroke Data Bank score
(Neurol Med Chir 2020) and SHARP — are built on age, WFNS grade, Fisher grade,
prior stroke, size and location. Six of the eight factors below are
morphological instead, and four of those come from rupture-risk literature.

References
----------
- Hoh et al., AHA/ASA 2023 guideline on aneurysmal SAH — Class I LOE A for
  coiling in ruptured anterior-circulation aneurysms equally suitable for both
- Molyneux et al., ISAT 18-year follow-up (Lancet 2015)
- Spetzler et al., BRAT 10-year saccular analysis (J Neurosurg 2019)
- Brinjikji et al., AJNR 2009 — wide-neck definition
- Dhar et al. 2008, Raghavan et al. 2005 — shape indices, RUPTURE RISK
- Etminan et al., ESO 2022 — unruptured aneurysm management
- Greving et al., Lancet Neurol 2014 — PHASES
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ── Location constants ─────────────────────────────────────────────────────── #

LOCATION_UNKNOWN   = "Desconocida / No especificada"
LOCATION_MCA       = "ACM — Arteria Cerebral Media"
LOCATION_ACA_ACOA  = "ACA / ACoA — Arteria Comunicante Anterior"
LOCATION_ICA_PROX  = "ACI proximal (segm. cavernoso / clinoideo)"
LOCATION_ICA_DIST  = "ACI distal (PCOM / oftálmica)"
LOCATION_PCOM      = "ACoP — Arteria Comunicante Posterior"
LOCATION_BASILAR   = "Basilar (punta, tronco o AICA)"
LOCATION_PICA      = "PICA / Vertebral"
LOCATION_OTHER     = "Otra localización"

LOCATIONS: list[str] = [
    LOCATION_UNKNOWN, LOCATION_MCA, LOCATION_ACA_ACOA, LOCATION_ICA_PROX,
    LOCATION_ICA_DIST, LOCATION_PCOM, LOCATION_BASILAR, LOCATION_PICA, LOCATION_OTHER,
]


#: Lo máximo que puede aportar cada grupo. Sirve para una sola cosa: saber qué
#: parte del caso se ha podido evaluar, y por tanto cuánto vale el veredicto.
#: Sin los índices de forma: no votan, así que su ausencia no resta certeza a la
#: decisión. Sí importan para el perfil endovascular, que lo dice por su cuenta.
_MAX_WEIGHT: dict[str, int] = {
    "neck": 25, "dnr": 15, "size": 20,
    "location": 25, "ruptured": 30, "age": 12, "wfns": 15, "fisher": 10,
}

#: Cómo se llama cada dato cuando hay que pedirlo.
_INPUT_LABEL: dict[str, str] = {
    "neck": "diámetro del cuello", "dnr": "relación domo-cuello",
    "size": "diámetro máximo", "location": "localización",
    "age": "edad del paciente", "wfns": "grado WFNS",
    "fisher": "grado de Fisher",
}


def _coverage(known: set[str], applicable: set[str]) -> float:
    """Qué fracción del peso evaluable se ha podido mirar, entre 0 y 1.

    No es lo mismo que «cuántos factores han sumado». Un diámetro de 8 mm cae en
    la franja neutra y no aporta puntos, pero es un dato conocido: el motor lo ha
    mirado y ha decidido que no inclina. Falta de dato y factor neutro son cosas
    distintas y sólo la primera resta certeza.
    """
    total = sum(_MAX_WEIGHT[k] for k in applicable) or 1
    return sum(_MAX_WEIGHT[k] for k in (known & applicable)) / total


# ── Internal dataclasses ───────────────────────────────────────────────────── #

@dataclass
class _Factor:
    name:      str
    detail:    str
    direction: str  # "clip" | "endo" | "neutral"
    points:    int
    #: Where the threshold comes from, and where the weight comes from. They are
    #: rarely the same place, and a factor that does not say so reads as if the
    #: number had been derived from something.
    source:    str = ""
    #: False para lo que se enseña y no suma. Mismo patrón que la fuerza de
    #: cierre y la apertura en el selector de clips: borrar una medida porque no
    #: puede votar la esconde; dejarla con su motivo la deja discutible.
    votes:     bool = True


#: Provenance per factor. Written out rather than inferred so that adding a
#: factor without a source is a visible omission.
_SOURCE: dict[str, str] = {
    "neck": (
        "Umbral: cuello ≥ 4 mm es la definición estándar de cuello ancho "
        "(Brinjikji, AJNR 2009). Peso: heurístico, sin fuente. Nota: hoy el "
        "coiling asistido con stent es alternativa aceptada en cuello ancho."
    ),
    "ar": (
        "Ya no vota. Índice de RIESGO DE ROTURA (Dhar 2008; Raghavan 2005), sin "
        "validación para elegir modalidad. Y la evidencia más directa sobre el AR "
        "y el coiling apunta al revés que el +20 que daba a endovascular: un AR "
        "≥ 1.6 se asocia a RECANALIZACIÓN, OR 4.15 (IC 95 % 1.57–11.00) sobre 307 "
        "aneurismas con 79 meses de seguimiento (Neurol Med Chir 2022). Un domo "
        "profundo sobre cuello estrecho retiene bien el coil el día de la "
        "intervención y recanaliza más después: son momentos distintos y ahora se "
        "dicen los dos, en el perfil endovascular."
    ),
    "dnr": (
        "Umbral: relación domo-cuello < 2 es la definición estándar de cuello "
        "ancho (Brinjikji, AJNR 2009). Peso: heurístico, sin fuente."
    ),
    "size": (
        "Umbrales de tamaño de uso corriente; el corte de gigante (25 mm) es "
        "convencional. Peso: heurístico. La diversión de flujo en gigantes tiene "
        "tasas de complicación notables y no es una elección automática."
    ),
    "bf": (
        "Ya no vota. Índice de RIESGO DE ROTURA (Dhar 2008), sin validación para "
        "elegir modalidad. Lo que la relación domo-cuello sí predice —la "
        "necesidad de balón o stent— se dice en el perfil endovascular, con la "
        "fuente que lo mide."
    ),
    "ui": (
        "Ya no vota. Índice de RIESGO DE ROTURA (Raghavan 2005; Dhar 2008), sin "
        "validación para elegir modalidad ni para predecir el resultado del "
        "coiling. Que un saco lobulado se llene peor es un argumento mecánico "
        "razonable, y razonable no es lo mismo que medido: se enuncia como "
        "cautela en el perfil endovascular, no como puntos."
    ),
    "location": (
        "Dirección: práctica establecida y recogida en guía para circulación "
        "posterior (AHA/ASA 2023). En ACM los metaanálisis de 2024-2025 dan "
        "mejor oclusión y menos retratamiento con clipaje, pero SIN diferencia "
        "en resultado funcional. Peso: heurístico, sin fuente."
    ),
    "ruptured": (
        "AHA/ASA 2023: en circulación anterior rota igualmente abordable por "
        "ambas vías, coiling preferente — Clase I, nivel A, la recomendación "
        "más fuerte que toca este motor. ISAT a 18 años: más vivos e "
        "independientes en el brazo endovascular. Peso: heurístico (30), "
        "elegido por una regla que se puede discutir: una recomendación "
        "Clase I nivel A no "
        "puede quedar por debajo de ningún otro factor suelto, y el mayor de "
        "los demás vale 25. Antes valía 15 y una localización en ACM la "
        "volteaba ella sola."
    ),
    "age": (
        "Dirección: el modelo del Japan Stroke Data Bank (Neurol Med Chir 2020) "
        "penaliza el clipaje desde los 72 años y el coiling solo desde los 80, "
        "es decir la edad avanzada tolera peor la cirugía. Magnitud contenida a "
        "propósito: el metaanálisis de 2025 sobre 51 415 pacientes ≥60 años no "
        "halló diferencia en resultado (RR 1,03) ni mortalidad, solo estancia "
        "más corta con coiling, y con certeza muy baja. Peso: heurístico."
    ),
    "wfns": (
        "Variable de mayor peso del modelo validado del Japan Stroke Data Bank, "
        "que la puntúa hasta 3 de 5 puntos y penaliza antes al clipaje (desde "
        "WFNS II-III) que al coiling (desde III). Peso aquí: heurístico, "
        "trasladado por analogía de esa estructura."
    ),
    "fisher": (
        "El modelo del Japan Stroke Data Bank penaliza el COILING en Fisher 4. "
        "Coincide con la posición referida para el hematoma intraparenquimatoso "
        "voluminoso, donde el clipaje permite evacuar en el mismo acto. Peso: "
        "heurístico. No sustituye a medir el hematoma, que esta aplicación aún "
        "no recoge."
    ),
    "small": (
        "Umbral heurístico. No procede de ninguna guía: ESO 2022 plantea la "
        "decisión como comparar el riesgo de rotura contra el del procedimiento, "
        "no como un corte de diámetro."
    ),
}


@dataclass
class _Decision:
    clip_raw:          int
    endo_raw:          int
    balance:           int
    clip_pct:          int
    endo_pct:          int
    recommendation:    str
    recommendation_key: str
    confidence:        str
    factors: list[_Factor] = field(default_factory=list)
    notes:   list[str]     = field(default_factory=list)
    #: Qué parte del caso se ha podido evaluar, y qué datos faltaban.
    coverage_pct:   int       = 100
    missing_inputs: list[str] = field(default_factory=list)


def _small_aneurysm(diameter_mm: float, phases: dict[str, Any] | None,
                    ruptured: bool) -> dict[str, Any]:
    """«Tratar o vigilar» para un aneurisma menor de 3 mm.

    Esto no es la pregunta que responde el resto del módulo. El resto elige
    ENTRE dos tratamientos; esto decide si hay tratamiento, que es la pregunta
    anterior y se contesta con otros datos.

    Se contestaba con el diámetro y nada más, y con confianza «Alta». Dos
    pacientes con el mismo aneurisma de 2.8 mm —uno finlandés, hipertenso, con
    HSA previa, PHASES 14 y 17 % de riesgo a cinco años; otro sin factores, con
    PHASES 0 y 0.4 %— recibían el mismo veredicto y la misma confianza. Un
    riesgo 42 veces mayor no movía nada, porque el PHASES lo calcula el paso de
    morfometría y este cálculo no lo miraba.

    ESO 2022 plantea la decisión como comparar el riesgo de rotura contra el del
    procedimiento. El riesgo del procedimiento no está en esta aplicación, así
    que aquí no se resuelve esa comparación: lo que se hace es dejar de fingir
    que está resuelta cuando las dos cifras no apuntan al mismo sitio.
    """
    notes = [
        f"Aneurisma muy pequeño (Ø {diameter_mm:.1f} mm < 3 mm): el riesgo "
        f"procedimental generalmente supera el riesgo de rotura."
    ]
    # Este camino no evalúa ningún factor, así que no hay cobertura que declarar:
    # lo que decide es el tamaño y, ahora, el riesgo de rotura estimado.
    cov = 0

    if ruptured:
        # Un aneurisma roto ya no plantea la pregunta de vigilar, y el PHASES
        # —construido sobre aneurismas incidentales— no dice nada sobre él.
        notes.append(
            "Pero está roto: la vigilancia no es una opción y el tamaño no la "
            "reabre. Tratamiento según la guía de HSA aneurismática, por la vía "
            "que la anatomía permita."
        )
        return _to_dict(_Decision(
            clip_raw=0, endo_raw=0, balance=0, clip_pct=50, endo_pct=50,
            coverage_pct=cov,
            recommendation="DISCUSIÓN MULTIDISCIPLINARIA",
            recommendation_key="mdt", confidence="Baja",
            factors=[], notes=notes,
        ))

    band = (phases or {}).get("risk_band", "")
    risk = (phases or {}).get("risk_5yr_pct")
    score = (phases or {}).get("total_score")

    if not band:
        notes.append(
            "No se ha estimado el riesgo de rotura: esta recomendación descansa "
            "solo en el diámetro. Calcula el PHASES en Morfometría para que la "
            "comparación entre riesgo de rotura y riesgo del procedimiento —que "
            "es como plantea la decisión la guía ESO 2022— se pueda hacer."
        )
        confidence = "Baja"
    elif band == "high":
        # Las dos cifras se contradicen, y decirlo es más útil que elegir una.
        notes.append(
            f"Pero el PHASES es {score} → {risk:.1f} % de riesgo de rotura a 5 "
            f"años, que es una estimación ALTA. El tamaño sugiere vigilar y el "
            f"riesgo estimado sugiere lo contrario: la decisión no se sostiene "
            f"en el diámetro y corresponde a sesión multidisciplinar."
        )
        return _to_dict(_Decision(
            clip_raw=0, endo_raw=0, balance=0, clip_pct=50, endo_pct=50,
            coverage_pct=cov,
            recommendation="DISCUSIÓN MULTIDISCIPLINARIA",
            recommendation_key="mdt", confidence="Baja",
            factors=[], notes=notes,
        ))
    else:
        notes.append(
            f"El PHASES lo acompaña: {score} → {risk:.1f} % de riesgo de rotura "
            f"a 5 años ({'moderado' if band == 'moderate' else 'bajo'}). "
            f"Seguimiento con imagen."
        )
        confidence = "Alta" if band == "low" else "Moderada"

    return _to_dict(_Decision(
        clip_raw=0, endo_raw=0, balance=0, clip_pct=50, endo_pct=50,
        coverage_pct=cov,
        recommendation="VIGILANCIA ACTIVA", recommendation_key="surveillance",
        confidence=confidence, factors=[], notes=notes,
    ))


# ── Public engine ──────────────────────────────────────────────────────────── #

def compute_decision(
    neck_mm:           float,
    aspect_ratio:      float,
    dnr:               float,
    max_diameter_mm:   float,
    bottleneck_factor: float,
    undulation_index:  float,
    location:          str  = LOCATION_UNKNOWN,
    ruptured:          bool = False,
    phases:            dict[str, Any] | None = None,
    patient_age:       int | None = None,
    wfns_grade:        int | None = None,
    fisher_grade:      int | None = None,
) -> dict[str, Any]:
    """Compute CLIP vs ENDOVASCULAR recommendation.

    All morpho inputs accept 0.0 as "not available" — factors are skipped
    when the input is zero so that partial morpho data still yields a result.

    `phases` is the score the morphometry step already computed, when there is
    one. It does not enter the clip-vs-endo arithmetic — it answers a different
    question — but it decides whether the small-aneurysm shortcut below is
    entitled to say «watch and wait».

    Returns a dict matching TreatmentDecisionResult Pydantic model fields.
    """
    clip_pts = 0
    endo_pts = 0
    factors: list[_Factor] = []
    notes:   list[str]     = []

    def _add(name: str, detail: str, direction: str, pts: int, key: str,
             votes: bool = True) -> None:
        nonlocal clip_pts, endo_pts
        factors.append(_Factor(name, detail, direction, pts if votes else 0,
                               _SOURCE[key], votes))
        if not votes:
            return
        if direction == "clip":
            clip_pts += pts
        elif direction == "endo":
            endo_pts += pts

    # ── Special case: very small aneurysm (< 3 mm) ────────────────────── #
    if 0 < max_diameter_mm < 3.0:
        return _small_aneurysm(max_diameter_mm, phases, ruptured)

    # ── Factor 1: Neck diameter ────────────────────────────────────────── #
    if neck_mm > 0:
        if neck_mm < 4.0:
            _add(
                f"Cuello estrecho ({neck_mm:.1f} mm < 4 mm)",
                "Cuello < 4 mm: retención óptima del coil sin stent de soporte.",
                "endo", 25, "neck",
            )
        elif neck_mm <= 5.0:
            _add(
                f"Cuello intermedio ({neck_mm:.1f} mm, 4–5 mm)",
                "Cuello borderline: posible stent-assisted coiling o clipping.",
                "endo", 5, "neck",
            )
        else:
            _add(
                f"Cuello ancho ({neck_mm:.1f} mm > 5 mm)",
                "Cuello ≥ 5 mm: retención de coil difícil; clipping o flow diverter.",
                "clip", 25, "neck",
            )

    # ── Factor 2: Aspect Ratio (AR = dome_height / neck) ──────────────── #
    if aspect_ratio > 0:
        if aspect_ratio > 2.0:
            _add(
                f"Aspect Ratio alto (AR = {aspect_ratio:.2f} > 2.0)",
                "AR > 2: domo profundo relativo al cuello — geometría favorable para coiling.",
                "endo", 20, "ar", votes=False,
            )
        elif aspect_ratio > 1.3:
            _add(
                f"Aspect Ratio moderado (AR = {aspect_ratio:.2f}, 1.3–2.0)",
                "AR 1.3–2.0: geometría ligeramente favorable para coiling.",
                "endo", 10, "ar", votes=False,
            )
        else:
            _add(
                f"Aspect Ratio bajo (AR = {aspect_ratio:.2f} < 1.3)",
                "AR < 1.3: saco corto y ancho — acceso quirúrgico favorable.",
                "clip", 10, "ar", votes=False,
            )

    # ── Factor 3: Dome-to-Neck Ratio (DNR) ────────────────────────────── #
    if dnr > 0:
        if dnr > 2.0:
            _add(
                f"DNR favorable para coiling (DNR = {dnr:.2f} > 2.0)",
                "DNR > 2: domo amplio relativo al cuello — buena retención de coils.",
                "endo", 15, "dnr",
            )
        elif dnr > 1.5:
            _add(
                f"DNR moderado (DNR = {dnr:.2f}, 1.5–2.0)",
                "DNR 1.5–2.0: leve preferencia por coiling.",
                "endo", 8, "dnr",
            )
        else:
            _add(
                f"DNR bajo (DNR = {dnr:.2f} < 1.5)",
                "DNR < 1.5: cuello ancho relativo al domo — clipping más efectivo.",
                "clip", 15, "dnr",
            )

    # ── Factor 4: Maximum diameter ─────────────────────────────────────── #
    if max_diameter_mm > 0:
        if max_diameter_mm > 25.0:
            _add(
                f"Aneurisma gigante (Ø = {max_diameter_mm:.1f} mm > 25 mm)",
                "Gigante (>25 mm): flow diverter (PED) es tratamiento de elección.",
                "endo", 20, "size",
            )
            notes.append(
                "Aneurisma gigante: considerar flow diverter (Pipeline, Surpass) "
                "o bypass quirúrgico con exclusión."
            )
        elif max_diameter_mm >= 12.0:
            _add(
                f"Aneurisma grande (Ø = {max_diameter_mm:.1f} mm, 12–25 mm)",
                "Grande (12–25 mm): ligera preferencia endovascular; valorar complejidad.",
                "endo", 5, "size",
            )
        elif max_diameter_mm < 5.0:
            _add(
                f"Aneurisma pequeño (Ø = {max_diameter_mm:.1f} mm < 5 mm)",
                "Pequeño (<5 mm): clipping más fiable para exclusión completa.",
                "clip", 8, "size",
            )
        # 5–12 mm: neutral (no factor added)

    # ── Factor 5: Bottleneck Factor (BF = max_dome_diam / neck) ──────── #
    if bottleneck_factor > 0:
        if bottleneck_factor > 2.0:
            _add(
                f"Bottleneck Factor alto (BF = {bottleneck_factor:.2f} > 2.0)",
                "BF > 2: cuello muy estrecho relativo al domo — ideal para coiling.",
                "endo", 12, "bf", votes=False,
            )
        elif bottleneck_factor > 1.5:
            _add(
                f"Bottleneck Factor moderado (BF = {bottleneck_factor:.2f}, 1.5–2.0)",
                "BF 1.5–2.0: cuello moderadamente estrecho.",
                "endo", 6, "bf", votes=False,
            )
        elif bottleneck_factor <= 1.2:
            _add(
                f"Bottleneck Factor bajo (BF = {bottleneck_factor:.2f} ≤ 1.2)",
                "BF ≤ 1.2: domo ancho (no hay efecto de cuello) — clipping favorable.",
                "clip", 8, "bf", votes=False,
            )

    # ── Factor 6: Undulation Index (UI — dome irregularity) ───────────── #
    if undulation_index > 0:
        if undulation_index > 0.20:
            _add(
                f"Domo muy irregular (UI = {undulation_index:.3f} > 0.20)",
                "UI > 0.20: morfología lobulada; riesgo de llenado incompleto con coils.",
                "clip", 10, "ui", votes=False,
            )
        elif undulation_index > 0.10:
            _add(
                f"Domo moderadamente irregular (UI = {undulation_index:.3f}, 0.10–0.20)",
                "UI 0.10–0.20: cierta irregularidad; leve preferencia por clipping.",
                "clip", 5, "ui", votes=False,
            )
        elif undulation_index < 0.05:
            _add(
                f"Domo regular (UI = {undulation_index:.3f} < 0.05)",
                "Domo esférico regular — favorable para empaquetado con coils.",
                "endo", 5, "ui", votes=False,
            )

    # ── Factor 7: Location (clinical input) ───────────────────────────── #
    loc = (location or "").strip()
    if loc == LOCATION_MCA:
        _add(
            "Localización ACM (Arteria Cerebral Media)",
            "ACM: acceso quirúrgico directo — clipping de elección en la mayoría de centros.",
            "clip", 20, "location",
        )
    elif loc == LOCATION_ACA_ACOA:
        _add(
            "Localización ACA / ACoA",
            "ACoA: abordaje quirúrgico bien establecido; ligera preferencia por clipping.",
            "clip", 10, "location",
        )
    elif loc == LOCATION_ICA_PROX:
        _add(
            "Localización ACI proximal (cavernoso / clinoideo)",
            "ACI proximal: acceso endovascular más seguro en la mayoría de casos.",
            "endo", 10, "location",
        )
    elif loc == LOCATION_ICA_DIST:
        _add(
            "Localización ACI distal (PCOM / oftálmica)",
            "ACI distal: factible por ambas vías; leve preferencia endovascular.",
            "endo", 5, "location",
        )
    elif loc == LOCATION_PCOM:
        _add(
            "Localización ACoP (Comunicante Posterior)",
            "PCOM: tratable por ambas vías; el tamaño y morfología determinan la estrategia.",
            "neutral", 0, "location",
        )
    elif loc == LOCATION_BASILAR:
        _add(
            "Localización Basilar (punta, tronco o AICA)",
            "Basilar: acceso quirúrgico de alta complejidad — endovascular de elección.",
            "endo", 25, "location",
        )
    elif loc == LOCATION_PICA:
        _add(
            "Localización PICA / Vertebral",
            "Circulación posterior: endovascular preferido por acceso quirúrgico difícil.",
            "endo", 20, "location",
        )

    # ── Factor 8: Rupture status ───────────────────────────────────────── #
    if ruptured:
        _add(
            "Aneurisma roto (HSA activa)",
            "Roto: coiling preferente en circulación anterior abordable por ambas "
            "vías (AHA/ASA 2023, Clase I nivel A).",
            "endo", 30, "ruptured",
        )
        notes.append(
            "Aneurisma roto: el coiling es de primera elección si la morfología lo permite "
            "(ISAT 2002). Si no es factible endovascularmente, clipping de urgencia."
        )

    # ── Factor 9: Age ──────────────────────────────────────────────────── #
    if patient_age is not None and patient_age > 0:
        if patient_age >= 80:
            _add(f"Edad ≥ 80 años ({patient_age})",
                 "Edad muy avanzada: el modelo japonés penaliza ya ambas vías, y "
                 "más la cirugía.", "endo", 12, "age")
        elif patient_age >= 72:
            _add(f"Edad 72–79 años ({patient_age})",
                 "Desde los 72 el modelo japonés penaliza el clipaje y todavía no "
                 "el coiling.", "endo", 6, "age")

    # ── Factores 10-11: sólo existen si hay hemorragia ─────────────────── #
    # WFNS gradúa una hemorragia subaracnoidea y Fisher la sangre del TC. En un
    # aneurisma incidental no hay nada que graduar, así que no se piden ni se
    # echan en falta: se ignoran en silencio si llegaran.
    if ruptured:
        if wfns_grade:
            if wfns_grade >= 4:
                _add(f"WFNS {wfns_grade} (mal grado)",
                     "Mal grado clínico: es la variable de mayor peso del modelo "
                     "validado, y penaliza antes al clipaje.", "endo", 15, "wfns")
            elif wfns_grade == 3:
                _add("WFNS 3",
                     "Grado intermedio: el modelo validado ya lo penaliza en ambas "
                     "vías, algo más en la quirúrgica.", "endo", 8, "wfns")
        if fisher_grade == 4:
            _add("Fisher 4 (sangre intraparenquimatosa o intraventricular)",
                 "El modelo validado penaliza el coiling en Fisher 4; con hematoma "
                 "voluminoso el clipaje permite evacuar en el mismo acto.",
                 "clip", 10, "fisher")

    # ── Compute percentages ────────────────────────────────────────────── #
    total = clip_pts + endo_pts
    if total == 0:
        clip_pct = endo_pct = 50
    else:
        clip_pct = round(clip_pts / total * 100)
        endo_pct = 100 - clip_pct

    balance = clip_pts - endo_pts

    # ── Qué parte del caso se ha podido mirar ──────────────────────────── #
    #
    # Nada es obligatorio, y dos de estos datos ni siquiera pueden serlo: WFNS
    # gradúa una hemorragia y Fisher la sangre del TC, así que en un aneurisma
    # incidental no existen. Lo que sí hacía falta era dejar de tratar «no lo sé»
    # como si fuera «no inclina».
    #
    # La confianza se sacaba de |saldo|, y el saldo crece sumando factores. Un
    # caso con un único dato —el cuello— salía con «CLIPPING QUIRÚRGICO» y
    # confianza Moderada: un veredicto sobre una sola medida. Medía cuántos
    # factores había, no cuánto se sabía.
    applicable = {"neck", "dnr", "size", "location", "ruptured"}
    known = {"ruptured"}
    for key, value in (("neck", neck_mm), ("dnr", dnr), ("size", max_diameter_mm)):
        if value > 0:
            known.add(key)
    if (location or "").strip() and location != LOCATION_UNKNOWN:
        known.add("location")
    # La edad siempre aplica; el grado clínico sólo con hemorragia.
    applicable.add("age")
    if patient_age is not None and patient_age > 0:
        known.add("age")
    if ruptured:
        applicable |= {"wfns", "fisher"}
        if wfns_grade:
            known.add("wfns")
        if fisher_grade:
            known.add("fisher")

    coverage = _coverage(known, applicable)
    missing = [_INPUT_LABEL[k] for k in sorted(applicable - known) if k in _INPUT_LABEL]

    # ── Confidence & recommendation ────────────────────────────────────── #
    abs_bal    = abs(balance)
    confidence = "Alta" if abs_bal >= 50 else "Moderada" if abs_bal >= 25 else "Baja"

    # El acuerdo entre factores no puede compensar los que no se han mirado.
    if coverage < 0.5:
        confidence = "Baja"
    elif coverage < 0.8 and confidence == "Alta":
        confidence = "Moderada"

    if missing:
        notes.append(
            f"Evaluado el {round(coverage * 100)} % del caso: falta "
            f"{', '.join(missing)}. La recomendación se calcula igualmente con lo "
            f"disponible, pero la confianza está limitada por lo que no se ha "
            f"podido mirar, no sólo por el acuerdo entre lo que sí."
        )

    if balance >= 20:
        rec, rec_key = "CLIPPING QUIRÚRGICO", "clip"
    elif balance <= -20:
        rec, rec_key = "TRATAMIENTO ENDOVASCULAR", "endo"
    else:
        rec, rec_key = "DISCUSIÓN MULTIDISCIPLINARIA", "mdt"
        if confidence == "Baja":
            notes.append(
                "Resultado ambiguo: se recomienda presentar el caso en sesión "
                "neuroendovascular multidisciplinaria antes de decidir la estrategia."
            )

    logger.debug(
        "TreatmentDecision: clip=%d endo=%d balance=%d → %s (%s)",
        clip_pts, endo_pts, balance, rec_key, confidence,
    )

    from services.endovascular import endovascular_profile, profile_to_dict

    out = _to_dict(_Decision(
        clip_raw=clip_pts, endo_raw=endo_pts, balance=balance,
        clip_pct=clip_pct, endo_pct=endo_pct,
        recommendation=rec, recommendation_key=rec_key,
        confidence=confidence,
        factors=factors, notes=notes,
        coverage_pct=round(coverage * 100), missing_inputs=missing,
    ))
    # Lo que la morfología SÍ describe con respaldo: cómo sería la vía
    # endovascular. Se calcula siempre, también cuando la recomendación es
    # clipaje, porque una sesión multidisciplinar compara las dos opciones y no
    # sólo la ganadora.
    out["endovascular"] = profile_to_dict(endovascular_profile(
        neck_mm=neck_mm, dnr=dnr, aspect_ratio=aspect_ratio,
        max_diameter_mm=max_diameter_mm, undulation_index=undulation_index,
    ))
    return out


# ── Serialiser ─────────────────────────────────────────────────────────────── #

def _to_dict(d: _Decision) -> dict[str, Any]:
    """Convert _Decision to a dict matching TreatmentDecisionResult fields."""
    factor_dicts = [
        {
            "name":      f.name,
            "detail":    f.detail,
            "direction": f.direction,
            "points":    f.points,
            "source":    f.source,
            "votes":     f.votes,
        }
        for f in d.factors
    ]
    return {
        # Los puntos, además del cociente. La barra «CLIP 72 % · ENDO 28 %» se
        # lee como una probabilidad y no lo es: es la proporción de unos puntos
        # heurísticos normalizada a 100. Publicar el crudo permite enseñar lo que
        # de verdad se ha sumado.
        "clip_points":        d.clip_raw,
        "endo_points":        d.endo_raw,
        "clip_pct":           d.clip_pct,
        "endo_pct":           d.endo_pct,
        "balance":            d.balance,
        "recommendation":     d.recommendation,
        "recommendation_key": d.recommendation_key,
        "confidence":         d.confidence,
        "factors":            factor_dicts,
        "clip_factors":       [f.name for f in d.factors if f.direction == "clip"],
        "endo_factors":       [f.name for f in d.factors if f.direction == "endo"],
        # Las notas se calculaban y se tiraban: no salían del motor, así que ni
        # la pantalla ni el informe las veían nunca. Es donde vive el
        # razonamiento del caso pequeño —incluida ahora la comparación con el
        # PHASES— y sin ellas el veredicto llega sin el porqué.
        "notes":              list(d.notes),
        "coverage_pct":       d.coverage_pct,
        "missing_inputs":     list(d.missing_inputs),
    }
