# -*- coding: utf-8 -*-
"""El calibre de la arteria madre, que alimenta el Size Ratio.

Dos errores del port, medidos en IM_0055 (SR 13,2 con una arteria madre de
0,7 mm): la posición del cuello se aplicaba en el marco del árbol entero y no
en el del saco, y de cada corte se quedaba el contorno más grande de TODO el
árbol, no el que está junto al cuello.

Lo que esto NO arregla: el método supone que la arteria madre sigue el eje del
aneurisma (aneurisma de punta). En uno lateral los planos cortan el vaso a lo
largo y el calibre sale corto; sin una medida de los médicos no hay con qué
validar un método alternativo.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk

from services.parent_artery import estimate_parent_artery_diameter, neck_point_on_axis


def _tubo(centro, radio, largo, eje="z"):
    ln = vtk.vtkLineSource()
    c = np.asarray(centro, float)
    d = {"z": np.array([0, 0, 1.0]), "x": np.array([1.0, 0, 0])}[eje] * largo / 2
    ln.SetPoint1(*(c - d)); ln.SetPoint2(*(c + d)); ln.SetResolution(int(largo / 0.5))
    tf = vtk.vtkTubeFilter(); tf.SetInputConnection(ln.GetOutputPort())
    tf.SetRadius(radio); tf.SetNumberOfSides(32); tf.CappingOn()
    tr = vtk.vtkTriangleFilter(); tr.SetInputConnection(tf.GetOutputPort()); tr.Update()
    return tr.GetOutput()


def _une(*ps):
    ap = vtk.vtkAppendPolyData()
    for p in ps:
        ap.AddInputData(p)
    ap.Update()
    return ap.GetOutput()


@pytest.fixture()
def punta():
    """Arteria madre de Ø 3 mm que sube por z y termina en z = 0 (el cuello),
    y un vaso de Ø 8 mm a 30 mm que los mismos planos también cortan."""
    madre = _tubo((0, 0, -15), 1.5, 30)
    lejano = _tubo((30, 0, -15), 4.0, 30)
    return _une(madre, lejano)


def test_mide_la_arteria_junto_al_cuello_y_no_la_mas_gruesa(punta):
    d = estimate_parent_artery_diameter(punta, (0, 0, 0), (0, 0, 1), neck_mm=3.0)
    assert d == pytest.approx(3.0, abs=0.3)


def test_sin_vaso_cerca_del_cuello_no_inventa_un_calibre():
    solo_lejano = _tubo((30, 0, -15), 4.0, 30)
    assert estimate_parent_artery_diameter(solo_lejano, (0, 0, 0), (0, 0, 1), 3.0) == 0.0


def test_la_posicion_del_cuello_es_del_saco_no_del_arbol():
    # Un saco de z = 0 a z = 6: la fracción 0 es su base, en z = 0, aunque el
    # árbol baje hasta z = −30. Antes 0 caía en el extremo del árbol.
    s = vtk.vtkSphereSource(); s.SetCenter(0, 0, 3); s.SetRadius(3); s.Update()
    p = neck_point_on_axis(s.GetOutput(), (0, 0, 3), (0, 0, 1), 0.0)
    assert np.allclose(p, (0, 0, 0), atol=0.05)
    p = neck_point_on_axis(s.GetOutput(), (0, 0, 3), (0, 0, 1), 0.5)
    assert np.allclose(p, (0, 0, 3), atol=0.05)
