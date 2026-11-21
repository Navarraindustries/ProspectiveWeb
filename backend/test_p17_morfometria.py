"""P17: elipticidad, no esfericidad y diámetros como en la literatura.

O2 comparó la morfometría con las medidas de expertos de CMHA (Song 2024) y
encontró tres índices mal definidos:

- NSI (Raghavan 2005) = 1 − (18π)^⅓·V^⅔/S, con S el área del saco SIN la tapa
  del cuello: la constante normaliza a una semiesfera abierta, que da 0. Con
  esa fórmula el NSI de CMHA sale idéntico en los 100 sacos de O2.
- EI (Raghavan 2005) = lo mismo sobre la envolvente convexa del saco. Antes la
  app daba como EI la fórmula del NSI sobre el saco tapado.
- El diámetro máximo era el lado mayor de la caja alineada a los ejes: cambiaba
  al girar el estudio. Ahora el tamaño es la mayor distancia entre dos puntos
  del saco, y el DNR y el BF usan el ancho del domo paralelo al cuello
  (Brinjikji 2009, Hoh 2007), que es el Dmax de CMHA: el mayor diámetro
  hidráulico 4·A/P de los cortes paralelos al cuello (O2, 21-11).

Todo con mallas sintéticas de resultado conocido.
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import vtk

from services.morphometrics import MorphometricAnalyzer


def _limpia(poly: vtk.vtkPolyData) -> vtk.vtkPolyData:
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(tri.GetOutputPort())
    clean.Update()
    return clean.GetOutput()


def _semiesfera_tapada(r: float = 3.0, res: int = 80) -> vtk.vtkPolyData:
    """Semiesfera z ≥ 0 cerrada por su disco en z = 0 (el cuello)."""
    s = vtk.vtkSphereSource()
    s.SetRadius(r)
    s.SetThetaResolution(res)
    s.SetPhiResolution(res)
    plano = vtk.vtkPlane()
    plano.SetOrigin(0.0, 0.0, 0.0)
    plano.SetNormal(0.0, 0.0, 1.0)
    clip = vtk.vtkClipPolyData()
    clip.SetInputConnection(s.GetOutputPort())
    clip.SetClipFunction(plano)
    fill = vtk.vtkFillHolesFilter()
    fill.SetInputConnection(clip.GetOutputPort())
    fill.SetHoleSize(1e6)
    fill.Update()
    return _limpia(fill.GetOutput())


def _cilindro_tapado(radio: float = 2.0, alto: float = 8.0) -> vtk.vtkPolyData:
    """Cilindro sobre el eje Y, de y = 0 (cuello) a y = alto."""
    c = vtk.vtkCylinderSource()
    c.SetRadius(radio)
    c.SetHeight(alto)
    c.SetResolution(64)
    c.SetCenter(0.0, alto / 2.0, 0.0)
    c.CappingOn()
    c.Update()
    return _limpia(c.GetOutput())


def _elipsoide(semiejes=(2.0, 3.0, 6.0), giro=(0.0, 0.0, 0.0)) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(1.0)
    s.SetThetaResolution(60)
    s.SetPhiResolution(60)
    t = vtk.vtkTransform()
    t.RotateX(giro[0])
    t.RotateY(giro[1])
    t.RotateZ(giro[2])
    t.Scale(*semiejes)
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputConnection(s.GetOutputPort())
    f.SetTransform(t)
    f.Update()
    return _limpia(f.GetOutput())


def _con_cuello(poly, origen, normal, d_cuello):
    return MorphometricAnalyzer().analyze(
        poly, neck_plane=(np.asarray(origen, float), np.asarray(normal, float), d_cuello))


# ── NSI y EI de Raghavan ───────────────────────────────────────────────── #

def test_la_semiesfera_tiene_no_esfericidad_cero():
    m = _con_cuello(_semiesfera_tapada(3.0), (0, 0, 0), (0, 0, 1), 6.0)
    assert m.reliable
    assert m.non_sphericity_idx == pytest.approx(0.0, abs=0.02)


def test_la_semiesfera_tiene_elipticidad_cero():
    m = _con_cuello(_semiesfera_tapada(3.0), (0, 0, 0), (0, 0, 1), 6.0)
    assert m.ellipticity_index == pytest.approx(0.0, abs=0.02)


def test_el_nsi_usa_el_area_sin_la_tapa_del_cuello():
    """Cilindro r 2, alto 8: V = 32π; S sin el disco del cuello = 32π + 4π."""
    m = _con_cuello(_cilindro_tapado(2.0, 8.0), (0, 0, 0), (0, 1, 0), 4.0)
    v, s_abierta = 32 * math.pi, 36 * math.pi
    esperado = 1 - (18 * math.pi) ** (1 / 3) * v ** (2 / 3) / s_abierta
    assert m.non_sphericity_idx == pytest.approx(esperado, abs=0.01)


def test_en_un_saco_convexo_la_elipticidad_es_igual_a_la_no_esfericidad():
    """La envolvente convexa de un saco convexo es el propio saco."""
    m = _con_cuello(_cilindro_tapado(2.0, 8.0), (0, 0, 0), (0, 1, 0), 4.0)
    assert m.ellipticity_index == pytest.approx(m.non_sphericity_idx, abs=0.01)
    assert m.ellipticity_index > 0.1


# ── Tamaño: mayor distancia entre dos puntos ─────────────────────────── #

@pytest.mark.parametrize("giro", [(0, 0, 0), (45, 0, 0), (30, 50, 20)])
def test_el_diametro_maximo_no_depende_de_la_orientacion(giro):
    m = MorphometricAnalyzer().analyze(_elipsoide((2.0, 3.0, 6.0), giro))
    assert m.max_diameter_mm == pytest.approx(12.0, rel=0.01)


def test_el_diametro_maximo_es_la_mayor_distancia_del_saco():
    """En el cilindro 4 × 8 la mayor distancia es la diagonal, √(8² + 4²)."""
    m = _con_cuello(_cilindro_tapado(2.0, 8.0), (0, 0, 0), (0, 1, 0), 4.0)
    assert m.max_diameter_mm == pytest.approx(math.hypot(8.0, 4.0), rel=0.01)


# ── Ancho del domo paralelo al cuello: DNR y BF ──────────────────────── #

def test_el_ancho_del_domo_se_mide_paralelo_al_cuello():
    m = _con_cuello(_cilindro_tapado(2.0, 8.0), (0, 0, 0), (0, 1, 0), 4.0)
    assert m.dome_width_mm == pytest.approx(4.0, rel=0.01)


def test_dnr_y_bf_son_el_ancho_del_domo_entre_el_cuello():
    m = _con_cuello(_cilindro_tapado(2.0, 8.0), (0, 0, 0), (0, 1, 0), 4.0)
    assert m.dome_to_neck_ratio == pytest.approx(1.0, rel=0.02)
    assert m.bottleneck_factor == pytest.approx(1.0, rel=0.02)
    assert m.aspect_ratio == pytest.approx(2.0, rel=0.02)


def test_el_ancho_del_domo_de_la_semiesfera_es_su_diametro():
    m = _con_cuello(_semiesfera_tapada(3.0), (0, 0, 0), (0, 0, 1), 6.0)
    assert m.dome_width_mm == pytest.approx(6.0, rel=0.02)


def _cilindro_eliptico(a: float = 4.0, b: float = 2.0, alto: float = 8.0) -> vtk.vtkPolyData:
    """Cilindro de sección elíptica (semiejes a en X, b en Z) de y = 0 a y = alto."""
    t = vtk.vtkTransform()
    t.Scale(a / b, 1.0, 1.0)
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(_cilindro_tapado(b, alto))
    f.SetTransform(t)
    f.Update()
    return _limpia(f.GetOutput())


def test_el_ancho_del_domo_es_el_diametro_hidraulico_del_corte():
    """El Dmax de CMHA es 4·área/perímetro del corte paralelo al cuello, el
    mayor entre cortes (O2, 21-11: cociente 1,000 en los 105 sacos; el Feret
    salía un 19,6 % mayor). En una elipse 8 × 4 el Feret es 8 y 4·A/P ≈ 5,19."""
    a, b = 4.0, 2.0
    m = _con_cuello(_cilindro_eliptico(a, b), (0, 0, 0), (0, 1, 0), 2 * math.sqrt(a * b))
    perimetro = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))  # Ramanujan
    assert m.dome_width_mm == pytest.approx(4 * math.pi * a * b / perimetro, rel=0.02)


def test_el_ancho_del_domo_se_busca_en_toda_la_altura():
    """Esfera r 5 cortada en z = −3: cuello de Ø 8 y domo de Ø 10 a media altura.
    El máximo no está en el primer corte: obliga a que cada corte se recalcule."""
    s = vtk.vtkSphereSource()
    s.SetRadius(5.0)
    s.SetThetaResolution(96)
    s.SetPhiResolution(96)
    plano = vtk.vtkPlane()
    plano.SetOrigin(0.0, 0.0, -3.0)
    plano.SetNormal(0.0, 0.0, 1.0)
    clip = vtk.vtkClipPolyData()
    clip.SetInputConnection(s.GetOutputPort())
    clip.SetClipFunction(plano)
    fill = vtk.vtkFillHolesFilter()
    fill.SetInputConnection(clip.GetOutputPort())
    fill.SetHoleSize(1e6)
    fill.Update()
    m = _con_cuello(_limpia(fill.GetOutput()), (0, 0, -3), (0, 0, 1), 8.0)
    assert m.dome_width_mm == pytest.approx(10.0, rel=0.01)
    assert m.dome_to_neck_ratio == pytest.approx(10.0 / 8.0, rel=0.02)


def test_el_ancho_del_domo_no_depende_del_giro_dentro_del_plano():
    """Girar el saco alrededor del eje del cuello no cambia el ancho."""
    t = vtk.vtkTransform()
    t.RotateY(37.0)
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(_cilindro_eliptico())
    f.SetTransform(t)
    f.Update()
    quieto = _con_cuello(_cilindro_eliptico(), (0, 0, 0), (0, 1, 0), 2 * math.sqrt(8))
    girado = _con_cuello(f.GetOutput(), (0, 0, 0), (0, 1, 0), 2 * math.sqrt(8))
    assert girado.dome_width_mm == pytest.approx(quieto.dome_width_mm, rel=0.01)
