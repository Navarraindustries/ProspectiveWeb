import numpy as np
import vtk
from eval.synthetic import (bifurcacion_con_saco_apical, bifurcacion_sin_saco, saco_en_borde,
                            tubo, tubo_con_saco, tubo_curvo_sin_saco, tubo_mas_isla)


def _n_components(poly):
    c = vtk.vtkPolyDataConnectivityFilter(); c.SetInputData(poly); c.SetExtractionModeToAllRegions(); c.Update()
    return c.GetNumberOfExtractedRegions()


def _open_edge_mm(poly):
    fe = vtk.vtkFeatureEdges(); fe.SetInputData(poly); fe.BoundaryEdgesOn(); fe.FeatureEdgesOff()
    fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    out = fe.GetOutput(); total = 0.0
    for i in range(out.GetNumberOfCells()):
        ids = out.GetCell(i).GetPointIds()
        a = np.array(out.GetPoint(ids.GetId(0))); b = np.array(out.GetPoint(ids.GetId(1)))
        total += float(np.linalg.norm(a - b))
    return total


def test_cada_generador_da_una_malla_triangulada_no_vacia():
    for poly in (tubo_con_saco()[0], bifurcacion_sin_saco(), tubo_curvo_sin_saco(),
                 saco_en_borde()[0], tubo_mas_isla(), bifurcacion_con_saco_apical()[0]):
        assert poly.GetNumberOfPoints() > 100 and poly.GetNumberOfPolys() > 100


def test_la_isla_es_un_componente_aparte_y_la_bifurcacion_uno_solo():
    assert _n_components(tubo_mas_isla()) == 2
    assert _n_components(bifurcacion_sin_saco()) == 1
    assert _n_components(bifurcacion_con_saco_apical()[0]) == 1


def test_el_borde_cortado_tiene_aristas_abiertas_y_el_tubo_cerrado_no():
    assert _open_edge_mm(saco_en_borde()[0]) > 3.0
    assert _open_edge_mm(tubo()) < 1e-6


def test_el_saco_en_borde_esta_pegado_al_tubo_cortado():
    poly, _ = saco_en_borde()
    assert _n_components(poly) == 1
    assert _open_edge_mm(poly) > 3.0
    assert poly.GetBounds()[3] < 20.5


def test_el_saco_declarado_esta_sobre_la_malla():
    for poly, saco in (tubo_con_saco(), saco_en_borde(), bifurcacion_con_saco_apical()):
        pts = np.array([poly.GetPoint(i) for i in range(poly.GetNumberOfPoints())])
        assert np.linalg.norm(pts - np.array(saco), axis=1).min() < 3.5


def test_el_tubo_admite_otro_eje():
    pts = tubo(largo=20.0, eje="x")
    b = pts.GetBounds()
    assert b[1] - b[0] > 15 and b[3] - b[2] < 5
