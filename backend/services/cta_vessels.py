"""Vasos de una angio-TC: el árbol entero, limpio, sin cráneo ni cuero cabelludo.

Por qué existe (14–15-11-2026, medido en Zenodo con volúmenes nativos): la receta
tubular de 3DRA aplicada a la angio-TC daba mallas con ruido, hueso de la base del
cráneo y vasos cortados. Las causas, una por una:

  · Umbral fijo de 150 HU: por volumen parcial las ramas distales bajan de 150 en
    algún tramo y quedan sueltas (050: 574 piezas, la mayor de 11 cm³; con 100 HU,
    una sola pieza de 37 cm³ con el árbol entero). El cerebro está a 36–48 ± 15–18 HU,
    así que 100 HU sigue siendo su media más tres desviaciones.
  · Semillas y crecimiento por percentiles de tubularidad: en angio-TC las semillas
    caían en la base del cráneo y el crecimiento perdía las ramas (6 de 1 794 piezas).
  · Tabiques de los senos paranasales y de la mastoides (150–700 HU) que la máscara
    de hueso (> 700) no ve.
  · El cuero cabelludo, la cara y el cuello: arterias de la carótida externa y tejido
    que no sirven para planificar un aneurisma.

La receta (solo TC; la 3DRA sigue por `services.vascular_mask`):

  1. hueso denso = componentes > `bone_hu` de ≥ `bone_min_mm3`; fuera con un margen
     pequeño (`bone_margin_mm`). Cerca del hueso (≤ `near_bone_mm`) la máscara se abre
     con una bola de `open_mm`: se van las láminas de volumen parcial y los tabiques,
     y los vasos gruesos (la carótida en el peñasco) sobreviven. El margen fijo de
     1,5 mm de antes se comía la luz de la carótida en el canal petroso.
  2. lo que está a ≤ `air_mm` de aire (< `air_hu`) no es vaso: ninguna arteria
     intracraneal toca aire; así caen los senos paranasales y la mastoides.
  3. cavidad intracraneal (`intracranial_cavity`): solo cuenta lo que está dentro (o a
     ≤ `cavity_margin_mm`), más un corredor en la base del cráneo para los tubos
     gruesos (carótidas y vertebrales) que entran desde el cuello.
  4. histéresis de HU: la máscara es lo que supera el umbral débil (`weak_hu`,
     adaptativo: media del parénquima + 3σ) y está conectado (6-conectividad, la de
     la malla) a algo que supera el fuerte (`strong_hu`, el umbral de la interfaz).
  5. piezas de menos de `min_piece_cm3` fuera, y las piezas sueltas con forma de
     placa pegada al hueso (`_plate_pieces`): restos de la tabla interna o de un
     tabique que la apertura no se llevó entera.

La geometría la corrige `refine_surface` sobre la malla: la topología sale del umbral
débil (para no cortar ramas) y cada vértice baja por su normal hasta el borde a media
altura local entre la luz y el parénquima, con techo `edge_cap_hu`. Así los vasos
gruesos no salen inflados (importa para medir stents y cuellos) y la malla no se
parte: un borde sobre la máscara rompía 130 de 10 piezas a 1 400.

Las venas van incluidas. Separarlas por reglas se probó de seis maneras y en los
estudios en fase venosa siempre acababa metiendo un aneurisma en la capa venosa
(036) o devolviendo el seno sagital a la arterial; queda para una fase siguiente.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


@dataclass
class CtaParams:
    strong_hu: float = 150.0
    #: None = adaptativo: media + 3σ del parénquima, recortado a [weak_min_hu, weak_max_hu].
    weak_hu: float | None = None
    weak_min_hu: float = 90.0
    weak_max_hu: float = 115.0
    bone_hu: float = 700.0
    bone_min_mm3: float = 500.0
    bone_margin_mm: float = 0.5
    near_bone_mm: float = 3.0
    # 0,7 dejaba una lámina de volumen parcial pegada a la tabla interna en casi
    # todos los estudios de Zenodo (130: ~88 cm³ de lámina frente a ~40 de vasos);
    # 1,0 la reduce sin perder lesiones en 7 estudios (016_1: 1,00 → 0,98). 1,2 la
    # limpiaba más pero separaba muchas ramas corticales (16-11-2026).
    open_mm: float = 1.0
    air_hu: float = -400.0
    air_mm: float = 2.5
    cavity_margin_mm: float = 3.0
    corridor_mm: float = 45.0
    corridor_thick_mm: float = 1.2
    min_piece_cm3: float = 0.2
    #: Placas sueltas: una pieza que NO es la mayor se quita si al menos esta
    #: fracción está a ≤ `near_bone_mm` del hueso, es plana (3.ª extensión / 2.ª ≤
    #: `plate_flat`) y ancha en dos ejes (2.ª / 1.ª ≥ `plate_wide`). Un tubo suelto
    #: (carótida, vertebral) es alargado y no cae; la placa frontal de 002 sí.
    #: plate_bone_frac > 1 la apaga.
    plate_bone_frac: float = 0.3
    plate_flat: float = 0.4
    plate_wide: float = 0.3
    #: Rejilla de las distancias y de la cavidad (mm): las distancias a hueso, aire y
    #: cavidad no necesitan el vóxel nativo y así no cuestan un float por vóxel.
    grid_mm: float = 1.0


@dataclass
class CtaResult:
    mask: np.ndarray
    background_hu: float
    stats: dict = field(default_factory=dict)


def _say(cb, phase: str, pct: float) -> None:
    if cb is not None:
        cb(phase, pct)


def _ball(spacing, r_mm: float) -> np.ndarray:
    rr = [int(np.floor(r_mm / s)) for s in spacing]
    z, y, x = np.ogrid[-rr[0]:rr[0] + 1, -rr[1]:rr[1] + 1, -rr[2]:rr[2] + 1]
    return (z * spacing[0]) ** 2 + (y * spacing[1]) ** 2 + (x * spacing[2]) ** 2 <= r_mm * r_mm + 1e-6


def _factors(spacing, grid_mm: float) -> list[int]:
    return [max(1, int(round(grid_mm / float(s)))) for s in spacing]


def _pool(mask: np.ndarray, f: list[int], how: str = "any") -> np.ndarray:
    """Reduce una máscara bool por bloques f (cualquiera / media ≥ ½)."""
    sh = [int(np.ceil(n / k)) for n, k in zip(mask.shape, f)]
    pad = np.zeros([a * k for a, k in zip(sh, f)], dtype=bool)
    pad[:mask.shape[0], :mask.shape[1], :mask.shape[2]] = mask
    blocks = pad.reshape(sh[0], f[0], sh[1], f[1], sh[2], f[2])
    if how == "any":
        return blocks.any(axis=(1, 3, 5))
    return blocks.mean(axis=(1, 3, 5)) >= 0.5


def _unpool(coarse: np.ndarray, f: list[int], shape) -> np.ndarray:
    up = coarse.repeat(f[0], 0).repeat(f[1], 1).repeat(f[2], 2)
    return up[:shape[0], :shape[1], :shape[2]]


def _near(src: np.ndarray, spacing, mm: float, grid_mm: float) -> np.ndarray:
    """Vóxeles a ≤ `mm` de `src`, con la distancia medida en la rejilla gruesa (bool nativo)."""
    f = _factors(spacing, grid_mm)
    c = _pool(src, f)
    if not c.any():
        return np.zeros(src.shape, dtype=bool)
    d = ndimage.distance_transform_edt(~c, sampling=[s * k for s, k in zip(spacing, f)])
    return _unpool(d <= mm, f, src.shape)


def _coarse_mean(volume: np.ndarray, f: list[int]) -> np.ndarray:
    sh = [n // k for n, k in zip(volume.shape, f)]
    v = volume[:sh[0] * f[0], :sh[1] * f[1], :sh[2] * f[2]]
    out = np.empty(sh, dtype=np.float32)
    # por cortes gruesos: la media de todo el volumen en float32 de una vez duplicaría su tamaño
    for i in range(sh[0]):
        blk = v[i * f[0]:(i + 1) * f[0]].astype(np.float32)
        out[i] = blk.reshape(f[0], sh[1], f[1], sh[2], f[2]).mean(axis=(0, 2, 4))
    return out


def _islas_brillantes(cav: np.ndarray, bright: np.ndarray) -> np.ndarray:
    """Huecos de la cavidad rodeados por ella en algún plano (axial, coronal o
    sagital) y con brillo de contraste.

    En 3D un saco con contraste no es un hueco: la carótida, también por encima
    de `bone_hu`, lo une a la base del cráneo. En un corte casi siempre lo es:
    la carótida sale del plano. El cráneo nunca queda rodeado por la cavidad.
    """
    add = np.zeros_like(cav)
    for ax in range(3):
        for i in range(cav.shape[ax]):
            sl = [slice(None)] * 3
            sl[ax] = i
            sl = tuple(sl)
            c = cav[sl]
            if c.any():
                add[sl] |= ndimage.binary_fill_holes(c) & ~c
    return add & bright


def intracranial_cavity(volume: np.ndarray, spacing, *, bone_hu: float = 300.0,
                        dense_hu: float = 700.0, erode_mm: float = 4.0, grow_mm: float = 6.0,
                        grid_mm: float = 1.0) -> tuple[np.ndarray, dict]:
    """La cavidad intracraneal, en la rejilla de `grid_mm` y devuelta al vóxel nativo.

    1. hueso = media del bloque > `bone_hu` (300: incluye el cráneo flojo, 084/123);
    2. blando = −30…110 HU (cerebro y LCR) fuera del hueso dilatado 1 mm;
    3. erosión `erode_mm` y componente mayor: el cerebro, sin las órbitas ni el cuello
       (los agujeros de la base son más finos que la erosión);
    4. se reconstruye dentro de lo blando y se rellena (vasos, ventrículos);
    5. crece `grow_mm` sin atravesar hueso: llega a la tabla interna con los senos y
       los vasos de superficie, pero no salta el cráneo al cuero cabelludo;
    6. devuelve el contraste que el paso 1 tomó por hueso (`_islas_brillantes`,
       entre `bone_hu` y `dense_hu`): sin esto un saco grande quedaba hueco, solo
       con la corteza de `cavity_margin_mm` (130 de Zenodo, 26 mm: el 29 % del
       saco vacío; 22 de 49 sacos ≥ 10 mm, P3 18-11-2026).
    Funciona con la cabeza inclinada (002): no supone ninguna orientación.
    """
    f = _factors(spacing, grid_mm)
    v = _coarse_mean(volume, f)
    csp = [s * k for s, k in zip(spacing, f)]
    s = float(np.mean(csp))

    def ball(r_mm):
        r = r_mm / s
        n = int(np.ceil(r))
        z, y, x = np.ogrid[-n:n + 1, -n:n + 1, -n:n + 1]
        return z * z + y * y + x * x <= r * r + 1e-6

    bone = v > bone_hu
    soft = (v > -30) & (v < 110) & ~ndimage.binary_dilation(bone, structure=ball(1.0))
    core = ndimage.binary_erosion(soft, structure=ball(erode_mm))
    lab, n = ndimage.label(core)
    if n == 0:
        return np.zeros(volume.shape, dtype=bool), {"applied": False, "cavity_cm3": 0.0, "islands_cm3": 0.0}
    cnt = np.bincount(lab.ravel())
    cnt[0] = 0
    brain = lab == int(np.argmax(cnt))
    del lab, core
    for _ in range(int(round((erode_mm + 2.0) / s))):
        brain = ndimage.binary_dilation(brain) & soft
    brain = ndimage.binary_fill_holes(brain)
    free = ~bone
    cav = brain
    for _ in range(int(round(grow_mm / s))):
        cav = ndimage.binary_dilation(cav) & free
    cav = ndimage.binary_fill_holes(cav)
    islas = _islas_brillantes(cav, bone & (v < dense_hu))
    n_islas = int(islas.sum())
    if n_islas:
        cav = ndimage.binary_fill_holes(cav | islas)
    del islas
    out = np.zeros(volume.shape, dtype=bool)
    up = _unpool(cav, f, (cav.shape[0] * f[0], cav.shape[1] * f[1], cav.shape[2] * f[2]))
    zs, ys, xs = (min(a, b) for a, b in zip(up.shape, volume.shape))
    out[:zs, :ys, :xs] = up[:zs, :ys, :xs]
    vox_cm3 = float(np.prod(spacing)) / 1000.0
    return out, {"applied": True, "cavity_cm3": round(float(out.sum()) * vox_cm3, 1),
                 "islands_cm3": round(n_islas * float(np.prod(csp)) / 1000.0, 2)}


def background_stats(volume: np.ndarray, within: np.ndarray | None, bone: np.ndarray) -> tuple[float, float]:
    """Media y desviación del parénquima (0–80 HU dentro de la cabeza, fuera del hueso)."""
    sel = (volume > 0) & (volume < 80) & ~bone
    if within is not None:
        sel &= within
    vals = volume[sel]
    if vals.size < 1000:
        return 40.0, 15.0
    if vals.size > 5_000_000:
        vals = vals[:: vals.size // 5_000_000 + 1]
    return float(vals.mean()), float(vals.std())


def _plate_pieces(lab: np.ndarray, keep: np.ndarray, cnt: np.ndarray, near_bone: np.ndarray,
                  sp, p: CtaParams) -> list[int]:
    """Etiquetas de las piezas sueltas (no la mayor) con forma de placa pegada al hueso.

    Extensiones por PCA de las coordenadas en mm (4σ por eje, e1 ≥ e2 ≥ e3): placa =
    plana (e3/e2 ≤ `plate_flat`) y ancha (e2/e1 ≥ `plate_wide`), con al menos
    `plate_bone_frac` de sus vóxeles a ≤ `near_bone_mm` del hueso denso.
    """
    if p.plate_bone_frac > 1 or keep.sum() < 2:
        return []
    ids = np.nonzero(keep)[0]
    main = int(ids[np.argmax(cnt[ids])])
    scale = np.asarray(sp, dtype=float)
    out: list[int] = []
    objs = ndimage.find_objects(lab)
    for i in ids:
        if i == main or objs[i - 1] is None:
            continue
        sl = objs[i - 1]
        pm = lab[sl] == i
        if near_bone[sl][pm].mean() < p.plate_bone_frac:
            continue
        xyz = np.argwhere(pm) * scale
        if len(xyz) < 4:
            continue
        ev = np.sort(np.linalg.eigvalsh(np.cov((xyz - xyz.mean(0)).T)))[::-1]
        e = 4.0 * np.sqrt(np.maximum(ev, 1e-12))
        if e[2] / e[1] <= p.plate_flat and e[1] / e[0] >= p.plate_wide:
            out.append(int(i))
    return out


def segment_cta(volume: np.ndarray, spacing, *, within: np.ndarray | None = None,
                params: CtaParams | None = None, extra_bone: np.ndarray | None = None,
                on_progress: Callable[[str, float], None] | None = None) -> CtaResult:
    """Máscara de todos los vasos de una angio-TC (z, y, x) con `spacing` (sz, sy, sx) en mm.

    `extra_bone`: hueso que el umbral de `bone_hu` no ve (el cráneo flojo, cuyas
    tablas no llegan a 700 HU): se trata igual que el hueso denso —fuera, con su
    margen y su apertura alrededor—.
    """
    p = params or CtaParams()
    sp = tuple(float(s) for s in spacing)
    vox_cm3 = float(np.prod(sp)) / 1000.0
    stats: dict = {}

    _say(on_progress, "hueso", 5)
    hot = volume > p.bone_hu
    lab, n = ndimage.label(hot)
    del hot
    cnt = np.bincount(lab.ravel())
    cnt[0] = 0
    keep = cnt * vox_cm3 * 1000.0 >= p.bone_min_mm3
    keep[0] = False
    dense = keep[lab]
    del lab, cnt, keep
    if extra_bone is not None:
        stats["extra_bone_cm3"] = round(float((extra_bone & ~dense).sum()) * vox_cm3, 1)
        dense |= extra_bone
    stats["bone_cm3"] = round(float(dense.sum()) * vox_cm3, 1)

    mean_bg, std_bg = background_stats(volume, within, dense)
    weak = p.weak_hu if p.weak_hu is not None else float(np.clip(mean_bg + 3.0 * std_bg, p.weak_min_hu, p.weak_max_hu))
    strong = max(p.strong_hu, weak + 1.0)
    stats.update(background_hu=round(mean_bg, 1), background_sd=round(std_bg, 1),
                 weak_hu=round(weak, 1), strong_hu=round(strong, 1))

    _say(on_progress, "umbral", 15)
    m = volume >= weak
    if within is not None:
        m &= within
    if p.bone_margin_mm > 0:
        m &= ~ndimage.binary_dilation(dense, structure=_ball(sp, p.bone_margin_mm))
    else:
        m &= ~dense
    stats["m_cm3"] = round(float(m.sum()) * vox_cm3, 1)

    _say(on_progress, "junto al hueso", 25)
    near_bone = _near(dense, sp, p.near_bone_mm, p.grid_mm) if p.near_bone_mm > 0 else None
    if p.open_mm > 0 and near_bone is not None:
        zone = m & near_bone
        opened = ndimage.binary_opening(zone, structure=_ball(sp, p.open_mm))
        stats["opened_cm3"] = round(float((zone & ~opened).sum()) * vox_cm3, 1)
        m &= ~zone
        m |= opened
        del zone, opened
    del dense

    _say(on_progress, "aire", 35)
    if p.air_mm > 0:
        air = volume < p.air_hu
        if within is not None:
            air &= within
        junk = m & _near(air, sp, p.air_mm, p.grid_mm)
        del air
        stats["air_cm3"] = round(float(junk.sum()) * vox_cm3, 1)
        m &= ~junk
        del junk

    _say(on_progress, "cavidad", 45)
    cav, cinfo = intracranial_cavity(volume, sp, grid_mm=p.grid_mm)
    stats["cavity"] = cinfo
    if cinfo.get("applied"):
        zone = _near(cav, sp, p.cavity_margin_mm, p.grid_mm)
        zc = np.nonzero(cav.any(axis=(1, 2)))[0]
        z_floor = int(zc.min()) if len(zc) else 0
        z_top = min(volume.shape[0], z_floor + int(round(p.corridor_mm / sp[0])) + 1)
        outside = m & ~zone
        outside[z_top:] = False
        corridor = np.zeros_like(m)
        if outside.any():
            # Tubos gruesos fuera de la cavidad en la base (carótidas, vertebrales): grosor
            # medido solo en su caja, y reconstruidos con su borde.
            zz, yy, xx = (np.nonzero(outside.any(axis=a))[0] for a in ((1, 2), (0, 2), (0, 1)))
            sl = tuple(slice(a.min(), a.max() + 1) for a in (zz, yy, xx))
            o = outside[sl]
            thick = ndimage.distance_transform_edt(o, sampling=sp) >= p.corridor_thick_mm
            corridor[sl] = ndimage.binary_dilation(thick, structure=_ball(sp, p.corridor_thick_mm)) & o
            del o, thick
        stats["corridor_cm3"] = round(float(corridor.sum()) * vox_cm3, 1)
        stats["outside_cm3"] = round(float((m & ~zone & ~corridor).sum()) * vox_cm3, 1)
        m &= zone | corridor
        del zone, outside, corridor
    del cav

    _say(on_progress, "conexión", 70)
    lab, n = ndimage.label(m)
    del m
    strong_ids = np.zeros(n + 1, dtype=bool)
    strong_ids[np.unique(lab[volume >= strong])] = True
    cnt = np.bincount(lab.ravel())
    cnt[0] = 0
    keep = strong_ids & (cnt * vox_cm3 >= p.min_piece_cm3)
    keep[0] = False
    plates = _plate_pieces(lab, keep, cnt, near_bone, sp, p) if near_bone is not None else []
    for i in plates:
        keep[i] = False
    stats["plates_dropped"] = len(plates)
    stats["plates_cm3"] = round(float(cnt[plates].sum()) * vox_cm3, 2) if plates else 0.0
    del near_bone
    mask = keep[lab]
    stats["pieces_kept"] = int(keep.sum())
    stats["pieces_dropped"] = int(max(0, n - keep.sum()))
    del lab
    stats["mask_cm3"] = round(float(mask.sum()) * vox_cm3, 1)
    _say(on_progress, "hecho", 100)
    logger.info("Vasos de angio-TC: %s", stats)
    return CtaResult(mask=mask, background_hu=mean_bg, stats=stats)


def refine_surface(poly, volume: np.ndarray, spacing, background_hu: float, *,
                   low_hu: float = 100.0, cap_hu: float = 150.0, depth_mm: float = 2.0,
                   step_mm: float = 0.1, sigma_mm: float = 0.4, origin_mm=(0.0, 0.0, 0.0)):
    """Lleva cada vértice al borde a media altura local, bajando por su normal; no toca la topología.

    Para cada vértice se muestrea el HU suavizado hacia dentro hasta `depth_mm`:
    P = pico de esa línea; iso = clip(fondo + ½(P − fondo), low_hu, cap_hu); el
    vértice va al primer punto con HU ≥ iso (interpolado), sin moverse más de
    depth_mm/2. En un vaso fino P es bajo e iso cae al umbral débil: no se mueve.
    `origin_mm` es la posición (x, y, z) del vóxel [0, 0, 0] de `volume` en el marco
    de la malla. Medido en 7 estudios de Zenodo: recubrimiento de las lesiones igual
    o mejor que con la malla de antes en 6 de 9, y ninguna pieza nueva.
    """
    import SimpleITK as sitk
    import vtk
    from vtkmodules.util import numpy_support as ns

    nf = vtk.vtkPolyDataNormals()
    nf.SetInputData(poly)
    nf.ComputePointNormalsOn(); nf.ComputeCellNormalsOff()
    nf.SplittingOff(); nf.ConsistencyOn(); nf.AutoOrientNormalsOn()
    nf.Update()
    out = nf.GetOutput()
    if out.GetNumberOfPoints() == 0:
        return poly
    pts = ns.vtk_to_numpy(out.GetPoints().GetData()).astype(np.float64)
    nrm = ns.vtk_to_numpy(out.GetPointData().GetNormals()).astype(np.float64)
    spx = np.array(spacing, dtype=np.float64)[::-1]          # (sx, sy, sz)
    org = np.asarray(origin_mm, dtype=np.float64)
    lo = np.floor((pts.min(0) - org - depth_mm - 2.0) / spx).astype(int)
    hi = np.ceil((pts.max(0) - org + depth_mm + 2.0) / spx).astype(int)
    lo = np.maximum(lo, 0)
    hi = np.minimum(hi, np.array(volume.shape)[::-1] - 1)
    sub = np.ascontiguousarray(volume[lo[2]:hi[2] + 1, lo[1]:hi[1] + 1, lo[0]:hi[0] + 1], dtype=np.float32)
    img = sitk.GetImageFromArray(sub)
    img.SetSpacing(tuple(float(v) for v in spx))
    sm = sitk.GetArrayFromImage(sitk.SmoothingRecursiveGaussian(img, sigma_mm))
    del sub, img
    ts = np.arange(0.0, depth_mm + 1e-9, step_mm)
    moved = np.zeros(len(pts))
    chunk = 50_000
    for a in range(0, len(pts), chunk):
        line = pts[a:a + chunk, None, :] - ts[None, :, None] * nrm[a:a + chunk, None, :]
        idx = (line - org) / spx - lo
        coords = [idx[..., 2].ravel(), idx[..., 1].ravel(), idx[..., 0].ravel()]
        val = ndimage.map_coordinates(sm, coords, order=1, mode="nearest").reshape(line.shape[:2])
        peak = val.max(axis=1)
        iso = np.clip(background_hu + 0.5 * (peak - background_hu), low_hu, cap_hu)
        above = val >= iso[:, None]
        first = np.where(above.any(axis=1), above.argmax(axis=1), 0)
        k = np.maximum(first, 1)
        rows = np.arange(len(k))
        v0, v1 = val[rows, k - 1], val[rows, k]
        frac = np.clip((iso - v0) / np.maximum(v1 - v0, 1e-6), 0.0, 1.0)
        t = np.where(first > 0, ts[k - 1] + frac * step_mm, 0.0)
        moved[a:a + chunk] = np.minimum(t, depth_mm / 2.0)
    newp = pts - moved[:, None] * nrm
    res = vtk.vtkPolyData()
    res.DeepCopy(out)
    res.GetPoints().SetData(ns.numpy_to_vtk(newp.astype(np.float32), deep=True))
    smooth = vtk.vtkWindowedSincPolyDataFilter()
    smooth.SetInputData(res)
    smooth.SetNumberOfIterations(10); smooth.SetPassBand(0.1)
    smooth.NonManifoldSmoothingOn(); smooth.NormalizeCoordinatesOn()
    smooth.Update()
    n2 = vtk.vtkPolyDataNormals()
    n2.SetInputData(smooth.GetOutput()); n2.SplittingOff(); n2.Update()
    return n2.GetOutput()
