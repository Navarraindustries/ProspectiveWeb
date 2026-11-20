"""La distancia firmada que sustituye a vtkImplicitPolyDataDistance (VTK 9.6.1
se cae con SimpleITK cargado; ver services/distancia_malla.py)."""
from __future__ import annotations

import numpy as np
import pytest
import SimpleITK  # noqa: F401 — el fallo de VTK aparecía con SimpleITK cargado
import vtk

from services.distancia_malla import DistanciaFirmada

R = 5.0


def _esfera(invertida: bool = False) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetRadius(R); s.SetThetaResolution(96); s.SetPhiResolution(96)
    s.Update()
    malla = s.GetOutput()
    if invertida:
        rev = vtk.vtkReverseSense(); rev.SetInputData(malla); rev.ReverseCellsOn(); rev.ReverseNormalsOn()
        rev.Update()
        malla = rev.GetOutput()
    out = vtk.vtkPolyData(); out.DeepCopy(malla)
    return out


@pytest.mark.parametrize("invertida", [False, True], ids=["hacia fuera", "hacia dentro"])
def test_distancia_y_signo_de_una_esfera(invertida):
    d = DistanciaFirmada(_esfera(invertida))
    rng = np.random.default_rng(0)
    pts = rng.uniform(-9, 9, (500, 3))
    teor = np.linalg.norm(pts, axis=1) - R
    got = np.array([d.EvaluateFunction(*p) for p in pts])
    # La esfera es un poliedro: dentro de la tolerancia de su teselado.
    assert np.abs(got - teor).max() < 0.02
    assert d.EvaluateFunction(0.0, 0.0, 0.0) < 0
    assert d.EvaluateFunction((0.0, 0.0, 9.0)) > 0          # también con una terna


def test_gradiente_hacia_fuera():
    d = DistanciaFirmada(_esfera())
    g = [0.0, 0.0, 0.0]
    for p in ([2.0, 0.0, 0.0], [0.0, 7.0, 0.0], np.array([0.0, 0.0, -3.0])):
        d.EvaluateGradient(p, g)
        radial = np.asarray(p, dtype=float) / np.linalg.norm(p)
        assert np.dot(g, radial) > 0.99


def test_malla_vacia_no_rompe():
    d = DistanciaFirmada(vtk.vtkPolyData())
    assert d.EvaluateFunction(1.0, 2.0, 3.0) == 0.0


def test_muchas_evaluaciones_lejos_sin_caerse():
    """El patrón que tumbaba el proceso con vtkImplicitPolyDataDistance:
    una malla de decenas de miles de triángulos y puntos lejos de ella."""
    s = vtk.vtkSphereSource(); s.SetRadius(R); s.SetThetaResolution(180); s.SetPhiResolution(180); s.Update()
    d = DistanciaFirmada(s.GetOutput())
    rng = np.random.default_rng(1)
    g = [0.0, 0.0, 0.0]
    for p in rng.uniform(-40, 40, (20000, 3)):
        d.EvaluateFunction(*p)
        d.EvaluateGradient(p, g)
