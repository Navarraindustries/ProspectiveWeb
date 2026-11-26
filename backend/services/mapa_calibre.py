"""Mapa de calibre: el diámetro local del vaso en cada vértice de la malla,
para pintarlo sobre el árbol (como `vmtkdistancetocenterlines`, pero sin
necesitar la red de líneas centrales).

Cómo se mide
------------
Desde cada vértice sale un rayo hacia dentro por su normal hasta la pared de
enfrente: en un tubo, esa cuerda es el diámetro. Las normales son las de la
copia suave que ve el visor (las de la malla de marching cubes tiemblan) y la
pared es la de la malla original. Un choque solo vale si el rayo SALE por él
(la normal del triángulo mira hacia donde va el rayo); si no, es la propia
pared rozada y el rayo sigue. Después, la mediana con los vecinos dos veces:
quita las cuerdas que corren a lo largo del vaso (en un extremo cortado, o en
una curva cerrada) y rellena los pocos vértices sin choque.

Medido (25-11): en los cinco fantomas de tubos la mediana coincide con el
diámetro a menos de 0,01 mm. La transformada de distancia en vóxeles de 0,4 mm
que usa el detector (`aneurysm_consensus.local_calibre`) daba 39 valores
distintos en case 3 y el 10 % de los vértices a cero (los vasos más finos que
el vóxel): pintada, eran franjas y huecos.

Solo para ver. Las medidas siguen saliendo de sus propios cálculos.
"""
from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy

from services.mesh_smooth import copia_suave
from services.segmentation import read_vtp, write_vtp

SUFIJO = ".calibre.vtp"
#: El campo de puntos que lleva la copia: diámetro local en mm.
CAMPO = "calibre_mm"
#: Más largo que el saco más grande que se planifica: un rayo que no choca
#: antes se ha escapado por un extremo abierto.
LARGO_MAX_MM = 30.0
#: El rayo arranca un poco dentro para no chocar con su propio triángulo.
ARRANQUE_MM = 0.02
#: Choques que se saltan por vértice antes de darlo por perdido.
CHOQUES_MAX = 4
VUELTAS_MEDIANA = 2
#: Cuerdas más largas que esto se comprueban (las cortas no pueden ir a lo
#: largo de nada que importe y son la mayoría).
CUERDA_REVISAR_MM = 1.0
#: En un diámetro el punto medio está a 0,5 cuerdas de la pared; se acepta
#: desde 0,35 por los sacos y las secciones ovaladas.
FRACCION_EJE = 0.35


def _orientacion(poly: vtk.vtkPolyData) -> float:
    """+1 si los triángulos miran hacia fuera (volumen firmado positivo)."""
    pts = vtk_to_numpy(poly.GetPoints().GetData()).astype(np.float64)
    tris = vtk_to_numpy(poly.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    a, b, c = (pts[tris[:, k]] for k in range(3))
    return -1.0 if float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) < 0.0 else 1.0


def _triangulos(poly: vtk.vtkPolyData) -> vtk.vtkPolyData:
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.PassVertsOff(); tri.PassLinesOff()
    tri.Update()
    out = vtk.vtkPolyData()
    out.DeepCopy(tri.GetOutput())
    return out


def _normales_celda(poly: vtk.vtkPolyData) -> np.ndarray:
    """Normal de cada triángulo según su orden, hacia fuera."""
    pts = vtk_to_numpy(poly.GetPoints().GetData()).astype(np.float64)
    tris = vtk_to_numpy(poly.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    n = np.cross(pts[tris[:, 1]] - pts[tris[:, 0]], pts[tris[:, 2]] - pts[tris[:, 0]])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n * _orientacion(poly)


def _normales_punto(poly: vtk.vtkPolyData) -> np.ndarray:
    """Normal de cada vértice hacia fuera, saliendo del orden de los triángulos
    (no de un arreglo que traiga la malla)."""
    copia = vtk.vtkPolyData()
    copia.ShallowCopy(poly)
    copia.GetPointData().SetNormals(None)
    nf = vtk.vtkPolyDataNormals()
    nf.SetInputData(copia)
    nf.SplittingOff(); nf.ConsistencyOff(); nf.AutoOrientNormalsOff()
    nf.ComputePointNormalsOn(); nf.ComputeCellNormalsOff()
    nf.Update()
    return vtk_to_numpy(nf.GetOutput().GetPointData().GetNormals()).astype(np.float64) * _orientacion(poly)


def diametro_por_rayo(pared: vtk.vtkPolyData, desde: vtk.vtkPolyData) -> np.ndarray:
    """Cuerda hacia dentro desde cada vértice de `desde` hasta `pared`, en mm
    (NaN si no sale por ningún lado antes de `LARGO_MAX_MM`)."""
    pared = _triangulos(pared)
    ncel = _normales_celda(pared)
    loc = vtk.vtkStaticCellLocator()
    loc.SetDataSet(pared)
    loc.BuildLocator()
    pts = vtk_to_numpy(desde.GetPoints().GetData()).astype(np.float64)
    nrm = _normales_punto(desde)
    out = np.full(len(pts), np.nan)
    t = vtk.reference(0.0)
    x = [0.0, 0.0, 0.0]
    pc = [0.0, 0.0, 0.0]
    sub = vtk.reference(0)
    cid = vtk.reference(0)
    for i in range(len(pts)):
        d = -nrm[i]
        recorrido = ARRANQUE_MM
        for _ in range(CHOQUES_MAX):
            a = pts[i] + d * recorrido
            b = pts[i] + d * LARGO_MAX_MM
            if not loc.IntersectWithLine(a, b, 1e-6, t, x, pc, sub, cid):
                break
            recorrido += float(t) * (LARGO_MAX_MM - recorrido)
            if ncel[int(cid)] @ d > 0.0:          # sale por aquí: la pared de enfrente
                out[i] = recorrido
                break
            recorrido += ARRANQUE_MM               # roce con la propia pared: sigue
    # Cuerdas a lo largo del vaso (la tapa plana de un vaso cortado, la punta
    # de un tubo): en un diámetro, el punto medio está en el eje, a media
    # cuerda de la pared; aquí queda mucho más cerca. Entonces el calibre es
    # el doble de esa profundidad (en los fantomas, las tapas daban 11-14 mm
    # en tubos de 3; en case 3, hasta 29,5).
    cp = [0.0, 0.0, 0.0]
    d2 = vtk.reference(0.0)
    for i in np.flatnonzero(out > CUERDA_REVISAR_MM):
        medio = pts[i] - nrm[i] * (out[i] / 2.0)
        loc.FindClosestPoint(medio, cp, cid, sub, d2)
        hondo = float(np.sqrt(max(float(d2), 0.0)))
        if hondo < FRACCION_EJE * out[i]:
            out[i] = 2.0 * hondo
    return out


def _vecinos(poly: vtk.vtkPolyData) -> np.ndarray:
    """(n, k) índices de los vecinos de cada vértice por las aristas, más él
    mismo en la columna 0; relleno con -1."""
    n = poly.GetNumberOfPoints()
    tris = vtk_to_numpy(poly.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    ar = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    ar = np.unique(np.sort(ar, axis=1), axis=0)
    ar = np.concatenate([ar, ar[:, ::-1]])
    ar = ar[np.argsort(ar[:, 0], kind="stable")]
    cuenta = np.bincount(ar[:, 0], minlength=n)
    k = int(cuenta.max()) + 1 if len(cuenta) else 1
    tabla = np.full((n, k), -1, dtype=np.int64)
    tabla[:, 0] = np.arange(n)
    inicio = np.concatenate([[0], np.cumsum(cuenta)[:-1]])
    col = np.arange(len(ar)) - inicio[ar[:, 0]] + 1
    tabla[ar[:, 0], col] = ar[:, 1]
    return tabla


def mediana_vecinos(poly: vtk.vtkPolyData, valores: np.ndarray, vueltas: int = VUELTAS_MEDIANA) -> np.ndarray:
    """Mediana de cada vértice con sus vecinos, `vueltas` veces (los NaN no cuentan)."""
    tabla = _vecinos(poly)
    v = np.asarray(valores, dtype=np.float64).copy()
    for _ in range(vueltas):
        ext = np.append(v, np.nan)                 # el -1 del relleno lee NaN
        with warnings.catch_warnings():            # fila toda NaN: queda NaN
            warnings.simplefilter("ignore", RuntimeWarning)
            v = np.nanmedian(ext[tabla], axis=1)
    return v


def calibre(original: vtk.vtkPolyData, suave: vtk.vtkPolyData) -> np.ndarray:
    """Diámetro local (mm) en cada vértice de `suave` (la copia suave de
    `original`, mismos vértices): rayo y mediana con los vecinos."""
    d = diametro_por_rayo(original, suave)
    d = mediana_vecinos(suave, d)
    # Lo que siga sin dato tras las medianas (una isla sin choques) va al
    # mínimo: se pinta como lo más fino, no como un hueco.
    resto = np.isnan(d)
    if resto.any():
        d[resto] = np.nanmin(d) if (~resto).any() else 0.0
    return d


def resumen(d: np.ndarray) -> dict[str, float]:
    return {
        "p5_mm": float(np.percentile(d, 5)),
        "mediana_mm": float(np.median(d)),
        "p95_mm": float(np.percentile(d, 95)),
        "maximo_mm": float(d.max()),
    }


def copia_con_calibre(src: Path) -> tuple[Path, dict[str, float]]:
    """`<nombre>.calibre.vtp` junto a `src`: la copia suave con el campo
    `calibre_mm`. Se rehace si `src` es más nueva."""
    dst = src.with_name(src.stem + SUFIJO)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        poly = read_vtp(dst)
        arr = poly.GetPointData().GetArray(CAMPO)
        if arr is not None:
            return dst, resumen(vtk_to_numpy(arr))
    original = read_vtp(src)
    suave = read_vtp(copia_suave(src))
    if suave.GetNumberOfPoints() != original.GetNumberOfPoints():
        suave = original                           # la copia no es de esta malla: sin suavizar
    d = calibre(original, suave).astype(np.float32)   # el resumen, de lo que se guarda
    arr = numpy_to_vtk(d, deep=True)
    arr.SetName(CAMPO)
    out = vtk.vtkPolyData()
    out.DeepCopy(suave)
    out.GetPointData().AddArray(arr)
    write_vtp(out, dst)
    return dst, resumen(d)
