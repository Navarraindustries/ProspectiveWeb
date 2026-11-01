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
  2 tubular   V = Frangi(1) máximo entre escalas; se MIDE core_vox =
              |M0 ∧ V ≥ p60(V | M0)| (la puerta no filtra: es la cifra de núcleo).
  3 semillas  componentes de M0 ∧ V ≥ p90 con ≥ 50 mm³: los troncos gruesos.
  4 crecer    lo conectado a una semilla dentro de M0 ∧ V ≥ p40 (histéresis).
  5 recuperar M0 a ≤ 3 mm del tubo y conectado a él (pared que el
              crecimiento adelgazó, y los sacos, que no son tubos); más allá de la banda
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
# Cortes por loncha de Frangi. Se fija aquí (y no se deja al valor por defecto
# de objectness_max) porque la fase se anuncia como «tubularidad 0/n» ANTES de
# calcular la primera loncha: objectness_max sólo avisa al terminar cada una, y
# sin ese aviso inicial la interfaz seguiría diciendo «núcleo» durante toda la
# primera loncha (en un volumen de una sola loncha, durante toda la fase).
FRANGI_SLAB = 64


@dataclass
class MaskParams:
    lower: float
    upper: float = 0.0            # 0 = sin techo
    #: Máscara de hueso (TC): los componentes de `volume > bone_hu` de al menos
    #: `bone_min_mm3`, dilatados `bone_margin_mm`, se quitan de M0 antes de
    #: todo. 0 = apagado (XA/3DRA: no hay hueso). Por qué no basta el techo:
    #: el techo se aplica tras rellenar y solo quita lo caliente que asoma al
    #: exterior; el hueso cortical queda envuelto por su propia cáscara de
    #: volumen parcial (150–700 HU) y se conserva como si fuera el centro de
    #: un vaso. Medido en Zenodo 027 (angio-TC a resolución nativa): techo 700
    #: deja 200 cm³ de máscara con la cabeza en bloque y 4 de 5 candidatos en
    #: hueso; esta máscara con 1,5 mm deja 20,7 cm³, un árbol de 16 cm³, los
    #: tres canales encendidos y la lesión 2.ª. El mínimo de 500 mm³ deja en
    #: paz las calcificaciones de la pared de un saco (decenas de mm³).
    bone_hu: float = 0.0
    bone_min_mm3: float = 500.0
    bone_margin_mm: float = 1.5
    #: Solo cuenta como hueso lo que tiene núcleo: el componente caliente se
    #: erosiona `bone_erode_mm` y se recupera dilatando lo que queda. Una
    #: cáscara calcificada de 1 mm alrededor de un saco trombosado desaparece
    #: al erosionar y se conserva (Zenodo 096: la pared calcificada de un
    #: saco de 21 mm estaba pegada al cráneo y la máscara sin erosión se la
    #: llevaba entera, recall 0). Pero el cráneo fino también se queda sin
    #: núcleo y vuelve a la máscara (027 nativo con 1 mm: 25 → 101 cm³), así
    #: que en producción va a 0 (`routers.segment.CT_BONE_ERODE_MM`).
    bone_erode_mm: float = 0.0
    #: Percentil de la puerta tubular. Solo MIDE (`stats.core_vox`,
    #: `thresholds.gate`): no filtra la máscara, así que moverlo no la cambia.
    gate_pctl: float = 60.0
    seed_pctl: float = 90.0
    grow_pctl: float = 40.0
    seed_min_mm3: float = 50.0
    reclaim_mm: float = 3.0
    plate_veto: bool = True
    closing_iter: int = 1
    #: Fase 7, sacos: bolas de M0 que quedaron fuera de la máscara. La
    #: recuperación (fase 5) devuelve lo que está a ≤ reclaim_mm del tubo Y
    #: conectado a él por M0; un saco grande con cuello estrecho, trombo
    #: parcial o volumen parcial en el cuello no cumple ninguna de las dos
    #: (Zenodo 026: un saco de 50 mm, macizo, 11 cm³, a 3,1 mm de la máscara,
    #: recall 0,02). Aquí se abre el resto (M0 fuera de la máscara) `sac_open_mm`
    #: por eje, que quita láminas, pared fina y ramas finas; cada núcleo que
    #: sobrevive con diámetro equivalente ≥ `sac_min_d_mm` se reconstruye
    #: dentro del resto y se acepta si queda a ≤ `sac_reach_mm` de la máscara y
    #: menos de `sac_plate_max` de sus vóxeles puntúan como lámina (PLATE_RATIO).
    #: Medido a resolución nativa (2026-10-23, scratchpad diag_blob.py): 026
    #: 2 → 49 % de los puntos del saco, 024 (20 mm, trombo) 4 → 35 %, 093 y 121
    #: sin cambio (cáscaras parciales que no sobreviven a la apertura); en los
    #: controles 001, 003 y 045 no admite ninguna bola (0 cm³). `sac_min_d_mm`
    #: o `sac_reach_mm` a 0 apagan la fase.
    sac_open_mm: float = 1.5
    sac_min_d_mm: float = 5.0
    sac_reach_mm: float = 5.0
    sac_plate_max: float = 0.5


@dataclass
class MaskResult:
    mask: np.ndarray              # bool (z, y, x)
    stats: dict = field(default_factory=dict)
    fallback: bool = False        # True cuando no hubo semillas y se devolvió el umbral


def _say(on_progress: Callable[[str, float], None] | None, phase: str, pct: float) -> None:
    if on_progress:
        on_progress(phase, pct)


def _fallback(m0: np.ndarray, stats: dict,
              on_progress: Callable[[str, float], None] | None = None) -> MaskResult:
    """Sin troncos que sembrar devolvemos el umbral relleno y lo decimos.

    Mejor una máscara con hueso que una vacía: quien llama ve `fallback` y
    puede avisar de que la limpieza por tubularidad no se aplicó. Las stats
    llevan todas las claves para que el cliente no tenga casos especiales.
    """
    n = int(m0.sum())
    stats.update(seeds=0, grow_components=0, kept_components=0, tube_vox=0, reclaimed_vox=0,
                 vetoed_vox=0, sac_blobs=0, sac_vox=0, final_vox=n, kept_fraction=1.0 if n else 0.0)
    stats.setdefault("core_vox", 0)
    stats.setdefault("thresholds", {"gate": 0.0, "seed": 0.0, "grow": 0.0})
    # También aquí se cierra el progreso: si no, la barra se queda en 2 o 50 %.
    _say(on_progress, "hecho", 100)
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


def bone_mask(volume: np.ndarray, spacing: tuple[float, float, float],
              bone_hu: float, min_mm3: float, margin_mm: float,
              erode_mm: float = 0.0) -> np.ndarray:
    """El hueso de una TC: componentes > `bone_hu` de ≥ `min_mm3`, dilatados `margin_mm`.

    El mínimo de volumen separa el cráneo (cientos de cm³) de las
    calcificaciones de una pared vascular (decenas de mm³), que se quedan. La
    dilatación cubre la cáscara de volumen parcial (150–700 HU) que rodea al
    cortical y que el umbral inferior tomaría por vaso.

    Con `erode_mm` > 0 solo cuenta lo que tiene núcleo: se erosiona el
    componente y se recupera dilatando lo que queda otros `erode_mm` (más el
    margen). Una cáscara calcificada más fina que 2·erode_mm desaparece al
    erosionar y no vuelve, aunque esté pegada al cráneo.
    """
    hot = volume > bone_hu
    lab, n = ndimage.label(hot)
    del hot
    if n == 0:
        return np.zeros(volume.shape, dtype=bool)
    vox_mm3 = float(np.prod(spacing))
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    big = ids[counts * vox_mm3 >= min_mm3]
    if len(big) == 0:
        return np.zeros(volume.shape, dtype=bool)
    bone = _pick(lab, n, big)
    del lab
    vox = float(min(spacing))
    # Al vóxel más cercano, no por exceso: a resolución reducida (2–3 mm de
    # vóxel) un vóxel de erosión se llevaría el cráneo entero como «sin
    # núcleo»; ahí no se erosiona, y la pasada nativa (services.band_refine)
    # rehace la máscara de hueso con la erosión exacta.
    it_e = int(round(erode_mm / vox)) if erode_mm > 0 else 0
    if it_e > 0:
        bone = ndimage.binary_erosion(bone, iterations=it_e)
        if not bone.any():
            return bone
    # Margen POR EJE y al vóxel más cercano, no por exceso en todos los ejes a
    # la vez: en Zenodo 019 (factor 3, vóxel 0,9 × 1,4 × 1,4 mm) el margen de
    # 1,5 mm salía a 2 vóxeles en todo = 2,8 mm en plano, y cortaba las
    # carótidas donde pasan pegadas al hueso: el árbol se quedaba en 0,2 cm³.
    return _dilate_mm(bone, spacing, margin_mm + erode_mm)


def _dilate_mm(mask: np.ndarray, spacing: tuple[float, float, float], mm: float) -> np.ndarray:
    """Dilatación de `mm` (caja, por ejes), con el radio de cada eje redondeado a su vóxel (mínimo 1)."""
    out = mask
    for axis, sp in enumerate(spacing):
        r = max(1, int(round(mm / float(sp))))
        shape = [1, 1, 1]
        shape[axis] = 3
        out = ndimage.binary_dilation(out, structure=np.ones(shape, dtype=bool), iterations=r)
    return out


def _erode_mm(mask: np.ndarray, spacing: tuple[float, float, float], mm: float) -> np.ndarray:
    """Erosión de `mm` (caja, por ejes), la inversa de `_dilate_mm`."""
    out = mask
    for axis, sp in enumerate(spacing):
        r = max(1, int(round(mm / float(sp))))
        shape = [1, 1, 1]
        shape[axis] = 3
        out = ndimage.binary_erosion(out, structure=np.ones(shape, dtype=bool), iterations=r)
    return out


def _sac_blobs(m0: np.ndarray, final: np.ndarray, volume: np.ndarray,
               spacing: tuple[float, float, float], vesselness: np.ndarray,
               plateness: np.ndarray | None, params: MaskParams, stats: dict,
               within: np.ndarray | None = None) -> np.ndarray:
    """Bolas del resto (M0 fuera de `final`) que se pegan a la máscara. Ver MaskParams.

    Todo se evalúa en la caja de cada bola (más `open + reach` de margen), no en
    el volumen entero: la transformada de distancia completa costaba 1 GB en
    `_near_tube` y aquí sólo importa la distancia desde la bola. Con `within`
    sólo cuentan los núcleos que tocan esa máscara (las semillas externas).
    """
    added = np.zeros_like(final)
    stats["sac_blobs"] = 0
    rest = m0 & ~final
    if not rest.any():
        return added
    core = _erode_mm(rest, spacing, params.sac_open_mm)
    lab, n = ndimage.label(core)
    del core
    if n == 0:
        return added
    vox_mm3 = float(np.prod(spacing))
    min_vox = (np.pi / 6.0 * params.sac_min_d_mm ** 3) / vox_mm3
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    big = ids[counts >= min_vox]
    if within is not None and len(big):
        seeded = np.unique(lab[within])
        big = big[np.isin(big, seeded[seeded > 0])]
    if len(big) == 0:
        return added
    objs = ndimage.find_objects(lab)
    margin = [int(np.ceil((params.sac_open_mm + params.sac_reach_mm) / float(sp))) + 1 for sp in spacing]
    for cid in big:
        sl = tuple(slice(max(0, s.start - m), min(dim, s.stop + m))
                   for s, m, dim in zip(objs[cid - 1], margin, lab.shape))
        seedb = lab[sl] == cid
        # reconstruir la bola dentro del resto, sólo lo conectado al propio núcleo
        blob = _dilate_mm(seedb, spacing, params.sac_open_mm) & rest[sl]
        lb, nb = ndimage.label(blob)
        keep = np.unique(lb[seedb])
        keep = keep[keep > 0]
        blob = _pick(lb, nb, keep)
        del lb, seedb
        f = final[sl]
        if not f.any():
            continue
        dist = ndimage.distance_transform_edt(~f, sampling=spacing)
        if float(dist[blob].min()) > params.sac_reach_mm:
            continue
        del dist
        if params.plate_veto and params.sac_plate_max < 1.0:
            where = np.nonzero(blob)
            p = plateness[sl] if plateness is not None else objectness_max(
                np.ascontiguousarray(volume[sl], dtype=np.float32), spacing, dimension=2, slab=FRANGI_SLAB)
            plate = float(np.mean(p[where] > PLATE_RATIO * vesselness[sl][where]))
            del where, p
            if plate >= params.sac_plate_max:
                continue
        added[sl] |= blob
        stats["sac_blobs"] += 1
    del lab, rest
    return added


def _near_tube(tube: np.ndarray, m0: np.ndarray, spacing: tuple[float, float, float],
               reach_mm: float, wall_mm: float, slab: int = 32) -> tuple[np.ndarray, np.ndarray]:
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
    seed_mask: np.ndarray | None = None,
    within: np.ndarray | None = None,
    on_progress: Callable[[str, float], None] | None = None,
) -> MaskResult:
    """Máscara vascular de `volume` (z, y, x) con `spacing` (sz, sy, sx) en mm.

    `vesselness`/`plateness` permiten reutilizar un Frangi ya calculado; si
    faltan se calculan aquí por lonchas. `on_progress(fase, porcentaje)`.

    `within`, si se da (bool, la forma del volumen), restringe M0 a lo que está
    dentro, tras calcular los percentiles de tubularidad sobre todo M0: lo de
    fuera no es semilla, ni crece, ni se recupera, ni es saco. Lo usa la
    envolvente de la cabeza (`services.head_mask`): el soporte del escáner
    queda fuera sin tocar los HU ni los umbrales de la receta.

    `seed_mask`, si se da, sustituye a las semillas por percentil (fase 3):
    las semillas son `seed_mask ∧ M0`, y si no queda ninguna la máscara vuelve
    VACÍA (no el umbral relleno de `_fallback`: quien siembra desde fuera ya
    sabe dónde está el árbol, y una baldosa sin árbol no debe traer nada). Lo
    usa `services.band_refine`: el tubo hallado a resolución reducida siembra
    el crecimiento a resolución nativa, baldosa a baldosa.
    """
    volume = np.asarray(volume)
    # Un Frangi de caché con otra forma fallaría muy adentro con un error de
    # índices opaco, o indexaría mal en silencio si difunde; mejor aquí.
    for name, arr in (("tubularidad", vesselness), ("laminaridad", plateness)):
        if arr is not None and np.shape(arr) != volume.shape:
            raise ValueError(f"La {name} precalculada tiene forma {np.shape(arr)} "
                             f"y el volumen {volume.shape}")
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
    #
    # Por qué por corte y no por componente 3D: el centro brillante de un vaso
    # es un solo componente a lo largo de todo el vaso; si un hueso por encima
    # del techo lo toca en un punto y asoma fuera, el componente entero cuenta
    # como expuesto y el vaso sale hueco de punta a punta (el test del hueso
    # que toca el núcleo). Decidido en cada corte z, sólo se pierde el centro
    # en los cortes donde el hueso lo toca; ahí el hueco queda sellado por los
    # cortes vecinos y el relleno final de la fase 6 lo cierra.
    #
    # Sin segundo relleno tras quitar: lo quitado en un corte toca el exterior
    # de M0 en ese mismo corte (y ~M0 ya es todo exterior tras el primer
    # relleno), así que no puede dejar un hueco cerrado que rellenar.
    _say(on_progress, "núcleo", 2)
    above = volume >= params.lower
    stats["bone_vox"] = 0
    if params.bone_hu > 0:
        bone = bone_mask(volume, spacing, params.bone_hu, params.bone_min_mm3, params.bone_margin_mm,
                         params.bone_erode_mm)
        stats["bone_vox"] = int(np.count_nonzero(bone & above))
        above &= ~bone
        del bone
    m0 = ndimage.binary_fill_holes(above)
    del above
    if within is not None and np.shape(within) != m0.shape:
        raise ValueError(f"`within` tiene forma {np.shape(within)} y el volumen {m0.shape}")
    if params.upper > params.lower:
        cross = ndimage.generate_binary_structure(2, 1)
        for z in range(m0.shape[0]):
            hot = m0[z] & (volume[z] > params.upper)
            if not hot.any():
                continue
            lab_h, n_h = ndimage.label(hot, structure=cross)
            # border_value=0: el borde del volumen no cuenta como exterior, así
            # el centro de un vaso cortado por el borde no se toma por superficie.
            rim = ndimage.binary_dilation(~m0[z], structure=cross) & m0[z]
            m0[z] &= ~_pick(lab_h, n_h, np.unique(lab_h[rim]))
    stats["m0_vox"] = int(m0.sum())
    if stats["m0_vox"] == 0:
        return _fallback(m0, stats, on_progress)

    # 2 · tubularidad y puerta.
    # Los percentiles se toman de V dentro de M0, no del volumen entero: así se
    # adaptan al estudio (γ, contraste, resolución) sin constantes absolutas.
    if vesselness is None:
        n_slabs = len(range(0, volume.shape[0], FRANGI_SLAB))
        _say(on_progress, f"tubularidad 0/{n_slabs}", 5)
        vesselness = objectness_max(
            volume, spacing, dimension=1, slab=FRANGI_SLAB,
            on_progress=lambda i, n: _say(on_progress, f"tubularidad {i}/{n}", 5 + 40 * i / n))
    vin = vesselness[m0]
    t_gate = float(np.percentile(vin, params.gate_pctl))
    t_seed = float(np.percentile(vin, params.seed_pctl))
    t_grow = float(np.percentile(vin, params.grow_pctl))
    del vin
    stats["thresholds"] = {"gate": t_gate, "seed": t_seed, "grow": t_grow}
    if within is not None:
        # DESPUÉS de los percentiles, a propósito: se toman de todo M0, como
        # siempre, y solo entonces se descarta lo de fuera. Restringir antes
        # cambia la población de la que salen (en Zenodo 004 el soporte era 112
        # de los 146 cm³ de M0, con tubularidad baja; sin él p90 y p40 suben y
        # las semillas pasan de 52 a 4, la máscara de 146 a 3 cm³). Así la
        # receta es la de siempre menos lo que no está dentro de la cabeza.
        stats["outside_vox"] = int(np.count_nonzero(m0 & ~within))
        m0 &= within
    # La puerta (p60) sólo mide: cuánto de M0 es claramente tubular, la cifra
    # que se publica como núcleo. No filtra nada; semillas (p90) y crecimiento
    # (p40) umbralizan V por su cuenta dentro de M0.
    stats["core_vox"] = int(np.count_nonzero(m0 & (vesselness >= t_gate)))

    # 3 · semillas: los troncos.
    # Un volumen mínimo en mm³ (no en vóxeles) hace el criterio independiente
    # de la resolución: 50 mm³ es un segmento de carótida o basilar, nunca ruido.
    _say(on_progress, "semillas", 50)
    # Con semillas externas (las baldosas nativas de la banda) la fase 7 sólo
    # mira las bolas que esas semillas tocan: la pasada gruesa ya decidió qué
    # sacos entran, y mirar todo el resto de cada baldosa (vasos que en esa
    # baldosa no tienen semilla) costaba 12 s por baldosa sin cambiar la máscara
    # (Zenodo 010: 41 baldosas, 286 → 802 s, mismos vóxeles).
    sac_within = None
    if seed_mask is not None:
        if np.shape(seed_mask) != volume.shape:
            raise ValueError(f"seed_mask tiene forma {np.shape(seed_mask)} y el volumen {volume.shape}")
        seed_mask = np.asarray(seed_mask, dtype=bool) & m0
        sac_within = seed_mask
        n_seed_vox = int(np.count_nonzero(seed_mask))
        if n_seed_vox == 0:
            stats.update(seeds=0, seed_vox=0, grow_components=0, kept_components=0, tube_vox=0,
                         reclaimed_vox=0, vetoed_vox=0, sac_blobs=0, sac_vox=0, final_vox=0,
                         kept_fraction=0.0)
            _say(on_progress, "hecho", 100)
            return MaskResult(np.zeros_like(m0), stats, fallback=False)
        stats["seeds"] = 1
        stats["seed_vox"] = n_seed_vox
    else:
        lab_s, n_s = ndimage.label(m0 & (vesselness >= t_seed))
        # Sólo los vóxeles etiquetados (el 10 % de M0): bincount sobre el volumen
        # entero lo copiaría a int64.
        ids, counts = np.unique(lab_s[lab_s > 0], return_counts=True)
        big = ids[counts * vox_mm3 >= params.seed_min_mm3]
        if len(big) == 0:
            del lab_s
            return _fallback(m0, stats, on_progress)
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
                n_slabs = len(range(0, volume.shape[0], FRANGI_SLAB))
                _say(on_progress, f"laminaridad 0/{n_slabs}", 66)
                plateness = objectness_max(
                    volume, spacing, dimension=2, slab=FRANGI_SLAB,
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

    # 7 · sacos: bolas de M0 que la recuperación no alcanza (ver MaskParams.sac_*).
    stats["sac_blobs"], stats["sac_vox"] = 0, 0
    if params.sac_min_d_mm > 0 and params.sac_reach_mm > 0:
        _say(on_progress, "sacos", 94)
        sacs = _sac_blobs(m0, final, volume, spacing, vesselness, plateness, params, stats,
                          within=sac_within)
        stats["sac_vox"] = int(sacs.sum())
        if stats["sac_vox"]:
            final = ndimage.binary_fill_holes(final | sacs)
        del sacs
    stats["final_vox"] = int(final.sum())
    stats["kept_fraction"] = float(stats["final_vox"] / max(1, stats["m0_vox"]))
    _say(on_progress, "hecho", 100)
    return MaskResult(final, stats, fallback=False)
