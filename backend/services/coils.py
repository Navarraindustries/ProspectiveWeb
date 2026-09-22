"""Endovascular coil library.

Copied from prospective/models/coil_library.py — pure Python, zero Qt / VTK dependencies.

Treatment strategy
------------------
1. Framing coil   — large, stiff, shapes to dome wall (select Ø ≥ dome Ø)
2. Filling coils  — standard helical coils fill the interior volume
3. Finishing coils — ultra-soft, pack residual voids

Packing density
---------------
La densidad de empaquetamiento —volumen de hilo / volumen del saco— es la única
cifra de esta familia que se MIDE: el volumen de hilo sale del catálogo y el del
saco, de la morfometría. Los umbrales viven en `PACKING_*`, abajo, con su fuente.

Lo que este módulo NO hace es predecir el grado de oclusión angiográfica. La
escala de Raymond-Roy tiene tres clases ordinales que se valoran sobre la
angiografía posterior al procedimiento; convertir un empaquetamiento en un
«porcentaje de oclusión» exigiría una curva que no existe publicada.

References: manufacturer IFUs and published sizing charts.
All dimensions in mm / cm.  Wire diameter in micrometres (µm).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from enum import Enum


# ── Enums ──────────────────────────────────────────────────────────────────── #

class CoilType(Enum):
    FRAMING    = "Enmarcado"      # first coil — large, stiff frame
    FILLING    = "Relleno"        # standard helical filling
    FINISHING  = "Acabado"        # ultra-soft, final packing
    COMPLEX_3D = "Complejo 3D"    # random 3-D shape for irregular sacs
    HYDROCOIL  = "Hidrocoil"      # hydrogel-expanding (MicroVention)


# ── Data model ─────────────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class CoilSpec:
    """Geometric and clinical specification of one coil model."""
    name:              str
    coil_type:         CoilType
    diameter_mm:       float       # nominal coil diameter (match dome diameter)
    length_cm:         float       # stretched wire length
    shape_3d:          str
    wire_diameter_um:  float       # bare platinum wire thickness in µm
    manufacturer:      str
    compatible_wire:   str         # required microwire ('0.014"' or '0.010"')
    catheter_id_fr:    float       # minimum microcatheter inner diameter (Fr)

    @property
    def display_label(self) -> str:
        return f"{self.name}  (Ø{self.diameter_mm:.0f} mm × {self.length_cm:.0f} cm)"

    @property
    def wire_volume_mm3(self) -> float:
        """Bare platinum wire volume (cylinder approximation)."""
        r_mm = (self.wire_diameter_um * 1e-3) / 2.0
        return math.pi * r_mm * r_mm * self.length_cm * 10.0


# ── Catalogue ──────────────────────────────────────────────────────────────── #

COIL_CATALOGUE: list[CoilSpec] = [

    # ══════════════════════════════════════════════════════════════════════
    # Stryker — Target 360° / Target Ultra / Target Nano
    # ══════════════════════════════════════════════════════════════════════

    CoilSpec("Target 360° 4mm×8cm",   CoilType.FRAMING,    4,  8, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target 360° 5mm×10cm",  CoilType.FRAMING,    5, 10, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target 360° 6mm×15cm",  CoilType.FRAMING,    6, 15, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target 360° 8mm×20cm",  CoilType.FRAMING,    8, 20, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target 360° 10mm×25cm", CoilType.FRAMING,   10, 25, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target 360° 12mm×30cm", CoilType.FRAMING,   12, 30, "Complejo 3D", 254, "Stryker", '0.014"', 1.7),

    CoilSpec("Target Ultra 3mm×6cm",  CoilType.FILLING,    3,  6, "Helicoidal",  254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target Ultra 4mm×8cm",  CoilType.FILLING,    4,  8, "Helicoidal",  254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target Ultra 5mm×12cm", CoilType.FILLING,    5, 12, "Helicoidal",  254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target Ultra 6mm×15cm", CoilType.FILLING,    6, 15, "Helicoidal",  254, "Stryker", '0.014"', 1.7),
    CoilSpec("Target Ultra 7mm×18cm", CoilType.FILLING,    7, 18, "Helicoidal",  254, "Stryker", '0.014"', 1.7),

    CoilSpec("Target Nano 2mm×4cm",   CoilType.FINISHING,  2,  4, "Helicoidal",  127, "Stryker", '0.010"', 1.5),
    CoilSpec("Target Nano 3mm×6cm",   CoilType.FINISHING,  3,  6, "Helicoidal",  127, "Stryker", '0.010"', 1.5),
    CoilSpec("Target Nano 4mm×8cm",   CoilType.FINISHING,  4,  8, "Helicoidal",  127, "Stryker", '0.010"', 1.5),

    # ══════════════════════════════════════════════════════════════════════
    # Penumbra — Ruby / Coil 400
    # ══════════════════════════════════════════════════════════════════════

    CoilSpec("Ruby 6mm×20cm",         CoilType.FRAMING,    6, 20, "Complejo 3D", 254, "Penumbra", '0.027"', 2.8),
    CoilSpec("Ruby 8mm×25cm",         CoilType.FRAMING,    8, 25, "Complejo 3D", 254, "Penumbra", '0.027"', 2.8),
    CoilSpec("Ruby 10mm×30cm",        CoilType.FRAMING,   10, 30, "Complejo 3D", 254, "Penumbra", '0.027"', 2.8),
    CoilSpec("Ruby 12mm×40cm",        CoilType.FRAMING,   12, 40, "Complejo 3D", 254, "Penumbra", '0.027"', 2.8),
    CoilSpec("Ruby 14mm×50cm",        CoilType.FRAMING,   14, 50, "Complejo 3D", 254, "Penumbra", '0.027"', 2.8),

    CoilSpec("Coil 400 3mm×6cm",      CoilType.FILLING,    3,  6, "Helicoidal",  254, "Penumbra", '0.014"', 1.7),
    CoilSpec("Coil 400 4mm×8cm",      CoilType.FILLING,    4,  8, "Helicoidal",  254, "Penumbra", '0.014"', 1.7),
    CoilSpec("Coil 400 5mm×10cm",     CoilType.FILLING,    5, 10, "Helicoidal",  254, "Penumbra", '0.014"', 1.7),
    CoilSpec("Coil 400 6mm×15cm",     CoilType.FILLING,    6, 15, "Helicoidal",  254, "Penumbra", '0.014"', 1.7),

    # ══════════════════════════════════════════════════════════════════════
    # MicroVention — HydroCoil / MicroPlex 18 & 10
    # HydroCoil expands up to 9× after contact with blood/saline
    # ══════════════════════════════════════════════════════════════════════

    CoilSpec("HydroCoil 4mm×8cm",     CoilType.HYDROCOIL,  4,  8, "Hidrocoil",  254, "MicroVention", '0.014"', 1.7),
    CoilSpec("HydroCoil 5mm×12cm",    CoilType.HYDROCOIL,  5, 12, "Hidrocoil",  254, "MicroVention", '0.014"', 1.7),
    CoilSpec("HydroCoil 6mm×15cm",    CoilType.HYDROCOIL,  6, 15, "Hidrocoil",  254, "MicroVention", '0.014"', 1.7),
    CoilSpec("HydroCoil 8mm×20cm",    CoilType.HYDROCOIL,  8, 20, "Hidrocoil",  254, "MicroVention", '0.014"', 1.7),
    CoilSpec("HydroCoil 10mm×25cm",   CoilType.HYDROCOIL, 10, 25, "Hidrocoil",  254, "MicroVention", '0.014"', 1.7),

    CoilSpec("MicroPlex 18 4mm×8cm",  CoilType.FRAMING,    4,  8, "Complejo 3D", 254, "MicroVention", '0.014"', 1.7),
    CoilSpec("MicroPlex 18 6mm×15cm", CoilType.FRAMING,    6, 15, "Complejo 3D", 254, "MicroVention", '0.014"', 1.7),
    CoilSpec("MicroPlex 18 8mm×20cm", CoilType.FRAMING,    8, 20, "Complejo 3D", 254, "MicroVention", '0.014"', 1.7),

    CoilSpec("MicroPlex 10 2mm×3cm",  CoilType.FINISHING,  2,  3, "Helicoidal",  127, "MicroVention", '0.010"', 1.5),
    CoilSpec("MicroPlex 10 3mm×6cm",  CoilType.FINISHING,  3,  6, "Helicoidal",  127, "MicroVention", '0.010"', 1.5),
    CoilSpec("MicroPlex 10 4mm×8cm",  CoilType.FINISHING,  4,  8, "Helicoidal",  127, "MicroVention", '0.010"', 1.5),

    # ══════════════════════════════════════════════════════════════════════
    # Medtronic — Axium 3D / Axium Prime
    # ══════════════════════════════════════════════════════════════════════

    CoilSpec("Axium 3D 4mm×10cm",     CoilType.COMPLEX_3D, 4, 10, "Complejo 3D", 254, "Medtronic", '0.014"', 1.7),
    CoilSpec("Axium 3D 6mm×15cm",     CoilType.COMPLEX_3D, 6, 15, "Complejo 3D", 254, "Medtronic", '0.014"', 1.7),
    CoilSpec("Axium 3D 8mm×20cm",     CoilType.COMPLEX_3D, 8, 20, "Complejo 3D", 254, "Medtronic", '0.014"', 1.7),
    CoilSpec("Axium Prime 4mm×8cm",   CoilType.FILLING,    4,  8, "Helicoidal",  254, "Medtronic", '0.014"', 1.7),
    CoilSpec("Axium Prime 6mm×15cm",  CoilType.FILLING,    6, 15, "Helicoidal",  254, "Medtronic", '0.014"', 1.7),
]


# ── Empaquetamiento: umbrales y su fuente ──────────────────────────────────── #
# Estas dos cifras estaban repetidas a mano en tres sitios con valores distintos
# (20 % en la descripción del endpoint, 25 % en este módulo, y un aviso que
# mezclaba ambas). No es que una estuviera mal: son dos umbrales diferentes y
# nadie lo había dicho. Aquí se nombran y se separan.

#: Por debajo de esto se avisa: es donde la literatura sitúa la compactación.
PACKING_MIN: float = 0.20

#: A lo que se apunta al planificar el número de coils. Se apunta por encima del
#: mínimo porque el empaquetamiento real cae respecto al calculado.
PACKING_AIM: float = 0.25

#: Tope físico del platino empaquetado; por encima, el cálculo se satura.
PACKING_MAX: float = 0.55

SRC_PACKING = (
    "Sluzewski et al., AJNR 2004 — relación entre volumen del aneurisma, "
    "empaquetamiento y compactación de los coils"
)
SRC_RAYMOND = (
    "Raymond-Roy — clasificación de la oclusión en tres clases, valorada sobre "
    "la angiografía posterior al procedimiento"
)


@dataclass(frozen=True)
class PackingAssessment:
    """Qué se puede decir del empaquetamiento medido, y con qué respaldo."""

    packing: float
    meets_minimum: bool
    durability: str
    warning: str | None
    sources: list[str]


def packing_assessment(
    packing: float,
    n_coils: int,
    volume_known: bool = True,
) -> PackingAssessment:
    """Lee la densidad de empaquetamiento sin convertirla en un pronóstico.

    Antes esto devolvía un «porcentaje de oclusión estimado» sacado de una
    exponencial ajustada a ojo (`1 - exp(-packing/0.10)`), sin fuente, y se
    pintaba en la interfaz con un decimal, que es justo lo que le da aspecto de
    medición. Lo que sí se puede afirmar es lo de abajo.

    `volume_known=False` cuando no se ha corrido la morfometría. El divisor de
    la densidad es el volumen del saco, así que sin él no hay densidad que dar.
    El respaldo que había —0.08 por coil, hasta 0.45— era un número inventado
    ocupando el sitio de uno medido, que es el mismo defecto que el porcentaje
    de oclusión.
    """
    if n_coils > 0 and not volume_known:
        return PackingAssessment(
            packing=0.0,
            meets_minimum=False,
            durability=(
                f"{n_coils} coil(s) colocado(s), pero la densidad de "
                f"empaquetamiento no se puede calcular todavía: hace falta el "
                f"volumen del saco, que sale de Morfometría. El volumen de hilo "
                f"lo da el catálogo; el divisor, no."
            ),
            warning=(
                "Sin volumen del saco no hay densidad de empaquetamiento. "
                "Ejecuta la morfometría."
            ),
            sources=[],
        )

    if n_coils <= 0:
        return PackingAssessment(
            packing=0.0,
            meets_minimum=False,
            durability=(
                "Sin coils colocados todavía. La densidad de empaquetamiento se "
                "calcula con el volumen de hilo del catálogo y el volumen del "
                "saco medido en Morfometría."
            ),
            warning=None,
            sources=[],
        )

    meets = packing >= PACKING_MIN
    if meets:
        durability = (
            f"Empaquetamiento {packing * 100:.0f} %, por encima del "
            f"{PACKING_MIN * 100:.0f} % por debajo del cual se describe "
            f"compactación de los coils. No es un pronóstico de oclusión: el "
            f"grado se valora sobre la angiografía posterior."
        )
        warning = None
    else:
        durability = (
            f"Empaquetamiento {packing * 100:.0f} %, por debajo del "
            f"{PACKING_MIN * 100:.0f} % asociado a compactación. Es la magnitud "
            f"que se relaciona con la recanalización, no una medida de oclusión."
        )
        warning = (
            f"Densidad de empaquetamiento {packing * 100:.0f} % por debajo del "
            f"{PACKING_MIN * 100:.0f} %: al planificar se apunta al "
            f"{PACKING_AIM * 100:.0f} %."
        )

    return PackingAssessment(
        packing=packing,
        meets_minimum=meets,
        durability=durability,
        warning=warning,
        sources=[SRC_PACKING, SRC_RAYMOND],
    )


# ── Sizing helpers ─────────────────────────────────────────────────────────── #

def coils_for_aneurysm(
    dome_diameter_mm: float,
    coil_type:        CoilType | None = None,
) -> list[CoilSpec]:
    """Return coils appropriate for a given dome diameter.

    Framing: coil Ø ≈ dome Ø × 1.0–1.3
    Filling/Finishing: coil Ø ≤ dome Ø × 1.0
    HydroCoil: coil Ø ≤ dome Ø (expands after delivery)
    """
    result = []
    for c in COIL_CATALOGUE:
        if coil_type is not None and c.coil_type != coil_type:
            continue
        if c.coil_type == CoilType.FRAMING:
            if dome_diameter_mm * 0.9 <= c.diameter_mm <= dome_diameter_mm * 1.3:
                result.append(c)
        elif c.coil_type == CoilType.HYDROCOIL:
            if c.diameter_mm <= dome_diameter_mm * 1.0:
                result.append(c)
        else:
            if c.diameter_mm <= dome_diameter_mm * 1.0:
                result.append(c)
    return result


def estimate_coil_count(
    aneurysm_volume_mm3: float,
    coil_spec:           CoilSpec,
    target_packing_pct:  float = PACKING_AIM * 100.0,
) -> int:
    """Estimate how many coils are needed to reach target packing density.

    Returns minimum 1.
    """
    if coil_spec.wire_volume_mm3 <= 0:
        return 1
    target_volume = aneurysm_volume_mm3 * target_packing_pct / 100.0
    n = math.ceil(target_volume / coil_spec.wire_volume_mm3)
    return max(1, n)


# ── El montaje sugerido ────────────────────────────────────────────────────── #
# `coils_for_aneurysm` y `estimate_coil_count` llevaban desde la migración
# importados en el router y sin usar: nadie filtraba el catálogo por el domo
# medido. La consecuencia era que el desplegable ofrecía los 40 modelos y se
# podía elegir un enmarcado de 12 mm para un saco de 3 mm sin que nada chistara.
# Y la interfaz mandaba N coils IDÉNTICOS, cuando la secuencia real es
# enmarcado -> relleno -> acabado, con modelos distintos y tamaños decrecientes.


@dataclass(frozen=True)
class CoilStep:
    """Un escalón del montaje: qué modelo, cuántos y por qué."""

    spec:     CoilSpec
    count:    int
    role:     str       # framing | filling | finishing
    rationale: str


@dataclass(frozen=True)
class CoilConstruct:
    """Montaje sugerido para un saco medido."""

    steps:            list[CoilStep]
    dome_mm:          float
    volume_mm3:       float
    projected_packing: float
    feasible:         bool
    note:             str


def _closest(specs: list[CoilSpec], target_mm: float) -> CoilSpec | None:
    """El modelo cuyo diámetro más se acerca a *target_mm*."""
    if not specs:
        return None
    return min(specs, key=lambda c: abs(c.diameter_mm - target_mm))


def suggest_construct(dome_mm: float, volume_mm3: float) -> CoilConstruct:
    """Propone enmarcado, relleno y acabado para el saco medido.

    No es una prescripción: es el catálogo filtrado por las reglas de
    dimensionado que ya estaban escritas en este módulo, más el número de coils
    que hace falta para acercarse a `PACKING_AIM`. Quien decide es el operador.

    Con el domo o el volumen a cero devuelve un montaje vacío y `feasible` en
    falso, en vez de inventarse un saco de referencia.
    """
    if dome_mm <= 0 or volume_mm3 <= 0:
        return CoilConstruct(
            steps=[], dome_mm=dome_mm, volume_mm3=volume_mm3,
            projected_packing=0.0, feasible=False,
            note=(
                "Hace falta la morfometría: el diámetro del domo elige el coil "
                "de enmarcado y el volumen del saco fija cuántos de relleno."
            ),
        )

    steps: list[CoilStep] = []
    objetivo_mm3 = volume_mm3 * PACKING_AIM
    acumulado = 0.0

    # ── Enmarcado: uno solo, Ø ≈ domo, que es quien da la forma ───────── #
    framing = _closest(coils_for_aneurysm(dome_mm, CoilType.FRAMING), dome_mm * 1.1)
    if framing is not None:
        steps.append(CoilStep(
            spec=framing, count=1, role="framing",
            rationale=(
                f"Enmarcado Ø{framing.diameter_mm:.0f} mm para un domo de "
                f"{dome_mm:.1f} mm: es el que se amolda a la pared y define la "
                f"jaula. Va uno."
            ),
        ))
        acumulado += framing.wire_volume_mm3

    # ── Relleno: los que hagan falta hasta acercarse al objetivo ──────── #
    filling = _closest(coils_for_aneurysm(dome_mm, CoilType.FILLING), dome_mm * 0.75)
    if filling is not None and acumulado < objetivo_mm3:
        n = estimate_coil_count(
            max(objetivo_mm3 - acumulado, 0.0) / (PACKING_AIM or 1.0),
            filling,
        )
        n = max(1, min(n, 12))          # más de 12 en un solo escalón no es un plan
        steps.append(CoilStep(
            spec=filling, count=n, role="filling",
            rationale=(
                f"Relleno Ø{filling.diameter_mm:.0f} mm × {n} para llegar al "
                f"{PACKING_AIM * 100:.0f} % de empaquetamiento desde el "
                f"enmarcado."
            ),
        ))
        acumulado += filling.wire_volume_mm3 * n

    # ── Acabado: uno blando para los huecos del cuello ────────────────── #
    finishing = _closest(coils_for_aneurysm(dome_mm, CoilType.FINISHING), dome_mm * 0.4)
    if finishing is not None:
        steps.append(CoilStep(
            spec=finishing, count=1, role="finishing",
            rationale=(
                f"Acabado Ø{finishing.diameter_mm:.0f} mm, ultrablando, para los "
                f"huecos que quedan junto al cuello."
            ),
        ))
        acumulado += finishing.wire_volume_mm3

    packing = min(acumulado / volume_mm3, PACKING_MAX) if volume_mm3 > 0 else 0.0

    if not steps:
        note = (
            f"El catálogo no tiene modelos para un domo de {dome_mm:.1f} mm. "
            f"Revisa la medida o usa el catálogo completo."
        )
    elif packing < PACKING_MIN:
        note = (
            f"El montaje proyecta {packing * 100:.0f} % de empaquetamiento, por "
            f"debajo del {PACKING_MIN * 100:.0f} %. Harán falta más coils de "
            f"relleno de los que cabe proponer desde la geometría."
        )
    else:
        note = (
            f"Proyección {packing * 100:.0f} % con el catálogo cargado. Es una "
            f"cuenta de volúmenes de hilo, no una predicción de cómo se van a "
            f"acomodar dentro del saco."
        )

    return CoilConstruct(
        steps=steps, dome_mm=dome_mm, volume_mm3=volume_mm3,
        projected_packing=round(packing, 3),
        feasible=bool(steps), note=note,
    )


# ── API type mapping ───────────────────────────────────────────────────────── #

# Map internal CoilType → API coil_type string (CoilLibraryItem.coil_type)
_API_TYPE: dict[CoilType, str] = {
    CoilType.FRAMING:    "framing",
    CoilType.FILLING:    "filling",
    CoilType.FINISHING:  "finishing",
    CoilType.COMPLEX_3D: "framing",    # complex 3-D is a framing variant
    CoilType.HYDROCOIL:  "filling",    # hydrocoil is a filling variant
}


def _slug(name: str) -> str:
    """Convert coil name to a URL-safe identifier."""
    s = name.lower()
    s = re.sub(r"[°×/\"']", "-", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def spec_to_api(c: CoilSpec) -> dict:
    """Serialise CoilSpec to a CoilLibraryItem-compatible dict."""
    return {
        "id":           _slug(c.name),
        "name":         c.name,
        "manufacturer": c.manufacturer,
        "diameter_mm":  c.diameter_mm,
        "length_cm":    c.length_cm,
        "coil_type":    _API_TYPE[c.coil_type],
        "is_detachable": True,          # all GDC-type electrolytic detachment
    }


def catalogue_to_api(catalogue: list[CoilSpec] | None = None) -> list[dict]:
    """Return the full coil library as a list of CoilLibraryItem dicts."""
    return [spec_to_api(c) for c in (catalogue or COIL_CATALOGUE)]
