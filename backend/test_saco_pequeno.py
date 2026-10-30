# -*- coding: utf-8 -*-
"""Canal de «saco pequeño» con cuota del 5.º puesto (29-10, informe §4.20).

Los sacos de 3–5 mm forman región propia con la curvatura de una esfera, pero el
orden por área del canal de curvatura los deja detrás del tope o en los puestos
11–40. El canal los ordena por forma y el consenso les reserva el 5.º puesto si no
hay ninguno entre los 5. No vota ni cuenta como familia: con puestos propios
repartía (126 y 154 perdían el 1.º). Aquí se fija el mecanismo, no la cifra.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_saco_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest

from services.aneurysm_consensus import (CH_CALIBRE, CH_CURVATURE, CH_SACO, ConsensusHit,
                                         _apply_small_sac_quota, _family_ranks, hit_confidence,
                                         order_hits)
from services.aneurysm_detector import AneurysmDetector
from test_consensus_and_plane import _bola, _tubo, _une
from test_paso3_detector import GRANDE, PEQUENA, _cerca, _detector


@pytest.fixture(scope="module")
def vaso_con_dos_sacos():
    return _une(_tubo(radio=1.0, largo=70.0), _bola(GRANDE, 3.5, res=40), _bola(PEQUENA, 1.8, res=40))


class TestElPresetYElDetector:
    def test_el_preset_de_tc_lo_lleva_y_el_de_xa_no(self):
        from routers.detect import _detector_for_modality
        ct = _detector_for_modality("CT")
        assert ct.small_sac_channel and ct.small_sac_quota == 5
        assert not _detector_for_modality("XA").small_sac_channel
        assert not AneurysmDetector().small_sac_channel

    def test_el_canal_elige_por_forma_y_radio(self, vaso_con_dos_sacos):
        det = _detector("area")
        det.min_gauss_curvature = 1.0 / 36.0
        assert det.detect(vaso_con_dos_sacos).small_sacs == []      # apagado por defecto
        det.small_sac_channel = True
        res = det.detect(vaso_con_dos_sacos)
        assert any(_cerca(c, PEQUENA) for c in res.small_sacs)       # esfera de 1,8 mm: saco pequeño
        det.small_sac_r_max = 2.5                                    # con el radio tope por debajo de 3,5, la grande no
        res = det.detect(vaso_con_dos_sacos)
        assert any(_cerca(c, PEQUENA) for c in res.small_sacs)
        assert not any(_cerca(c, GRANDE) for c in res.small_sacs)
        for c in res.small_sacs:                                     # todos con curvatura de esfera y forma
            assert 0.7 <= c.mean_curvature * c.radius_mm <= 1.3
            assert c.sphericity >= 0.6 and c.compactness >= 0.3 and c.positive_gauss_frac >= 0.7


def _hit(x, **ranks):
    return ConsensusHit(position=(float(x), 0.0, 0.0), ranks=ranks)


class TestLaCuotaNoVota:
    def test_el_canal_no_entra_en_el_orden_ni_en_las_familias(self):
        solo_saco = _hit(0, saco=1)
        calibre = _hit(50, calibre=3)
        assert solo_saco.best_rank == 10_000 and calibre.best_rank == 3
        assert order_hits([solo_saco, calibre])[0] is calibre          # el 1.º del canal va detrás
        mixto = _hit(100, calibre=2, saco=1)
        assert _family_ranks(mixto) == {"grosor": 2}                     # el saco no es una familia más
        assert _family_ranks(solo_saco) == {"saco": 1}                   # salvo que sea el único canal
        assert 0.0 < hit_confidence(solo_saco) < hit_confidence(_hit(1, curvatura=1))

    def test_la_cuota_garantiza_el_quinto_puesto(self):
        ordered = [_hit(i, curvatura=i) for i in range(1, 8)] + [_hit(20, saco=1)]
        out = _apply_small_sac_quota(ordered, 5)
        assert CH_SACO in out[4].ranks                                   # el mejor del canal pasa al 5.º
        assert [h.ranks.get(CH_CURVATURE) for h in out[:4]] == [1, 2, 3, 4]
        assert [h.ranks.get(CH_CURVATURE) for h in out[5:]] == [5, 6, 7]  # los de detrás bajan uno
        ya_dentro = [_hit(1, curvatura=1), _hit(2, curvatura=2, saco=1)] + [_hit(i, curvatura=i) for i in range(3, 8)]
        assert _apply_small_sac_quota(ya_dentro, 5) == ya_dentro          # ya hay uno entre los 5: nada cambia
        assert _apply_small_sac_quota(ordered, 0) == ordered              # cuota 0: apagada
        sin_saco = [_hit(i, curvatura=i) for i in range(1, 8)]
        assert _apply_small_sac_quota(sin_saco, 5) == sin_saco

    def test_el_consenso_aplica_la_cuota_solo_con_el_canal(self, vaso_con_dos_sacos):
        from services.aneurysm_consensus import consensus
        det = _detector("area")
        det.min_gauss_curvature = 1.0 / 36.0
        det.small_sac_channel = True
        det.small_sac_quota = 1          # cuota al 1.º: el mejor saco pequeño va primero
        det.small_sac_r_max = 2.5        # solo la esfera pequeña es «saco pequeño»
        hits = consensus(vaso_con_dos_sacos, det, top=5)
        assert CH_SACO in hits[0].ranks and np.linalg.norm(np.asarray(hits[0].position) - PEQUENA) < 4.0
        det.small_sac_channel = False
        hits = consensus(vaso_con_dos_sacos, det, top=5)
        assert all(CH_SACO not in h.ranks for h in hits)                # sin el canal, nadie lleva la etiqueta
