"""IVUS virtual de VINI 3D: un «pullback» calculado sobre la angio-TC o la 3DRA.

Un IVUS de verdad retira un catéter de ultrasonido por la arteria y da, en cada
posición, un corte transversal circular; de esa pila salen la vista longitudinal
y las medidas sección a sección. Aquí la pila sale del volumen: una sección
perpendicular a la línea central en cada punto (~0,5 mm), con

- la imagen del volumen remuestreada en ese plano (la luz, no la pared: con
  vóxeles de ~0,5 mm la pared intracraneal, ~0,3 mm, no se resuelve);
- el contorno de la luz, cortando la malla del vaso por ese plano y quedándose
  con el lazo que rodea a la línea central (el más grande puede ser otra rama);
- las medidas IVUS de ese contorno: área, perímetro, diámetros mínimo y máximo
  por el centroide, diámetro equivalente y excentricidad.

Los ejes de cada sección son un marco de rotación mínima (doble reflexión,
Wang et al. 2008): la imagen no gira sobre sí misma al avanzar, y la vista
longitudinal no se retuerce.

Resumen (convenciones de IVUS): área luminal mínima (MLA) y áreas de
referencia proximal y distal, la mayor sección a menos de 10 mm a cada lado.
Las secciones dentro de la lesión (saco o zona del candidato) se marcan y no
cuentan: allí el área es la del aneurisma, no la de la arteria.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy

logger = logging.getLogger(__name__)

TAMANO_PX = 128              # lado de cada sección de la pila
FOV_MIN_MM, FOV_MAX_MM = 9.0, 24.0
FOV_POR_RADIO = 5.0          # campo = 5 × radio del percentil 75 (la luz ocupa ~1/3, como en un IVUS; el saco del final no lo infla), acotado
VENTANA_REF_MM = 10.0        # referencias: la mayor sección a menos de 10 mm
# Sección de rama: donde otra rama se une, el corte abarca las dos luces y el
# área salta. IVUS toma la referencia «antes de una rama mayor»; aquí, la
# sección que supera en un 50 % la mediana de su entorno (±3 mm) o es muy
# excéntrica no puede ser referencia.
RAMA_FACTOR_AREA = 1.5
RAMA_VENTANA_MM = 3.0
RAMA_EXCENTRICIDAD = 0.5
MARGEN_EXTREMOS_MM = 1.0     # los extremos de la línea son ruidosos
PUNTOS_CONTORNO = 72         # contorno remuestreado para enviarlo
ANGULOS_DIAMETRO = 180       # diámetros por el centroide, cada 1°


@dataclass
class Seccion:
    arc_mm: float
    valida: bool = False             # contorno cerrado que rodea a la línea
    en_lesion: bool = False
    en_rama: bool = False            # una rama se une a la luz: no vale de referencia
    area_mm2: float | None = None
    perimetro_mm: float | None = None
    d_min_mm: float | None = None
    d_max_mm: float | None = None
    d_eq_mm: float | None = None
    excentricidad: float | None = None
    angulo_min_deg: float | None = None
    angulo_max_deg: float | None = None
    centroide: tuple[float, float] | None = None
    contorno: list[tuple[float, float]] = field(default_factory=list)   # (u, v) mm


@dataclass
class Resumen:
    mla_mm2: float
    mla_indice: int
    mla_arc_mm: float
    d_min_mm: float
    d_max_mm: float
    excentricidad: float
    ref_prox_mm2: float | None
    ref_prox_arc_mm: float | None
    ref_dist_mm2: float | None
    ref_dist_arc_mm: float | None
    ref_mm2: float | None
    estenosis_area_pct: float | None


@dataclass
class Pullback:
    pila: np.ndarray                 # (N, TAMANO_PX, TAMANO_PX) uint8; fila = v, columna = u
    fov_mm: float
    ventana: tuple[float, float]     # intensidades que van a 0 y a 255
    secciones: list[Seccion]
    resumen: Resumen | None
    nota: str = ""


# ── Marco de rotación mínima ──────────────────────────────────────────────── #

def tangentes(p: np.ndarray) -> np.ndarray:
    """Diferencias centradas, unilaterales en los extremos (como tangentAt del visor)."""
    n = len(p)
    a = p[np.maximum(0, np.arange(n) - 1)]
    b = p[np.minimum(n - 1, np.arange(n) + 1)]
    d = b - a
    l = np.linalg.norm(d, axis=1, keepdims=True)
    l[l < 1e-9] = 1.0
    return d / l


def marcos(p: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(T, U, V) por punto: T la tangente; U, V los ejes de la sección (V = T × U).

    El primer U es la parte de +z perpendicular a T (o de +y si T es casi z);
    los siguientes se transportan por doble reflexión, sin giro propio."""
    t = tangentes(p)
    n = len(p)
    u = np.zeros_like(t)
    ref = np.array([0.0, 0.0, 1.0]) if abs(t[0, 2]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u0 = ref - np.dot(ref, t[0]) * t[0]
    u[0] = u0 / np.linalg.norm(u0)
    for i in range(n - 1):
        v1 = p[i + 1] - p[i]
        c1 = float(np.dot(v1, v1))
        if c1 < 1e-12:
            u[i + 1] = u[i]
            continue
        rl = u[i] - (2.0 / c1) * np.dot(v1, u[i]) * v1
        tl = t[i] - (2.0 / c1) * np.dot(v1, t[i]) * v1
        v2 = t[i + 1] - tl
        c2 = float(np.dot(v2, v2))
        ui = rl - (2.0 / c2) * np.dot(v2, rl) * v2 if c2 > 1e-12 else rl
        ui -= np.dot(ui, t[i + 1]) * t[i + 1]
        u[i + 1] = ui / (np.linalg.norm(ui) or 1.0)
    v = np.cross(t, u)
    return t, u, v


# ── Imagen de cada sección ────────────────────────────────────────────────── #

def fov_para(radios: np.ndarray) -> float:
    r = float(np.percentile(radios, 75)) if len(radios) else 1.5
    return float(np.clip(FOV_POR_RADIO * r, FOV_MIN_MM, FOV_MAX_MM))


def remuestrear(vol: np.ndarray, espaciado: tuple[float, float, float], p: np.ndarray,
                u: np.ndarray, v: np.ndarray, fov_mm: float, tam: int = TAMANO_PX) -> np.ndarray:
    """Intensidad del volumen (z, y, x; marco índice × espaciado) en una rejilla
    tam × tam de lado fov_mm centrada en cada punto: (N, tam, tam) float32."""
    from scipy.ndimage import map_coordinates

    s = np.asarray(espaciado, dtype=np.float64)                # (sz, sy, sx)
    paso = (np.arange(tam) + 0.5) / tam * fov_mm - fov_mm / 2.0
    gu, gv = np.meshgrid(paso, paso)                           # fila = v, columna = u
    # Recorte del volumen alrededor de la línea: map_coordinates sobre el memmap entero leería de más.
    margen = fov_mm * 0.75 + 1.0
    lo_mm, hi_mm = p.min(axis=0) - margen, p.max(axis=0) + margen   # (x, y, z)
    shape = np.array(vol.shape)                                # (z, y, x)
    lo = np.clip(np.floor(lo_mm[::-1] / s).astype(int), 0, shape - 1)
    hi = np.clip(np.ceil(hi_mm[::-1] / s).astype(int) + 1, 1, shape)
    sub = np.asarray(vol[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]], dtype=np.float32)
    fondo = float(np.percentile(sub, 1)) if sub.size else 0.0
    out = np.empty((len(p), tam, tam), dtype=np.float32)
    for i in range(len(p)):
        mm = p[i][None, None, :] + gu[..., None] * u[i] + gv[..., None] * v[i]   # (tam, tam, 3) x,y,z
        idx = mm[..., ::-1] / s - lo                                            # z, y, x en el recorte
        out[i] = map_coordinates(sub, [idx[..., 0], idx[..., 1], idx[..., 2]], order=1, mode="constant", cval=fondo)
    return out


def a_uint8(pila: np.ndarray) -> tuple[np.ndarray, tuple[float, float]]:
    """Ventana por percentiles (1 % y 99,5 %) de toda la pila, igual para todas
    las secciones: así una sección más clara lo es de verdad."""
    lo, hi = (float(x) for x in np.percentile(pila, [1.0, 99.5]))
    if hi - lo < 1e-6:
        hi = lo + 1.0
    return np.clip((pila - lo) / (hi - lo) * 255.0 + 0.5, 0, 255).astype(np.uint8), (lo, hi)


# ── Contorno y medidas ────────────────────────────────────────────────────── #

def _lazos(poly: vtk.vtkPolyData, o: np.ndarray, t: np.ndarray, u: np.ndarray, v: np.ndarray):
    """Lazos del corte de la malla por el plano (o, t), en coordenadas (u, v) mm,
    con si están cerrados."""
    plano = vtk.vtkPlane()
    plano.SetOrigin(*map(float, o)); plano.SetNormal(*map(float, t))
    corte = vtk.vtkCutter(); corte.SetCutFunction(plano); corte.SetInputData(poly); corte.Update()
    if corte.GetOutput().GetNumberOfPoints() < 3:
        return []
    tira = vtk.vtkStripper(); tira.SetInputData(corte.GetOutput()); tira.JoinContiguousSegmentsOn(); tira.Update()
    out = tira.GetOutput()
    if out.GetNumberOfPoints() < 3 or out.GetLines() is None:
        return []
    pts = vtk_to_numpy(out.GetPoints().GetData()).astype(np.float64) - o
    uv = np.stack([pts @ u, pts @ v], axis=1)
    lazos = []
    lineas = out.GetLines(); lineas.InitTraversal(); ids = vtk.vtkIdList()
    while lineas.GetNextCell(ids):
        k = [ids.GetId(j) for j in range(ids.GetNumberOfIds())]
        if len(k) < 4:
            continue
        cerrado = k[0] == k[-1] or float(np.linalg.norm(uv[k[0]] - uv[k[-1]])) < 1e-3
        q = uv[k[:-1]] if k[0] == k[-1] else uv[k]
        lazos.append((q, cerrado))
    return lazos


def _area_con_signo(q: np.ndarray) -> float:
    x, y = q[:, 0], q[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def _contiene(q: np.ndarray, pt=(0.0, 0.0)) -> bool:
    """Punto en polígono por cruces de rayo."""
    x, y = q[:, 0], q[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    cruza = (y > pt[1]) != (y2 > pt[1])
    with np.errstate(divide="ignore", invalid="ignore"):
        xc = x + (pt[1] - y) * (x2 - x) / (y2 - y)
    return bool(np.count_nonzero(cruza & (xc > pt[0])) % 2)


def _distancia_a(q: np.ndarray, pt=(0.0, 0.0)) -> float:
    a, b = q, np.roll(q, -1, axis=0)
    ab = b - a
    t = np.clip(np.einsum("ij,ij->i", np.asarray(pt) - a, ab) / np.maximum(np.einsum("ij,ij->i", ab, ab), 1e-12), 0, 1)
    return float(np.min(np.linalg.norm(a + t[:, None] * ab - np.asarray(pt), axis=1)))


def _centroide(q: np.ndarray) -> np.ndarray:
    x, y = q[:, 0], q[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    c = x * y2 - x2 * y
    a = c.sum() / 2.0
    if abs(a) < 1e-12:
        return q.mean(axis=0)
    return np.array([((x + x2) * c).sum(), ((y + y2) * c).sum()]) / (6.0 * a)


def diametros(q: np.ndarray, c: np.ndarray, n: int = ANGULOS_DIAMETRO):
    """Cuerda por el centroide en n direcciones (0–180°): de la intersección más
    cercana a un lado a la más cercana al otro (en una luz cóncava, la cuerda
    que contiene al centroide). Devuelve (ángulos en grados, cuerdas en mm)."""
    a, b = q - c, np.roll(q, -1, axis=0) - c
    angs = np.arange(n) * (180.0 / n)
    cuerdas = np.full(n, np.nan)
    for k, ang in enumerate(np.radians(angs)):
        d = np.array([np.cos(ang), np.sin(ang)])
        e = b - a
        den = d[0] * e[:, 1] - d[1] * e[:, 0]                  # d × e
        ok = np.abs(den) > 1e-12
        s = np.where(ok, (a[:, 0] * e[:, 1] - a[:, 1] * e[:, 0]) / np.where(ok, den, 1), np.nan)   # a lo largo de d
        w = np.where(ok, (a[:, 0] * d[1] - a[:, 1] * d[0]) / np.where(ok, den, 1), np.nan)        # a lo largo de e
        dentro = ok & (w >= 0) & (w <= 1)
        pos, neg = s[dentro & (s > 0)], s[dentro & (s < 0)]
        if pos.size and neg.size:
            cuerdas[k] = pos.min() - neg.max()
    return angs, cuerdas


def remuestrear_contorno(q: np.ndarray, n: int = PUNTOS_CONTORNO) -> np.ndarray:
    cerrado = np.vstack([q, q[:1]])
    seg = np.linalg.norm(np.diff(cerrado, axis=0), axis=1)
    arco = np.concatenate([[0.0], np.cumsum(seg)])
    if arco[-1] < 1e-9:
        return q[:1].repeat(n, axis=0)
    s = np.linspace(0.0, arco[-1], n, endpoint=False)
    return np.stack([np.interp(s, arco, cerrado[:, 0]), np.interp(s, arco, cerrado[:, 1])], axis=1)


def medir_seccion(poly: vtk.vtkPolyData, o, t, u, v, arc_mm: float) -> Seccion:
    sec = Seccion(arc_mm=float(arc_mm))
    lazos = _lazos(poly, np.asarray(o, float), t, u, v)
    if not lazos:
        return sec
    rodean = [(abs(_area_con_signo(q)), q) for q, cerrado in lazos if cerrado and _contiene(q)]
    if rodean:
        q = min(rodean, key=lambda x: x[0])[1]                 # el lazo más pequeño que rodea a la línea
        sec.valida = True
    else:
        q = min((q for q, _ in lazos), key=_distancia_a)       # para dibujarlo; sin medidas
    sec.contorno = [(round(float(a), 3), round(float(b), 3)) for a, b in remuestrear_contorno(q)]
    if not sec.valida:
        return sec
    area = abs(_area_con_signo(q))
    c = _centroide(q)
    angs, cuerdas = diametros(q, c)
    if np.all(np.isnan(cuerdas)) or area < 1e-6:
        sec.valida = False
        return sec
    kmin, kmax = int(np.nanargmin(cuerdas)), int(np.nanargmax(cuerdas))
    sec.area_mm2 = area
    sec.perimetro_mm = float(np.linalg.norm(np.diff(np.vstack([q, q[:1]]), axis=0), axis=1).sum())
    sec.d_min_mm, sec.d_max_mm = float(cuerdas[kmin]), float(cuerdas[kmax])
    sec.angulo_min_deg, sec.angulo_max_deg = float(angs[kmin]), float(angs[kmax])
    sec.d_eq_mm = 2.0 * float(np.sqrt(area / np.pi))
    sec.excentricidad = (sec.d_max_mm - sec.d_min_mm) / sec.d_max_mm if sec.d_max_mm > 0 else 0.0
    sec.centroide = (float(c[0]), float(c[1]))
    return sec


# ── Lesión ────────────────────────────────────────────────────────────────── #

def en_lesion(p: np.ndarray, lesion: vtk.vtkPolyData | None, vaso: vtk.vtkPolyData) -> np.ndarray:
    """Qué puntos de la línea caen en la lesión: dentro del saco si es cerrado;
    si es una zona abierta, los que tienen la zona por pared más cercana
    (como `_lesion_center` de la línea central)."""
    fuera = np.zeros(len(p), dtype=bool)
    if lesion is None or lesion.GetNumberOfPoints() == 0:
        return fuera
    fe = vtk.vtkFeatureEdges(); fe.SetInputData(lesion)
    fe.BoundaryEdgesOn(); fe.FeatureEdgesOff(); fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    if fe.GetOutput().GetNumberOfCells() == 0:
        pts = vtk.vtkPoints(); pts.SetData(numpy_to_vtk(np.ascontiguousarray(p, dtype=np.float64), deep=True))
        sonda = vtk.vtkPolyData(); sonda.SetPoints(pts)
        enc = vtk.vtkSelectEnclosedPoints(); enc.SetInputData(sonda); enc.SetSurfaceData(lesion)
        enc.SetTolerance(0.001); enc.Update()
        return vtk_to_numpy(enc.GetOutput().GetPointData().GetArray("SelectedPoints")).astype(bool)
    from scipy.spatial import cKDTree
    d_zona, _ = cKDTree(vtk_to_numpy(lesion.GetPoints().GetData())).query(p)
    dist = vtk.vtkImplicitPolyDataDistance(); dist.SetInput(vaso)
    d_pared = np.array([abs(dist.EvaluateFunction(*map(float, q))) for q in p])
    return d_zona <= d_pared + 0.5


# ── Resumen ───────────────────────────────────────────────────────────────── #

def marcar_ramas(secs: list[Seccion]) -> None:
    """Marca `en_rama` en las secciones válidas donde se une otra rama."""
    arcs = np.array([s.arc_mm for s in secs])
    areas = np.array([s.area_mm2 if s.valida else np.nan for s in secs])
    for i, s in enumerate(secs):
        if not s.valida:
            continue
        cerca = (np.abs(arcs - s.arc_mm) <= RAMA_VENTANA_MM) & (np.arange(len(secs)) != i) & ~np.isnan(areas)
        mediana = float(np.median(areas[cerca])) if cerca.any() else s.area_mm2
        s.en_rama = bool(s.area_mm2 > RAMA_FACTOR_AREA * mediana or (s.excentricidad or 0) > RAMA_EXCENTRICIDAD)


def resumir(secs: list[Seccion]) -> Resumen | None:
    if not secs:
        return None
    L = secs[-1].arc_mm
    usable = [i for i, s in enumerate(secs)
              if s.valida and not s.en_lesion and MARGEN_EXTREMOS_MM <= s.arc_mm <= L - MARGEN_EXTREMOS_MM]
    if len(usable) < 3:
        return None
    im = min(usable, key=lambda i: secs[i].area_mm2)
    m = secs[im]

    def referencia(lado: int):
        # Desde la MLA hacia fuera, hasta 10 mm y sin cruzar una rama ni la
        # lesión: más allá el vaso es otro (en una confluencia, el de después
        # de la unión es más ancho y la estenosis saldría inflada).
        cands, j = [], im + lado
        while 0 <= j < len(secs) and lado * (secs[j].arc_mm - m.arc_mm) <= VENTANA_REF_MM:
            s = secs[j]
            if s.en_rama or s.en_lesion:
                break
            if j in usable:
                cands.append(j)
            j += lado
        if not cands:
            return None, None
        i = max(cands, key=lambda j: secs[j].area_mm2)
        return secs[i].area_mm2, secs[i].arc_mm

    rp, rpa = referencia(-1)
    rd, rda = referencia(+1)
    refs = [r for r in (rp, rd) if r is not None]
    ref = float(np.mean(refs)) if refs else None
    pct = max(0.0, (1.0 - m.area_mm2 / ref) * 100.0) if ref else None
    return Resumen(
        mla_mm2=m.area_mm2, mla_indice=im, mla_arc_mm=m.arc_mm,
        d_min_mm=m.d_min_mm, d_max_mm=m.d_max_mm, excentricidad=m.excentricidad,
        ref_prox_mm2=rp, ref_prox_arc_mm=rpa, ref_dist_mm2=rd, ref_dist_arc_mm=rda,
        ref_mm2=ref, estenosis_area_pct=pct,
    )


# ── Todo junto ────────────────────────────────────────────────────────────── #

def calcular_pullback(puntos: np.ndarray, radios: np.ndarray, arco: np.ndarray,
                      vaso: vtk.vtkPolyData, vol: np.ndarray, espaciado,
                      lesion: vtk.vtkPolyData | None = None) -> Pullback:
    p = np.asarray(puntos, dtype=np.float64)
    if len(p) < 3:
        raise ValueError("La línea central es demasiado corta para el IVUS virtual.")
    t, u, v = marcos(p)
    fov = fov_para(np.asarray(radios, dtype=np.float64))
    pila, ventana = a_uint8(remuestrear(vol, espaciado, p, u, v, fov))
    lesion_pt = en_lesion(p, lesion, vaso)
    secs = []
    for i in range(len(p)):
        s = medir_seccion(vaso, p[i], t[i], u[i], v[i], float(arco[i]))
        s.en_lesion = bool(lesion_pt[i])
        secs.append(s)
    marcar_ramas(secs)
    resumen = resumir(secs)
    nota = "" if resumen else "No hay secciones suficientes fuera de la lesión para medir el área mínima."
    return Pullback(pila=pila, fov_mm=fov, ventana=ventana, secciones=secs, resumen=resumen, nota=nota)
