"""Dimensionado de un flow-diverter sobre la línea central.

Lo que hace el neurointervencionista a mano antes de elegir dispositivo, con
las medidas que esta aplicación ya tiene: dónde cae el cuello a lo largo del
vaso, cuánto mide la arteria en el anclaje proximal y en el distal, y qué
diámetro y longitud del catálogo encajan.

Reglas, y de dónde salen:

- **Diámetro: lo más cerca posible de la arteria receptora.** Sobredimensionar
  abre la trenza y baja la cobertura metálica (ver `metal_coverage_note` en
  services/endovascular.py, con sus dos medidas publicadas). Se elige la medida
  comercializada más pequeña que no quede por debajo del anclaje mayor más que
  la tolerancia de medida: por debajo, mala aposición en ese extremo.
- **Si el anclaje proximal y el distal difieren mucho, varios dispositivos**,
  cada uno con su medida, en vez de uno sobredimensionado en el extremo
  estrecho (SRC_MISMATCH). «Mucho» aquí es 1 mm: es el sobredimensionado con
  el que se midió una cobertura del 25,5 % frente al 48 %.
- **La longitud etiquetada es una referencia baja.** Desplegado, un Pipeline
  midió de media un 32,6 % más (26,3–109,2 %) en 101 pacientes
  (SRC_ELONGATION). Por eso la longitud se elige con la etiqueta, que es lo
  único que se pide al almacén, y se dice hasta dónde puede llegar alargado.
- **Anclaje de 5 mm a cada lado**: el mismo valor de partida, no publicado,
  que usa el planificador de stent (`LANDING_ZONE_MM`).

Lo que NO hace: simular el despliegue de la trenza (eso es Sim&Size o
AneuGuide, con el diseño de cada dispositivo), ni predecir la longitud final,
ni decidir. El sentido proximal → distal es el de la línea central: del
origen que marcó el usuario al destino.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

from services.endovascular import (LANDING_ZONE_MM, MCR_OVERSIZED, SIZING_TOLERANCE_MM,
                                   SRC_BRAID, SRC_OVERSIZING, metal_coverage_note)
from services.parent_artery import _nearest_contour, _section_shape

SRC_MISMATCH = (
    "neuroangio.org, Pipeline: dimensionar tan cerca como se pueda de la arteria "
    "receptora; una diferencia importante entre los anclajes proximal y distal "
    "pide varios dispositivos, cada uno con su medida"
)
SRC_ELONGATION = (
    "J NeuroIntervent Surg 2023;15(1):57 (AneuGuide, 101 pacientes con Pipeline) "
    "— la longitud desplegada superó a la etiquetada un 32,6 % de media "
    "(26,3–109,2 %): la etiqueta es solo una referencia baja"
)

#: Alargamiento medio medido tras desplegar (SRC_ELONGATION). Solo para decir
#: hasta dónde puede llegar; no es una predicción para este vaso.
MEAN_ELONGATION = 0.326

#: Diferencia proximal–distal a partir de la cual un solo dispositivo queda
#: sobredimensionado en el extremo estrecho tanto como en la medida publicada
#: de cobertura más baja (MCR_OVERSIZED).
MISMATCH_MULTI_MM = MCR_OVERSIZED[0]

#: Separación entre el borde del cuello y el primer corte de anclaje: el corte
#: pegado al cuello atraviesa también el saco.
NECK_CLEARANCE_MM = 1.0
#: Paso entre cortes dentro de cada anclaje.
SAMPLE_STEP_MM = 0.5
#: Mínimo de cortes redondos para dar el calibre de un anclaje.
MIN_SECTIONS = 3
#: Si el punto más cercano de la línea central está más lejos que esto del
#: cuello, la línea no pasa por el aneurisma.
MAX_NECK_DISTANCE_MM = 12.0


@dataclass
class LandingZone:
    arc_from_mm: float
    arc_to_mm: float
    diameter_mm: float          # 0 = sin medir
    min_mm: float = 0.0
    max_mm: float = 0.0
    n_sections: int = 0
    truncated: bool = False     # la línea central se acaba antes del anclaje entero


@dataclass
class FdOption:
    device_id: str
    name: str
    manufacturer: str
    diameter_mm: float          # 0 = el catálogo no tiene medida que encaje
    length_mm: float            # 0 = ninguna longitud basta
    fits: bool
    reason: str
    neck_note: str = ""
    narrow_end_note: str = ""
    deploy_arc_mm: tuple[float, float] = (0.0, 0.0)
    elongated_length_mm: float = 0.0


@dataclass
class FdSizing:
    neck_arc_mm: tuple[float, float]
    neck_from_rim: bool
    total_arc_mm: float
    proximal: LandingZone
    distal: LandingZone
    mismatch_mm: float
    target_diameter_mm: float
    required_length_mm: float
    multiple_devices: bool
    options: list[FdOption] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


def _arc(points: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))])


def _tangents(points: np.ndarray) -> np.ndarray:
    t = np.gradient(points, axis=0)
    n = np.linalg.norm(t, axis=1, keepdims=True)
    return t / np.where(n < 1e-9, 1.0, n)


def project_on_centerline(points: np.ndarray, arc: np.ndarray, p) -> tuple[float, float]:
    """(longitud de arco del punto más cercano, distancia a él)."""
    d = np.linalg.norm(points - np.asarray(p, float), axis=1)
    i = int(np.argmin(d))
    return float(arc[i]), float(d[i])


def _at_arc(points, arc, tangents, s):
    i = int(np.clip(np.searchsorted(arc, s), 0, len(points) - 1))
    return points[i], tangents[i]


#: Alargamiento máximo de un corte de anclaje. No es el 1,6 de la arteria madre
#: (services/parent_artery.py): allí el plano no sigue al vaso y un contorno
#: alargado delata un corte en diagonal. Aquí el plano es perpendicular a la
#: línea central, así que el alargamiento es la FORMA del vaso. En el case 3 el
#: basilar, justo antes del cuello, mide 4,3–4,7 mm con secciones 1,7–1,9 veces
#: más largas que anchas, y con 1,6 el anclaje proximal se quedaba sin medir.
#: Por encima de 2,5 el corte ha atrapado otra cosa (el saco, una rama).
MAX_SECTION_ELONGATION = 2.5


def _transverse_diameter(poly, p, t, reach_mm: float = 8.0) -> float:
    """Diámetro de igual área del corte perpendicular a la línea central; 0 si no vale."""
    c = _nearest_contour(poly, p, t)
    if c is None or float(np.min(np.linalg.norm(c - np.asarray(p, float), axis=1))) > reach_mm:
        return 0.0
    d, elong = _section_shape(c, t)
    return d if elong <= MAX_SECTION_ELONGATION else 0.0


def _centred(poly, p, t, diameter: float) -> bool:
    """El corte es del vaso que recorre la línea central y no de una rama pegada.

    El contorno más cercano al punto puede ser el de una rama que toca el
    vaso: en un caso real, a 12 mm del origen salió uno de 1,7 mm en un vaso de
    4–5 mm. El del propio vaso tiene la línea central cerca de su centro; el de
    la rama, a más de su radio."""
    c = _nearest_contour(poly, p, t)
    if c is None:
        return False
    return float(np.linalg.norm(c.mean(axis=0) - np.asarray(p, float))) <= 0.5 * diameter


def measure_zone(poly, points, arc, tangents, s_from: float, s_to: float) -> LandingZone:
    total = float(arc[-1])
    a, b = max(0.0, s_from), min(total, s_to)
    zone = LandingZone(arc_from_mm=round(a, 1), arc_to_mm=round(b, 1), diameter_mm=0.0,
                       truncated=(b - a) < (s_to - s_from) - 1e-6)
    if b - a <= 0:
        return zone
    diams = []
    for s in np.arange(a, b + 1e-9, SAMPLE_STEP_MM):
        p, t = _at_arc(points, arc, tangents, s)
        d = _transverse_diameter(poly, p, t)
        if d > 0 and _centred(poly, p, t, d):
            diams.append(d)
    zone.n_sections = len(diams)
    if len(diams) >= MIN_SECTIONS:
        zone.diameter_mm = round(float(np.median(diams)), 2)
        zone.min_mm = round(float(min(diams)), 2)
        zone.max_mm = round(float(max(diams)), 2)
    return zone


def pick_diameter(target: float, item: dict) -> float:
    """La medida comercializada más cercana al anclaje que no se queda corta
    más que la tolerancia de medida; 0 si ninguna."""
    sizes = item.get("available_diameters_mm") or []
    lo = target - SIZING_TOLERANCE_MM
    ok = [s for s in sizes if s >= lo]
    if sizes:
        return float(min(ok, key=lambda s: (abs(s - target), s))) if ok else 0.0
    # Sin lista de medidas: solo se puede decir si el objetivo cae en el rango.
    if item["min_diameter_mm"] <= target <= item["max_diameter_mm"]:
        return round(target, 2)
    return 0.0


def size_flow_diverter(
    poly,
    points: np.ndarray,
    neck_center: Sequence[float],
    neck_mm: float,
    library: list[dict],
    rim_points: Sequence[Sequence[float]] = (),
) -> FdSizing:
    """Dimensiona sobre la línea central `points` (proximal → distal)."""
    pts = np.asarray(points, float)
    if len(pts) < 2:
        raise ValueError("La línea central debe tener al menos 2 puntos.")
    arc = _arc(pts)
    tan = _tangents(pts)
    total = float(arc[-1])

    s_neck, dist = project_on_centerline(pts, arc, neck_center)
    if dist > MAX_NECK_DISTANCE_MM:
        raise ValueError(
            f"La línea central pasa a {dist:.0f} mm del cuello: no recorre la arteria "
            f"del aneurisma. Extráela entre un punto antes y otro después del cuello.")

    # El tramo del vaso que ocupa el cuello: lo que proyectan los puntos del
    # borde si se marcaron; si no, el ancho del cuello centrado en él.
    from_rim = len(rim_points) >= 3
    if from_rim:
        ss = [project_on_centerline(pts, arc, r)[0] for r in rim_points]
        s0, s1 = min(ss), max(ss)
        if s1 - s0 < 0.5:                     # borde casi perpendicular al vaso
            s0, s1 = s_neck - neck_mm / 2, s_neck + neck_mm / 2
    else:
        s0, s1 = s_neck - neck_mm / 2, s_neck + neck_mm / 2
    span = s1 - s0

    prox = measure_zone(poly, pts, arc, tan, s0 - NECK_CLEARANCE_MM - LANDING_ZONE_MM, s0 - NECK_CLEARANCE_MM)
    dist_z = measure_zone(poly, pts, arc, tan, s1 + NECK_CLEARANCE_MM, s1 + NECK_CLEARANCE_MM + LANDING_ZONE_MM)

    warnings: list[str] = []
    notes: list[str] = []
    for nombre, z in (("proximal", prox), ("distal", dist_z)):
        if z.truncated:
            warnings.append(
                f"La línea central se acaba antes del anclaje {nombre} completo: "
                f"extráela más larga por ese lado.")
        if z.diameter_mm <= 0:
            warnings.append(
                f"Sin calibre en el anclaje {nombre}: menos de {MIN_SECTIONS} cortes "
                f"redondos (ramas, el propio saco o la línea central demasiado corta).")

    medidos = [z.diameter_mm for z in (prox, dist_z) if z.diameter_mm > 0]
    target = max(medidos) if medidos else 0.0
    mismatch = abs(prox.diameter_mm - dist_z.diameter_mm) if len(medidos) == 2 else 0.0
    multi = mismatch > MISMATCH_MULTI_MM
    if multi:
        warnings.append(
            f"El anclaje proximal ({prox.diameter_mm:.2f} mm) y el distal "
            f"({dist_z.diameter_mm:.2f} mm) difieren {mismatch:.2f} mm. Un solo "
            f"dispositivo quedaría sobredimensionado en el extremo estrecho; lo "
            f"habitual es usar varios, cada uno con su medida.")

    required = span + 2 * (NECK_CLEARANCE_MM + LANDING_ZONE_MM)
    mid = (s0 + s1) / 2
    narrow = min(medidos) if medidos else 0.0
    # Calibre del vaso a la altura del cuello: entre los dos anclajes.
    neck_vessel = sum(medidos) / len(medidos) if medidos else 0.0

    options: list[FdOption] = []
    for item in library:
        if item.get("type") != "flow_diverter":
            continue
        opt = FdOption(device_id=item["id"], name=item["name"], manufacturer=item["manufacturer"],
                       diameter_mm=0.0, length_mm=0.0, fits=False, reason="")
        if target <= 0:
            opt.reason = "Sin calibre medido en los anclajes."
            options.append(opt)
            continue
        d = pick_diameter(target, item)
        lengths = sorted(float(x) for x in item.get("available_lengths_mm") or [])
        L = next((x for x in lengths if x >= required), 0.0)
        opt.diameter_mm, opt.length_mm = d, L
        if d <= 0:
            opt.reason = (f"Ninguna medida del catálogo ({item['min_diameter_mm']:.2f}–"
                          f"{item['max_diameter_mm']:.2f} mm) encaja con {target:.2f} mm.")
        elif L <= 0:
            opt.reason = (f"Ninguna longitud del catálogo llega a {required:.0f} mm "
                          f"(cuello más anclajes): habría que solapar dos.")
        else:
            opt.fits = True
            opt.reason = (f"Ø{d:.2f} mm por el anclaje mayor ({target:.2f} mm); "
                          f"{L:.0f} mm etiquetados para {required:.0f} mm necesarios.")
            opt.neck_note = metal_coverage_note(d, neck_vessel)[1]
            if narrow > 0 and narrow < target:
                opt.narrow_end_note = metal_coverage_note(d, narrow)[1]
            a = max(0.0, mid - L / 2)
            b = min(total, a + L)
            opt.deploy_arc_mm = (round(a, 1), round(b, 1))
            opt.elongated_length_mm = round(L * (1 + MEAN_ELONGATION), 1)
        options.append(opt)

    if any(o.fits for o in options):
        largo = max(o.elongated_length_mm for o in options if o.fits)
        notes.append(
            f"La longitud es la etiquetada. Desplegado, un Pipeline midió de media "
            f"un 33 % más (26–109 %): el más largo de estos llegaría a unos "
            f"{largo:.0f} mm. Comprueba qué ramas quedan debajo.")
    notes.append(
        f"Anclaje de {LANDING_ZONE_MM:.0f} mm a cada lado del cuello, más "
        f"{NECK_CLEARANCE_MM:.0f} mm de margen: valor de partida, no publicado.")
    notes.append(
        "Proximal es el ORIGEN que marcaste al extraer la línea central; si lo "
        "marcaste al revés, los anclajes están intercambiados.")

    return FdSizing(
        neck_arc_mm=(round(s0, 1), round(s1, 1)),
        neck_from_rim=from_rim,
        total_arc_mm=round(total, 1),
        proximal=prox,
        distal=dist_z,
        mismatch_mm=round(mismatch, 2),
        target_diameter_mm=round(target, 2),
        required_length_mm=round(required, 1),
        multiple_devices=multi,
        options=options,
        warnings=warnings,
        notes=notes,
        sources=[SRC_MISMATCH, SRC_ELONGATION, SRC_OVERSIZING, SRC_BRAID],
    )


def segment_diameter(poly, points: np.ndarray, s_from: float, s_to: float,
                     exclude: tuple[float, float] | None = None) -> tuple[float, int]:
    """(mediana del calibre, nº de cortes) entre dos longitudes de arco.

    Lo usa el stent sobre la línea central para juzgar su diámetro con la MISMA
    medida que el dimensionado. Antes usaba los radios de la extracción de la
    línea central —la esfera más grande que cabe en el vaso, sobre una malla
    de vóxeles de 0,8 mm—, que en un vaso ovalado es su lado estrecho: en el
    case 3 decía 3,44 mm donde los cortes miden 3,9–4,4, y avisaba de un
    sobredimensionado que no había. `exclude` es el tramo del cuello: ahí el
    corte arrastra el saco."""
    pts = np.asarray(points, float)
    arc = _arc(pts)
    tan = _tangents(pts)
    a, b = max(0.0, s_from), min(float(arc[-1]), s_to)
    diams = []
    for s in np.arange(a, b + 1e-9, SAMPLE_STEP_MM):
        if exclude is not None and exclude[0] - NECK_CLEARANCE_MM <= s <= exclude[1] + NECK_CLEARANCE_MM:
            continue
        p, t = _at_arc(pts, arc, tan, s)
        d = _transverse_diameter(poly, p, t)
        if d > 0 and _centred(poly, p, t, d):
            diams.append(d)
    if len(diams) < MIN_SECTIONS:
        return 0.0, len(diams)
    return round(float(np.median(diams)), 2), len(diams)
