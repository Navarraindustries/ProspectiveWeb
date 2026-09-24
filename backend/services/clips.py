"""Surgical clip library and recommender assistant.

Merged from:
  - prospective/models/clip_library.py   → CLIP_CATALOGUE + ClipSpec
  - prospective/processing/clip_recommender.py → scoring engine

Pure Python, zero Qt / VTK dependencies.

Scoring model (weighted sum, 0–100)
-------------------------------------
1. Coverage score  (w=0.45) — Gaussian centred at coverage_ratio = 1.35
2. Shape fit score (w=0.40) — rule-based on neck width and aspect ratio
3. Force score     (w=0.15) — optimal closing force window 80–160 g

References
----------
- Lawton 2011, "Seven Aneurysms" — clip selection algorithm
- Molyneux et al.  neck ≥ 4 mm as wide-neck threshold
- Pierot & Wakhloo 2013 — shape-based selection rationale
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence


# ── Shape enum ─────────────────────────────────────────────────────────────── #

class ClipShape(Enum):
    STRAIGHT    = "Recto"
    CURVED      = "Curvo"
    ANGLED      = "Angulado 90°"
    ANGLED_45   = "Angulado 45°"
    BAYONET     = "Bayoneta"
    FENESTRATED = "Fenestrado"


# ── Internal data model ────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class ClipSpec:
    """Full geometric specification of one clip model."""
    name:             str
    shape:            ClipShape
    blade_length_mm:  float
    blade_width_mm:   float
    blade_height_mm:  float
    spring_length_mm: float
    closing_force_g:  float
    manufacturer:     str
    # Inner diameter of the window on a fenestrated clip, in mm. 0.0 means "not
    # declared" and is NOT the same as "no window": the catalogue below was
    # transcribed without these figures, and inventing them would let the
    # selector approve a clip that strangles the branch it was chosen to spare.
    # `clip_selection` treats 0.0 on a fenestrated clip as "verify by hand".
    fenestration_mm:  float = 0.0
    # Upper end of the closing-force band, when the part has a band rather than a
    # figure. 0.0 means `closing_force_g` is a single characterised value.
    closing_force_max_g: float = 0.0
    # True when the force is a design target the manufacturer has not yet
    # characterised. The selector must not report a precision the part lacks.
    force_provisional: bool = False
    # "stock"         — held in inventory, can be picked up today
    # "made_to_order" — a real design, manufactured for the case
    # "template"      — a design not yet manufacturable
    availability: str = "stock"
    # True bend angle in degrees. `shape` is the selector's coarse class; a
    # family that bends in 15° steps would otherwise lose that detail, and it is
    # the real angle that gets machined.
    bend_angle_deg: float = 0.0
    # Stable identifier. Empty means "derive it from the name", which is fine for
    # the built-in catalogue but not for a family whose names carry ™, decimals
    # and degree signs: a slug of those is fragile, and the id is what the
    # placement endpoint looks the geometry up by.
    clip_id: str = ""

    @property
    def identifier(self) -> str:
        return self.clip_id or _slug(self.name)

    @property
    def force_band(self) -> tuple[float, float]:
        """(min, max) closing force in grams. Equal when it is a single value."""
        if self.closing_force_max_g > self.closing_force_g:
            return (self.closing_force_g, self.closing_force_max_g)
        return (self.closing_force_g, self.closing_force_g)

    @property
    def display_label(self) -> str:
        return f"{self.name}  ({self.blade_length_mm:.0f} mm)"


# ── Catalogue ──────────────────────────────────────────────────────────────── #
# Simplified subset covering the most common sizes used in intracranial
# aneurysm surgery.  All lengths in mm; closing force in grams.

#: Whether clips from other manufacturers are OFFERED to the surgeon.
#: Turned off: this institution plans with its own NAVARRO™ family, which now
#: covers all four shapes (straight, curved, angled, fenestrated), so a Sugita
#: or an Aesculap in the list is a piece nobody here can obtain — and one that
#: cannot be sent to fabricación, which is where a stray commercial pick used to
#: dead-end.
#:
#: The table below is NOT deleted, because it is also the dimensional reference
#: the manufacturing spec is derived from — the proportions of real clips, and
#: the floors (smallest spring, smallest blade) that stop the spec proposing a
#: part nobody can wind. Reference, never an offer: what IS offered comes from
#: `clip_library.catalogue_with_library`, and that is what `catalogue_to_api`
#: serialises.
OFFER_COMMERCIAL_CLIPS = False

CLIP_CATALOGUE: list[ClipSpec] = [

    # ══════════════════════════════════════════════════════════════════════
    # Yasargil (Karl Storz) — gold standard in cerebrovascular surgery
    # ══════════════════════════════════════════════════════════════════════

    ClipSpec("Yasargil Mini recto",        ClipShape.STRAIGHT,    5.0, 1.0, 0.8,  5.5,  75,  "Yasargil/KS"),
    ClipSpec("Yasargil Recto 7mm",         ClipShape.STRAIGHT,    7.0, 1.1, 0.9,  6.5, 100,  "Yasargil/KS"),
    ClipSpec("Yasargil Recto 9mm",         ClipShape.STRAIGHT,    9.0, 1.3, 1.0,  7.0, 120,  "Yasargil/KS"),
    ClipSpec("Yasargil Recto 11mm",        ClipShape.STRAIGHT,   11.0, 1.4, 1.0,  7.5, 140,  "Yasargil/KS"),
    ClipSpec("Yasargil Recto 14mm",        ClipShape.STRAIGHT,   14.0, 1.5, 1.1,  8.0, 160,  "Yasargil/KS"),
    ClipSpec("Yasargil Recto 19mm",        ClipShape.STRAIGHT,   19.0, 1.5, 1.1,  9.0, 190,  "Yasargil/KS"),

    ClipSpec("Yasargil Curvo 7mm",         ClipShape.CURVED,      7.0, 1.1, 0.9,  6.5, 100,  "Yasargil/KS"),
    ClipSpec("Yasargil Curvo 9mm",         ClipShape.CURVED,      9.0, 1.3, 1.0,  7.0, 120,  "Yasargil/KS"),
    ClipSpec("Yasargil Curvo 11mm",        ClipShape.CURVED,     11.0, 1.4, 1.0,  7.5, 140,  "Yasargil/KS"),
    ClipSpec("Yasargil Curvo 14mm",        ClipShape.CURVED,     14.0, 1.5, 1.1,  8.0, 160,  "Yasargil/KS"),

    ClipSpec("Yasargil Angulado 45° 7mm",  ClipShape.ANGLED_45,   7.0, 1.1, 0.9,  6.5, 100,  "Yasargil/KS"),
    ClipSpec("Yasargil Angulado 45° 9mm",  ClipShape.ANGLED_45,   9.0, 1.3, 1.0,  7.0, 120,  "Yasargil/KS"),
    ClipSpec("Yasargil Angulado 45° 11mm", ClipShape.ANGLED_45,  11.0, 1.4, 1.0,  7.5, 140,  "Yasargil/KS"),

    ClipSpec("Yasargil Angulado 90° 7mm",  ClipShape.ANGLED,      7.0, 1.1, 0.9,  6.5, 100,  "Yasargil/KS"),
    ClipSpec("Yasargil Angulado 90° 9mm",  ClipShape.ANGLED,      9.0, 1.3, 1.0,  7.0, 120,  "Yasargil/KS"),

    ClipSpec("Yasargil Bayoneta 7mm",      ClipShape.BAYONET,     7.0, 1.1, 0.9,  8.0, 105,  "Yasargil/KS"),
    ClipSpec("Yasargil Bayoneta 11mm",     ClipShape.BAYONET,    11.0, 1.4, 1.0, 10.0, 145,  "Yasargil/KS"),
    ClipSpec("Yasargil Bayoneta 14mm",     ClipShape.BAYONET,    14.0, 1.5, 1.1, 11.0, 165,  "Yasargil/KS"),

    ClipSpec("Yasargil Fenestrado 7mm",    ClipShape.FENESTRATED,  7.0, 1.1, 0.9,  7.0, 105,  "Yasargil/KS"),
    ClipSpec("Yasargil Fenestrado 9mm",    ClipShape.FENESTRATED,  9.0, 1.3, 1.0,  7.5, 125,  "Yasargil/KS"),
    ClipSpec("Yasargil Fenestrado 11mm",   ClipShape.FENESTRATED, 11.0, 1.4, 1.0,  8.0, 145,  "Yasargil/KS"),

    # ══════════════════════════════════════════════════════════════════════
    # Sugita (Mizuho) — widely used in Asia and Latin America
    # ══════════════════════════════════════════════════════════════════════

    ClipSpec("Sugita Mini recto",          ClipShape.STRAIGHT,    5.0, 1.0, 0.8,  5.0,  70,  "Sugita"),
    ClipSpec("Sugita Recto S",             ClipShape.STRAIGHT,    7.0, 1.2, 0.9,  6.0,  80,  "Sugita"),
    ClipSpec("Sugita Recto M",             ClipShape.STRAIGHT,   10.0, 1.4, 1.0,  7.0,  90,  "Sugita"),
    ClipSpec("Sugita Recto L",             ClipShape.STRAIGHT,   12.0, 1.4, 1.0,  7.0,  95,  "Sugita"),
    ClipSpec("Sugita Recto XL",            ClipShape.STRAIGHT,   15.0, 1.5, 1.1,  8.0, 100,  "Sugita"),
    ClipSpec("Sugita Recto XXL",           ClipShape.STRAIGHT,   20.0, 1.5, 1.1,  9.0, 110,  "Sugita"),

    ClipSpec("Sugita Curvo Mini",          ClipShape.CURVED,      5.0, 1.0, 0.8,  5.0,  70,  "Sugita"),
    ClipSpec("Sugita Curvo S",             ClipShape.CURVED,      7.0, 1.2, 0.9,  6.0,  80,  "Sugita"),
    ClipSpec("Sugita Curvo M",             ClipShape.CURVED,     10.0, 1.4, 1.0,  7.0,  90,  "Sugita"),
    ClipSpec("Sugita Curvo L",             ClipShape.CURVED,     12.0, 1.4, 1.0,  7.0,  95,  "Sugita"),

    ClipSpec("Sugita Fenestrado S",        ClipShape.FENESTRATED,  7.0, 1.2, 0.9,  7.0,  85,  "Sugita"),
    ClipSpec("Sugita Fenestrado M",        ClipShape.FENESTRATED, 10.0, 1.4, 1.0,  8.0,  95,  "Sugita"),

    # ══════════════════════════════════════════════════════════════════════
    # Aesculap (B. Braun) — standard European system
    # ══════════════════════════════════════════════════════════════════════

    ClipSpec("Aesculap Angulado 90° S",    ClipShape.ANGLED,      7.0, 1.2, 0.9,  6.0,  80,  "Aesculap"),
    ClipSpec("Aesculap Angulado 90° M",    ClipShape.ANGLED,     10.0, 1.4, 1.0,  7.0,  90,  "Aesculap"),
    ClipSpec("Aesculap Recto S",           ClipShape.STRAIGHT,    7.0, 1.2, 0.9,  6.0,  80,  "Aesculap"),
    ClipSpec("Aesculap Recto M",           ClipShape.STRAIGHT,   10.0, 1.4, 1.0,  7.0,  90,  "Aesculap"),
    ClipSpec("Aesculap Fenestrado M",      ClipShape.FENESTRATED, 10.0, 1.4, 1.0,  8.0,  92,  "Aesculap"),

    # ══════════════════════════════════════════════════════════════════════
    # Codman (DePuy Synthes / J&J) — common in US / Latin America
    # ══════════════════════════════════════════════════════════════════════

    ClipSpec("Codman Bayoneta S",          ClipShape.BAYONET,     7.0, 1.2, 0.9,  8.0,  85,  "Codman"),
    ClipSpec("Codman Bayoneta M",          ClipShape.BAYONET,    10.0, 1.4, 1.0, 10.0,  95,  "Codman"),
    ClipSpec("Codman Recto S",             ClipShape.STRAIGHT,    7.0, 1.2, 0.9,  6.0,  80,  "Codman"),
    ClipSpec("Codman Recto M",             ClipShape.STRAIGHT,   10.0, 1.4, 1.0,  7.0,  90,  "Codman"),
]


# ── Recommender constants ──────────────────────────────────────────────────── #

WIDE_NECK_THRESHOLD_MM: float = 5.0   # neck ≥ 5 mm → wide neck
DEEP_DOME_AR_THRESHOLD: float = 1.5   # AR ≥ 1.5   → deep dome

_W_COVERAGE: float = 0.45
_W_SHAPE:    float = 0.40
_W_FORCE:    float = 0.15

# El ideal del motor heredado sigue a la regla de la deformacion, para que no
# haya dos criterios distintos en el mismo repositorio. Ver `jaw_requirement`.
_COV_SIGMA:  float = 0.25

_FORCE_OPT_LO: float = 80.0
_FORCE_OPT_HI: float = 160.0

_BLADE_MIN_OVER:  float = 1.0    # blade_length >= neck + 1 mm (safety floor)
_BLADE_MAX_RATIO: float = 3.0    # blade_length <= neck × 3   (avoid oversize)


# ── Cuánta mordaza pide un cuello ──────────────────────────────────────────── #
#
# Un cuello no se clipa con su diámetro: se clipa con lo que mide DESPUÉS de
# quedar aplastado entre las hojas. Al cerrarse, la sección redonda se convierte
# en una ranura plana y lo que se conserva es el PERÍMETRO, así que la línea de
# cierre de un cuello circular de diámetro D mide
#
#     πD / 2  ≈  1,571 · D
#
# Es la razón geométrica detrás de la regla clínica: «Aneurysm clips: What every
# resident should know» (Neurology India) dice que al cerrar las hojas el cuello
# aumenta ~50 % y que por eso la hoja debe medir 1,5 veces el cuello, y el
# estudio numérico «Pre-selection blade size choice for the microsurgical
# clipping of cerebral artery aneurysms» (2024) mide una deformación de al menos
# 1,4×. Los dos números son el mismo π/2 con más o menos aplastamiento. El mismo
# texto recuerda para qué sirve: el cierre incompleto del lado distal del cuello
# es la causa más frecuente de que el domo siga rellenándose.
#
# Pedido por dirección el 24-09-2026 a partir de ese artículo; antes el objetivo
# era ×1,35, que era el centro de una campana sin procedencia clínica anotada.
NECK_DEFORMATION_FACTOR: float = 1.5

#: El factor SUPONE un cuello circular. Cuando se ha medido el contorno real, su
#: mitad es la línea de cierre exacta de ESTE paciente y no hace falta suponer
#: nada. Importa: un cuello elíptico de 6,0 × 2,7 mm equivale en área a un
#: círculo de 4,0 mm —la regla pediría 6,0 mm de mordaza— pero su perímetro es
#: 14,2 mm, o sea 7,1 mm de línea de cierre. Un milímetro largo de diferencia,
#: y por el lado que deja el cuello abierto.
#:
#: El perímetro medido solo se acepta dentro de una horquilla. Por la
#: desigualdad isoperimétrica, entre todas las curvas cerradas de un área dada
#: la circunferencia es la de MENOR perímetro: medir menos de π·D_eq es
#: imposible y delata un corte abierto o un plano que cazó dos lazos. Por
#: arriba, un contorno que pidiera más del triple del cuello tampoco describe
#: un cuello.
_PERIMETER_MIN_RATIO: float = 1.5    # ≈ π/2, el límite del círculo
_PERIMETER_MAX_RATIO: float = 3.0


@dataclass(frozen=True)
class JawRequirement:
    """Cuánta mordaza hace falta para cerrar este cuello, y de dónde sale."""

    mm: float
    #: "perimeter" (contorno medido) · "factor" (regla ×1,5) · "floor" (suelo
    #: de seguridad en cuellos muy pequeños) · "none" (sin cuello medido).
    source: str
    detail: str


def jaw_requirement(neck_mm: float, neck_perimeter_mm: float = 0.0) -> JawRequirement:
    """La mordaza mínima que cierra el cuello una vez deformado.

    Con el perímetro del contorno medido se usa su mitad, que es la longitud
    exacta de la línea de cierre. Sin él se aplica la regla de ×1,5. En los dos
    casos se respeta el suelo de `neck + 1 mm`: en un cuello de 1,5 mm, ×1,5 son
    2,25 mm de mordaza y no dejan con qué agarrar.
    """
    if neck_mm <= 0.0:
        return JawRequirement(0.0, "none", "Sin cuello medido.")

    suelo = neck_mm + _BLADE_MIN_OVER
    plano = 0.0
    if neck_perimeter_mm > 0.0:
        candidato = neck_perimeter_mm / 2.0
        if neck_mm * _PERIMETER_MIN_RATIO <= candidato <= neck_mm * _PERIMETER_MAX_RATIO:
            plano = candidato
        # Fuera de la horquilla el contorno no describe este cuello: se ignora
        # en silencio y manda la regla, que es lo que había antes de medirlo.

    if plano > 0.0:
        req = max(plano, suelo)
        detalle = (f"Contorno del cuello medido: {neck_perimeter_mm:.1f} mm de "
                   f"perímetro, que aplastado son {plano:.1f} mm de línea de cierre.")
        return JawRequirement(round(req, 2), "floor" if suelo > plano else "perimeter", detalle)

    factor = neck_mm * NECK_DEFORMATION_FACTOR
    req = max(factor, suelo)
    detalle = (f"Cuello de {neck_mm:.1f} mm × {NECK_DEFORMATION_FACTOR} = "
               f"{factor:.1f} mm al quedar aplastado entre las hojas.")
    return JawRequirement(round(req, 2), "floor" if suelo > factor else "factor", detalle)


def required_jaw_mm(neck_mm: float, neck_perimeter_mm: float = 0.0) -> float:
    """Solo el número, para quien no necesita explicar de dónde sale."""
    return jaw_requirement(neck_mm, neck_perimeter_mm).mm


# Shape fit tables (score 0–1 for each clinical context)
_SHAPE_FIT_WIDE_NECK: dict[ClipShape, float] = {
    ClipShape.FENESTRATED: 1.00,
    ClipShape.CURVED:      0.75,
    ClipShape.ANGLED:      0.65,
    ClipShape.ANGLED_45:   0.60,
    ClipShape.STRAIGHT:    0.50,
    ClipShape.BAYONET:     0.45,
}
_SHAPE_FIT_DEEP_DOME: dict[ClipShape, float] = {
    ClipShape.ANGLED:      1.00,
    ClipShape.BAYONET:     0.90,
    ClipShape.ANGLED_45:   0.85,
    ClipShape.CURVED:      0.70,
    ClipShape.STRAIGHT:    0.55,
    ClipShape.FENESTRATED: 0.40,
}
_SHAPE_FIT_STANDARD: dict[ClipShape, float] = {
    ClipShape.STRAIGHT:    1.00,
    ClipShape.CURVED:      0.90,
    ClipShape.ANGLED_45:   0.70,
    ClipShape.ANGLED:      0.60,
    ClipShape.BAYONET:     0.50,
    ClipShape.FENESTRATED: 0.35,
}


# ── Scoring helpers ────────────────────────────────────────────────────────── #

def _coverage_score(cov: float) -> float:
    return math.exp(-0.5 * ((cov - NECK_DEFORMATION_FACTOR) / _COV_SIGMA) ** 2)

def _shape_score(clip: ClipSpec, neck_mm: float, ar: float) -> float:
    if neck_mm >= WIDE_NECK_THRESHOLD_MM:
        return _SHAPE_FIT_WIDE_NECK.get(clip.shape, 0.4)
    if ar >= DEEP_DOME_AR_THRESHOLD:
        return _SHAPE_FIT_DEEP_DOME.get(clip.shape, 0.4)
    return _SHAPE_FIT_STANDARD.get(clip.shape, 0.4)

def _force_score(force: float) -> float:
    if _FORCE_OPT_LO <= force <= _FORCE_OPT_HI:
        return 1.0
    if force < _FORCE_OPT_LO:
        return max(0.0, force / _FORCE_OPT_LO)
    return max(0.0, 1.0 - (force - _FORCE_OPT_HI) / _FORCE_OPT_HI)


# ── Scored recommendation internal class ───────────────────────────────────── #

@dataclass
class _Recommendation:
    clip:             ClipSpec
    score:            float
    coverage_ratio:   float
    safety_margin_mm: float
    reasons:          list[str] = field(default_factory=list)

    @property
    def score_label(self) -> str:
        if self.score >= 75: return "Excelente"
        if self.score >= 55: return "Bueno"
        if self.score >= 35: return "Aceptable"
        return "Marginal"


# ── Public recommender ─────────────────────────────────────────────────────── #

def recommend_clips(
    neck_mm:      float,
    aspect_ratio: float,
    catalogue:    Sequence[ClipSpec] | None = None,
    n:            int = 8,
) -> list[_Recommendation]:
    """Return top-n clip recommendations sorted by descending composite score.

    Parameters
    ----------
    neck_mm       : aneurysm neck diameter (mm)
    aspect_ratio  : dome/neck aspect ratio (unitless)
    catalogue     : clip catalogue to search (defaults to CLIP_CATALOGUE)
    n             : maximum results

    Returns
    -------
    list of :class:`_Recommendation`, best first
    """
    if catalogue is None:
        catalogue = CLIP_CATALOGUE
    if neck_mm <= 0:
        return []

    # Por debajo de la mordaza requerida la hoja no cierra el cuello una vez
    # aplastado: no es una puntuacion baja, es que no vale.
    lo = required_jaw_mm(neck_mm)
    hi = neck_mm * _BLADE_MAX_RATIO

    recs: list[_Recommendation] = []
    for clip in catalogue:
        bl = clip.blade_length_mm
        if bl < lo or bl > hi:
            continue

        cov       = bl / neck_mm
        composite = (
            _W_COVERAGE * _coverage_score(cov)
            + _W_SHAPE   * _shape_score(clip, neck_mm, aspect_ratio)
            + _W_FORCE   * _force_score(clip.closing_force_g)
        ) * 100.0
        safety_mm = bl - neck_mm

        reasons: list[str] = []
        if cov >= 1.2:
            reasons.append(f"Cobertura adecuada (×{cov:.2f})")
        else:
            reasons.append(f"Cobertura justa (×{cov:.2f}) — verificar en IQ")
        if neck_mm >= WIDE_NECK_THRESHOLD_MM and clip.shape == ClipShape.FENESTRATED:
            reasons.append("Fenestrado indicado para cuello ancho")
        elif aspect_ratio >= DEEP_DOME_AR_THRESHOLD and clip.shape in (ClipShape.ANGLED, ClipShape.BAYONET):
            reasons.append("Angulado/Bayoneta indicado para domo profundo (AR alto)")
        if safety_mm < 1.5:
            reasons.append(f"Margen de seguridad pequeño ({safety_mm:.1f} mm)")
        else:
            reasons.append(f"Margen de seguridad: {safety_mm:.1f} mm")

        recs.append(_Recommendation(
            clip=clip,
            score=round(composite, 1),
            coverage_ratio=round(cov, 3),
            safety_margin_mm=round(safety_mm, 2),
            reasons=reasons,
        ))

    recs.sort(key=lambda r: r.score, reverse=True)
    return recs[:n]


# ── API conversion helpers ─────────────────────────────────────────────────── #

_SHAPE_ANGLE: dict[ClipShape, float] = {
    ClipShape.STRAIGHT:    0.0,
    ClipShape.CURVED:      0.0,
    ClipShape.ANGLED:      90.0,
    ClipShape.ANGLED_45:   45.0,
    ClipShape.BAYONET:     0.0,
    ClipShape.FENESTRATED: 0.0,
}

_APPLIER: dict[str, str] = {
    "Yasargil/KS": "Yasargil Standard",
    "Sugita":      "Sugita Standard",
    "Aesculap":    "Aesculap Standard",
    "Codman":      "Codman Standard",
}


def _slug(name: str) -> str:
    """Convert clip name to a URL-safe identifier."""
    s = name.lower()
    s = re.sub(r"[°/]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s)
    return s


#: Public alias — `clip_selection` and the routers need to slug clip names too.
clip_slug = _slug


def spec_to_api(c: ClipSpec) -> dict:
    """Serialise ClipSpec to a ClipLibraryItem-compatible dict."""
    return {
        # `identifier`, not a slug of the name. The placement endpoint looks the
        # geometry up by identifier, and a NAVARRO™ name slugged down to
        # "navarro-t1-recto-70-mm" matches nothing: the clip was accepted, no
        # spec was found, and a generic 9 mm box was placed in its stead.
        "id":               c.identifier,
        "name":             c.name,
        "manufacturer":     c.manufacturer,
        "length_mm":        c.blade_length_mm,
        "angle_deg":        _SHAPE_ANGLE.get(c.shape, 0.0),
        "is_fenestrated":   c.shape == ClipShape.FENESTRATED,
        "closing_force_g":  c.closing_force_g,
        "compatible_applier": _APPLIER.get(c.manufacturer, "Standard"),
    }


def catalogue_to_api(catalogue: list[ClipSpec] | None = None) -> list[dict]:
    """Serialise what the surgeon is actually OFFERED, not the reference table.

    Defaulting to `CLIP_CATALOGUE` outlived the day it was true. That table is
    now dimensional reference — `OFFER_COMMERCIAL_CLIPS` is off — so this handed
    out 42 clips from four makers that nothing else in the app knows about:
    ids no index resolves, pieces this institution cannot obtain, and no route
    into fabricación. Pass a list explicitly to serialise a specific one.
    """
    if catalogue is None:
        from services.clip_library import catalogue_with_library
        catalogue = catalogue_with_library()
    return [spec_to_api(c) for c in catalogue]


def recommendation_to_api(rec: _Recommendation) -> dict:
    """Serialise _Recommendation to a ClipRecommendation-compatible dict."""
    return {
        # `identifier` here too: this serialiser is no longer wired to an
        # endpoint, and a slug of the name is exactly the trap that made the one
        # it used to feed hand out ids nothing resolves.
        "clip_id":   rec.clip.identifier,
        "clip_name": rec.clip.name,
        "score":     rec.score / 100.0,          # API uses 0–1 scale
        "reason":    "; ".join(rec.reasons),
        "suggested_placement": None,              # computed by VTK pipeline (Session E)
    }


def recommendations_to_api(recs: list[_Recommendation]) -> list[dict]:
    return [recommendation_to_api(r) for r in recs]
