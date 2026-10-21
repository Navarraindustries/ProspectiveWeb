# backend/test_candidate_vetoes.py
import numpy as np
import pytest
import vtk
from eval.synthetic import (bifurcacion_con_saco_apical, bifurcacion_sin_saco, saco_en_borde,
                            tubo, tubo_con_saco, tubo_curvo_sin_saco, tubo_mas_isla, bola, _suelda)
from routers.detect import _detect_hits, _detector_for_modality
from services.aneurysm_consensus import hit_patch
from services.candidate_vetoes import (NECK_RATIO, component_fraction, crossing_count, evaluate, neck_ratio,
                                       open_edge_length_mm, veto_bifurcation, veto_border, veto_island, veto_shape)


def _hits(poly):
    det = _detector_for_modality("XA")
    hits, _ = _detect_hits(poly, "XA", det, top=30)
    return [(h, *hit_patch(poly, h)) for h in hits]


def _nearest(hits, pt, within=8.0):
    best = min(hits, key=lambda t: np.linalg.norm(np.array(t[0].position) - pt))
    assert np.linalg.norm(np.array(best[0].position) - pt) < within
    return best


class TestBorde:
    def test_el_extremo_cortado_se_veta_y_el_saco_pegado_al_borde_no(self):
        poly, saco = saco_en_borde()
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.array(saco))
        assert veto_border(poly, h, patch) is None
        cortado = [t for t in hits if t[0].position[1] > 17.0]
        assert cortado and veto_border(poly, *cortado[0][:2]) is not None
        assert veto_border(poly, *cortado[0][:2]).reason == "borde"

    def test_un_tubo_cerrado_no_tiene_aristas_abiertas(self):
        assert open_edge_length_mm(tubo()) < 1e-6


class TestIsla:
    def test_la_bola_suelta_se_veta_y_el_tubo_no(self):
        poly = tubo_mas_isla()
        frac_isla, mayor = component_fraction(poly, (15.0, 0.0, 0.0))
        assert frac_isla < 0.02 and not mayor
        frac_tubo, mayor_t = component_fraction(poly, (0.0, 0.0, 1.0))
        assert mayor_t
        hits = _hits(poly)
        h, patch, _ = _nearest(hits, np.array([15.0, 0.0, 0.0]), within=4.0)
        assert veto_island(poly, h, patch).reason == "isla"

    def test_un_arbol_pequeno_de_un_solo_componente_no_se_veta(self):
        # Soldado, no `une`: `une` solo apila mallas y el tubo y la bola
        # quedarían como dos componentes, el del punto (el tubo) el menor.
        poly = _suelda(tubo(largo=6.0, radio=1.0, segmentos=6, res=8), bola((0, 1.5, 1.2), 1.4, res=10))
        frac, mayor = component_fraction(poly, (0.0, 1.5, 1.2))
        assert mayor and frac == pytest.approx(1.0)


class TestBifurcacion:
    def test_la_union_sin_saco_tiene_tres_salidas_y_se_veta(self):
        poly = bifurcacion_sin_saco()
        assert crossing_count(poly, (0.0, 0.0, 0.0), 4.0) >= 3
        assert crossing_count(tubo(), (0.0, 0.0, 0.0), 4.0) == 2
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.zeros(3), within=6.0)
        assert veto_bifurcation(poly, h, patch) is not None

    def test_el_saco_en_el_apice_no_se_veta(self):
        poly, saco = bifurcacion_con_saco_apical()
        hits = _hits(poly)
        h, patch, kind = _nearest(hits, np.array(saco))
        assert veto_bifurcation(poly, h, patch) is None


class TestForma:
    def test_el_saco_tiene_cuello_y_la_curva_no(self):
        poly, saco = tubo_con_saco()
        h, patch, kind = _nearest(_hits(poly), np.array(saco))
        if kind == "region":
            assert neck_ratio(patch) < 0.85 and veto_shape(poly, h, patch, kind) is None
        curva = tubo_curvo_sin_saco()
        for h, patch, kind in _hits(curva):
            if kind == "region":
                assert veto_shape(curva, h, patch, kind) is not None

    def test_veto_shape_directo_tubo_semiesfera_y_disco(self):
        """Sin pasar por el detector: un trozo de tubo es «forma»; un
        casquete (media bola) y un disco plano no."""
        class _H:
            position = (0.0, 0.0, 0.0); radius_mm = 1.2; candidate = None

        trozo = tubo(largo=8.0, radio=1.2)
        assert neck_ratio(trozo) >= NECK_RATIO
        v = veto_shape(trozo, _H(), trozo, "region")
        assert v is not None and v.reason == "forma" and v.label == "No es sacular"

        pl = vtk.vtkPlane(); pl.SetOrigin(0, 0, 0); pl.SetNormal(0, 0, 1)
        cl = vtk.vtkClipPolyData(); cl.SetInputData(bola((0, 0, 0), 3.0)); cl.SetClipFunction(pl); cl.Update()
        casquete = cl.GetOutput()
        assert neck_ratio(casquete) < NECK_RATIO
        assert veto_shape(casquete, _H(), casquete, "region") is None

        disco = vtk.vtkDiskSource(); disco.SetInnerRadius(0.0); disco.SetOuterRadius(3.0)
        disco.SetCircumferentialResolution(32); disco.SetRadialResolution(4); disco.Update()
        tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(disco.GetOutputPort()); tri.Update()
        plano = tri.GetOutput()
        assert neck_ratio(plano) is None
        assert veto_shape(plano, _H(), plano, "region") is None
        # Y un localizador nunca se juzga por su forma.
        assert veto_shape(trozo, _H(), trozo, "locator") is None

    def test_un_parche_vacio_o_minimo_no_lanza(self):
        vacio = vtk.vtkPolyData()
        poly, _ = tubo_con_saco()
        h = _hits(poly)[0][0]
        assert neck_ratio(vacio) is None
        assert veto_shape(poly, h, vacio, "region") is None
        assert veto_bifurcation(poly, h, vacio) is None
        assert veto_border(poly, h, vacio) is None


def test_evaluate_respeta_el_orden_y_devuelve_el_primero():
    poly, _ = saco_en_borde()
    hits = _hits(poly)
    cortado = [t for t in hits if t[0].position[1] > 17.0][0]
    v = evaluate(poly, cortado[0], cortado[1], cortado[2])
    assert v is not None and v.reason == "borde" and v.label == "Recorte de la malla"
