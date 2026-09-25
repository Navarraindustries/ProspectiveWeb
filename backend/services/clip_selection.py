"""Clip selection: which clip fits THIS aneurysm, and why — or what to manufacture.

Why this exists next to `clips.py`
-----------------------------------
`clips.recommend_clips` scores the catalogue against two numbers (neck diameter
and aspect ratio) and returns a 0–100 composite. That has three problems this
module fixes:

1. **It only sees two variables.** Clip choice also depends on how deep the dome
   sits, whether a branch runs through the neck, the parent-artery calibre, the
   anatomical region, and how trustworthy the neck measurement is. All of those
   are already measured and stored — they were simply never fed to the scorer.

2. **It fails silently.** Its hard gate is `neck + 1 mm <= blade <= neck * 3`.
   A 1 mm neck and a 20 mm neck both come back as an empty list with nothing
   said. An empty list IS the answer "no stock clip fits" — it just has to be
   delivered as a manufacturing specification instead of as silence.

3. **A composite score is not a rationale.** "92.6" cannot be defended in front
   of a surgeon. Every candidate here carries a per-criterion verdict with the
   measurement behind it, so the panel can show *why* a clip ranks where it does
   and *what single thing* disqualified the ones that failed.

What this module is and is not
-------------------------------
The geometric criteria (blade vs neck, safety margin, fenestration calibre) are
arithmetic on measured quantities and are as good as the morphometry feeding
them. The clinical preferences (shape per region, closing-force windows) are
heuristics from the literature below, NOT validated against annotated cases —
there is no ground truth in this project to validate a ranking against. The
output is therefore assistive and always shows its reasons; it does not choose
a clip.

One limit is worth naming because it looks solvable and is not: whether a branch
actually runs through the neck cannot be seen from the isolated sac mesh. This
module infers "consider a fenestrated clip" from the anatomical region recorded
on the case, so that criterion is never a hard rejection — only a flag.

References
----------
- Lawton 2011, "Seven Aneurysms" — clip selection algorithm by location
- Molyneux et al. — neck >= 4 mm as the wide-neck threshold
- Pierot & Wakhloo 2013 — shape-based selection rationale
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Literal

from services.clips import (
    DEEP_DOME_AR_THRESHOLD,
    NECK_DEFORMATION_FACTOR,
    WIDE_NECK_THRESHOLD_MM,
    ClipShape,
    ClipSpec,
    JawRequirement,
    jaw_requirement,
)

Verdict = Literal["ok", "warn", "fail"]

# ── Geometric limits ──────────────────────────────────────────────────────── #

# The blade has to overshoot the neck: a blade the width of the neck leaves no
# room for the residual wall and slips. 1 mm is the floor the legacy scorer used,
# kept here so the two modules agree on what is physically impossible.
BLADE_MIN_OVER_MM: float = 1.0
# Past this the clip is oversized for the target and its distal end sits in
# tissue it has no business touching.
BLADE_MAX_RATIO: float = 3.0
# Lo que sobra por encima de la mordaza requerida, en mm, antes de que la hoja
# empiece a estorbar. No es una campana sobre un ratio: la mordaza justa YA
# contempla la deformacion del cuello, asi que quedarse en ella es correcto y lo
# unico penalizable es pasarse. Sigma en milimetros, no en proporcion, porque
# 3 mm de hoja de mas son 3 mm de hoja de mas en un cuello de 2 y en uno de 8.
EXCESS_SIGMA_MM: float = 2.5
# Por encima de esto la hoja es larga para el objetivo aunque no llegue al tope.
COVERAGE_COMFORTABLE_HI: float = 2.20

# ── Closing-force windows by neck width ───────────────────────────────────── #
# A wider neck carries more residual wall between the blades, so it needs a
# firmer spring to stay put. Windows are (acceptable_lo, optimal_lo, optimal_hi,
# acceptable_hi) in grams. Heuristic, not measured.
_FORCE_WINDOWS: list[tuple[float, tuple[float, float, float, float]]] = [
    (4.0, (70.0, 80.0, 120.0, 150.0)),      # neck < 4 mm
    (7.0, (85.0, 100.0, 150.0, 175.0)),     # 4 mm <= neck < 7 mm
    (1e9, (105.0, 120.0, 190.0, 220.0)),    # neck >= 7 mm
]


def force_window(neck_mm: float) -> tuple[float, float, float, float]:
    """Acceptable and optimal closing-force band for a neck of this width."""
    for limit, window in _FORCE_WINDOWS:
        if neck_mm < limit:
            return window
    return _FORCE_WINDOWS[-1][1]


# ── Anatomical region → shape preference ──────────────────────────────────── #
# Keys are matched as substrings against the case's free-text region, lowercased
# and accent-stripped, because that field is typed by hand. An unrecognised
# region yields no preference rather than a penalty: a clip is not punished for
# a region we failed to parse.
_REGION_PREFERENCE: list[tuple[tuple[str, ...], dict[ClipShape, float], str]] = [
    (
        ("acom", "acoa", "comunicante anterior"),
        {ClipShape.STRAIGHT: 1.0, ClipShape.ANGLED_45: 0.9, ClipShape.CURVED: 0.85,
         ClipShape.FENESTRATED: 0.8, ClipShape.ANGLED: 0.7, ClipShape.BAYONET: 0.5},
        "ACoA: campo estrecho entre las A2; recto o angulado 45° es lo habitual",
    ),
    (
        ("acm", "cerebral media", "silviana", "m1", "m2"),
        {ClipShape.STRAIGHT: 1.0, ClipShape.CURVED: 0.95, ClipShape.FENESTRATED: 0.85,
         ClipShape.ANGLED_45: 0.7, ClipShape.ANGLED: 0.6, ClipShape.BAYONET: 0.5},
        "ACM: bifurcación superficial; recto o curvo, fenestrado si el cuello incorpora M2",
    ),
    (
        ("carotida", "ica", "paraclinoid", "paraclinoide", "oftalmica",
         "comunicante posterior", "acop"),
        {ClipShape.BAYONET: 1.0, ClipShape.ANGLED: 0.95, ClipShape.CURVED: 0.85,
         ClipShape.FENESTRATED: 0.8, ClipShape.ANGLED_45: 0.75, ClipShape.STRAIGHT: 0.6},
        "Carótida/paraclinoideo: campo profundo bajo la clinoides; bayoneta o angulado "
        "apartan el mango de la línea de visión",
    ),
    (
        ("basilar", "vertebral", "pica", "posterior", "tronco"),
        {ClipShape.ANGLED: 1.0, ClipShape.BAYONET: 0.95, ClipShape.ANGLED_45: 0.85,
         ClipShape.CURVED: 0.7, ClipShape.FENESTRATED: 0.65, ClipShape.STRAIGHT: 0.5},
        "Circulación posterior: campo profundo y estrecho; angulado o bayoneta",
    ),
    (
        ("pericallos", "callosomarginal", "aca", "a2", "a3"),
        {ClipShape.STRAIGHT: 1.0, ClipShape.CURVED: 0.9, ClipShape.ANGLED_45: 0.8,
         ClipShape.ANGLED: 0.6, ClipShape.BAYONET: 0.5, ClipShape.FENESTRATED: 0.5},
        "Pericallosa: vaso pequeño y superficial; recto corto",
    ),
]

# Regions where the neck commonly incorporates a branch, so a fenestrated clip is
# worth considering. A prompt, never a rejection: the branch itself is not
# visible in the isolated sac mesh (see the module docstring).
#
# Split by how they must be matched. A short acronym as a bare substring finds
# itself inside ordinary words: "ica" sits in "per-ica-llosa", so every
# pericallosal aneurysm was read as a bifurcation and sent to a fenestrated clip
# the family cannot even build. Acronyms are matched on word boundaries; the
# long descriptive terms stay substrings so "cerebral media derecha" still hits.
_ACCENTS = str.maketrans("áéíóúàèìòùäëïöüâêîôûñ", "aeiouaeiouaeiouaeioun")
_WORD_RE = re.compile(r"[a-z0-9]+")

_BIFURCATION_ACRONYMS: tuple[str, ...] = ("acom", "acoa", "acm", "ica")
_BIFURCATION_TERMS: tuple[str, ...] = (
    "comunicante", "cerebral media", "bifurcac", "trifurcac", "basilar", "carotida",
)

def _mentions_bifurcation(text: str) -> bool:
    """Whether this free-text location suggests a branch at the neck."""
    hay = _norm(text)
    if any(t in hay for t in _BIFURCATION_TERMS):
        return True
    return bool(set(_WORD_RE.findall(hay)) & set(_BIFURCATION_ACRONYMS))


def _norm(text: str) -> str:
    """Lowercase and strip accents so hand-typed region text still matches."""
    return (text or "").strip().lower().translate(_ACCENTS)


def _matches_key(key: str, hay: str, words: set[str]) -> bool:
    """One preference key against a location, with the right kind of match.

    Short single tokens are acronyms and must match whole words. As bare
    substrings they find themselves inside ordinary anatomy: "ica" sits in
    "per-ica-llosa", so a pericallosal aneurysm was picking up the CAROTID
    preferences — which argue for a bayonet in a deep field, exactly the wrong
    advice for a small superficial vessel. Longer descriptive keys stay
    substrings so "cerebral media derecha" still matches.
    """
    if " " not in key and len(key) <= 4:
        return key in words
    return key in hay


def _region_preference(region: str, aneurysm_type: str) -> tuple[dict[ClipShape, float] | None, str]:
    hay = f"{_norm(region)} {_norm(aneurysm_type)}"
    words = set(_WORD_RE.findall(hay))
    for keys, table, note in _REGION_PREFERENCE:
        if any(_matches_key(k, hay, words) for k in keys):
            return table, note
    return None, ""


# ── The case ──────────────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class ClipCase:
    """Everything about one aneurysm that changes which clip fits.

    Only `neck_mm` is required. Every other field degrades to "not considered"
    rather than to a wrong assumption, because a session can reach the devices
    step with a partial measurement and a half-filled case record.
    """
    neck_mm: float
    #: Perimetro del contorno del cuello, cuando se ha marcado el plano y se ha
    #: podido medir. Su mitad es la linea de cierre exacta de este cuello; sin
    #: el se aplica la regla de x1,5 sobre el diametro. Ver `jaw_requirement`.
    neck_perimeter_mm: float = 0.0
    dome_height_mm: float = 0.0
    max_diameter_mm: float = 0.0
    ar: float = 0.0
    dnr: float = 0.0
    bf: float = 0.0
    parent_artery_mm: float = 0.0
    neck_source: str = "auto"          # auto | manual | rim
    neck_tilt_deg: float = 0.0
    neck_reliable: bool = True
    region: str = ""
    laterality: str = ""
    aneurysm_type: str = ""

    @property
    def jaw_requirement(self) -> JawRequirement:
        """La mordaza minima que cierra este cuello, con su procedencia."""
        return jaw_requirement(self.neck_mm, self.neck_perimeter_mm)

    @property
    def is_wide_neck(self) -> bool:
        return self.neck_mm >= WIDE_NECK_THRESHOLD_MM

    @property
    def is_deep_dome(self) -> bool:
        return self.ar >= DEEP_DOME_AR_THRESHOLD

    @property
    def suggests_fenestration(self) -> bool:
        return _mentions_bifurcation(f"{self.region} {self.aneurysm_type}")


# ── Criteria ──────────────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class Criterion:
    """One judged aspect of a clip, carrying the number behind the verdict."""
    key: str
    label: str
    verdict: Verdict
    detail: str
    score: float          # 0–1, contribution to the ranking
    weight: float = 1.0


@dataclass
class GeometryCheck:
    """Result of actually placing the clip on the measured neck plane.

    `clean_rolls` of `n_rolls` matters as much as `collision` does. Reporting
    only the best orientation made a clip that clears the neighbouring vessel at
    every angle indistinguishable from one that clears it at exactly one — and
    the second demands an application accuracy the first does not.
    """
    collision: bool
    n_contacts: int
    span_mm: float
    neck_coverage_pct: float
    clean_rolls: int = 0
    n_rolls: int = 0
    note: str = ""

    @property
    def tight(self) -> bool:
        """Usable, but only from a narrow band of approach angles."""
        return 0 < self.clean_rolls <= max(1, self.n_rolls // 3)


@dataclass
class ClipCandidate:
    clip: ClipSpec
    criteria: list[Criterion]
    coverage_ratio: float
    safety_margin_mm: float
    score: float = 0.0                        # 0–100
    verified: GeometryCheck | None = None     # filled in by the VTK pass

    @property
    def failures(self) -> list[Criterion]:
        return [c for c in self.criteria if c.verdict == "fail"]

    @property
    def warnings(self) -> list[Criterion]:
        return [c for c in self.criteria if c.verdict == "warn"]

    @property
    def viable(self) -> bool:
        return not self.failures

    @property
    def verdict(self) -> Verdict:
        if self.failures:
            return "fail"
        return "warn" if self.warnings else "ok"

    @property
    def headline(self) -> str:
        """The single sentence the panel shows under the clip name."""
        if self.failures:
            return self.failures[0].detail
        if self.warnings:
            return self.warnings[0].detail
        return (f"Cumple todos los criterios · cobertura ×{self.coverage_ratio:.2f}, "
                f"margen {self.safety_margin_mm:.1f} mm")


#: Floor for a criterion that warns rather than fails. A warning means the clip
#: is usable with a caveat, and a score of exactly zero says the opposite — it is
#: what a failed criterion scores. Small enough that a warned clip never
#: outranks a clean one, non-zero so a list of warned clips still has an order.
WARN_SCORE_FLOOR = 0.05


def _coverage_criterion(clip: ClipSpec, case: ClipCase) -> Criterion:
    """¿Cierra esta hoja el cuello DESPUÉS de aplastarlo?

    El criterio no compara la hoja con el diámetro del cuello, sino con la
    longitud que ese cuello toma al quedar plano entre las hojas —el perímetro
    medido partido por dos, o la regla de ×1,5 cuando no se ha medido—. Ahí es
    donde se juega el fallo que importa: el cierre incompleto del lado distal es
    la causa más frecuente de que el domo siga rellenándose.

    Por eso no hay campana sobre un ratio. Quedarse en la mordaza justa ya es
    correcto, porque la deformación está contada; lo único penalizable es
    pasarse, y pasarse de verdad —con la punta sobre tejido sano— lo descarta.
    """
    neck = case.neck_mm
    bl = clip.blade_length_mm
    cov = bl / neck if neck > 0 else 0.0
    req = case.jaw_requirement
    margin = bl - req.mm

    if req.mm > 0.0 and bl < req.mm:
        return Criterion(
            "coverage", "Cobertura", "fail",
            f"Hoja de {bl:.0f} mm insuficiente: el cuello de {neck:.1f} mm mide "
            f"{req.mm:.1f} mm una vez aplastado entre las hojas, y por debajo de "
            f"eso el cierre queda incompleto",
            0.0, weight=2.0,
        )
    if cov > BLADE_MAX_RATIO:
        return Criterion(
            "coverage", "Cobertura", "fail",
            f"Hoja de {bl:.0f} mm sobredimensionada (×{cov:.1f} el cuello): "
            f"el extremo distal queda sobre tejido sano",
            0.0, weight=2.0,
        )
    # Con el mínimo ya garantizado arriba, la puntuación solo ordena por exceso:
    # entre dos hojas que cierran, la más corta estorba menos. Conserva el suelo
    # de `warn` para que una hoja utilizable-con-reservas nunca puntúe cero, que
    # es lo que significa haber fallado un criterio.
    score = max(WARN_SCORE_FLOOR, math.exp(-0.5 * (margin / EXCESS_SIGMA_MM) ** 2))
    if cov > COVERAGE_COMFORTABLE_HI:
        return Criterion(
            "coverage", "Cobertura", "warn",
            f"Cierra el cuello aplastado ({req.mm:.1f} mm) pero sobran "
            f"{margin:.1f} mm de hoja (×{cov:.2f} el cuello)",
            score, weight=2.0,
        )
    return Criterion(
        "coverage", "Cobertura", "ok",
        f"Cierra el cuello aplastado ({req.mm:.1f} mm) con {margin:.1f} mm "
        f"de margen (×{cov:.2f} el cuello sin deformar)",
        score, weight=2.0,
    )


def _fenestration_criterion(clip: ClipSpec, case: ClipCase) -> Criterion | None:
    """Only emitted when the recorded region suggests a branch at the neck."""
    if not case.suggests_fenestration:
        return None
    is_fen = clip.shape == ClipShape.FENESTRATED
    parent = case.parent_artery_mm

    if not is_fen:
        # No criterion at all. Whether a branch runs through the neck is not
        # visible in the isolated sac mesh, so flagging every non-fenestrated
        # clip would warn on almost the whole catalogue — and a warning that
        # fires on everything stops carrying information. The prompt belongs
        # once, at case level, in `_caveats`.
        return None
    if parent <= 0:
        return Criterion(
            "fenestration", "Fenestración", "warn",
            "Fenestrado indicado, pero no hay diámetro de vaso padre medido con el que "
            "comprobar que la rama pasa por la ventana",
            0.75,
        )
    if clip.fenestration_mm <= 0:
        return Criterion(
            "fenestration", "Fenestración", "warn",
            f"Fenestrado indicado; el catálogo no declara el diámetro de ventana — "
            f"verificar que admite un vaso de {parent:.1f} mm",
            0.80,
        )
    if clip.fenestration_mm < parent:
        return Criterion(
            "fenestration", "Fenestración", "fail",
            f"Ventana de {clip.fenestration_mm:.1f} mm menor que el vaso padre "
            f"({parent:.1f} mm): estrangularía la rama",
            0.0,
        )
    return Criterion(
        "fenestration", "Fenestración", "ok",
        f"Ventana de {clip.fenestration_mm:.1f} mm admite el vaso padre ({parent:.1f} mm)",
        1.0,
    )


def _reach_criterion(clip: ClipSpec, case: ClipCase) -> Criterion | None:
    """A deep dome needs a shape that clears the sac to reach the neck."""
    if not case.is_deep_dome:
        return None
    # What a bend buys is a shaft that leaves the neck plane, so the sac does not
    # have to be retracted to get the applier in. WHETHER the shaft clears is
    # what the geometry supports; HOW MUCH bend is best is not — and scoring 90°
    # above 60° above 45° said it was, which is why a neutral case came back with
    # six angled clips whose only difference was an angle nobody had justified.
    #
    # So: bent clears, straight does not, and every bend scores the same. The
    # actual angle is on screen and in the order form, as the surgeon's choice.
    bent = clip.shape in (ClipShape.ANGLED, ClipShape.ANGLED_45,
                          ClipShape.BAYONET, ClipShape.CURVED)
    head = (f"Domo profundo (AR {case.ar:.2f}, altura {case.dome_height_mm:.1f} mm): "
            f"{clip.shape.value.lower()}")
    if bent:
        bend = f" con acodado de {clip.bend_angle_deg:.0f}°" if clip.bend_angle_deg else ""
        return Criterion(
            "reach", "Alcance", "ok",
            f"{head}{bend} aparta el mango del saco para alcanzar el cuello. "
            f"Cuánto acodado conviene lo decide el corredor de abordaje, no esta "
            f"puntuación: las variantes acodadas puntúan igual entre sí.", 1.0)
    return Criterion("reach", "Alcance", "warn",
                     f"{head} deja el mango sobre el saco: obliga a más retracción. "
                     f"Considerar una variante acodada o curva.", 0.55)


def _shape_criterion(clip: ClipSpec, case: ClipCase) -> Criterion | None:
    table, note = _region_preference(case.region, case.aneurysm_type)
    if table is None:
        return None
    s = table.get(clip.shape, 0.5)
    if s >= 0.85:
        return Criterion("shape", "Forma / localización", "ok",
                         f"{clip.shape.value} adecuado. {note}", s)
    if s >= 0.60:
        return Criterion("shape", "Forma / localización", "warn",
                         f"{clip.shape.value} es viable pero no la primera opción. {note}", s)
    return Criterion("shape", "Forma / localización", "warn",
                     f"{clip.shape.value} poco habitual en esta localización. {note}", s)


def _force_weight(clip: ClipSpec) -> float:
    """How much the force criterion votes. Zero while the band is a design target.

    Not a way of hiding it: the verdict and the numbers stay on screen, and a
    band that could not hold the neck still fails the clip outright. What it
    stops doing is ordering a list where it is identical for every candidate.
    """
    return 0.0 if clip.force_provisional else 1.0


def _force_criterion(clip: ClipSpec, case: ClipCase) -> Criterion:
    """Judge the spring against the neck, honouring a band when that is all there is.

    A part whose force is still a design target has a BAND, not a figure. Taking
    its midpoint would report a precision the part does not have, and taking its
    best end would flatter it. So a band is judged on its worst credible end —
    a clip is only safe if it is safe across everything it might turn out to be —
    and the verdict is capped at `warn` while it stays provisional, because
    "meets the criterion" is a claim nobody can make yet.
    """
    acc_lo, opt_lo, opt_hi, acc_hi = force_window(case.neck_mm)
    lo, hi = clip.force_band
    banded = hi > lo
    shown = f"{lo:.0f}–{hi:.0f} g" if banded else f"{lo:.0f} g"
    tail = " (banda de diseño, sin caracterizar)" if clip.force_provisional else ""

    # Nothing the band could turn out to be would hold this neck.
    if hi < acc_lo:
        return Criterion(
            "force", "Fuerza de cierre", "fail",
            f"{shown} insuficiente para un cuello de {case.neck_mm:.1f} mm "
            f"(mínimo {acc_lo:.0f} g): riesgo de deslizamiento{tail}",
            0.0,
        )
    # Nothing it could turn out to be would be gentle enough.
    if lo > acc_hi:
        return Criterion(
            "force", "Fuerza de cierre", "warn",
            f"{shown} por encima de lo necesario (máx. {acc_hi:.0f} g): "
            f"riesgo de lesión de la pared{tail}",
            0.30, _force_weight(clip),
        )

    inside_opt = lo >= opt_lo and hi <= opt_hi
    if inside_opt and not clip.force_provisional:
        return Criterion("force", "Fuerza de cierre", "ok",
                         f"{shown} dentro de la ventana {opt_lo:.0f}–{opt_hi:.0f} g", 1.0, _force_weight(clip))
    if inside_opt:
        return Criterion(
            "force", "Fuerza de cierre", "warn",
            f"{shown} cae entera en la ventana {opt_lo:.0f}–{opt_hi:.0f} g, pero la "
            f"fuerza real está sin caracterizar: confirmar antes de fabricar",
            0.80, _force_weight(clip),
        )
    # Part of the band is usable. Say which part, so the figure to ask the
    # manufacturer for is on screen instead of left to be worked out.
    ov_lo, ov_hi = max(lo, opt_lo), min(hi, opt_hi)
    if ov_lo <= ov_hi:
        return Criterion(
            "force", "Fuerza de cierre", "warn",
            f"{shown} solo es óptima entre {ov_lo:.0f} y {ov_hi:.0f} g para este "
            f"cuello ({opt_lo:.0f}–{opt_hi:.0f} g){tail}",
            0.60, _force_weight(clip),
        )
    return Criterion(
        "force", "Fuerza de cierre", "warn",
        f"{shown} aceptable pero fuera del óptimo {opt_lo:.0f}–{opt_hi:.0f} g{tail}",
        0.55, _force_weight(clip),
    )


def recompute_score(cand: ClipCandidate) -> None:
    """Re-derive the 0–100 score after a criterion is added or changed.

    The geometric verification runs after the analytic pass, so its criterion
    lands on a candidate that was already scored.
    """
    total_w = sum(c.weight for c in cand.criteria) or 1.0
    raw = 100.0 * sum(c.score * c.weight for c in cand.criteria) / total_w
    cand.score = 0.0 if any(c.verdict == "fail" for c in cand.criteria) else round(raw, 1)


def _opening_criterion(clip: ClipSpec, case: ClipCase) -> Criterion | None:
    """How wide the tips part, against the neck they have to go around.

    A different dimension from the one the whole selector was built on. The jaw
    LENGTH has to span the neck; the OPENING is perpendicular to it, and it is
    capped by the applier, not by the blade — a 22 mm jaw parts no further than
    a 10 mm one. So the ranking could hand a 15 mm neck a 19 mm jaw, correct on
    every criterion it had, whose tips never part beyond 10 mm.

    Nothing said so. `coverage`, `reach` and `force` were the three criteria, and
    none of them looks at this axis.

    **This one warns and does not vote** — weight 0.0, like the closing force.
    Saying how much clearance over the neck is enough is a clinical judgement,
    and no figure here is validated; inventing a threshold would reorder the list
    on an opinion nobody has signed. What is not an opinion is the arithmetic:
    the tips part this much, the neck measures that much, and when the first does
    not exceed the second it goes on screen.
    """
    if case.neck_mm <= 0:
        return None
    try:
        from services.clip_animation import MAX_TIP_OPENING_MM, tip_opening_mm
    except Exception:  # noqa: BLE001 — no animation module, no claim to make
        return None

    opening = tip_opening_mm(clip.blade_length_mm)
    capped = opening >= MAX_TIP_OPENING_MM
    how = ("el aplicador limita el recorrido" if capped
           else "por debajo del tope, estimada de clips comerciales")

    if opening > case.neck_mm:
        return Criterion(
            "opening", "Apertura de las hojas", "ok",
            f"Las puntas separan {opening:.1f} mm, más que el cuello "
            f"({case.neck_mm:.1f} mm) — {how}",
            1.0, 0.0,
        )
    return Criterion(
        "opening", "Apertura de las hojas", "warn",
        f"Las puntas separan {opening:.1f} mm y el cuello mide "
        f"{case.neck_mm:.1f} mm: la apertura no lo supera, así que hay que "
        f"comprobar en el ensayo que el clip llega a montarse sobre él "
        f"({how})",
        0.0, 0.0,
    )


def evaluate_clip(clip: ClipSpec, case: ClipCase) -> ClipCandidate:
    """Judge one clip against one case, criterion by criterion.

    A candidate with any `fail` scores 0: the ranking must never float a clip
    that cannot physically be used above one that can.
    """
    crits: list[Criterion] = [_coverage_criterion(clip, case)]
    for maybe in (_fenestration_criterion(clip, case),
                  _reach_criterion(clip, case),
                  _shape_criterion(clip, case),
                  _opening_criterion(clip, case),
                  _force_criterion(clip, case)):
        if maybe is not None:
            crits.append(maybe)

    # Two criteria are shown and do not vote, for different reasons. The closing
    # force scores the same for every candidate — one uncharacterised band for
    # the whole family, 0.60 on all 66 — and a constant cannot order anything, it
    # only dilutes the criteria that can; it still FAILS a clip whose band could
    # not hold the neck, which zeroes the score below. The blade opening is the
    # opposite case: it discriminates perfectly well, but how much clearance over
    # the neck is enough is a clinical call nobody here has signed, and weighting
    # an unvalidated threshold would reorder the list on an opinion.
    total_w = sum(c.weight for c in crits if c.weight > 0) or 1.0
    raw = 100.0 * sum(c.score * c.weight for c in crits if c.weight > 0) / total_w
    failed = any(c.verdict == "fail" for c in crits)
    cov = clip.blade_length_mm / case.neck_mm if case.neck_mm > 0 else 0.0

    return ClipCandidate(
        clip=clip,
        criteria=crits,
        coverage_ratio=round(cov, 3),
        # Sobre el cuello APLASTADO, que es contra lo que cierra la hoja.
        safety_margin_mm=round(clip.blade_length_mm - case.jaw_requirement.mm, 2),
        score=0.0 if failed else round(raw, 1),
    )


# ── Manufacturing specification ───────────────────────────────────────────── #
# Blade width/height and spring length are not free parameters: they track blade
# length across every real clip in the catalogue. Rather than invent them for a
# clip that does not exist yet, derive the proportions from the clips that do.

def _catalogue_proportions() -> tuple[float, float, float]:
    """Median width/length, height/length and spring/length across the catalogue."""
    from statistics import median

    from services.clips import CLIP_CATALOGUE
    w = median(c.blade_width_mm / c.blade_length_mm for c in CLIP_CATALOGUE)
    h = median(c.blade_height_mm / c.blade_length_mm for c in CLIP_CATALOGUE)
    s = median(c.spring_length_mm / c.blade_length_mm for c in CLIP_CATALOGUE)
    return w, h, s


def _catalogue_floors() -> tuple[float, float, float]:
    """Smallest blade width, blade height and spring length that exist as real parts.

    Scaling every dimension with blade length treats the clip as one shape
    photographed at different zooms, and it is not. Seen on screen: a 2.5 mm neck
    produced a spec with a 2.8 mm spring — 44 % below the shortest spring in the
    catalogue (5.0 mm), and not a thing anyone can wind. The spread of
    spring/blade across real clips is 0.45–1.14, which already says the relation
    is not proportional, and the NAVARRO™ family settles it: 42 designs from 7 to
    22 mm of jaw, all on the SAME 14.3 mm body. A spring is sized by the force it
    has to hold, not by the blade in front of it.

    So the proportions still set the shape, but nothing is specified below the
    smallest part that demonstrably exists.
    """
    from services.clips import CLIP_CATALOGUE

    return (min(c.blade_width_mm for c in CLIP_CATALOGUE),
            min(c.blade_height_mm for c in CLIP_CATALOGUE),
            min(c.spring_length_mm for c in CLIP_CATALOGUE))


@dataclass
class ManufactureSpec:
    """The clip that would fit, when no stock clip does.

    Everything here is derived from the case measurements plus the proportions
    observed across the real catalogue, so the numbers are manufacturable rather
    than notional. `confidence_notes` carries what a machinist still has to
    decide, because a spec that hides its assumptions is worse than one that
    states them.
    """
    blade_length_mm: float
    blade_width_mm: float
    blade_height_mm: float
    spring_length_mm: float
    shape: ClipShape
    angle_deg: float
    closing_force_g: float
    fenestration_mm: float          # 0.0 when a plain (non-fenestrated) clip fits
    neck_mm: float
    reasons: list[str]              # why the stock catalogue could not serve
    confidence_notes: list[str]

    @property
    def label(self) -> str:
        fen = f", ventana {self.fenestration_mm:.1f} mm" if self.fenestration_mm > 0 else ""
        return (f"{self.shape.value} de {self.blade_length_mm:.1f} mm"
                f"{fen} · {self.closing_force_g:.0f} g")


_SHAPE_ANGLE_OUT: dict[ClipShape, float] = {
    ClipShape.STRAIGHT: 0.0, ClipShape.CURVED: 0.0, ClipShape.BAYONET: 0.0,
    ClipShape.FENESTRATED: 0.0, ClipShape.ANGLED_45: 45.0, ClipShape.ANGLED: 90.0,
}


def _preferred_shape(case: ClipCase) -> ClipShape:
    """The shape the case argues for, independent of what is in stock."""
    if case.suggests_fenestration and case.parent_artery_mm > 0:
        return ClipShape.FENESTRATED
    table, _note = _region_preference(case.region, case.aneurysm_type)
    if table:
        # Best-rated shape for this region, broken toward reach when the dome is deep.
        if case.is_deep_dome:
            deep = {ClipShape.ANGLED, ClipShape.BAYONET, ClipShape.ANGLED_45}
            ranked = sorted(((v, k.name) for k, v in table.items() if k in deep), reverse=True)
            if ranked and ranked[0][0] >= 0.7:
                return ClipShape[ranked[0][1]]
        return max(table.items(), key=lambda kv: kv[1])[0]
    if case.is_deep_dome:
        return ClipShape.ANGLED
    if case.is_wide_neck:
        return ClipShape.CURVED
    return ClipShape.STRAIGHT


def derive_manufacture_spec(case: ClipCase, rejected: list[ClipCandidate]) -> ManufactureSpec:
    """Turn "nothing in stock fits" into something a workshop can build."""
    w_r, h_r, s_r = _catalogue_proportions()

    # Apunta a la mordaza que cierra el cuello aplastado, redondeando HACIA
    # ARRIBA: en una pieza que se va a fabricar, medio milimetro de mas estorba
    # menos que medio de menos.
    target = case.jaw_requirement.mm
    blade = math.ceil(target * 2.0) / 2.0          # round up to the next 0.5 mm

    shape = _preferred_shape(case)
    _acc_lo, opt_lo, opt_hi, _acc_hi = force_window(case.neck_mm)
    force = round((opt_lo + opt_hi) / 2.0)

    fen = 0.0
    notes: list[str] = []
    if shape == ClipShape.FENESTRATED and case.parent_artery_mm > 0:
        # Clearance so the window does not sit hard against the vessel wall.
        fen = round(case.parent_artery_mm + 0.5, 1)
    elif case.suggests_fenestration:
        # The location argues for a window but nothing here can size one. Say it
        # on the specification: quietly ordering a plain clip would drop a
        # requirement the case implied, and a workshop cannot know that.
        notes.append(
            "Esta localización suele necesitar clip fenestrado, pero no hay diámetro "
            "de vaso padre medido con el que dimensionar la ventana. Mide el vaso "
            "padre antes de fabricar, o confirma que el cuello no incorpora ninguna rama."
        )

    # Distinct reasons the stock catalogue failed, most common first.
    counts: dict[str, int] = {}
    for cand in rejected:
        for crit in cand.failures:
            key = {
                "coverage": "Ninguna hoja del catálogo cubre este cuello con margen suficiente",
                "force": "Ningún clip del catálogo alcanza la fuerza de cierre necesaria",
                "fenestration": "Ninguna ventana del catálogo admite el vaso padre",
            }.get(crit.key, crit.label)
            counts[key] = counts.get(key, 0) + 1
    reasons = [k for k, _v in sorted(counts.items(), key=lambda kv: -kv[1])]
    if not reasons:
        reasons = ["El catálogo no ofrece ninguna combinación válida para este caso"]

    notes.append(
        "Anchura, altura y muelle se derivan de las proporciones medianas del "
        "catálogo real, no de una medición del caso."
    )
    notes.append(
        f"La fuerza de cierre ({force} g) es el centro de la ventana heurística para "
        f"un cuello de {case.neck_mm:.1f} mm; confirmar con el fabricante."
    )
    if case.neck_source == "auto":
        notes.append(
            "El cuello se midió de forma automática. Marcarlo a mano o por borde "
            "antes de encargar la fabricación."
        )

    w_min, h_min, s_min = _catalogue_floors()
    width = blade * w_r
    height = blade * h_r
    spring = blade * s_r
    if width < w_min or height < h_min or spring < s_min:
        notes.append(
            f"Para una hoja de {blade:.1f} mm las proporciones del catálogo darían una "
            f"pieza por debajo de lo que existe fabricado (muelle {spring:.1f} mm frente "
            f"a un mínimo real de {s_min:.1f} mm). Anchura, altura y muelle se han "
            f"llevado al mínimo real: el muelle lo dimensiona la fuerza que debe "
            f"sostener, no la hoja que lleva delante."
        )
    return ManufactureSpec(
        blade_length_mm=round(blade, 1),
        blade_width_mm=round(max(width, w_min), 2),
        blade_height_mm=round(max(height, h_min), 2),
        spring_length_mm=round(max(spring, s_min), 1),
        shape=shape,
        angle_deg=_SHAPE_ANGLE_OUT.get(shape, 0.0),
        closing_force_g=float(force),
        fenestration_mm=fen,
        neck_mm=round(case.neck_mm, 2),
        reasons=reasons,
        confidence_notes=notes,
    )


# ── Made-to-order sizing ──────────────────────────────────────────────────── #

@dataclass
class CustomJaw:
    """A made-to-order clip sized to this case, from a family that varies its jaw.

    The NAVARRO™ designs come in 3 mm jaw steps. A neck rarely lands on one, so
    the nearest drawn size is either a little short or a little long — and since
    these are manufactured per case rather than taken off a shelf, the exact jaw
    is a real option rather than a wish. This is what the panel offers next to
    the drawn sizes.
    """
    series: str
    angle_deg: float
    jaw_mm: float
    nearest_drawn_mm: float
    reason: str
    #: Which of the four drawn series, and its window. Deriving only a BEND from
    #: the winning candidate meant a fenestrated case was offered a custom
    #: straight jaw — the shape silently traded away for a size, which is the
    #: one thing a fenestrated clip cannot give up.
    shape: str = "straight"
    window_mm: float = 0.0
    #: False for the curved series, whose jaw is an arc and is not stretched.
    resizable: bool = True

    @property
    def label(self) -> str:
        # Deducido solo del ángulo, esto rotulaba «NAVARRO™ T4 Recto» una mordaza
        # fenestrada a medida: el propio objeto ya decía `shape=fenestrated` dos
        # campos más arriba, y el rótulo lo contradecía.
        from services.navarro import shape_label
        return (f"NAVARRO™ {self.series} "
                f"{shape_label(self.shape, self.angle_deg, self.window_mm)}, "
                f"mordaza {self.jaw_mm:.1f} mm")


def ideal_jaw_mm(case: ClipCase) -> float:
    """La mordaza que pide este cuello, antes de mirar ningun catalogo.

    Es la longitud de la linea de cierre una vez aplastado el cuello, no su
    diametro: ver `services.clips.jaw_requirement`.
    """
    return case.jaw_requirement.mm


def _best_resizable(recommended: list[ClipCandidate]) -> ClipCandidate | None:
    """The best candidate whose jaw can actually be made to size.

    The custom jaw is an offer about SIZE, and the curved series cannot take part
    — its jaw is an arc. Handing `suggest_custom_jaw` whatever won the ranking
    made the offer vanish for most cases the moment curved clips started winning
    ties: the answer to «can I have this exact length» became silence, when the
    honest answer is «yes, in one of the three series that stretch».
    """
    return next((c for c in recommended if c.clip.shape != ClipShape.CURVED), None)


def suggest_custom_jaw(case: ClipCase, best: ClipCandidate | None) -> CustomJaw | None:
    """Offer an exact jaw when the drawn sizes only bracket what the case needs.

    Returns None when a drawn size already lands close enough that machining a
    special would buy nothing — the family exists to be manufactured, not to be
    re-specified for every fraction of a millimetre.
    """
    try:
        from services.navarro import STOCK_JAW_MM, list_variants, nearest_variant
    except Exception:  # noqa: BLE001 — no family installed, nothing to offer
        return None
    if not list_variants():
        return None
    if case.neck_mm <= 0:
        return None

    from services.navarro import ANGLED, CURVED, STRAIGHT, navarro_shape_for

    want = round(ideal_jaw_mm(case), 1)
    # Keep BOTH the shape and the bend the winning candidate argued for. Taking
    # only the bend answered a fenestrated case with a straight clip of the right
    # length, which is the wrong piece at the right size.
    angle = 0.0
    clip_shape = _preferred_shape(case) if best is None else best.clip.shape
    if best is not None and getattr(best.clip, "bend_angle_deg", 0.0):
        angle = float(best.clip.bend_angle_deg)
    elif best is None:
        angle = {ClipShape.ANGLED: 90.0, ClipShape.ANGLED_45: 45.0,
                 ClipShape.BAYONET: 90.0}.get(clip_shape, 0.0)
    shape = navarro_shape_for(clip_shape)
    window = float(getattr(best.clip, "fenestration_mm", 0.0) or 0.0) if best is not None else 0.0

    # The curved jaw is an arc and is never stretched, so no custom size exists
    # with that curvature. That is a fact about the curved series, not an answer
    # to «can I have this exact length» — which is yes, in any of the three that
    # stretch. Returning None told the surgeon nothing and hid the offer from
    # most cases, because curved clips win ties often.
    curved_note = ""
    if shape == CURVED:
        shape = ANGLED if case.is_deep_dome else STRAIGHT
        angle = 45.0 if shape == ANGLED else 0.0
        window = 0.0
        curved_note = (" La serie curva solo existe en las tallas dibujadas, así que "
                       "la mordaza exacta se ofrece en la serie que sí se estira.")

    # Same silent trade, one shape further out: the paraclinoid carotid table
    # rates BAYONET top, and a case there was being offered a jaw in whichever
    # series the mapping happened to land on. The family draws no bayonet; the
    # angled series is its nearest answer, and that is a substitution, not a
    # match, so it is said out loud rather than left for the surgeon to notice.
    bayonet_note = ""
    if clip_shape == ClipShape.BAYONET:
        bayonet_note = (" La familia no dibuja bayoneta: se ofrece angulada, que es lo que "
                        "aparta el mango de la línea de visión en un campo profundo.")

    src = nearest_variant(angle, want, shape=shape, window_mm=window)
    if src is None:
        return None
    gap = abs(src.jaw_mm - want)
    # Half a step: closer than this and the drawn size is the better answer,
    # because it is already validated CAD.
    #
    # Pero solo si esa talla CIERRA el cuello. `want` dejó de ser un objetivo
    # alrededor del cual se puede caer por los dos lados: es el mínimo que cubre
    # el cuello una vez aplastado, y una talla más corta no vale por muy cerca
    # que esté. Un cuello de 5 mm pide 7,5 mm de mordaza y la talla dibujada más
    # próxima es 7: a 0,5 mm de distancia, y medio milímetro por debajo de lo
    # que hace falta. Sin esta condición la oferta a medida se retiraba justo
    # ahí y al cirujano se le ofrecía la pieza que no cierra.
    if gap < 1.5 and src.jaw_mm >= want:
        return None
    if want < min(STOCK_JAW_MM) or want > max(STOCK_JAW_MM):
        reason = (f"Un cuello de {case.neck_mm:.1f} mm pide {want:.1f} mm de mordaza, "
                  f"fuera de las tallas dibujadas ({min(STOCK_JAW_MM)}–{max(STOCK_JAW_MM)} mm).")
    else:
        reason = (f"Un cuello de {case.neck_mm:.1f} mm pide {want:.1f} mm de mordaza; "
                  f"la talla dibujada más cercana es {src.jaw_mm} mm ({gap:.1f} mm de diferencia).")
    reason += curved_note + bayonet_note
    return CustomJaw(series=src.series, angle_deg=src.angle_deg, jaw_mm=want,
                     nearest_drawn_mm=float(src.jaw_mm), reason=reason,
                     shape=src.shape, window_mm=float(src.window_mm),
                     resizable=src.can_resize)


# ── Montaje de varios clips ───────────────────────────────────────────────── #
#
# Un cuello que ninguna hoja cierra no es necesariamente un cuello que haya que
# mandar a fabricar: la cirugía lo resuelve con VARIOS clips. Es técnica
# descrita, no una salida de emergencia:
#
#   · tándem / apilado — un clip paralelo al vaso padre y otros por debajo
#     (understacking) o por encima (overstacking) reforzando el cierre;
#   · «picket fence» — varios clips en fila, SOLAPADOS y escalonados a lo largo
#     del cuello, reconstruyéndolo por tramos. En la serie publicada se usaron
#     siete clips fenestrados en un ACM gigante y cuatro en una ACoA.
#
# Lo que este módulo puede aportar es la parte geométrica: cuántas mordazas de
# las que existen hacen falta para cubrir la línea de cierre, y con qué solape.
# Cuál de las técnicas corresponde —tándem, picket fence, fenestrado sobre la
# rama— es del cirujano, y se dice en el propio resultado.
#
# Fuentes: «Picket-Fence Technique in Surgical Treatment of Cerebral Aneurysms»
# (PMC12654722) y la literatura de clipaje en tándem; el aviso del peso
# acumulado sobre el vaso padre viene de «Suture retraction technique to prevent
# parent vessel obstruction following aneurysm tandem clipping» (J Neurosurg
# 2015;123:472).

#: Cuánto tiene que montar una hoja sobre la anterior. Las hojas van SOLAPADAS,
#: no adosadas: dejar que se toquen justo en la punta deja un hueco donde el
#: cuello no queda cerrado, que es la misma forma de fallar que persigue la
#: regla del cuello aplastado.
#:
#: SUPUESTO, no medido. Ninguna de las fuentes da un número: describen el solape
#: cualitativamente. 2 mm es el valor con el que trabaja el montaje, se enseña
#: en pantalla para que sea discutible, y está en la lista de preguntas para los
#: neurocirujanos.
MULTICLIP_OVERLAP_MM: float = 2.0

#: Más allá de esto el montaje deja de ser una propuesta razonable. La serie del
#: picket fence llega a siete clips, pero cada hoja añade peso sobre el vaso
#: padre —hay descrita obstrucción del vaso tras clipaje en tándem— y proponer
#: una fila larga desde una geometría es pasarse de donde llega este software.
MULTICLIP_MAX_CLIPS: int = 4


@dataclass
class MultiClipConstruct:
    """Varias mordazas que juntas cierran un cuello que ninguna cierra sola."""

    jaws_mm: list[float]
    required_mm: float
    covered_mm: float
    overlap_mm: float
    shape: str
    #: Lo que el montaje NO decide, dicho en el propio objeto.
    cautions: list[str] = field(default_factory=list)

    @property
    def n_clips(self) -> int:
        return len(self.jaws_mm)

    @property
    def label(self) -> str:
        tallas = " + ".join(f"{j:.0f}" for j in self.jaws_mm)
        return (f"{self.n_clips} clips en fila ({tallas} mm de mordaza), "
                f"solapando {self.overlap_mm:.0f} mm")


def suggest_multiclip(
    case: ClipCase,
    catalogue: list[ClipSpec],
    overlap_mm: float = MULTICLIP_OVERLAP_MM,
) -> MultiClipConstruct | None:
    """El montaje más corto que cubre la línea de cierre, o None.

    Cubrir con `n` hojas iguales de longitud `j` solapando `s` da

        cobertura = n·j − (n−1)·s

    Se buscan primero los montajes de dos clips, luego de tres, y dentro de cada
    número la talla más pequeña que llegue: cada milímetro de hoja de más es
    hoja dentro del campo, y cada clip de más es peso sobre el vaso padre.
    """
    req = case.jaw_requirement.mm
    if req <= 0:
        return None

    tallas = sorted({c.blade_length_mm for c in catalogue if c.blade_length_mm > 0})
    if not tallas:
        return None

    # Si una sola hoja ya llega, esto no es un caso de varios clips.
    if max(tallas) >= req:
        return None

    for n in range(2, MULTICLIP_MAX_CLIPS + 1):
        for j in tallas:
            if j <= overlap_mm:          # una hoja que no supera el solape no suma
                continue
            if n * j - (n - 1) * overlap_mm >= req:
                shape = _preferred_shape(case)
                return MultiClipConstruct(
                    jaws_mm=[j] * n,
                    required_mm=req,
                    covered_mm=round(n * j - (n - 1) * overlap_mm, 2),
                    overlap_mm=overlap_mm,
                    shape=shape.value,
                    cautions=[
                        "La geometría dice cuántas mordazas cubren el cuello; la "
                        "técnica —tándem apilado, picket fence, fenestrado sobre la "
                        "rama— la elige el cirujano según qué haya que preservar.",
                        f"El solape de {overlap_mm:.0f} mm entre hojas es un supuesto "
                        f"de este software, no una medida publicada: las series "
                        f"describen las hojas solapadas sin dar la distancia.",
                        "El peso acumulado de varios clips puede acodar el vaso "
                        "padre y obstruirlo; está descrito tras clipaje en tándem.",
                        "Cada clip se coloca y se comprueba por separado en el paso "
                        "de Dispositivos: la cobertura y las colisiones se miden "
                        "sobre el conjunto ya colocado, no sobre esta propuesta.",
                    ],
                )
    return None


# ── Selection ─────────────────────────────────────────────────────────────── #

Outcome = Literal["stock", "marginal", "manufacture", "unmeasured"]


@dataclass
class ClipSelection:
    """The complete answer for one case: what to use, what not to, or what to build."""
    outcome: Outcome
    summary: str
    case: ClipCase
    recommended: list[ClipCandidate]
    rejected: list[ClipCandidate]
    manufacture: ManufactureSpec | None
    caveats: list[str]
    custom_jaw: CustomJaw | None = None
    #: Varias mordazas que juntas cierran lo que ninguna cierra sola. Se ofrece
    #: junto a la especificación de fabricación, no en su lugar: son las dos
    #: salidas de un cuello que el inventario no cubre, y la elección entre
    #: mandar fabricar una pieza o poner dos que ya existen es del cirujano.
    multiclip: MultiClipConstruct | None = None


def _caveats(case: ClipCase) -> list[str]:
    """Everything that limits how much weight this selection can bear."""
    out: list[str] = []
    if case.neck_source == "auto":
        out.append(
            "El cuello procede de la detección automática. Toda la selección cuelga "
            "de esa medida: márcalo a mano o por borde para una recomendación firme."
        )
    elif case.neck_source == "rim" and case.neck_tilt_deg >= 10.0:
        out.append(
            f"El plano del cuello está inclinado {case.neck_tilt_deg:.0f} grados respecto "
            f"al eje cuello-domo; el método de un solo punto habría medido un cuello menor."
        )
    if case.parent_artery_mm <= 0:
        out.append(
            "Sin diámetro de vaso padre medido: no se puede comprobar el calibre de "
            "ninguna ventana fenestrada."
        )
    if case.suggests_fenestration:
        out.append(
            "La localización registrada suele incorporar una rama en el cuello. Si es "
            "el caso, valora un clip fenestrado: la rama no es visible en la malla del "
            "saco aislado, así que el sistema no puede comprobarlo por geometría."
        )
    if not _region_preference(case.region, case.aneurysm_type)[0]:
        out.append(
            "La región anatómica del caso no se reconoció, así que la forma del clip "
            "se juzga solo por geometría, sin preferencia por localización."
        )
    out.append(
        "Las preferencias clínicas (forma por localización, ventanas de fuerza) son "
        "heurísticas de la literatura, no validadas contra casos anotados."
    )
    return out


def _availability_caveats(cands: list[ClipCandidate]) -> list[str]:
    """Warn about what a recommendation assumes you can actually obtain."""
    out: list[str] = []
    if any(getattr(c.clip, "availability", "stock") == "made_to_order" for c in cands):
        out.append(
            "Hay clips «bajo pedido» en la lista: son diseños reales que se fabrican "
            "para el caso, no piezas disponibles en estantería. Cuenta con el plazo "
            "de fabricación al planificar."
        )
    if any(getattr(c.clip, "force_provisional", False) for c in cands):
        out.append(
            "La fuerza de cierre de los clips NAVARRO™ es una banda de diseño "
            "(120–200 g) todavía sin caracterizar: ningún criterio de fuerza sobre "
            "ellos puede darse por cumplido hasta que el fabricante dé el valor."
        )
    return out


def repartition_after_verification(selection: "ClipSelection") -> None:
    """Re-sort recommended vs rejected once the geometry check has had its say.

    The analytic pass splits the catalogue before any clip is posed on the
    patient's mesh. The geometry check runs afterwards and CAN demote a
    candidate — a blade that fouls a neighbouring vessel at every approach angle
    earns a `fail` — but the split had already happened, so the demoted clip
    stayed in `recommended` carrying "descartado" and a score of 0.

    That broke the module's own rule (an unusable clip must never outrank a
    usable one) and made the summary lie: it counted six clips as usable while
    two of them had just been found to collide. Caught end to end on a real
    study; the unit tests missed it because none of them verified a candidate
    that the geometry then rejected.
    """
    demoted = [c for c in selection.recommended if not c.viable]
    if demoted:
        selection.recommended = [c for c in selection.recommended if c.viable]
        selection.rejected = demoted + selection.rejected
    selection.recommended.sort(key=lambda c: -c.score)

    case = selection.case
    clean = [c for c in selection.recommended if c.verdict == "ok"]
    if not selection.recommended:
        spec = selection.manufacture or derive_manufacture_spec(case, selection.rejected)
        selection.outcome = "manufacture"
        selection.manufacture = spec
        selection.summary = (
            f"Ningún clip del inventario supera la comprobación sobre la malla de "
            f"este paciente. Se necesita fabricar: {spec.label}."
        )
    elif clean:
        plural = len(clean) != 1
        selection.outcome = "stock"
        selection.summary = (
            f"{len(clean)} clip{'s' if plural else ''} del inventario "
            f"cumple{'n' if plural else ''} todos los criterios para un cuello de "
            f"{case.neck_mm:.1f} mm."
        )
    else:
        spec = selection.manufacture or derive_manufacture_spec(case, selection.rejected)
        selection.manufacture = spec
        plural = len(selection.recommended) != 1
        selection.outcome = "marginal"
        selection.summary = (
            f"{len(selection.recommended)} clip{'s' if plural else ''} del inventario "
            f"{'son' if plural else 'es'} utilizable{'s' if plural else ''}, pero "
            f"ninguno sin reservas. La alternativa a medida sería: {spec.label}."
        )


def _with_every_shape_represented(viable: list[ClipCandidate], n: int) -> list[ClipCandidate]:
    """Top `n` by score, but never a whole SHAPE left off the list.

    Ranking alone hid an entire family once: a design whose closing force is a
    band is capped at `warn` on that criterion — correctly, nobody can call it
    met — and with a 6 mm neck the best of 42 NAVARRO™ designs ranked 12th of 60,
    so every visible slot went to stock. That guarantee split on availability,
    stock against made-to-order.

    It stopped meaning anything the day the family became the whole catalogue:
    one kind, so nothing to balance. And what replaced it was worse — the six
    recommended clips for a neutral case were six T3 angled 7 mm differing only
    in bend, while the straight, the curved and the fenestrated never appeared.
    That is not the question a surgeon is asking. «Straight, curved, angled or
    fenestrated» is the decision; «60° or 75°» is a detail inside it.

    So the balance is now across SHAPE. Each shape that has a usable candidate
    contributes its best one; the remaining slots go to score, as before. The
    scores are untouched — what changes is what gets seen.
    """
    by_shape: dict = {}
    for c in viable:
        by_shape.setdefault(c.clip.shape, c)      # `viable` is already sorted
    out = list(by_shape.values())
    shown = {id(c) for c in out}
    # The free slots go by score, but no more than two of any one shape: filling
    # them purely by score put three T3 variants that differ only in bend on a
    # list of six, which is three ways of saying the same thing.
    per_shape = {c.clip.shape: 1 for c in out}
    for c in viable:
        if len(out) >= max(n, len(by_shape)):
            break
        if id(c) in shown or per_shape.get(c.clip.shape, 0) >= 2:
            continue
        out.append(c)
        shown.add(id(c))
        per_shape[c.clip.shape] = per_shape.get(c.clip.shape, 0) + 1
    return sorted(out, key=lambda c: -c.score)


def _tie_caveat(recommended: list[ClipCandidate]) -> list[str]:
    """Say when the measurements do not actually choose between the top clips.

    They tie often, and for a real reason: with the catalogue reduced to one
    family, most of what used to separate clips — maker, alloy, characterised
    force — is now identical across every candidate. Presenting an arbitrary
    tie-break as «the best» would be inventing a preference the case does not
    support. Ties are information: it means the choice is the surgeon's.
    """
    if len(recommended) < 2:
        return []
    top = recommended[0].score
    tied = [c for c in recommended if abs(c.score - top) < 0.05]
    if len(tied) < 2 or top <= 0:
        return []
    names = ", ".join(c.clip.name.replace("NAVARRO™ ", "") for c in tied[:4])
    return [f"{len(tied)} clips empatan en la primera posición ({names}): las medidas "
            f"del caso no eligen entre ellos, la forma la decide el abordaje."]


def select_clips(
    case: ClipCase,
    catalogue: list[ClipSpec] | None = None,
    n: int = 6,
) -> ClipSelection:
    """Evaluate every clip against the case and decide what the answer is.

    Never returns an empty answer: when nothing in stock fits, the outcome is a
    manufacturing specification instead of silence.
    """
    if catalogue is None:
        # The built-in catalogue plus whatever clips this institution actually
        # owns. Scoring against a shelf the hospital does not have is how you
        # recommend a clip nobody can pick up.
        from services.clip_library import catalogue_with_library
        catalogue = catalogue_with_library()

    if case.neck_mm <= 0 or not case.neck_reliable:
        return ClipSelection(
            outcome="unmeasured",
            summary=(
                "No hay una medida de cuello fiable, y el cuello es la variable de la "
                "que depende toda la selección. Marca el plano del cuello en Morfometría."
            ),
            case=case, recommended=[], rejected=[], manufacture=None,
            caveats=["Sin cuello medido no se puede recomendar ni especificar un clip."],
        )

    evaluated = [evaluate_clip(c, case) for c in catalogue]
    viable = sorted([c for c in evaluated if c.viable], key=lambda c: -c.score)
    failed = sorted([c for c in evaluated if not c.viable],
                    key=lambda c: abs(c.clip.blade_length_mm - case.jaw_requirement.mm))

    recommended = _with_every_shape_represented(viable, n)
    # The near-misses worth showing: the ones that came closest to the ideal blade.
    rejected = failed[:n]

    if not viable:
        spec = derive_manufacture_spec(case, failed)
        multiclip = suggest_multiclip(case, catalogue)
        resumen = (
            f"Ningún clip del inventario sirve para un cuello de {case.neck_mm:.1f} mm. "
            f"Se necesita fabricar: {spec.label}."
        )
        if multiclip is not None:
            resumen += (
                f" Con lo que hay en el inventario haría falta un montaje de "
                f"{multiclip.n_clips} clips."
            )
        return ClipSelection(
            outcome="manufacture",
            summary=resumen,
            case=case, recommended=[], rejected=rejected, manufacture=spec,
            caveats=_caveats(case),
            custom_jaw=suggest_custom_jaw(case, None),
            multiclip=multiclip,
        )

    clean = [c for c in recommended if c.verdict == "ok"]
    if clean:
        plural = len(clean) != 1
        return ClipSelection(
            outcome="stock",
            summary=(
                f"{len(clean)} clip{'s' if plural else ''} del inventario "
                f"cumple{'n' if plural else ''} todos los criterios para un "
                f"cuello de {case.neck_mm:.1f} mm."
            ),
            case=case, recommended=recommended, rejected=rejected,
            # The ideal clip is offered even when the shelf already serves. It
            # used to be withheld here, on the reasoning that manufacturing is
            # for when stock fails — but that answers a different question from
            # "what would fit this neck best", and the answer to that one exists
            # whatever is in the cupboard. The outcome still says a stock clip
            # meets every criterion, so this reads as the option it is.
            manufacture=derive_manufacture_spec(case, failed),
            caveats=(_caveats(case) + _availability_caveats(recommended)
                     + _tie_caveat(recommended)),
            custom_jaw=suggest_custom_jaw(case, _best_resizable(recommended)),
        )

    # Usable but every one carries a caveat: offer the alternative rather than
    # letting the surgeon assume the top of the list is a clean fit.
    spec = derive_manufacture_spec(case, failed)
    plural = len(recommended) != 1
    return ClipSelection(
        outcome="marginal",
        summary=(
            f"{len(recommended)} clip{'s' if plural else ''} del inventario "
            f"{'son' if plural else 'es'} utilizable{'s' if plural else ''}, pero "
            f"ninguno sin reservas. La alternativa a medida sería: {spec.label}."
        ),
        case=case, recommended=recommended, rejected=rejected, manufacture=spec,
        caveats=(_caveats(case) + _availability_caveats(recommended)
                 + _tie_caveat(recommended)),
        custom_jaw=suggest_custom_jaw(case, _best_resizable(recommended)),
    )
