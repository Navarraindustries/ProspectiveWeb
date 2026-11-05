# -*- coding: utf-8 -*-
"""Dos escalas de curvatura en TC (04-11).

La copia fina (la de siempre) conserva los sacos pequeños; una copia a arista
fija de 0,71 mm pone 1.º los grandes. Los 2 primeros de la gruesa que miden
≥ 12 mm van delante de la lista fina. Calibre y cociente se calculan UNA vez.
Aquí se fija el mecanismo, no la cifra (ver el preset de TC en routers/detect.py).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_dos_escalas_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest

import services.aneurysm_consensus as ac
from services.aneurysm_consensus import (CH_CALIBRE, CH_CURVATURE, ConsensusHit,
                                         consensus, promote_coarse)
from services.aneurysm_detector import AneurysmDetector
from services.segmentation import decimate_to_edge, surface_area_mm2
from eval.synthetic import bola, tubo, une


def _hit(x, diam, **ranks):
    return ConsensusHit(position=(float(x), 0.0, 0.0), ranks=ranks or {CH_CALIBRE: 1},
                        radius_mm=diam / 2.0)


class TestPreset:
    def test_solo_tc_lleva_la_escala_gruesa(self):
        from routers.detect import _detector_for_modality
        ct = _detector_for_modality("CT")
        assert ct.coarse_edge_mm == pytest.approx(0.71)
        assert ct.coarse_promote_min_mm == 12.0 and ct.coarse_promote_top == 2
        assert not _detector_for_modality("XA").coarse_edge_mm
        assert AneurysmDetector().coarse_edge_mm is None


class TestPromoteCoarse:
    def test_un_saco_grande_de_la_gruesa_sube_con_el_sitio_de_la_fina(self):
        fina = [_hit(0, 4), _hit(30, 14), _hit(60, 5)]
        gruesa = [_hit(32, 18)]
        out = promote_coarse(fina, gruesa, min_diameter_mm=12, top=2)
        assert out[0] is fina[1]               # el sitio de la fina, con su región
        assert out[1:] == [fina[0], fina[2]]   # el resto, en su orden

    def test_un_sitio_pequeno_de_la_gruesa_no_mueve_nada(self):
        fina = [_hit(0, 4), _hit(30, 14)]
        out = promote_coarse(fina, [_hit(30, 8)], min_diameter_mm=12, top=2)
        assert out == fina

    def test_solo_cuentan_los_primeros_de_la_gruesa(self):
        fina = [_hit(0, 4), _hit(30, 14)]
        gruesa = [_hit(100, 3), _hit(120, 4), _hit(30, 20)]
        assert promote_coarse(fina, gruesa, min_diameter_mm=12, top=2) == fina

    def test_un_saco_que_la_fina_no_tiene_entra_y_quita_su_duplicado(self):
        fina = [_hit(0, 4), _hit(50, 5)]
        nuevo = _hit(200, 15)
        out = promote_coarse(fina, [nuevo, _hit(5, 13)], min_diameter_mm=12, top=2)
        assert out[0] is nuevo and out[1] is fina[0] and out[2] is fina[1]
        assert len(out) == 3


class TestDecimateToEdge:
    def test_la_densidad_sale_del_area(self):
        malla = bola((0.0, 0.0, 0.0), 10.0, res=120)
        n = malla.GetNumberOfPoints()
        area = surface_area_mm2(malla)
        copia = decimate_to_edge(malla, 1.0, 10_000_000)
        objetivo = area / 1.0
        assert copia.GetNumberOfPoints() < n
        assert copia.GetNumberOfPoints() == pytest.approx(objetivo, rel=0.15)

    def test_no_engorda_ni_pasa_del_tope(self):
        malla = bola((0.0, 0.0, 0.0), 10.0, res=30)
        assert decimate_to_edge(malla, 0.01, 10_000_000) is malla   # ya es más gruesa
        copia = decimate_to_edge(bola((0.0, 0.0, 0.0), 10.0, res=120), 0.05, 2_000)
        assert copia.GetNumberOfPoints() <= 2_000 * 1.05


class TestCacheDeCalibre:
    def test_la_segunda_llamada_no_recalcula_el_calibre(self, monkeypatch):
        malla = une(tubo(radio=1.0, largo=60.0), bola((0.0, 0.0, 30.0), 3.0, res=40))
        llamadas = []
        real = ac.local_calibre

        def espia(poly):
            llamadas.append(1)
            return real(poly)

        monkeypatch.setattr(ac, "local_calibre", espia)
        monkeypatch.setattr(ac, "_geometric_channels_apply", lambda geo, tree: True)
        det = AneurysmDetector()
        cache: dict = {}
        a = consensus(malla, det, top=10, geometric_cache=cache)
        b = consensus(malla, det, top=10, geometric_cache=cache)
        sin = consensus(malla, det, top=10)
        assert len(llamadas) == 2                       # la 1.ª y la sin caché
        key = lambda hs: [(tuple(round(v, 3) for v in h.position), sorted(h.ranks.items())) for h in hs]
        assert key(a) == key(b) == key(sin)


class TestDetectHits:
    def test_la_escala_gruesa_repite_el_consenso_y_sube_los_grandes(self, monkeypatch):
        import routers.detect as rd
        malla = une(tubo(radio=1.0, largo=60.0), bola((0.0, 0.0, 30.0), 3.0, res=40))
        fina = [_hit(0, 4, **{CH_CURVATURE: 1}), _hit(30, 14, **{CH_CURVATURE: 2})]
        gruesa = [_hit(31, 16, **{CH_CURVATURE: 1})]
        vistas = []

        def falso(poly, detector, top=5, **kw):
            vistas.append(kw.get("geometric_cache"))
            return list(fina if len(vistas) == 1 else gruesa)

        monkeypatch.setattr(ac, "consensus", falso)
        det = rd._detector_for_modality("CT")
        hits, _ = rd._detect_hits(malla, "CT", det, top=5)
        assert len(vistas) == 2 and vistas[0] is vistas[1]   # la misma caché de calibre
        assert hits[0] is fina[1]

        vistas.clear()
        det.coarse_edge_mm = 0.0                              # apagada: una sola pasada
        hits, _ = rd._detect_hits(malla, "CT", det, top=5)
        assert len(vistas) == 1 and hits == fina
