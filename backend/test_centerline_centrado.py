"""La línea central va por dentro del vaso y por su centro (13-11).

El recorrido por dentro del vaso pone la cámara sobre la línea central. El
camino de Dijkstra va por centros de vóxel de 0,8 mm y el suavizado le cortaba
las curvas: en un vaso fino y curvo la línea salía por la pared y la cámara se
salía y volvía a entrar (Zenodo 002: 12 de 175 puntos fuera). `centrar_en_malla`
la lleva al centro del vaso en la malla.
"""
from __future__ import annotations

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk

from services.centerline import centrar_en_malla, extract_centerline

RADIO_TUBO = 0.8


def _eje_en_s(n: int = 400) -> np.ndarray:
    """Un eje en S con curvas cerradas (radio de curvatura de 3 mm en el vértice,
    como un sifón; el tubo tiene 0,8 mm de radio)."""
    z = np.linspace(0.0, 30.0, n)
    return np.column_stack([3.0 * np.sin(z / 3.0), np.zeros(n), z])


def _tubo(eje: np.ndarray, radio: float = RADIO_TUBO) -> vtk.vtkPolyData:
    pts = vtk.vtkPoints()
    pts.SetData(numpy_to_vtk(eje.astype(np.float64), deep=True))
    linea = vtk.vtkCellArray()
    linea.InsertNextCell(len(eje))
    for i in range(len(eje)):
        linea.InsertCellPoint(i)
    pd = vtk.vtkPolyData()
    pd.SetPoints(pts)
    pd.SetLines(linea)
    tubo = vtk.vtkTubeFilter()
    tubo.SetInputData(pd)
    tubo.SetRadius(radio)
    tubo.SetNumberOfSides(32)
    tubo.CappingOn()
    tubo.Update()
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(tubo.GetOutput())
    tri.Update()
    return tri.GetOutput()


def _distancia_firmada(malla: vtk.vtkPolyData, pts: np.ndarray) -> np.ndarray:
    f = vtk.vtkImplicitPolyDataDistance()
    f.SetInput(malla)
    return np.array([f.EvaluateFunction(*p) for p in pts])   # < 0 dentro


def _apartamiento_del_eje(eje: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return np.array([np.min(np.linalg.norm(eje - p, axis=1)) for p in pts])


class TestLineaPorDentroYPorElCentro:
    def test_en_un_vaso_fino_y_curvo_ningun_punto_sale_de_la_pared(self):
        eje = _eje_en_s()
        malla = _tubo(eje)
        res = extract_centerline(malla, tuple(eje[3]), tuple(eje[-4]), voxel_size_mm=0.8)
        d = _distancia_firmada(malla, res.points)
        assert (d < 0).all(), f"{int((d >= 0).sum())} puntos fuera, el peor a {d.max():+.2f} mm"

    def test_va_por_el_centro_del_vaso(self):
        eje = _eje_en_s()
        malla = _tubo(eje)
        res = extract_centerline(malla, tuple(eje[3]), tuple(eje[-4]), voxel_size_mm=0.8)
        aparte = _apartamiento_del_eje(eje, res.points)
        # Un radio de 0,8 mm: por el centro es apartarse bastante menos que eso.
        assert np.median(aparte) < 0.25 * RADIO_TUBO
        assert aparte.max() < 0.6 * RADIO_TUBO

    def test_centrar_mete_dentro_una_linea_que_corta_las_curvas(self):
        eje = _eje_en_s()
        malla = _tubo(eje)
        # La línea de antes: el eje suavizado de más, que corta las curvas.
        from scipy.ndimage import gaussian_filter1d
        cortada = np.column_stack([gaussian_filter1d(eje[::8, a], 5.0, mode="nearest") for a in range(3)])
        cortada[[0, -1]] = eje[::8][[0, -1]]
        assert (_distancia_firmada(malla, cortada) > 0).any()   # de partida se sale
        centrada = centrar_en_malla(cortada, malla)
        assert (_distancia_firmada(malla, centrada[1:-1]) < 0).all()   # los extremos no se tocan
        assert np.median(_apartamiento_del_eje(eje, centrada)) < 0.25 * RADIO_TUBO

    def test_los_extremos_no_se_mueven(self):
        eje = _eje_en_s()
        malla = _tubo(eje)
        linea = eje[::8].copy()
        centrada = centrar_en_malla(linea, malla)
        np.testing.assert_allclose(centrada[[0, -1]], linea[[0, -1]])

    def test_sin_malla_devuelve_la_linea_tal_cual(self):
        linea = _eje_en_s()[::8]
        np.testing.assert_allclose(centrar_en_malla(linea, vtk.vtkPolyData()), linea)
