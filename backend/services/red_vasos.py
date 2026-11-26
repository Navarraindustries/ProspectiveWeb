"""Red de líneas centrales de todo el árbol vascular, en segundos.

Lo que pinta `vmtkcenterlinesnetwork`, pero medido en case 3 (26-11): VMTK
tardaba 15 min, dejaba tramos rotos (decenas de «Target not reached») y junto
al saco no daba ninguna unión limpia; esto tarda menos de 10 s y ningún
punto cae fuera de la pared.

Cómo
----
1. La máscara del interior por cortes (`centerline.voxelizar`, la misma de la
   línea central) y su pieza más grande; la transformada de distancia da el
   radio en cada vóxel.
2. TEASAR (Sato et al., 2000): un grafo de vóxeles cuyo coste castiga
   alejarse del eje; desde la raíz (el vóxel más hondo) se traza el camino al
   vóxel más lejano que quede sin cubrir, se cubre una bola alrededor de cada
   punto del camino (1,5·r + 1 mm) y se repite hasta cubrir todo.
   Cada camino nuevo se para al entrar en lo ya cubierto y se engancha al
   punto de la red más cercano: si no, en los vasos gruesos (el eje es una
   cresta de varios vóxeles de ancho) salían caminos paralelos duplicados.
3. Tramos entre uniones y extremos; se podan las ramitas terminales más cortas
   que `max(2 mm, 1,5 × Ø de donde nacen)` (bultos de la pared, no vasos) y
   las uniones a menos de `_UNION_MM` cuentan como una. Una rama fina empieza
   donde sale del vaso grueso, no dentro de él (se veía doble).
4. Cada tramo se suaviza (gaussiana a lo largo, extremos fijos; el punto que
   el suavizado saque de la pared vuelve al centro de su vóxel), los de Ø ≥
   1,2 mm se centran en la malla como la línea central (`centrar_en_malla`) y
   su radio es la distancia exacta a la pared (`DistanciaFirmada`). Dos
   tramos que van juntos por el mismo vaso se dejan en uno (`_quitar_solapes`).

Medido en case 3: 8,7 s, 259 tramos, 111 bifurcaciones, ningún punto fuera.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import vtk
from scipy import ndimage, sparse
from scipy.ndimage import gaussian_filter1d
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from services.centerline import centrar_en_malla, voxelizar
from services.distancia_malla import DistanciaFirmada

logger = logging.getLogger(__name__)

VOXEL_MM = 0.4
#: Tope de vóxeles de la rejilla; por encima se engorda el vóxel.
_MAX_VOXELES = 20_000_000
#: Penalización TEASAR: largo · (1 + _PENAL · (1 − r/r_máx)^_POTENCIA).
_PENAL = 5000.0
_POTENCIA = 16
#: Bola que cubre cada punto de un camino: _CUBRE_K · r + _CUBRE_MM.
_CUBRE_K = 1.5
_CUBRE_MM = 1.0
#: Ramita terminal que se poda: más corta que max(_PODA_MM, _PODA_K · Ø en su unión).
_PODA_MM = 2.0
_PODA_K = 1.5
#: Uniones más cerca que esto son una sola bifurcación.
_UNION_MM = 1.5
#: Suavizado de cada tramo, en mm.
_SIGMA_MM = 0.6
#: Una rama es «fina» frente a otra si su radio es menos de 1/_RAMA_FINA del de esta.
_RAMA_FINA = 1.3
#: Mientras una rama fina siga a menos de esto × el radio del vaso grueso de su
#: eje, corre por dentro del grueso: su arranque se recorta.
_MITAD_CENTRAL = 0.5
#: Solape: un tramo a menos de _SOLAPE_RADIO × su radio de otro durante
#: _SOLAPE_MM o más va por el mismo vaso.
_SOLAPE_RADIO = 0.5
_SOLAPE_MM = 1.2
#: Rondas de centrado en la malla por tramo, y desde qué Ø (mm) se centra.
_CENTRAR_DESDE_MM = 1.2
_RONDAS_CENTRADO = 1


@dataclass
class Tramo:
    puntos: np.ndarray        # (n, 3) mm
    radios: np.ndarray        # (n,) mm, distancia exacta a la pared
    largo_mm: float
    terminal: bool            # uno de sus extremos es un extremo libre de la red


@dataclass
class Red:
    tramos: list[Tramo] = field(default_factory=list)
    uniones: list[tuple[float, float, float]] = field(default_factory=list)
    extremos: list[tuple[float, float, float]] = field(default_factory=list)
    voxel_mm: float = VOXEL_MM
    segundos: float = 0.0

    @property
    def largo_total_mm(self) -> float:
        return float(sum(t.largo_mm for t in self.tramos))


def _vecinos_26():
    return [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) > (0, 0, 0)]


def _grafo(idx: np.ndarray, num: np.ndarray, dt: np.ndarray, vs: float):
    """Grafos de vóxeles (26 vecinos): con la penalización TEASAR y con el largo."""
    nv = len(idx)
    dmax = float(dt.max())
    F, C, W, L = [], [], [], []
    for d in _vecinos_26():
        j = idx + d
        ok = np.all((j >= 0) & (j < num.shape), axis=1)
        a = np.flatnonzero(ok)
        b = num[tuple(j[ok].T)]
        k = b >= 0
        a, b = a[k], b[k]
        largo = vs * float(np.sqrt(sum(x * x for x in d)))
        r = 0.5 * (dt[tuple(idx[a].T)] + dt[tuple(idx[b].T)])
        F.append(a); C.append(b)
        W.append(largo * (1.0 + _PENAL * (1.0 - r / dmax) ** _POTENCIA))
        L.append(np.full(len(a), largo))
    F, C = np.concatenate(F), np.concatenate(C)
    G = sparse.coo_matrix((np.concatenate(W), (F, C)), shape=(nv, nv)).tocsr()
    Gl = sparse.coo_matrix((np.concatenate(L), (F, C)), shape=(nv, nv)).tocsr()
    return G, Gl


def _teasar(P: np.ndarray, radio: np.ndarray, G, Gl, raiz: int) -> set[tuple[int, int]]:
    """Aristas (pares de índices de vóxel) de la red."""
    _, pred = dijkstra(G, directed=False, indices=raiz, return_predecessors=True)
    geo = dijkstra(Gl, directed=False, indices=raiz)
    geo = np.where(np.isfinite(geo), geo, -1.0)
    kd = cKDTree(P)
    cubierto = np.zeros(len(P), dtype=bool)
    en_red = np.zeros(len(P), dtype=bool)
    en_red[raiz] = True
    aristas: set[tuple[int, int]] = set()

    def cubrir(i: int) -> None:
        cubierto[kd.query_ball_point(P[i], _CUBRE_K * radio[i] + _CUBRE_MM)] = True

    cubrir(raiz)
    while True:
        cand = np.where(cubierto, -1.0, geo)
        k = int(np.argmax(cand))
        if cand[k] <= 0:
            break
        cam = [k]
        while not cubierto[cam[-1]] and pred[cam[-1]] >= 0:
            cam.append(int(pred[cam[-1]]))
        # Enganche al punto de la red más cercano POR DENTRO y POR EL EJE: el
        # camino de menor coste TEASAR, buscado solo cerca. En línea recta
        # cortaba las curvas por fuera de la pared; con el camino más corto en
        # largo iba pegado a la pared de los vasos gruesos (hasta 9 mm), cubría
        # poco (el radio allí es pequeño) y otro camino corría luego en
        # paralelo por el eje: líneas dobles en case 3.
        fin = cam[-1]
        if not en_red[fin]:
            alcance = 2.0 * (_CUBRE_K * radio[fin] + _CUBRE_MM) + 1.0
            dlar = dijkstra(Gl, directed=False, indices=fin, limit=alcance)
            # El de menor coste, solo entre los vóxeles a ese alcance: con el
            # grafo entero la búsqueda recorría casi todo el árbol cada vez.
            cerca = np.flatnonzero(np.isfinite(dlar))
            sub_llega = np.flatnonzero(en_red[cerca])
            if len(sub_llega):
                Gs = G[cerca][:, cerca]
                desde = int(np.flatnonzero(cerca == fin)[0])
                dloc, ploc = dijkstra(Gs, directed=False, indices=desde, return_predecessors=True)
                ok = sub_llega[np.isfinite(dloc[sub_llega])]
            else:
                ok = sub_llega
            if len(ok):
                js = int(ok[np.argmin(dloc[ok])])
                tramo = [js]
                while tramo[-1] != desde:
                    tramo.append(int(ploc[tramo[-1]]))
                cam.extend(int(cerca[x]) for x in tramo[::-1][1:])
            else:                               # nada cerca: seguir el árbol hasta la red
                while not en_red[cam[-1]] and pred[cam[-1]] >= 0:
                    cam.append(int(pred[cam[-1]]))
        for a, b in zip(cam[:-1], cam[1:]):
            aristas.add((min(a, b), max(a, b)))
        for i in cam:
            en_red[i] = True
            cubrir(i)
    return aristas


def _cadenas(aristas: set[tuple[int, int]]):
    """Tramos (listas de nodos) entre nodos de grado ≠ 2, y el grado de cada nodo."""
    ady: dict[int, list[int]] = {}
    for a, b in aristas:
        ady.setdefault(a, []).append(b)
        ady.setdefault(b, []).append(a)
    grado = {v: len(n) for v, n in ady.items()}
    clave = {v for v, g in grado.items() if g != 2}
    vistas: set[tuple[int, int]] = set()
    cadenas = []
    for v in clave:
        for w in ady[v]:
            if (v, w) in vistas:
                continue
            cad = [v, w]
            vistas.add((v, w)); vistas.add((w, v))
            while cad[-1] not in clave:
                u = cad[-1]
                sig = [x for x in ady[u] if x != cad[-2]]
                if not sig:
                    break
                cad.append(sig[0])
                vistas.add((u, sig[0])); vistas.add((sig[0], u))
            cadenas.append(cad)
    return cadenas, grado


def _podar(aristas: set[tuple[int, int]], P: np.ndarray, radio: np.ndarray) -> set[tuple[int, int]]:
    """Quita ramitas terminales cortas hasta que no quede ninguna."""
    aristas = set(aristas)
    for _ in range(20):
        cadenas, grado = _cadenas(aristas)
        quitar = []
        for cad in cadenas:
            a, b = cad[0], cad[-1]
            if not ((grado[a] == 1) ^ (grado[b] == 1)):
                continue                       # solo ramas que cuelgan de una unión
            union = a if grado[a] >= 3 else b
            largo = float(np.linalg.norm(np.diff(P[cad], axis=0), axis=1).sum())
            if largo < max(_PODA_MM, _PODA_K * 2.0 * radio[union]):
                quitar.append(cad)
        if not quitar:
            break
        for cad in quitar:
            for u, v in zip(cad[:-1], cad[1:]):
                aristas.discard((min(u, v), max(u, v)))
    return aristas


def _agrupar(pts: np.ndarray, dist: float) -> list[np.ndarray]:
    """Grupos de puntos a menos de `dist` (por contagio)."""
    if len(pts) == 0:
        return []
    kd = cKDTree(pts)
    pares = kd.query_pairs(dist, output_type="ndarray")
    g = sparse.coo_matrix((np.ones(len(pares)), (pares[:, 0], pares[:, 1])) if len(pares) else ([], ([], [])),
                          shape=(len(pts), len(pts)))
    n, lab = sparse.csgraph.connected_components(g, directed=False)
    return [pts[lab == i].mean(axis=0) for i in range(n)]


def _recortar_arranques(tramos: list[Tramo], extremos: list[tuple[int, int]],
                        grado: dict[int, int], dist: DistanciaFirmada) -> None:
    """Una rama fina que sale de un vaso grueso arranca DENTRO del grueso y
    corre unos milímetros junto a su eje antes de separarse: se veía doble
    junto a cada bifurcación de una rama fina (2,5-3,5 mm en case 3). Desde la
    unión, mientras la rama siga en la mitad central del grueso, sus puntos
    sobran: la rama empieza en el punto del eje grueso más cercano a donde sale.
    """
    # Por bifurcación, no por nodo: una bifurcación partida en dos nodos
    # cercanos (a menos de _UNION_MM) es la misma.
    finales = []
    for i, (a, b) in enumerate(extremos):
        for lado, v in ((0, a), (1, b)):
            if grado.get(v, 0) >= 3:
                finales.append((i, lado, tramos[i].puntos[0 if lado == 0 else -1]))
    if not finales:
        return
    pos = np.array([f[2] for f in finales])
    pares = cKDTree(pos).query_pairs(_UNION_MM, output_type="ndarray")
    m = sparse.coo_matrix((np.ones(len(pares)), (pares[:, 0], pares[:, 1])) if len(pares) else ([], ([], [])),
                          shape=(len(pos), len(pos)))
    _, grupo = sparse.csgraph.connected_components(m, directed=False)
    por_nodo: dict[int, list[tuple[int, int]]] = {}
    for (i, lado, _), gid in zip(finales, grupo):
        por_nodo.setdefault(int(gid), []).append((i, lado))
    for quienes in por_nodo.values():
        quienes = list(dict.fromkeys(quienes))
        if len({i for i, _ in quienes}) < 2:
            continue
        rmed = {i: float(np.median(tramos[i].radios)) if len(tramos[i].radios) else 0.0 for i, _ in quienes}
        grueso = max(rmed, key=rmed.get)
        g = tramos[grueso]
        kd = cKDTree(g.puntos)
        for i, lado in quienes:
            if i == grueso or rmed[i] * _RAMA_FINA > rmed[grueso]:
                continue
            t = tramos[i]
            q = t.puntos if lado == 0 else t.puntos[::-1]
            d, j = kd.query(q)
            k = 0
            while k < len(q) - 2 and d[k] < _MITAD_CENTRAL * g.radios[j[k]]:
                k += 1
            if k == 0:
                continue
            nuevo = np.vstack([g.puntos[j[k]], q[k:]])
            if lado == 1:
                nuevo = nuevo[::-1]
            t.puntos = nuevo
            t.radios = np.array([max(0.0, -dist.EvaluateFunction(*x)) for x in nuevo])
            t.largo_mm = float(np.linalg.norm(np.diff(nuevo, axis=0), axis=1).sum())


def _quitar_solapes(tramos: list[Tramo], dist: DistanciaFirmada) -> list[Tramo]:
    """Dos tramos que recorren el MISMO vaso un trecho (a menos de medio radio
    uno del otro durante `_SOLAPE_MM` o más) se veían como una línea doble:
    en case 3, un tramo fino y uno grueso juntos 3,6 mm antes de separarse
    hacia bifurcaciones distintas. El trozo solapado se quita del tramo que
    más solapa (a igualdad, del más fino) y cada trozo que queda se engancha
    al otro tramo en el punto más cercano."""
    vivos = [True] * len(tramos)
    salida = list(tramos)
    orden = sorted(range(len(tramos)), key=lambda i: tramos[i].largo_mm)
    for i in orden:
        a = salida[i]
        if a is None or len(a.puntos) < 4:
            continue
        otros = [j for j in range(len(salida)) if j != i and salida[j] is not None and vivos[j]]
        if not otros:
            continue
        pts = np.vstack([salida[j].puntos for j in otros])
        kd = cKDTree(pts)
        d, k = kd.query(a.puntos)
        tapado = d < _SOLAPE_RADIO * np.maximum(a.radios, 0.3)
        if not tapado.any():
            continue
        paso = np.concatenate([[0.0], np.linalg.norm(np.diff(a.puntos, axis=0), axis=1)])
        # tramos seguidos tapados de al menos _SOLAPE_MM
        quitar = np.zeros(len(a.puntos), dtype=bool)
        ini = None
        for n in range(len(a.puntos) + 1):
            if n < len(a.puntos) and tapado[n]:
                ini = n if ini is None else ini
                continue
            if ini is not None:
                if paso[ini + 1:n].sum() >= _SOLAPE_MM:
                    quitar[ini:n] = True
                ini = None
        if not quitar.any():
            continue
        trozos = []
        n = 0
        while n < len(a.puntos):
            if quitar[n]:
                n += 1
                continue
            m = n
            while m < len(a.puntos) and not quitar[m]:
                m += 1
            q = a.puntos[n:m]
            # enganche al otro tramo por donde se quitó
            if n > 0:
                q = np.vstack([pts[k[n - 1]], q])
            if m < len(a.puntos):
                q = np.vstack([q, pts[k[m]]])
            largo = float(np.linalg.norm(np.diff(q, axis=0), axis=1).sum()) if len(q) > 1 else 0.0
            if len(q) >= 2 and largo >= 0.8:
                r = np.array([max(0.0, -dist.EvaluateFunction(*x)) for x in q])
                trozos.append(Tramo(q, r, largo, a.terminal))
            n = m
        salida[i] = None
        vivos[i] = False
        salida.extend(trozos)
        vivos.extend([True] * len(trozos))
    return [t for t in salida if t is not None]


def extraer_red(poly: vtk.vtkPolyData, voxel_mm: float = VOXEL_MM) -> Red:
    t0 = time.perf_counter()
    b = poly.GetBounds()
    vs = voxel_mm
    while ((b[1] - b[0]) / vs) * ((b[3] - b[2]) / vs) * ((b[5] - b[4]) / vs) > _MAX_VOXELES:
        vs *= 1.25
    mask, origin, vs = voxelizar(poly, b, vs)
    if not mask.any():
        raise ValueError("La malla no encierra volumen (¿superficie abierta?): no hay red que extraer.")
    lab, n = ndimage.label(mask, structure=np.ones((3, 3, 3)))
    if n > 1:
        mask = lab == (int(np.argmax(np.bincount(lab.ravel())[1:])) + 1)
    dt = ndimage.distance_transform_edt(mask) * vs
    idx = np.argwhere(mask)
    num = -np.ones(mask.shape, dtype=np.int64)
    num[tuple(idx.T)] = np.arange(len(idx))
    P = idx * vs + origin
    radio = dt[tuple(idx.T)]
    G, Gl = _grafo(idx, num, dt, vs)
    aristas = _teasar(P, radio, G, Gl, int(np.argmax(radio)))
    aristas = _podar(aristas, P, radio)
    cadenas, grado = _cadenas(aristas)

    dist = DistanciaFirmada(poly)
    red = Red(voxel_mm=float(vs))
    for cad in cadenas:
        q = P[cad].astype(np.float64)
        if len(q) >= 3:
            sig = _SIGMA_MM / vs
            s = np.column_stack([gaussian_filter1d(q[:, k], sig, mode="nearest") for k in range(3)])
            s[0], s[-1] = q[0], q[-1]
            # En un vaso fino y curvo el suavizado saca puntos de la pared: esos
            # vuelven al centro del vóxel, que está dentro.
            ds = np.array([dist.EvaluateFunction(*x) for x in s])
            s[ds >= 0.0] = q[ds >= 0.0]
            # Al eje: el centro de los vóxeles queda hasta medio vóxel de lado
            # (0,22 mm en un tubo de Ø 3) y el suavizado no lo corrige.
            # Una ronda: la red parte ya de la cresta de la transformada de
            # distancia, a menos de un vóxel del eje (cuatro, como la línea
            # central, multiplicaban por 4 el tiempo sin cambiar el resultado).
            # Solo los vasos gruesos: en los finos el centro del vóxel ya está a
            # menos de 0,2 mm del eje, que no se ve, y centrarlos era la mitad
            # del tiempo de la red en case 3.
            dentro = -ds[ds < 0.0]
            if len(dentro) and 2.0 * float(np.median(dentro)) >= _CENTRAR_DESDE_MM:
                c = centrar_en_malla(s, poly, dist, rondas=_RONDAS_CENTRADO)
                dc = np.array([dist.EvaluateFunction(*x) for x in c])
                c[dc >= 0.0] = s[dc >= 0.0]
                s = c
            q = s
        r = np.array([max(0.0, -dist.EvaluateFunction(*x)) for x in q])
        largo = float(np.linalg.norm(np.diff(q, axis=0), axis=1).sum())
        red.tramos.append(Tramo(q, r, largo, grado[cad[0]] == 1 or grado[cad[-1]] == 1))
    _recortar_arranques(red.tramos, [(cad[0], cad[-1]) for cad in cadenas], grado, dist)
    red.tramos = _quitar_solapes(red.tramos, dist)
    uniones = np.array([P[v] for v, g in grado.items() if g >= 3]) if grado else np.zeros((0, 3))
    red.uniones = [tuple(float(x) for x in u) for u in _agrupar(uniones, _UNION_MM)]
    red.extremos = [tuple(float(x) for x in P[v]) for v, g in grado.items() if g == 1]
    red.segundos = time.perf_counter() - t0
    logger.info("Red: %d tramos, %d uniones, %d extremos, %.0f mm en %.1f s (vóxel %.2f)",
                len(red.tramos), len(red.uniones), len(red.extremos), red.largo_total_mm, red.segundos, vs)
    return red


# ── La copia para el visor ─────────────────────────────────────────────────── #

SUFIJO = ".red.vtp"
#: Grosor de los tubos y de las uniones en el visor (mm): una línea, no un vaso.
_TUBO_MM = 0.22
_UNION_VISTA_MM = 0.5
#: Colores directos (RGB uint8) que lee el visor: tramos y uniones.
COLOR_TRAMO = (90, 200, 255)
COLOR_UNION = (255, 120, 70)
_CAMPOS = ("tramos", "uniones", "extremos", "largo_total_mm", "segundos", "voxel_mm")


def malla_de_red(red: Red) -> vtk.vtkPolyData:
    """Tubos finos por cada tramo y una esfera por unión, con el campo de
    color directo `colores` (uint8 × 3) y el resumen en los datos de campo."""
    ap = vtk.vtkAppendPolyData()

    def con_color(pd: vtk.vtkPolyData, rgb) -> vtk.vtkPolyData:
        c = vtk.vtkUnsignedCharArray(); c.SetName("colores"); c.SetNumberOfComponents(3)
        for _ in range(pd.GetNumberOfPoints()):
            c.InsertNextTuple3(*rgb)
        out = vtk.vtkPolyData(); out.ShallowCopy(pd); out.GetPointData().SetScalars(c)
        return out

    for t in red.tramos:
        if len(t.puntos) < 2:
            continue
        pts = vtk.vtkPoints()
        for p in t.puntos:
            pts.InsertNextPoint(*p)
        linea = vtk.vtkPolyLine(); linea.GetPointIds().SetNumberOfIds(len(t.puntos))
        for i in range(len(t.puntos)):
            linea.GetPointIds().SetId(i, i)
        cel = vtk.vtkCellArray(); cel.InsertNextCell(linea)
        pd = vtk.vtkPolyData(); pd.SetPoints(pts); pd.SetLines(cel)
        tubo = vtk.vtkTubeFilter(); tubo.SetInputData(pd); tubo.SetRadius(_TUBO_MM)
        tubo.SetNumberOfSides(8); tubo.CappingOn(); tubo.Update()
        ap.AddInputData(con_color(tubo.GetOutput(), COLOR_TRAMO))
    for u in red.uniones:
        s = vtk.vtkSphereSource(); s.SetCenter(*u); s.SetRadius(_UNION_VISTA_MM)
        s.SetThetaResolution(12); s.SetPhiResolution(12); s.Update()
        ap.AddInputData(con_color(s.GetOutput(), COLOR_UNION))
    ap.Update()
    out = vtk.vtkPolyData(); out.DeepCopy(ap.GetOutput())
    for nombre, valor in zip(_CAMPOS, (len(red.tramos), len(red.uniones), len(red.extremos),
                                       red.largo_total_mm, red.segundos, red.voxel_mm)):
        a = vtk.vtkDoubleArray(); a.SetName(nombre); a.InsertNextValue(float(valor))
        out.GetFieldData().AddArray(a)
    return out


def _resumen(pd: vtk.vtkPolyData) -> dict[str, float] | None:
    fd = pd.GetFieldData()
    if any(fd.GetArray(n) is None for n in _CAMPOS):
        return None
    r = {n: float(fd.GetArray(n).GetValue(0)) for n in _CAMPOS}
    for n in ("tramos", "uniones", "extremos"):
        r[n] = int(r[n])
    return r


def copia_con_red(src) -> tuple:
    """`<nombre>.red.vtp` junto a `src` y su resumen; se rehace si `src` es más nueva."""
    from services.segmentation import read_vtp, write_vtp
    dst = src.with_name(src.stem + SUFIJO)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        r = _resumen(read_vtp(dst))
        if r is not None:
            return dst, r
    pd = malla_de_red(extraer_red(read_vtp(src)))
    write_vtp(pd, dst)
    return dst, _resumen(pd)
