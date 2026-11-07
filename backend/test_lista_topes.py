"""Lista combinada de varios topes de curvatura (07-11).

Un cambio del 2,5 % en el tope de la copia de curvatura movía hasta diez
lesiones dentro y fuera de los 5 en los 172 de Zenodo. `combine_caps` junta
las listas de varios topes y ordena por el puesto mediano; `_detect_hits` lo
hace solo si el detector trae `curvature_caps`.
"""
from __future__ import annotations

import pytest

import services.aneurysm_consensus as ac
from services.aneurysm_consensus import (CH_CALIBRE, CH_CURVATURE, ConsensusHit,
                                         combine_caps)
from eval.synthetic import bola, tubo, une


def _hit(x, diam=2.0, y=0.0):
    return ConsensusHit(position=(float(x), float(y), 0.0), ranks={CH_CALIBRE: 1},
                        radius_mm=diam / 2.0)


def _pos(hits):
    return [h.position[0] for h in hits]


class TestCombineCaps:
    def test_un_solo_tope_deja_la_lista_igual(self):
        a = [_hit(0), _hit(20), _hit(40)]
        assert combine_caps([a], absent=41) == a

    def test_el_mismo_sitio_en_tres_topes_es_un_grupo(self):
        a, b, c = [_hit(0), _hit(20)], [_hit(1), _hit(21)], [_hit(0.5), _hit(20.5)]
        out = combine_caps([a, b, c], absent=41)
        assert len(out) == 2 and _pos(out) == [0, 20]

    def test_ordena_por_la_mediana_no_por_la_media(self):
        # X: puestos 1, 1 y ausente (41): mediana 1, media 14,3.
        # Y: puestos 2, 2, 1: mediana 2, media 1,7.
        x = lambda: _hit(0)
        y = lambda: _hit(50)
        out = combine_caps([[x(), y()], [x(), y()], [y()]], absent=41)
        assert _pos(out) == [0, 50]

    def test_a_igual_mediana_gana_el_mejor_puesto(self):
        # Q (0): 1, 3, 1 → mediana 1. X (100): 2, 2, 3 → mediana 2, mejor 2.
        # Y (200): 3, 1, 2 → mediana 2, mejor 1: pasa delante de X aunque
        # X se vio antes.
        a = [_hit(0), _hit(100), _hit(200)]
        b = [_hit(200), _hit(100), _hit(0)]
        c = [_hit(0), _hit(200), _hit(100)]
        out = combine_caps([a, b, c], absent=41)
        assert _pos(out) == [0, 200, 100]

    def test_representa_al_grupo_el_sitio_de_mejor_puesto(self):
        a = [_hit(50), _hit(0.0)]       # puesto 2
        b = [_hit(1.0)]                 # puesto 1
        out = combine_caps([a, b], absent=41)
        assert out[0] is b[0]

    def test_cada_tope_aporta_un_sitio_por_grupo(self):
        # Dos sitios del mismo tope a 2 mm no se funden entre sí.
        out = combine_caps([[_hit(0), _hit(2)]], absent=41)
        assert len(out) == 2

    def test_el_radio_es_el_diametro_con_suelo_de_5_mm(self):
        lejos = combine_caps([[_hit(0, diam=2)], [_hit(7, diam=2)]], absent=41)
        assert len(lejos) == 2                       # 7 mm > 5 mm
        grande = combine_caps([[_hit(0, diam=12)], [_hit(7, diam=2)]], absent=41)
        assert len(grande) == 1                      # 7 mm ≤ 12 mm

    def test_se_junta_con_el_mas_cercano(self):
        out = combine_caps([[_hit(0), _hit(6)], [_hit(4)]], absent=41)
        # El de 4 mm está a 4 del primero y a 2 del segundo: va con el segundo,
        # lo representa (puesto 1 frente a 2) y ese grupo pasa delante
        # (mediana 1,5 frente a 21).
        assert _pos(out) == [4, 0]


class TestCurvatureCaps:
    def test_vacio_es_un_tope(self):
        import routers.detect as rd
        det = rd._detector_for_modality("CT")
        assert det.curvature_caps == ""
        assert rd._curvature_caps(det) == []

    def test_lee_y_ordena(self):
        import routers.detect as rd
        det = rd._detector_for_modality("CT")
        det.curvature_caps = "82000, 78000,80000"
        assert rd._curvature_caps(det) == [78000, 80000, 82000]

    def test_rechaza_basura(self):
        import routers.detect as rd
        det = rd._detector_for_modality("CT")
        det.curvature_caps = "78,80"
        with pytest.raises(ValueError):
            rd._curvature_caps(det)

    def test_el_banco_lo_pasa_como_texto(self):
        from scripts.bench_detector import build_detector
        det = build_detector("CT", ["curvature_caps=78000,80000,82000"])
        assert det.curvature_caps == "78000,80000,82000"


class TestDetectHits:
    def _malla(self):
        return une(tubo(radio=1.0, largo=60.0), bola((0.0, 0.0, 30.0), 3.0, res=40))

    def test_sin_topes_una_pasada_con_el_tope_de_siempre(self, monkeypatch):
        import routers.detect as rd
        vistos = []

        def falso(poly, modality, detector, session_id, top, volume, cap, shared=None):
            vistos.append((cap, top))
            return [_hit(0)], type("R", (), {})()

        monkeypatch.setattr(rd, "_detect_hits_cap", falso)
        det = rd._detector_for_modality("CT")
        hits, res = rd._detect_hits(self._malla(), "CT", det, top=5)
        assert vistos == [(rd._CURVATURE_MAX_VERTS, 5)]
        assert res.head_crop is not None

    def test_con_tres_topes_combina_con_la_lista_larga(self, monkeypatch):
        import routers.detect as rd
        vistos, compartidos = [], []
        listas = {78000: [_hit(0), _hit(50)], 80000: [_hit(50), _hit(0)],
                  82000: [_hit(50), _hit(100)]}
        resultados = {c: type("R", (), {"cap": c})() for c in listas}

        def falso(poly, modality, detector, session_id, top, volume, cap, shared=None):
            vistos.append((cap, top))
            compartidos.append(shared)
            return list(listas[cap]), resultados[cap]

        monkeypatch.setattr(rd, "_detect_hits_cap", falso)
        det = rd._detector_for_modality("CT")
        det.curvature_caps = "80000,82000,78000"
        hits, res = rd._detect_hits(self._malla(), "CT", det, top=2)
        assert vistos == [(78000, rd._CAPS_LONG), (80000, rd._CAPS_LONG), (82000, rd._CAPS_LONG)]
        assert compartidos[0] is compartidos[1] is compartidos[2]
        # 50: puestos 2, 1, 1 → mediana 1. 0: 1, 2, 41 → mediana 2.
        assert _pos(hits) == [50, 0]
        assert res.cap == 80000                       # diagnósticos del tope central

    def test_la_copia_gruesa_se_hace_una_vez(self, monkeypatch):
        import routers.detect as rd
        import services.segmentation as seg
        llamadas = []
        real = seg.decimate_to_edge

        def espia(*a, **k):
            llamadas.append(1)
            return real(*a, **k)

        monkeypatch.setattr(seg, "decimate_to_edge", espia)
        monkeypatch.setattr(ac, "consensus", lambda poly, detector, top=5, **kw: [_hit(0, diam=4)])
        det = rd._detector_for_modality("CT")
        det.curvature_caps = "78000,80000,82000"
        hits, _ = rd._detect_hits(self._malla(), "CT", det, top=5)
        assert len(llamadas) == 1
        assert len(hits) == 1
