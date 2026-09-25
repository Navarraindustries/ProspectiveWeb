"""De un volumen a una máscara de vasos: macizos, sin hueso, con sus sacos.

Medido en Case 3 (384³ 3DRA a 0,32 mm, umbral 1470):
  · umbral solo: 568 297 vóxeles rellenos, láminas del peñasco pegadas a la
    vasculatura, y vasos huecos cuando hay techo;
  · esta máscara: 148 189 vóxeles tubulares (8 semillas, 1 componente) +
    50 373 recuperados a 3 mm, 4 459 vetados como lámina, 200 832 finales; en
    6,7 s con Frangi dado y 31,7 s calculándolo (2 × 12 s); la lesión confirmada
    conserva el 96,6 % de sus vóxeles de M0 a ≤ 3 mm (99,2 % sin veto: el veto
    cuesta algo de saco a cambio de no traerse hueso; ver PLATE_RATIO).

Fases (cada una publica progreso):
  1 núcleo    M0 = vol ≥ lower, relleno 3D; el techo (si lo hay) se aplica
              DESPUÉS del relleno, así que un vaso cuyo centro lo supera sigue
              macizo. Antes el techo vaciaba los vasos más llenos.
  2 tubular   V = Frangi(1) máximo entre escalas; Mv = M0 ∧ V ≥ p60(V | M0).
  3 semillas  componentes de M0 ∧ V ≥ p90 con ≥ 50 mm³: los troncos gruesos.
  4 crecer    lo conectado a una semilla dentro de M0 ∧ V ≥ p40 (histéresis).
  5 recuperar M0 a ≤ 3 mm del tubo y conectado a él (pared que la puerta
              adelgazó, y los sacos, que no son tubos); más allá de la banda
              de pared (WALL_MM) se veta lo que es lámina.
  6 cerrar    cierre de 1 vóxel y relleno final.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy import ndimage

from services.vesselness import objectness_max

# Veto de lámina: un vóxel es lámina cuando su laminaridad supera 300 veces su
# tubularidad. Por qué no «laminaridad > tubularidad» a secas: en 3DRA el borde
# de todo objeto brillante puntúa como lámina, y el saco también (el 87 % de
# los vóxeles de la lesión de Case 3). Medido en Case 3 (lesión en x,y,z =
# 62,1 63,7 62,9 mm, vóxeles de M0 a ≤ 3 mm), veto sin banda de pared:
#   sin veto  99,2 % conservado · ratio 1   64 % · ratio 30  85 %
#   ratio 300 94,3 % · ratio 900 95,7 %
# Una lámina plana tiene la segunda curvatura nula y su tubularidad cae a ~0
# (en el fantasma de la lámina en contacto, laminaridad 1 913 frente a
# tubularidad 1,97 un vóxel dentro del borde, ratio 970), así que el ratio alto
# la sigue vetando; 300 deja margen frente a ese 970.
PLATE_RATIO = 300.0
# Grosor de pared que se recupera siempre, sin veto (mm). Ver fase 5.
# Medido en Case 3 con PLATE_RATIO = 300 (lesión a ≤ 3 mm / recuperados / vetados):
#   0,5 mm  95,7 % / 47 404 / 6 600 · 0,75 mm 96,6 % / 50 373 / 4 459
#   1,0 mm  97,6 % / 51 822 / 3 161, pero con 1 mm vuelve demasiada lámina en
#   el test de la lámina en contacto (15,6 % > 15 %): el borde de una lámina es
#   una arista, puntúa como tubo y crece, y la banda se traería 1 mm a su lado.
WALL_MM = 0.75


@dataclass
class MaskParams:
    lower: float
    upper: float = 0.0            # 0 = sin techo
    gate_pctl: float = 60.0
    seed_pctl: float = 90.0
    grow_pctl: float = 40.0
    seed_min_mm3: float = 50.0
    reclaim_mm: float = 3.0
    plate_veto: bool = True
    closing_iter: int = 1


@dataclass
class MaskResult:
    mask: np.ndarray              # bool (z, y, x)
    stats: dict = field(default_factory=dict)
    fallback: bool = False        # True cuando no hubo semillas y se devolvió el umbral


def _say(on_progress: Callable[[str, float], None] | None, phase: str, pct: float) -> None:
    if on_progress:
        on_progress(phase, pct)


def _fallback(m0: np.ndarray, stats: dict) -> MaskResult:
    """Sin troncos que sembrar devolvemos el umbral relleno y lo decimos.

    Mejor una máscara con hueso que una vacía: quien llama ve `fallback` y
    puede avisar de que la limpieza por tubularidad no se aplicó. Las stats
    llevan todas las claves para que el cliente no tenga casos especiales.
    """
    n = int(m0.sum())
    stats.update(seeds=0, grow_components=0, kept_components=0, tube_vox=0, reclaimed_vox=0,
                 vetoed_vox=0, final_vox=n, kept_fraction=1.0 if n else 0.0)
    stats.setdefault("core_vox", 0)
    stats.setdefault("thresholds", {"gate": 0.0, "seed": 0.0, "grow": 0.0})
    return MaskResult(m0, stats, fallback=True)


def _pick(labels: np.ndarray, n: int, ids: np.ndarray) -> np.ndarray:
    """Máscara de las etiquetas `ids` por tabla de consulta.

    Por qué no np.isin: sobre 384³ etiquetas int32 hace copias int64 y ordena;
    la tabla sólo cuesta la máscara de salida (medido: parte del pico de 3 GB).
    """
    lut = np.zeros(int(n) + 1, dtype=bool)
    lut[np.asarray(ids, dtype=np.intp)] = True
    lut[0] = False
    return lut[labels]


def _near_tube(tube: np.ndarray, m0: np.ndarray, spacing: tuple[float, float, float],
               reach_mm: float, wall_mm: float, slab: int = 64) -> tuple[np.ndarray, np.ndarray]:
    """(cerca, banda): M0 fuera del tubo a ≤ reach_mm, y la parte a > wall_mm.

    Por lonchas en z: distance_transform_edt entero sobre 384³ reserva la
    transformada de rasgos (3 × int32) y la distancia en float64, ≈ 1,1 GB más
    temporales (medido: pico de 3 GB en esta fase). Como sólo importa si la
    distancia es ≤ reach_mm, basta con que cada loncha vea reach_mm de margen:
    el tubo más cercano de un vóxel que está a ≤ reach_mm cae dentro, así que
    esa distancia sale exacta; la de uno más lejano puede salir mayor que la
    real, pero sigue siendo > reach_mm y se descarta igual.
    """
    nz = tube.shape[0]
    near = np.zeros_like(tube)
    band = np.zeros_like(tube)
    margin = int(np.ceil(reach_mm / float(spacing[0]))) + 1
    for z0 in range(0, nz, slab):
        z1 = min(nz, z0 + slab)
        a, b = max(0, z0 - margin), min(nz, z1 + margin)
        t = tube[a:b]
        if not t.any():
            continue
        d = ndimage.distance_transform_edt(~t, sampling=spacing)[z0 - a:z1 - a]
        cand = m0[z0:z1] & ~tube[z0:z1] & (d <= reach_mm)
        near[z0:z1] = cand
        band[z0:z1] = cand & (d > wall_mm)
        del d, cand
    return near, band


def build_vascular_mask(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    params: MaskParams,
    *,
    vesselness: np.ndarray | None = None,
    plateness: np.ndarray | None = None,
    on_progress: Callable[[str, float], None] | None = None,
) -> MaskResult:
    """Máscara vascular de `volume` (z, y, x) con `spacing` (sz, sy, sx) en mm.

    `vesselness`/`plateness` permiten reutilizar un Frangi ya calculado; si
    faltan se calculan aquí por lonchas. `on_progress(fase, porcentaje)`.
    """
    volume = np.asarray(volume)
    vox_mm3 = float(np.prod(spacing))
    stats: dict = {}

    # 1 · núcleo relleno, techo después.
    # Por qué el techo va tras el relleno: en 3DRA el centro de los vasos más
    # contrastados supera el techo. Recortar el techo y volver a rellenar no
    # basta: un vaso que sale por el borde del volumen es un tubo abierto por
    # los extremos, y binary_fill_holes no cierra un tubo abierto (medido: el
    # test del núcleo sale hueco así). Por eso el techo sólo quita las zonas
    # por encima de él que asoman al exterior de M0 —la superficie brillante
    # del hueso— y respeta las que quedan envueltas por pared dentro de rango.
    _say(on_progress, "núcleo", 2)
    m0 = ndimage.binary_fill_holes(volume >= params.lower)
    if params.upper > params.lower:
        hot = m0 & (volume > params.upper)
        lab_h, n_h = ndimage.label(hot)
        del hot
        # border_value=0: el borde del volumen no cuenta como exterior, así el
        # centro de un vaso cortado por el borde no se toma por superficie.
        rim = ndimage.binary_dilation(~m0) & m0
        exposed = np.unique(lab_h[rim])
        del rim
        m0 &= ~_pick(lab_h, n_h, exposed)
        del lab_h
        m0 = ndimage.binary_fill_holes(m0)
    stats["m0_vox"] = int(m0.sum())
    if stats["m0_vox"] == 0:
        return _fallback(m0, stats)

    # 2 · tubularidad y puerta.
    # Los percentiles se toman de V dentro de M0, no del volumen entero: así se
    # adaptan al estudio (γ, contraste, resolución) sin constantes absolutas.
    if vesselness is None:
        vesselness = objectness_max(
            volume, spacing, dimension=1,
            on_progress=lambda i, n: _say(on_progress, f"tubularidad {i}/{n}", 5 + 40 * i / n))
    vin = vesselness[m0]
    t_gate = float(np.percentile(vin, params.gate_pctl))
    t_seed = float(np.percentile(vin, params.seed_pctl))
    t_grow = float(np.percentile(vin, params.grow_pctl))
    del vin
    stats["thresholds"] = {"gate": t_gate, "seed": t_seed, "grow": t_grow}
    # Por qué la puerta va antes que las semillas: la puerta (p60) separa lo
    # tubular de M0 y es la cifra que se publica como núcleo; las semillas son
    # un subconjunto más estricto de ella (p90 ⊂ p60), de modo que sólo los
    # troncos siembran y no un trozo de hueso con algo de curvatura.
    stats["core_vox"] = int(np.count_nonzero(m0 & (vesselness >= t_gate)))

    # 3 · semillas: los troncos.
    # Un volumen mínimo en mm³ (no en vóxeles) hace el criterio independiente
    # de la resolución: 50 mm³ es un segmento de carótida o basilar, nunca ruido.
    _say(on_progress, "semillas", 50)
    lab_s, n_s = ndimage.label(m0 & (vesselness >= t_seed))
    # Sólo los vóxeles etiquetados (el 10 % de M0): bincount sobre el volumen
    # entero lo copiaría a int64.
    ids, counts = np.unique(lab_s[lab_s > 0], return_counts=True)
    big = ids[counts * vox_mm3 >= params.seed_min_mm3]
    if len(big) == 0:
        del lab_s
        return _fallback(m0, stats)
    stats["seeds"] = int(len(big))
    seed_mask = _pick(lab_s, n_s, big)
    del lab_s, ids, counts

    # 4 · crecer por histéresis.
    # Umbral bajo (p40) para seguir las ramas finas, pero sólo las conectadas a
    # un tronco: una lámina o un grumo aislado puede tener tubularidad media y
    # aun así no tocar ninguna semilla, así que se queda fuera.
    _say(on_progress, "crecimiento", 58)
    lab_g, n_g = ndimage.label(m0 & (vesselness >= t_grow))
    keep = np.unique(lab_g[seed_mask])
    keep = keep[keep > 0]
    tube = _pick(lab_g, n_g, keep)
    stats["grow_components"], stats["kept_components"] = int(n_g), int(len(keep))
    stats["tube_vox"] = int(np.count_nonzero(tube))
    del lab_g, seed_mask

    # 5 · recuperar pared y sacos, vetando láminas.
    # Por qué recuperar: Frangi puntúa alto en el eje y bajo en el borde, así que
    # la puerta adelgaza los vasos; y un aneurisma es una bola, no un tubo, así
    # que su tubularidad es baja. Se devuelve lo de M0 a ≤ reclaim_mm del tubo,
    # pero sólo lo conectado a él (el hueso cercano pero separado no entra).
    # Por qué vetar láminas: el peñasco a menudo toca la carótida; sin veto la
    # recuperación se traería de vuelta hasta 3 mm de lámina pegada al vaso.
    reclaimed = np.zeros_like(tube)
    vetoed = 0
    if params.reclaim_mm > 0:
        _say(on_progress, "recuperación", 66)
        # La banda de pared (≤ WALL_MM) no se veta: la pared de un vaso es,
        # localmente, una lámina curva, y el veto se la comía (medido: el tubo
        # del test del núcleo perdía su anillo exterior entero, 768 vóxeles).
        # Fuera de esa banda es donde viven los sacos y el hueso pegado.
        near, band = _near_tube(tube, m0, spacing, params.reclaim_mm,
                                min(WALL_MM, params.reclaim_mm))
        if params.plate_veto and band.any():
            if plateness is None:
                plateness = objectness_max(
                    volume, spacing, dimension=2,
                    on_progress=lambda i, n: _say(on_progress, f"laminaridad {i}/{n}", 66 + 20 * i / n))
            # Es lámina lo que puntúa órdenes de magnitud más como lámina que
            # como tubo (ver PLATE_RATIO): la pared curva de un saco conserva
            # algo de tubularidad y pasa; una lámina plana no. Se evalúa sólo
            # en la banda para no crear otro volumen float32 entero.
            where = np.nonzero(band)
            is_plate = plateness[where] > PLATE_RATIO * vesselness[where]
            vetoed = int(np.count_nonzero(is_plate))
            near[tuple(w[is_plate] for w in where)] = False
            del where, is_plate
        del band
        lab_r, n_r = ndimage.label(near | tube)
        keep = np.unique(lab_r[tube])
        keep = keep[keep > 0]
        reclaimed = _pick(lab_r, n_r, keep) & ~tube
        del lab_r, near
    stats["reclaimed_vox"], stats["vetoed_vox"] = int(reclaimed.sum()), vetoed

    # 6 · cerrar y rellenar: tapa las muescas de un vóxel que dejan la puerta y
    # el veto en la pared, y los huecos interiores que queden.
    _say(on_progress, "cierre", 90)
    final = tube | reclaimed
    del tube, reclaimed
    if params.closing_iter > 0:
        final |= ndimage.binary_closing(final, iterations=params.closing_iter)
    final = ndimage.binary_fill_holes(final)
    stats["final_vox"] = int(final.sum())
    stats["kept_fraction"] = float(stats["final_vox"] / max(1, stats["m0_vox"]))
    _say(on_progress, "hecho", 100)
    return MaskResult(final, stats, fallback=False)
