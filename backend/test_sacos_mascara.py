# -*- coding: utf-8 -*-
"""Fase 7 de la máscara vascular: los sacos que la recuperación no alcanza.

La recuperación (fase 5) devuelve lo de M0 a ≤ 3 mm del tubo y conectado a él.
Un saco grande con cuello estrecho, trombo parcial o volumen parcial en el
cuello no cumple ninguna de las dos y se queda fuera del modelo (Zenodo 026:
un saco de 50 mm, macizo, a 3,1 mm de la máscara, con el 2 % de sus puntos en
la malla). La regla de sacos abre el resto 1,5 mm, se queda con los núcleos de
≥ 5 mm de diámetro equivalente, los reconstruye y los pega si están a ≤ 5 mm
de la máscara y no son lámina. Medida a nativo en 026 (2 → 49 %), 024 (4 → 35 %)
y en tres controles (0 bolas); aquí se comprueba sobre fantasmas.

Con la banda de la cabeza (factor > 1) la pasada gruesa decide los sacos sobre
el volumen entero y las baldosas nativas sólo miran las bolas que sus semillas
(la máscara gruesa) tocan: mirar todo el resto de cada baldosa costaba 12 s por
baldosa sin cambiar nada (Zenodo 010: 286 → 802 s).
"""
from __future__ import annotations

import numpy as np

from services.band_refine import refine_in_band
from services.vascular_mask import MaskParams, build_vascular_mask
from test_vascular_mask import SEMILLA, _sphere
from test_vesselness import SP, synthetic_tube

SHAPE = (64, 64, 96)


def _tubo_y_bola(gap_mm: float, radius_mm: float = 6.0, shape=SHAPE, sp=SP):
    """Tubo de 2 mm de radio por z y una bola suelta a `gap_mm` de su pared, en +x.

    Bola de 12 mm: la apertura es una caja de 1,5 mm de semilado, que a una
    esfera le quita unos 2,6 mm de radio (1,5 · √3); a una de 10 mm le deja un
    núcleo justo en el límite de los 5 mm de diámetro equivalente (medido: 123
    vóxeles frente a 128 a 0,8 mm). La regla ve bolas de unos 11 mm en adelante.
    """
    vol = synthetic_tube(shape=shape, spacing=sp, radius_mm=2.0)
    cx = shape[2] // 2 + int(round((2.0 + gap_mm + radius_mm) / sp[2]))
    bola = _sphere(shape, sp, (shape[0] // 2, shape[1] // 2, cx), radius_mm, 1000.0)
    return np.maximum(vol, bola), bola > 0


def _mascara(vol, sp=SP, **kw):
    return build_vascular_mask(vol, sp, MaskParams(lower=500.0, seed_min_mm3=SEMILLA, **kw))


class TestBolaSuelta:
    def test_una_bola_grande_a_2_mm_del_tubo_entra(self):
        vol, bola = _tubo_y_bola(gap_mm=2.0)
        sin = _mascara(vol, sac_min_d_mm=0.0)
        con = _mascara(vol)
        # Sin la fase, la bola es otro componente de M0 y la recuperación no la trae.
        assert sin.mask[bola].mean() < 0.05
        assert con.mask[bola].mean() > 0.9
        assert con.stats["sac_blobs"] == 1 and con.stats["sac_vox"] > 0
        assert con.mask[32, 32, 48]                     # el tubo sigue ahí

    def test_una_bola_a_8_mm_no_entra(self):
        vol, bola = _tubo_y_bola(gap_mm=8.0)
        r = _mascara(vol)
        assert r.mask[bola].mean() < 0.05
        assert r.stats["sac_blobs"] == 0 and r.stats["sac_vox"] == 0

    def test_una_bola_pequena_no_cuenta(self):
        # 1,5 mm de radio: la apertura de 1,5 mm la borra entera; y aunque
        # sobreviviera, no llega a los 5 mm de diámetro equivalente.
        vol, bola = _tubo_y_bola(gap_mm=2.0, radius_mm=1.5)
        r = _mascara(vol)
        assert r.mask[bola].mean() < 0.05
        assert r.stats["sac_blobs"] == 0

    def test_el_alcance_manda(self):
        vol, bola = _tubo_y_bola(gap_mm=4.0)
        assert _mascara(vol, sac_reach_mm=3.0).mask[bola].mean() < 0.05
        assert _mascara(vol, sac_reach_mm=5.0).mask[bola].mean() > 0.9


class TestNoCambiaLoDemas:
    def test_un_tubo_solo_no_gana_nada(self):
        vol = synthetic_tube(shape=SHAPE, radius_mm=2.0)
        con = _mascara(vol)
        sin = _mascara(vol, sac_min_d_mm=0.0)
        assert con.stats["sac_blobs"] == 0
        assert np.array_equal(con.mask, sin.mask)

    def test_apagada_reproduce_la_mascara_anterior(self):
        vol, _ = _tubo_y_bola(gap_mm=2.0)
        a = _mascara(vol, sac_min_d_mm=0.0)
        b = _mascara(vol, sac_reach_mm=0.0)
        assert np.array_equal(a.mask, b.mask)
        assert a.stats["sac_blobs"] == 0 and a.stats["sac_vox"] == 0

    def test_las_stats_llevan_las_claves_nuevas_tambien_sin_semillas(self):
        vol = np.zeros(SHAPE, np.float32)
        vol[30:34, 30:34, 30:34] = 1000.0            # algo de M0, sin troncos
        r = _mascara(vol)
        assert r.fallback
        assert r.stats["sac_blobs"] == 0 and r.stats["sac_vox"] == 0


# ── Con semillas externas (las baldosas de la banda) ───────────────────────── #
SP_N = (0.4, 0.4, 0.4)
SHAPE_N = (96, 96, 128)
# Factor 2 (0,8 mm de vóxel): el de 103 de los 172 estudios de Zenodo. A factor 4
# (1,6 mm) una bola de 10 mm pierde con la apertura más de lo que la regla pide
# (núcleo de 12 vóxeles frente a 16) y no entra: es el límite de la reducción,
# no de la regla.
FACTOR = 2


class TestConSemillasExternas:
    def test_con_semillas_solo_cuentan_las_bolas_que_las_tocan(self):
        vol, bola = _tubo_y_bola(gap_mm=2.0)
        tubo = synthetic_tube(shape=SHAPE, radius_mm=2.0) > 0
        # Semillas = sólo el tubo: la bola no está sembrada y no se mira.
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA), seed_mask=tubo)
        assert r.stats["sac_blobs"] == 0
        assert r.mask[bola].mean() < 0.05
        # Semillas que incluyen la bola: entra. (Sembrada, la parte tubular de la
        # bola ya crece en la fase 4 y la recuperación trae el resto; la fase 7
        # sólo remata lo que quede a más de 3 mm.)
        r2 = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA), seed_mask=tubo | bola)
        assert r2.mask[bola].mean() > 0.9

    def test_la_banda_nativa_conserva_la_bola_que_decidio_la_pasada_gruesa(self):
        vol, bola = _tubo_y_bola(gap_mm=2.0, shape=SHAPE_N, sp=SP_N)
        small = np.ascontiguousarray(vol[::FACTOR, ::FACTOR, ::FACTOR])
        sp_small = tuple(s * FACTOR for s in SP_N)
        params = MaskParams(lower=500.0, seed_min_mm3=SEMILLA)
        coarse = build_vascular_mask(small, sp_small, params)
        assert not coarse.fallback and coarse.stats["sac_blobs"] == 1
        rr = refine_in_band(vol, SP_N, coarse.mask, FACTOR, params, tile_vox=64, halo_vox=8)
        full = np.zeros(SHAPE_N, dtype=bool)
        z0, y0, x0 = rr.offset
        full[z0:z0 + rr.mask.shape[0], y0:y0 + rr.mask.shape[1], x0:x0 + rr.mask.shape[2]] = rr.mask
        assert full[bola].mean() > 0.85
        assert full[48, 48, 64]                       # el tubo, a nativo
