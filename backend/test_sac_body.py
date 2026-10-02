"""El cuerpo del saco sin las partes finas pegadas (services/sac_body.py).

Una esfera de 5 mm con un tubo de 0,6 mm que sale 4 mm: el Ø máximo se mide
hasta la punta del tubo y el del cuerpo no. Sin tubo, los dos coinciden y no
hay aviso. Las cifras de las dos sesiones reales están en el docstring del
servicio: 8,69 frente a ~5 (avisa), 8,37 frente a 7,3 (no).
"""
from __future__ import annotations

import pytest
import vtk

from services.sac_body import sac_body


def _superficie(funcion, lado=12.0, n=121):
    """Una sola superficie cerrada a partir de una función implícita: así la
    unión es de verdad y no dos mallas solapadas (que el relleno por paridad
    convierte en un agujero donde se cruzan)."""
    m = vtk.vtkSampleFunction(); m.SetImplicitFunction(funcion)
    m.SetModelBounds(-lado / 2, lado / 2, -lado / 2, lado / 2, -lado / 2, lado / 2)
    m.SetSampleDimensions(n, n, n); m.ComputeNormalsOff(); m.Update()
    c = vtk.vtkContourFilter(); c.SetInputConnection(m.GetOutputPort()); c.SetValue(0, 0.0); c.Update()
    return c.GetOutput()


def _esfera_impl(r=2.5):
    e = vtk.vtkSphere(); e.SetRadius(r); return e


def _esfera(r=2.5):
    return _superficie(_esfera_impl(r))


def _con_rama(largo=4.0, radio=0.3):
    # Cilindro a lo largo de y, cortado entre el centro y 2,5 + largo.
    cil = vtk.vtkCylinder(); cil.SetRadius(radio)
    tapa = vtk.vtkPlanes()
    pts = vtk.vtkPoints(); pts.InsertNextPoint(0, 0, 0); pts.InsertNextPoint(0, 2.5 + largo, 0)
    nor = vtk.vtkDoubleArray(); nor.SetNumberOfComponents(3)
    nor.InsertNextTuple3(0, -1, 0); nor.InsertNextTuple3(0, 1, 0)
    tapa.SetPoints(pts); tapa.SetNormals(nor)
    rama = vtk.vtkImplicitBoolean(); rama.SetOperationTypeToIntersection()
    rama.AddFunction(cil); rama.AddFunction(tapa)
    u = vtk.vtkImplicitBoolean(); u.SetOperationTypeToUnion()
    u.AddFunction(_esfera_impl()); u.AddFunction(rama)
    return _superficie(u, lado=2 * (2.5 + largo) + 2)


def test_una_rama_fina_infla_el_diametro_y_se_avisa():
    b = sac_body(_con_rama())
    assert b.full_max_mm == pytest.approx(9.0, abs=0.4)      # 2,5 + 2,5 + 4
    assert b.body_max_mm == pytest.approx(5.0, abs=0.3)
    assert b.inflated


def test_sin_ramas_no_hay_aviso():
    b = sac_body(_esfera())
    assert b.full_max_mm == pytest.approx(b.body_max_mm, abs=0.3)
    assert not b.inflated


def test_una_bleb_de_verdad_no_se_quita():
    # Un bulto de 1,6 mm de diámetro sobrevive a la apertura de 1 mm.
    b = sac_body(_con_rama(largo=1.5, radio=0.8))
    assert b.body_max_mm == pytest.approx(b.full_max_mm, abs=0.4)
    assert not b.inflated


def test_saco_vacio():
    assert sac_body(vtk.vtkPolyData()) is None
