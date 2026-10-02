"""Dimensionado del WEB (Woven EndoBridge) a partir del saco aislado.

El WEB es una malla que se abre DENTRO del saco y se apoya en su pared. Se
elige con dos medidas: la ANCHURA media del aneurisma, paralela al cuello, y su
ALTURA más pequeña, perpendicular al cuello. Esta aplicación ya aísla el saco
y tiene el plano del cuello, así que las dos salen de la malla en vez de a ojo
sobre dos proyecciones.

Reglas, y de dónde salen:

- **«+1/−1»** (SRC_RULE): anchura del dispositivo = anchura del aneurisma más
  1–2 mm (1 en los pequeños, 2 en los grandes); altura = altura del aneurisma
  MENOS lo mismo que se sumó. Al apoyarse lateralmente, el dispositivo se
  estira en altura; sin restarlo protruye por el cuello.
- **Catálogo**: las medidas que existen (CATALOGUE_SL, CATALOGUE_SLS), de la
  guía de selección del fabricante. No se interpola entre ellas.
- **Indicación aprobada** (SRC_FDA): aneurismas de bifurcación, de cuello
  ancho, con domo de 3 a 10 mm y cuello ≥ 4 mm o cociente domo/cuello entre
  1 y 2. Fuera de eso se dice, no se oculta.
- **Cociente de volúmenes dispositivo/aneurisma (DAV)**: se da como dato, sin
  decidir con él. Tres estudios proponen tres franjas que no casan (0,6–0,8;
  0,90–1,16; 0,76–1,24) y el último, multicéntrico, no encontró que ninguna
  mejore la regla clásica (SRC_DAV). Además el volumen del dispositivo aquí es
  el de su envolvente geométrica, no el que ocupa abierto.

Lo que NO hace: decidir la forma SL o SLS por el paciente, excluir lóbulos (la
anchura de la guía es «sin incluir lóbulos donde el dispositivo no va a
entrar»; aquí la malla entera cuenta), ni saber si la arteria es una
bifurcación: eso lo sabe quien mira.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

SRC_RULE = (
    "Brain Sci 2021;11(7):901 (Ansari et al.) — anchura del aneurisma más 1–2 mm "
    "(1 en pequeños, 2 en grandes), y la altura menos lo mismo"
)
SRC_DAV = (
    "Interv Neuroradiol 2024 (Pressman et al., 133 casos) — franjas de DAV "
    "propuestas 0,6–0,8 (Ansari), 0,90–1,16 (Tanabe) y 0,76–1,24; ninguna mejoró "
    "de forma significativa la regla clásica"
)
SRC_FDA = (
    "FDA PMA, WEB Aneurysm Embolization System (2018–2019) — aneurismas saculares "
    "de bifurcación de cuello ancho, domo de 3–10 mm y cuello ≥ 4 mm o cociente "
    "domo/cuello > 1 y < 2"
)
SRC_CATALOGUE = "MicroVention, WEB 17 System — tablas de selección de dispositivo (SL y SLS)"

#: (anchura, altura) en mm de cada WEB SL de la guía de selección.
CATALOGUE_SL: tuple[tuple[float, float], ...] = (
    (3, 2), (3.5, 2), (4, 2), (4, 3), (4.5, 2), (4.5, 3), (5, 2), (5, 3),
    (6, 3), (6, 4), (7, 3), (7, 4), (7, 5),
    (8, 3), (8, 4), (8, 5), (8, 6), (9, 4), (9, 5), (9, 6), (9, 7),
    (10, 5), (10, 6), (10, 7), (10, 8), (11, 6), (11, 7), (11, 8), (11, 9),
)
#: (anchura, altura) en mm de cada WEB SLS (esférico).
CATALOGUE_SLS: tuple[tuple[float, float], ...] = (
    (4, 2.6), (5, 3.6), (6, 4.6), (7, 5.6), (8, 6.6), (9, 7.6), (10, 8.6), (11, 9.6),
)

#: Lo que se suma a la anchura: entre 1 y 2 mm.
MIN_ADD_MM, MAX_ADD_MM = 1.0, 2.0
#: Las alturas del catálogo van de milímetro en milímetro: medio de holgura.
HEIGHT_TOL_MM = 0.5
#: Domo indicado por la FDA.
DOME_RANGE_MM = (3.0, 10.0)
#: Por debajo de esta fracción del volumen de un semielipsoide con las mismas
#: medidas, el saco aislado no es un domo lleno. En la sesión de Hernández el
#: saco cerrado mide 7 × 9 × 4,8 mm y encierra 56 mm³ (un domo así, ~150): su
#: superficie es 2,8 veces la de una esfera de ese volumen. Ahí la anchura
#: describe mal el hueco donde se abre el dispositivo y el DAV, menos aún.
MIN_FILL = 0.5


@dataclass
class SacDims:
    width_mm: float          # anchura media: (máxima + mínima) / 2, en el plano del cuello
    width_max_mm: float
    width_min_mm: float
    height_mm: float         # del plano del cuello al punto más alto del saco
    source: str              # "sac" (malla aislada) | "morpho" (cifras de la morfometría)


@dataclass
class WebOption:
    shape: str               # "SL" | "SLS"
    width_mm: float
    height_mm: float
    added_mm: float          # anchura del dispositivo − anchura del aneurisma
    target_height_mm: float  # altura del aneurisma − lo sumado
    dav: float | None        # volumen envolvente del dispositivo / volumen del aneurisma
    label: str = ""


@dataclass
class WebSizing:
    dims: SacDims
    neck_mm: float
    dnr: float
    volume_mm3: float
    within_indication: bool
    fill_ratio: float | None = None   # volumen / semielipsoide de las mismas medidas
    options: list[WebOption] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


def measure_sac(points: np.ndarray, origin, normal) -> SacDims:
    """Anchura y altura del saco respecto al plano del cuello."""
    pts = np.asarray(points, float)
    n = np.asarray(normal, float)
    n = n / (np.linalg.norm(n) + 1e-12)
    rel = pts - np.asarray(origin, float)
    h = rel @ n
    if np.sum(h > 0) < np.sum(h < 0):        # la normal apuntaba al vaso
        h, n = -h, -n
    dome = rel[h > -0.25]                    # el saco, sin lo que queda bajo el plano
    height = float(max(h.max(), 0.0))
    helper = np.array([1.0, 0, 0]) if abs(n[0]) < 0.8 else np.array([0, 1.0, 0])
    u = np.cross(n, helper); u /= np.linalg.norm(u)
    v = np.cross(n, u)
    xy = np.column_stack([dome @ u, dome @ v])
    # Anchura en cada dirección del plano (calibre de pie de rey), de 2° en 2°.
    widths = []
    for a in np.radians(np.arange(0, 180, 2)):
        proj = xy @ np.array([math.cos(a), math.sin(a)])
        widths.append(float(proj.max() - proj.min()))
    wmax, wmin = max(widths), min(widths)
    return SacDims(width_mm=round((wmax + wmin) / 2, 2), width_max_mm=round(wmax, 2),
                   width_min_mm=round(wmin, 2), height_mm=round(height, 2), source="sac")


def _dav(shape: str, w: float, h: float, volume_mm3: float) -> float | None:
    if volume_mm3 <= 0:
        return None
    dev = (math.pi * (w / 2) ** 2 * h) if shape == "SL" else (math.pi / 6 * w * w * h)
    return round(dev / volume_mm3, 2)


def _candidates(shape: str, catalogue, W: float, H: float, volume: float) -> list[WebOption]:
    out = []
    for w, h in catalogue:
        add = w - W
        if not (MIN_ADD_MM - 1e-6 <= add <= MAX_ADD_MM + 1e-6):
            continue
        target = H - add
        if h > target + HEIGHT_TOL_MM:      # más alto de lo que cabe: protruye
            continue
        out.append(WebOption(shape=shape, width_mm=float(w), height_mm=float(h),
                             added_mm=round(add, 2), target_height_mm=round(target, 2),
                             dav=_dav(shape, w, h, volume),
                             label=f"WEB {shape} {w:g}" + (f"×{h:g}" if shape == "SL" else "")))
    # Primero la altura que más se acerca a la buscada; luego lo menos sumado.
    out.sort(key=lambda o: (abs(o.height_mm - o.target_height_mm), o.added_mm))
    return out


def size_web(dims: SacDims, neck_mm: float, volume_mm3: float = 0.0, top: int = 3,
             dnr: float = 0.0) -> WebSizing:
    """`dnr`, si llega, es el de la morfometría: el mismo que ya está en pantalla."""
    W, H = dims.width_mm, dims.height_mm
    if dnr <= 0:
        dnr = round(dims.width_max_mm / neck_mm, 2) if neck_mm > 0 else 0.0
    warnings: list[str] = []
    notes: list[str] = []

    # ¿Es un domo lleno? Volumen frente al semielipsoide de las mismas medidas.
    domo_lleno = (2 / 3) * math.pi * (dims.width_max_mm / 2) * (dims.width_min_mm / 2) * H
    fill = volume_mm3 / domo_lleno if volume_mm3 > 0 and domo_lleno > 0 else None
    irregular = fill is not None and fill < MIN_FILL
    if irregular:
        warnings.append(
            f"El saco aislado no es un domo lleno: encierra {volume_mm3:.0f} mm³ y un "
            f"domo de {dims.width_max_mm:.1f} × {dims.width_min_mm:.1f} × {H:.1f} mm "
            f"tendría unos {domo_lleno:.0f}. La anchura puede incluir partes donde el "
            f"dispositivo no entra: revisa el saco en el visor. No se da el DAV.")
        volume_mm3_dav = 0.0
    else:
        volume_mm3_dav = volume_mm3

    dome = dims.width_max_mm
    in_dome = DOME_RANGE_MM[0] <= dome <= DOME_RANGE_MM[1]
    wide_neck = neck_mm >= 4.0 or (1.0 < dnr < 2.0)
    within = in_dome and wide_neck
    if not in_dome:
        warnings.append(
            f"Domo de {dome:.1f} mm: fuera de los 3–10 mm de la indicación aprobada.")
    if neck_mm > 0 and not wide_neck:
        warnings.append(
            f"Cuello de {neck_mm:.1f} mm y cociente domo/cuello {dnr:.2f}: no es un "
            f"cuello ancho según la indicación aprobada (≥ 4 mm, o cociente entre 1 y 2).")
    if dims.source != "sac":
        warnings.append(
            "Medidas orientativas: sin el saco aislado se usan el diámetro máximo y "
            "la altura del domo de la morfometría. Marca el cuello para medirlo.")

    options = (_candidates("SL", CATALOGUE_SL, W, H, volume_mm3_dav)[:top]
               + _candidates("SLS", CATALOGUE_SLS, W, H, volume_mm3_dav)[:top])
    if not options:
        warnings.append(
            f"Ninguna medida del catálogo cumple la regla con {W:.1f} × {H:.1f} mm "
            f"(anchura + 1–2 mm y altura reducida en lo mismo).")
    for o in options:
        if neck_mm > 0 and o.width_mm <= neck_mm:
            warnings.append(
                f"{o.label}: no es más ancho que el cuello ({neck_mm:.1f} mm); "
                f"nada lo retiene dentro del saco.")

    notes.append(
        f"Anchura media {W:.1f} mm (entre {dims.width_min_mm:.1f} y {dims.width_max_mm:.1f} "
        f"según la dirección), medida en el plano del cuello e incluyendo lóbulos; "
        f"altura {H:.1f} mm desde el plano del cuello.")
    notes.append(
        "Se suma 1 mm en los aneurismas pequeños y 2 en los grandes; las opciones "
        "cubren las dos cosas.")
    if volume_mm3_dav > 0:
        notes.append(
            "DAV = volumen de la envolvente del dispositivo / volumen del aneurisma. "
            "Las franjas publicadas no coinciden entre sí y ninguna ha mejorado la "
            "regla clásica: es un dato, no un criterio.")
    notes.append(
        "La indicación es para aneurismas de BIFURCACIÓN (ACM, carótida terminal, "
        "comunicante anterior, punta de basilar): eso no lo sabe la aplicación.")

    return WebSizing(dims=dims, neck_mm=round(neck_mm, 2), dnr=dnr,
                     volume_mm3=round(volume_mm3, 1), within_indication=within,
                     fill_ratio=round(fill, 2) if fill is not None else None,
                     options=options, warnings=warnings, notes=notes,
                     sources=[SRC_RULE, SRC_CATALOGUE, SRC_FDA, SRC_DAV])
