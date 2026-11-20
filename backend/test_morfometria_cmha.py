"""O2: lectura del cuello y cierre de un saco abierto, con una semiesfera sintética."""
import math

import numpy as np
import pytest
import vtk

from scripts.morfometria_cmha import area_y_volumen, borde_mayor, comparar, medir_lazo, tapar

R = 5.0


def _semiesfera() -> vtk.vtkPolyData:
    """Media esfera de radio R, abierta por el plano z = 0 y con el domo hacia +z."""
    s = vtk.vtkSphereSource()
    s.SetRadius(R)
    s.SetThetaResolution(96)
    s.SetPhiResolution(96)
    s.Update()
    plano = vtk.vtkPlane()
    plano.SetNormal(0, 0, 1)
    corte = vtk.vtkClipPolyData()
    corte.SetInputConnection(s.GetOutputPort())
    corte.SetClipFunction(plano)
    limpio = vtk.vtkCleanPolyData()
    limpio.SetInputConnection(corte.GetOutputPort())
    limpio.Update()
    return limpio.GetOutput()


def test_el_borde_abierto_es_el_cuello():
    lazo = borde_mayor(_semiesfera())
    cuello = medir_lazo(lazo, np.array([0.0, 0.0, R]))
    assert cuello["perimetro"] == pytest.approx(2 * math.pi * R, rel=0.01)
    assert cuello["area"] == pytest.approx(math.pi * R**2, rel=0.01)
    assert cuello["d_eq"] == pytest.approx(2 * R, rel=0.01)
    assert cuello["normal"] == pytest.approx([0, 0, 1], abs=0.01)  # hacia el domo
    assert cuello["origen"] == pytest.approx([0, 0, 0], abs=0.05)


def test_tapar_deja_el_volumen_de_media_esfera():
    area, volumen = area_y_volumen(tapar(_semiesfera()))
    assert volumen == pytest.approx(2 / 3 * math.pi * R**3, rel=0.02)
    assert area == pytest.approx(3 * math.pi * R**2, rel=0.02)  # casquete + tapa
    assert len(borde_mayor(tapar(_semiesfera()))) == 0


def test_una_malla_cerrada_no_tiene_cuello():
    s = vtk.vtkSphereSource()
    s.Update()
    assert len(borde_mayor(s.GetOutput())) == 0


def test_comparar_ignora_ceros_y_mide_el_sesgo():
    c = comparar([1.1, 2.2, 3.3, 0.0, 4.4], [1.0, 2.0, 3.0, 5.0, 4.0])
    assert c["n"] == 4
    assert c["cociente_mediano"] == pytest.approx(1.1)
    assert c["dif_relativa_mediana"] == pytest.approx(0.1)
    assert c["r"] == pytest.approx(1.0)
