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

from services.approach import _segments_along_ray, _vessel_locator
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
