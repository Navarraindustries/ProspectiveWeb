"""Los rayos contra la malla tienen que ver la malla, y no tumbar el proceso.

Con VTK 9.7.0, vtkOBBTree.IntersectWithLine no devolvía ningún cruce (ni con
una esfera), y con una malla del tamaño del Caso 3 a resolución completa
escribía fuera de memoria: el worker de uvicorn moría sin traza al pulsar
«Sugerir corredor». Estas pruebas usan una esfera de ese tamaño (unas 180 000
caras, la que abortaba el OBB) y comprueban los cruces que espera el cálculo.
"""
import numpy as np
import pytest
import vtk

from services.approach import (_segments_along_ray, _vessel_locator,
                               distinct_hit_distances)
from services.followup import _inside_parity


@pytest.fixture(scope="module")
def esfera() -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(5.0)
    s.SetThetaResolution(300)
    s.SetPhiResolution(300)
    s.Update()
    return s.GetOutput()


def test_el_rayo_que_cruza_la_esfera_ve_un_tramo_del_diametro(esfera):
    loc = _vessel_locator(esfera)
    p0 = np.array([-10.0, 0.1, 0.2])
    tramos = _segments_along_ray(loc, p0, np.array([10.0, 0.1, 0.2]))
    assert len(tramos) == 1
    t0, t1 = tramos[0]
    assert t0 == pytest.approx(5.0, abs=0.05)
    assert t1 - t0 == pytest.approx(10.0, abs=0.05)


def test_el_rayo_que_pasa_de_largo_no_ve_nada(esfera):
    loc = _vessel_locator(esfera)
    assert _segments_along_ray(loc, np.array([-10.0, 8.0, 0.0]),
                               np.array([10.0, 8.0, 0.0])) == []


def test_muchos_rayos_seguidos_sobre_el_mismo_localizador(esfera):
    # La caída del Caso 3 llegaba en el rayo 73 de un mismo árbol, no en el
    # primero: se repite el patrón de la primera pasada de propose_corridors.
    loc = _vessel_locator(esfera)
    rng = np.random.default_rng(0)
    for d in rng.normal(size=(200, 3)):
        d /= np.linalg.norm(d)
        tramos = _segments_along_ray(loc, d * 20.0, np.zeros(3))
        assert len(tramos) == 1


def test_dentro_y_fuera_por_paridad(esfera):
    dentro = _inside_parity(np.array([[0.0, 0.0, 0.0], [30.0, 0.0, 0.0],
                                      [1.0, 1.0, 1.0]]), esfera)
    assert dentro.tolist() == [True, False, True]


# El localizador de celdas da un impacto por celda: un rayo que pasa justo por
# un vértice o una arista compartidos lo cuenta una vez por cada triángulo que
# lo toca (64 en el polo de una esfera de 32×32). Sin descartarlos, el tramo de
# dentro se partía en tramos de longitud cero y la paridad podía invertirse.

def test_el_rayo_por_el_polo_de_la_esfera_ve_un_solo_tramo():
    s = vtk.vtkSphereSource()
    s.SetRadius(5.0)
    s.SetThetaResolution(32)
    s.SetPhiResolution(32)
    s.Update()
    esfera_polo = s.GetOutput()
    tramos = _segments_along_ray(_vessel_locator(esfera_polo),
                                 np.array([0.0, 0.0, -10.0]), np.array([0.0, 0.0, 10.0]))
    assert len(tramos) == 1
    t0, t1 = tramos[0]
    assert t0 == pytest.approx(5.0, abs=1e-6)
    assert t1 - t0 == pytest.approx(10.0, abs=1e-6)
    # Un punto dentro, sobre el eje de los polos: dos de los tres rayos de la
    # paridad no pasan por el polo, pero ninguno debe dar par por duplicados.
    assert _inside_parity(np.array([[0.0, 0.0, 0.0], [0.0, 0.0, 9.0]]),
                          esfera_polo).tolist() == [True, False]
    # Un rayo de la paridad que sale justo por un vértice de la malla: seis
    # triángulos lo tocan, un número PAR de impactos que, sin fundirlos, diría
    # «fuera» desde un punto que está dentro. La votación a tres lo tapa, pero
    # un solo voto no debe salir cambiado.
    from services.followup import _RAYS
    vertice = np.array(esfera_polo.GetPoint(esfera_polo.FindPoint([3.954, 0.0, 3.061])))
    p = vertice - 2.0 * _RAYS[0]
    hits = vtk.vtkPoints()
    _vessel_locator(esfera_polo).IntersectWithLine(
        p.tolist(), (p + 30.0 * _RAYS[0]).tolist(), 0.0, hits, vtk.vtkIdList())
    assert hits.GetNumberOfPoints() % 2 == 0
    assert len(distinct_hit_distances(hits, p)) == 1
    assert _inside_parity(np.array([p]), esfera_polo).tolist() == [True]


def _cubo() -> vtk.vtkPolyData:
    c = vtk.vtkCubeSource()
    c.SetXLength(10.0)
    c.SetYLength(10.0)
    c.SetZLength(10.0)
    tri = vtk.vtkTriangleFilter()
    tri.SetInputConnection(c.GetOutputPort())
    tri.Update()
    return tri.GetOutput()


def test_el_rayo_por_un_vertice_del_cubo_ve_un_solo_tramo():
    cubo = _cubo()
    # La diagonal entra por un vértice y sale por el opuesto: en cada uno se
    # tocan varios triángulos.
    p0 = np.array([-10.0, -10.0, -10.0])
    tramos = _segments_along_ray(_vessel_locator(cubo), p0, np.array([10.0, 10.0, 10.0]))
    assert len(tramos) == 1
    t0, t1 = tramos[0]
    assert t0 == pytest.approx(5.0 * 3 ** 0.5, abs=1e-6)
    assert t1 - t0 == pytest.approx(10.0 * 3 ** 0.5, abs=1e-6)


def test_paridad_desde_el_vertice_del_cubo():
    cubo = _cubo()
    # Puntos sobre la diagonal: los rayos de la paridad que salgan por un
    # vértice o una arista no deben contarlo dos veces.
    from services.followup import _RAYS
    # Este punto está dentro y el primer rayo de la paridad sale del cubo
    # exactamente por la esquina (5, 5, 5), donde se tocan varios triángulos.
    esquina = np.array([5.0, 5.0, 5.0]) - 2.0 * _RAYS[0]
    dentro = _inside_parity(np.array([[0.0, 0.0, 0.0], esquina,
                                      [6.0, 6.0, 6.0]]), cubo)
    assert dentro.tolist() == [True, True, False]
    # Y ese rayo, solo, cruza la malla una vez: impar, dentro.
    loc = _vessel_locator(cubo)
    hits = vtk.vtkPoints()
    loc.IntersectWithLine(esquina.tolist(), (esquina + 40.0 * _RAYS[0]).tolist(),
                          0.0, hits, vtk.vtkIdList())
    assert hits.GetNumberOfPoints() > 1
    assert len(distinct_hit_distances(hits, esquina)) == 1
