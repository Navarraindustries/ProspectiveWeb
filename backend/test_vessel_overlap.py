"""Choque = lo que entra en otro vaso, no lo que roza (devices.vessel_overlap).

En Case 3 (23-11), con las palas paralelas a la basilar —la orientación
correcta— el cruce de superficies daba 233 «contactos» y el panel decía
«Choca», sin que ningún vértice del clip entrase en la arteria.
"""
from __future__ import annotations

import vtk

from services.devices import vessel_overlap


def _cubo(centro, lados) -> vtk.vtkPolyData:
    c = vtk.vtkCubeSource()
    c.SetCenter(*centro)
    c.SetXLength(lados[0]); c.SetYLength(lados[1]); c.SetZLength(lados[2])
    c.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(c.GetOutput()); tri.Update()
    return tri.GetOutput()


def _tubo(r, largo, eje="x", centro=(0.0, 0.0, 0.0)) -> vtk.vtkPolyData:
    s = vtk.vtkCylinderSource()
    s.SetRadius(r); s.SetHeight(largo); s.SetResolution(48); s.CappingOn(); s.Update()
    t = vtk.vtkTransform()
    t.Translate(*centro)
    if eje == "x":
        t.RotateZ(90)                      # el cilindro de VTK va por Y
    tf = vtk.vtkTransformPolyDataFilter(); tf.SetInputData(s.GetOutput()); tf.SetTransform(t); tf.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(tf.GetOutput()); tri.Update()
    return tri.GetOutput()


ARTERIA = _tubo(2.0, 30.0, "x")                  # tronco Ø 4 por el eje X, techo en z = 2


def test_una_hoja_a_ras_de_la_pared_no_choca():
    hoja = _cubo((0, 0, 2.6), (12, 1.0, 1.0))        # su cara inferior a 0,1 mm de la pared
    assert vessel_overlap(ARTERIA, hoja) == 0


def test_rozando_la_pared_tampoco():
    hoja = _cubo((0, 0, 2.4), (12, 1.0, 1.0))        # 0,1 mm dentro de la pared
    assert vessel_overlap(ARTERIA, hoja) == 0


def test_hundida_en_la_arteria_choca():
    hoja = _cubo((0, 0, 1.0), (12, 1.0, 1.0))
    assert vessel_overlap(ARTERIA, hoja) > 100


def test_cruzar_una_rama_fina_choca():
    rama = _tubo(0.5, 20.0, "y", centro=(4.0, 0.0, 5.0))   # Ø 1 mm
    hoja = _cubo((4.0, 0.0, 5.0), (1.0, 1.0, 6.0))         # la atraviesa
    assert vessel_overlap(rama, hoja) > 0


def test_la_esfera_del_cuello_no_cuenta():
    hoja = _cubo((0, 0, 1.0), (3.0, 1.0, 1.0))             # hundida, pero dentro del cuello
    assert vessel_overlap(ARTERIA, hoja, exclude_center=(0, 0, 1.5), exclude_radius_mm=4.0) == 0
    assert vessel_overlap(ARTERIA, hoja) > 0
