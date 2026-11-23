"""La dirección de la arteria madre en el plano del cuello: la de las palas del clip.

En Case 3 (22-11) el clip se añadía con giro 0 —la rotación mínima de su eje al
del cuello— y sus palas cruzaban la basilar en vez de seguirla.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk

from services.parent_artery import parent_direction_in_plane, search_radius


def test_el_radio_va_con_la_arteria_madre_no_con_el_cuello():
    # Case 3 (23-11): con un cuello de 1,35 mm el radio era 4 mm y la dirección
    # salía a 59° de la basilar; con 8–12 mm, a 2–6°.
    assert search_radius(1.35, 4.5) == pytest.approx(9.0)
    assert search_radius(1.35) == pytest.approx(8.0)          # sin calibre medido
    assert search_radius(12.0, 3.0) == pytest.approx(15.0)    # tope
    assert search_radius(4.0, 3.0) == pytest.approx(8.0)


def _malla(*funciones, limites=(-12, 12, -12, 12, -12, 12), n=72) -> vtk.vtkPolyData:
    union = vtk.vtkImplicitBoolean()
    union.SetOperationTypeToUnion()
    for f in funciones:
        union.AddFunction(f)
    muestra = vtk.vtkSampleFunction()
    muestra.SetImplicitFunction(union)
    muestra.SetModelBounds(*limites)
    muestra.SetSampleDimensions(n, n, n)
    muestra.ComputeNormalsOff()
    contorno = vtk.vtkContourFilter()
    contorno.SetInputConnection(muestra.GetOutputPort())
    contorno.SetValue(0, 0.0)
    contorno.Update()
    return contorno.GetOutput()


def _cilindro(eje, centro=(0.0, 0.0, 0.0), r=1.5):
    c = vtk.vtkCylinder()
    c.SetRadius(r)
    c.SetCenter(*centro)
    c.SetAxis(*eje)
    return c


def _esfera(centro, r):
    s = vtk.vtkSphere()
    s.SetCenter(*centro)
    s.SetRadius(r)
    return s


def _paralelo(d, ref) -> float:
    return abs(float(np.dot(d, np.asarray(ref, float) / np.linalg.norm(ref))))


def test_lateral_las_palas_siguen_el_tronco():
    # Tronco a lo largo de X por debajo del cuello (z = 0), saco hacia +Z.
    vaso = _malla(_cilindro((1, 0, 0), centro=(0, 0, -2.0)), _esfera((0, 0, 3.0), 3.0))
    d = parent_direction_in_plane(vaso, (0, 0, 0), (0, 0, 1), neck_mm=3.0)
    assert d is not None
    assert _paralelo(d, (1, 0, 0)) > 0.95
    assert abs(float(d[2])) < 1e-6                     # en el plano del cuello


def test_cuello_pequeno_con_rama_fina_junto_al_cuello():
    # Tronco grueso a lo largo de X y una rama fina que baja a lo largo de Y
    # pegada al cuello: con el radio del cuello (4 mm) mandaba la rama.
    tronco = _cilindro((1, 0, 0), centro=(0, 0, -3.0), r=2.2)
    rama = _cilindro((0, 1, 0), centro=(0, 0, -1.2), r=0.6)
    corte = vtk.vtkPlane(); corte.SetOrigin(0, 4.5, 0); corte.SetNormal(0, 1, 0)
    rama_corta = vtk.vtkImplicitBoolean()
    rama_corta.SetOperationTypeToIntersection()
    rama_corta.AddFunction(rama); rama_corta.AddFunction(corte)
    vaso = _malla(tronco, rama_corta, _esfera((0, 0, 2.5), 2.5), n=96)
    d = parent_direction_in_plane(vaso, (0, 0, 0), (0, 0, 1), neck_mm=1.35, parent_mm=4.4)
    assert d is not None
    assert _paralelo(d, (1, 0, 0)) > 0.95


def test_eje_del_cuello_oblicuo():
    # El mismo caso girado: la dirección sale proyectada en el plano oblicuo.
    eje = np.array([0.0, 0.5, 1.0]); eje /= np.linalg.norm(eje)
    vaso = _malla(_cilindro((1, 0, 0), centro=tuple(-2.0 * eje)), _esfera(tuple(3.0 * eje), 3.0))
    d = parent_direction_in_plane(vaso, (0, 0, 0), tuple(eje), neck_mm=3.0)
    assert d is not None
    assert abs(float(np.dot(d, eje))) < 1e-6
    assert _paralelo(d, (1, 0, 0)) > 0.95


def test_bifurcacion_sigue_la_linea_de_las_ramas():
    # Tronco que llega de frente (−Z) y dos ramas a lo largo de Y: las palas van
    # paralelas a las ramas, que es la línea de cierre en una punta basilar.
    tronco = _cilindro((0, 0, 1), centro=(0, 0, 0), r=1.6)
    recorte = vtk.vtkPlane(); recorte.SetOrigin(0, 0, -1.5); recorte.SetNormal(0, 0, 1)
    tronco_abajo = vtk.vtkImplicitBoolean()
    tronco_abajo.SetOperationTypeToIntersection()
    tronco_abajo.AddFunction(tronco); tronco_abajo.AddFunction(recorte)
    ramas = _cilindro((0, 1, 0), centro=(0, 0, -2.0), r=1.2)
    vaso = _malla(tronco_abajo, ramas, _esfera((0, 0, 3.0), 3.0))
    d = parent_direction_in_plane(vaso, (0, 0, 0), (0, 0, 1), neck_mm=3.0)
    assert d is not None
    assert _paralelo(d, (0, 1, 0)) > 0.95


def test_sin_eje_claro_no_orienta():
    # Solo el tronco llegando de frente: en el plano no hay dirección.
    tronco = _cilindro((0, 0, 1), r=1.6)
    recorte = vtk.vtkPlane(); recorte.SetOrigin(0, 0, 0); recorte.SetNormal(0, 0, 1)
    abajo = vtk.vtkImplicitBoolean()
    abajo.SetOperationTypeToIntersection()
    abajo.AddFunction(tronco); abajo.AddFunction(recorte)
    vaso = _malla(abajo, _esfera((0, 0, 3.0), 3.0))
    assert parent_direction_in_plane(vaso, (0, 0, 0), (0, 0, 1), neck_mm=3.0) is None


@pytest.mark.parametrize("vaso", [None, vtk.vtkPolyData()])
def test_sin_malla(vaso):
    assert parent_direction_in_plane(vaso, (0, 0, 0), (0, 0, 1), neck_mm=3.0) is None
