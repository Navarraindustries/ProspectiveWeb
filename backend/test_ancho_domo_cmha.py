"""P17: las definiciones de ancho de `ancho_domo_cmha.py`, con cortes y un saco sintéticos."""
import math

import numpy as np
import pytest
import vtk

from scripts.ancho_domo_cmha import cuerda_mayor, medir_corte, medir_saco


def _elipse(a: float, b: float, n: int = 720) -> np.ndarray:
    t = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)
    return np.column_stack([a * np.cos(t), b * np.sin(t)])


def test_en_un_circulo_todas_las_definiciones_dan_el_diametro():
    m = medir_corte(_elipse(3.0, 3.0), np.array([1.0, 0.0]))
    assert all(v == pytest.approx(6.0, rel=1e-3) for v in m.values())


def test_en_una_elipse_el_hidraulico_queda_entre_los_dos_feret():
    m = medir_corte(_elipse(4.0, 2.0), np.array([1.0, 0.0]))
    assert (m["feret_max"], m["feret_min"]) == pytest.approx((8.0, 4.0), rel=1e-3)
    assert (m["dir_cuello"], m["perp_cuello"]) == pytest.approx((8.0, 4.0), rel=1e-3)
    assert m["d_area"] == pytest.approx(2.0 * math.sqrt(8.0), rel=1e-3)
    perimetro = math.pi * (3 * 6.0 - math.sqrt((3 * 4.0 + 2.0) * (4.0 + 3 * 2.0)))  # Ramanujan
    assert m["d_hidraulico"] == pytest.approx(4.0 * math.pi * 8.0 / perimetro, rel=1e-3)
    assert m["feret_min"] < m["d_hidraulico"] < m["d_area"] < m["feret_max"]


def test_un_corte_degenerado_no_se_mide():
    assert medir_corte(np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]), np.array([1.0, 0.0])) is None


def test_cuerda_mayor_de_una_elipse():
    direccion, largo = cuerda_mayor(_elipse(4.0, 2.0, 360))
    assert largo == pytest.approx(8.0, rel=1e-3) and abs(direccion[0]) == pytest.approx(1.0, abs=1e-3)


def test_saco_mas_ancho_que_su_cuello():
    # Esfera de radio 5 abierta por z = -3: cuello de radio 4 y domo de diámetro 10.
    s = vtk.vtkSphereSource()
    s.SetRadius(5.0)
    s.SetThetaResolution(96)
    s.SetPhiResolution(96)
    s.Update()
    plano = vtk.vtkPlane()
    plano.SetOrigin(0, 0, -3)
    plano.SetNormal(0, 0, 1)
    corte = vtk.vtkClipPolyData()
    corte.SetInputConnection(s.GetOutputPort())
    corte.SetClipFunction(plano)
    limpio = vtk.vtkCleanPolyData()
    limpio.SetInputConnection(corte.GetOutputPort())
    limpio.Update()
    m = medir_saco(limpio.GetOutput())
    assert m["d_hidraulico"] == pytest.approx(10.0, rel=0.01) and m["feret_max"] == pytest.approx(10.0, rel=0.01)
    assert m["cuello_d_hidraulico"] == pytest.approx(8.0, rel=0.01)
    assert m["altura"] == pytest.approx(8.0, rel=0.01) and m["bajo_el_plano_mm"] < 0.05
