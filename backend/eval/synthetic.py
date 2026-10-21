# -*- coding: utf-8 -*-
"""Vasos sintéticos compartidos.

Salen de los tests porque el banco de pruebas de la detección también los
necesita: una sola definición de cada caso, para que el test y el banco
midan sobre la misma geometría.
"""
from __future__ import annotations

import math

import numpy as np
import vtk

Vec3 = tuple[float, float, float]

SACO = np.array([0.0, 5.0, 2.2])


def limpia(poly) -> vtk.vtkPolyData:
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(poly); tri.Update()
    cl = vtk.vtkCleanPolyData(); cl.SetInputConnection(tri.GetOutputPort())
    cl.PointMergingOn(); cl.Update()
    return cl.GetOutput()


def _tubo_de_puntos(puntos, radio, res) -> vtk.vtkPolyData:
    pts = vtk.vtkPoints(); linea = vtk.vtkPolyLine()
    linea.GetPointIds().SetNumberOfIds(len(puntos))
    for i, p in enumerate(puntos):
        pts.InsertNextPoint(*p)
        linea.GetPointIds().SetId(i, i)
    ca = vtk.vtkCellArray(); ca.InsertNextCell(linea)
    pd = vtk.vtkPolyData(); pd.SetPoints(pts); pd.SetLines(ca)
    tf = vtk.vtkTubeFilter(); tf.SetInputData(pd); tf.SetRadius(radio)
    tf.SetNumberOfSides(res); tf.CappingOn(); tf.Update()
    return limpia(tf.GetOutput())


def tubo(centro=(0, 0, 0), largo=60.0, radio=1.0, segmentos=60, res=20,
         eje="y") -> vtk.vtkPolyData:
    k = {"x": 0, "y": 1, "z": 2}[eje]
    puntos = []
    for i in range(segmentos):
        t = i / (segmentos - 1)
        p = [float(centro[0]), float(centro[1]), float(centro[2])]
        p[k] += (t - 0.5) * largo
        puntos.append(p)
    return _tubo_de_puntos(puntos, radio, res)


def bola(centro, radio, res=26) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource(); s.SetCenter(*centro); s.SetRadius(radio)
    s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return limpia(s.GetOutput())


def une(*polys) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    return limpia(ap.GetOutput())


def _suelda(a, b) -> vtk.vtkPolyData:
    """Unión booleana: `une` solo apila mallas y las superficies que se
    cruzan seguirían siendo componentes distintos. Para la Y hace falta una
    única superficie conectada, como la de un vaso real."""
    f = vtk.vtkLoopBooleanPolyDataFilter()
    f.SetInputData(0, a); f.SetInputData(1, b)
    f.SetOperationToUnion(); f.Update()
    if f.GetOutput().GetNumberOfPolys() == 0:
        raise RuntimeError("la unión booleana salió vacía")
    return limpia(f.GetOutput())


def tubo_con_saco() -> tuple[vtk.vtkPolyData, Vec3]:
    """Un vaso fino de 1 mm con un saco de 3 mm pegado a media altura."""
    malla = une(tubo(radio=1.0, largo=60.0), bola((0.0, 5.0, 2.2), 3.0))
    return malla, (float(SACO[0]), float(SACO[1]), float(SACO[2]))


def _gira_z(poly, grados_z) -> vtk.vtkPolyData:
    tr = vtk.vtkTransform(); tr.RotateZ(grados_z)
    f = vtk.vtkTransformPolyDataFilter(); f.SetInputData(poly)
    f.SetTransform(tr); f.Update()
    return f.GetOutput()


def bifurcacion_sin_saco() -> vtk.vtkPolyData:
    """Una Y: tronco en y que acaba en (0,0,0) y dos ramas a ±35° en el plano xy.

    Las ramas arrancan en el origen (su extremo, no su centro) y se sueldan
    al tronco para que la Y sea un solo componente tras `limpia`.

    El tronco ACABA en la unión: si siguiera hasta y = +30 la malla tendría
    cuatro salidas y no tres, y no sería una Y. La unión se ensancha con una
    bola de 1,6 mm, como el ápice de una bifurcación real, que es más ancho
    que cada rama: es ese ensanchamiento lo que los canales de calibre leen
    como un bulto, y lo que el veto de bifurcación tiene que descartar (sin
    él los canales no proponen ningún sitio en la unión).
    """
    y = tubo(centro=(0, -15.0, 0), largo=30.0, radio=1.2)
    for grados in (35.0, -35.0):
        # Rama a lo largo de +y con su base en el origen, luego rotada.
        r = tubo(centro=(0, 12.5, 0), largo=25.0, radio=0.9)
        y = _suelda(y, _gira_z(r, grados))
    return _suelda(y, bola((0.0, 0.0, 0.0), 1.6))


def tubo_curvo_sin_saco() -> vtk.vtkPolyData:
    """Arco de 90° de radio 12 mm: la curvatura de un vaso sin lesión."""
    puntos = [(12.0 * math.cos(th), 12.0 * math.sin(th), 0.0)
              for th in np.linspace(0.0, math.pi / 2, 40)]
    return _tubo_de_puntos(puntos, 1.2, 20)


def saco_en_borde() -> tuple[vtk.vtkPolyData, Vec3]:
    """Tubo cortado sin tapa (aristas abiertas) con un saco cerca del corte.

    Es el caso que engaña al detector: un borde abierto parece un cuello.
    El vaso se ensancha (2,2 mm de radio) justo antes del corte, como uno que
    el borde del volumen corta en un bulbo: la boca abierta queda con una
    cúpula detrás y la curvatura la propone (centroide en y ≈ 19, a 9 mm del
    saco). Sin ese ensanchamiento ningún canal propone nada en el extremo
    abierto y el veto de borde no tendría a quién descartar.
    """
    pl = vtk.vtkPlane(); pl.SetOrigin(0, 20, 0); pl.SetNormal(0, -1, 0)
    centro = (0.0, 10.0, 2.2)
    # Se suelda el saco al tubo cerrado y después se corta: la unión booleana
    # exige mallas cerradas y el corte deja el borde abierto.
    malla = _suelda(tubo(largo=60.0, radio=1.0), bola(centro, 3.0))
    # Tramo grueso de y = 19 a 27: el corte en y = 20 deja 1 mm de él.
    malla = _suelda(malla, tubo(centro=(0, 23.0, 0), largo=8.0, radio=2.2))
    cl = vtk.vtkClipPolyData()
    cl.SetInputData(malla)
    cl.SetClipFunction(pl); cl.Update()  # sin InsideOut: se queda y < 20, donde está el saco
    return limpia(cl.GetOutput()), centro


def tubo_mas_isla() -> vtk.vtkPolyData:
    """Tubo y una bola suelta: un componente que no es vaso.

    La isla es una bola tosca (26 vértices, 1,4 % de la malla): un resto de
    segmentación es una fracción pequeña del árbol, y el veto de isla mide
    justo eso (`ISLAND_FRAC` = 2 %). Con una esfera fina era un tercio de los
    vértices y no se distinguía de un árbol pequeño.
    """
    return une(tubo(largo=60.0, radio=1.0, res=30), bola((15.0, 0.0, 0.0), 1.5, res=6))


def bifurcacion_con_saco_apical() -> tuple[vtk.vtkPolyData, Vec3]:
    """La Y con un saco pegado en su ápice, el sitio típico de un aneurisma."""
    centro = (0.0, 3.5, 0.0)
    return _suelda(bifurcacion_sin_saco(), bola(centro, 2.5)), centro
