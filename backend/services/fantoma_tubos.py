"""Fantomas de tubos con radio, curvatura y torsión conocidos (P14, Dalmer 2026).

Cada fantoma es un eje analítico (recta, arco de circunferencia, hélice) y la
superficie de los puntos a distancia `radio` de él, sacada con marching cubes
de un campo de distancia en una rejilla fina, igual que la malla de un vaso
sale de una segmentación. Los extremos quedan redondeados (semiesferas).

Sirven de prueba de regresión de la línea central: se extrae la línea entre
los dos extremos del eje con el mismo código que la app y se compara con lo
que se sabe del tubo: el eje, el radio, la longitud, la curvatura y la
torsión.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import vtk
from scipy.spatial import cKDTree
from vtk.util.numpy_support import numpy_to_vtk

PASO_EJE_MM = 0.05
PASO_REJILLA_MM = 0.2


@dataclass
class Fantoma:
    nombre: str
    eje: np.ndarray            # (N, 3) eje analítico, denso (PASO_EJE_MM)
    radio_mm: float
    curvatura: float           # 1/mm, constante a lo largo del eje
    torsion: float             # 1/mm, constante (con signo)
    malla: vtk.vtkPolyData

    @property
    def longitud_mm(self) -> float:
        return float(np.linalg.norm(np.diff(self.eje, axis=0), axis=1).sum())


def _por_longitud(f, longitud_mm: float) -> np.ndarray:
    """Eje parametrizado por longitud de arco s ∈ [0, longitud]."""
    s = np.linspace(0.0, longitud_mm, int(round(longitud_mm / PASO_EJE_MM)) + 1)
    return f(s)


def recta(longitud_mm: float = 40.0) -> np.ndarray:
    return _por_longitud(lambda s: np.column_stack([s, 0 * s, 0 * s]), longitud_mm)


def arco(radio_curva_mm: float, angulo_deg: float) -> np.ndarray:
    R = radio_curva_mm
    L = R * np.radians(angulo_deg)
    return _por_longitud(lambda s: np.column_stack([R * np.cos(s / R), R * np.sin(s / R), 0 * s]), L)


def helice(a_mm: float, b_mm: float, vueltas: float) -> np.ndarray:
    """x = a cos t, y = a sin t, z = b t: κ = a/(a²+b²), τ = b/(a²+b²)."""
    c = np.hypot(a_mm, b_mm)
    L = vueltas * 2 * np.pi * c
    return _por_longitud(
        lambda s: np.column_stack([a_mm * np.cos(s / c), a_mm * np.sin(s / c), b_mm * s / c]), L)


def tubo(eje: np.ndarray, radio_mm: float, paso_mm: float = PASO_REJILLA_MM) -> vtk.vtkPolyData:
    """Superficie de los puntos a `radio_mm` del eje (marching cubes sobre la distancia)."""
    lo = eje.min(axis=0) - radio_mm - 3 * paso_mm
    hi = eje.max(axis=0) + radio_mm + 3 * paso_mm
    n = np.ceil((hi - lo) / paso_mm).astype(int) + 1
    gx, gy, gz = (lo[a] + np.arange(n[a]) * paso_mm for a in range(3))
    # Orden de VTK: x varía más rápido.
    zz, yy, xx = np.meshgrid(gz, gy, gx, indexing="ij")
    pts = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel()])
    d, _ = cKDTree(eje).query(pts, distance_upper_bound=radio_mm + 2.0)
    d = np.where(np.isfinite(d), d, radio_mm + 2.0).astype(np.float32)
    img = vtk.vtkImageData()
    img.SetDimensions(int(n[0]), int(n[1]), int(n[2]))
    img.SetSpacing(paso_mm, paso_mm, paso_mm)
    img.SetOrigin(*lo)
    arr = numpy_to_vtk(d, deep=True)
    arr.SetName("d")
    img.GetPointData().SetScalars(arr)
    mc = vtk.vtkFlyingEdges3D()
    mc.SetInputData(img)
    mc.SetValue(0, radio_mm)
    mc.ComputeNormalsOff()
    mc.Update()
    # Normales hacia fuera, como deja la segmentación sus mallas
    # (segmentation.py): el centrado de la línea usa la distancia FIRMADA a la
    # malla, y con los triángulos al revés empuja la línea fuera del vaso.
    nf = vtk.vtkPolyDataNormals()
    nf.SetInputConnection(mc.GetOutputPort())
    nf.SplittingOff(); nf.ConsistencyOn(); nf.AutoOrientNormalsOn()
    nf.Update()
    out = vtk.vtkPolyData()
    out.DeepCopy(nf.GetOutput())
    return out


def fantoma(nombre: str, eje: np.ndarray, radio_mm: float, curvatura: float, torsion: float) -> Fantoma:
    return Fantoma(nombre, eje, radio_mm, curvatura, torsion, tubo(eje, radio_mm))


def catalogo() -> list[Fantoma]:
    """Los fantomas de la prueba: calibres y curvaturas de arterias intracraneales."""
    a, b = 8.0, 3.0
    return [
        fantoma("recta Ø3", recta(40.0), 1.5, 0.0, 0.0),
        fantoma("arco R12 Ø3", arco(12.0, 180.0), 1.5, 1 / 12.0, 0.0),
        fantoma("arco R6 Ø2", arco(6.0, 200.0), 1.0, 1 / 6.0, 0.0),
        fantoma("hélice a8 b3 Ø3", helice(a, b, 1.5), 1.5, a / (a * a + b * b), b / (a * a + b * b)),
        fantoma("hélice a5 b4 Ø4", helice(5.0, 4.0, 1.25), 2.0, 5.0 / 41.0, 4.0 / 41.0),
    ]
