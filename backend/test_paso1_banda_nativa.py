"""Paso 1 del plan Zenodo: resolución nativa en la banda del árbol.

Un volumen por encima del tope de vóxeles se segmenta reducido por 2 a 6 en
cada eje, y una lesión de 3 mm cabe en un vóxel. `services.band_refine` vuelve
a segmentar a resolución nativa, por baldosas, una banda alrededor del árbol
que la máscara reducida localizó. Lo que se fija aquí:

· el saco que la reducción se come vuelve en la banda;
· las baldosas no dejan costura;
· a factor 1 no se llama a nada (Case 3 e IM_0055 siguen por su camino);
· reducido, `segment_tubular` devuelve una malla nativa en coordenadas del
  volumen entero, no de la caja.
"""
from __future__ import annotations

import os
import tempfile
from types import SimpleNamespace

_tmp = tempfile.mkdtemp(prefix="prospective_p1_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest

from services.band_refine import (band_from_coarse, refine_in_band,
                                  upsample_slice)
from services.vascular_mask import MaskParams, build_vascular_mask
from test_vascular_mask import SEMILLA, _sphere
from test_vesselness import synthetic_tube

SP = (0.4, 0.4, 0.4)
SHAPE = (128, 96, 96)
FACTOR = 4


def _tubo_con_saco():
    """Vaso de 2 mm de radio (350 HU) con un saco de 1,2 mm de radio pegado al
    costado: a 1,6 mm de vóxel (factor 4) el saco es un vóxel y medio."""
    vol = synthetic_tube(shape=SHAPE, spacing=SP, radius_mm=2.0, value=350.0)
    centro = (64, 48 + 2.6 / SP[1], 48)
    saco = _sphere(SHAPE, SP, centro, 1.2, 350.0) > 0
    vol[saco] = 350.0
    return vol, saco


def _reducido(vol):
    return np.ascontiguousarray(vol[::FACTOR, ::FACTOR, ::FACTOR]), tuple(s * FACTOR for s in SP)


def _nativa_completa(rr):
    """La máscara de la caja colocada en el volumen entero."""
    full = np.zeros(SHAPE, dtype=bool)
    z0, y0, x0 = rr.offset
    full[z0:z0 + rr.mask.shape[0], y0:y0 + rr.mask.shape[1], x0:x0 + rr.mask.shape[2]] = rr.mask
    return full


@pytest.fixture(scope="module")
def fantasma():
    vol, saco = _tubo_con_saco()
    small, sp_small = _reducido(vol)
    coarse = build_vascular_mask(small, sp_small, MaskParams(lower=150.0, seed_min_mm3=SEMILLA))
    assert not coarse.fallback
    return vol, saco, coarse.mask


class TestBanda:
    def test_la_banda_rodea_el_tubo_grueso(self, fantasma):
        _vol, _saco, coarse = fantasma
        band = band_from_coarse(coarse, FACTOR, SP, band_mm=5.0)
        assert band.sum() > coarse.sum()
        assert band[coarse].all()

    def test_upsample_slice_es_vecino_mas_cercano(self, fantasma):
        _vol, _saco, coarse = fantasma
        sl = (slice(10, 70), slice(0, 96), slice(20, 60))
        up = upsample_slice(coarse, FACTOR, sl)
        ref = np.repeat(np.repeat(np.repeat(coarse, FACTOR, 0), FACTOR, 1), FACTOR, 2)[:SHAPE[0], :SHAPE[1], :SHAPE[2]]
        assert up.shape == (60, 96, 40)
        assert np.array_equal(up, ref[sl])


class TestResolucionNativa:
    def test_el_saco_que_la_reduccion_se_come_vuelve_en_la_banda(self, fantasma):
        vol, saco, coarse = fantasma
        coarse_up = upsample_slice(coarse, FACTOR, tuple(slice(0, s) for s in SHAPE))
        antes = coarse_up[saco].mean()
        rr = refine_in_band(vol, SP, coarse, FACTOR, MaskParams(lower=150.0),
                            tile_vox=64, halo_vox=8)
        full = _nativa_completa(rr)
        despues = full[saco].mean()
        assert despues > 0.85, (antes, despues)
        assert despues > antes
        assert full[64, 48, 48] and full[10, 48, 48] and full[117, 48, 48]
        assert rr.stats["tiles_active"] >= 1 and rr.stats["mask_vox"] > 0

    def test_las_baldosas_no_dejan_costura(self, fantasma):
        vol, _saco, coarse = fantasma
        chico = _nativa_completa(refine_in_band(vol, SP, coarse, FACTOR, MaskParams(lower=150.0),
                                                tile_vox=32, halo_vox=8))
        grande = _nativa_completa(refine_in_band(vol, SP, coarse, FACTOR, MaskParams(lower=150.0),
                                                 tile_vox=256, halo_vox=8))
        iou = (chico & grande).sum() / max(1, (chico | grande).sum())
        assert iou > 0.95, iou

    def test_una_mascara_gruesa_vacia_no_rompe(self):
        vol = np.zeros((32, 32, 32), dtype=np.float32)
        rr = refine_in_band(vol, SP, np.zeros((8, 8, 8), dtype=bool), 4, MaskParams(lower=150.0))
        assert rr.mask.size == 0 and rr.stats["tiles_active"] == 0

    def test_la_forma_de_la_mascara_gruesa_se_comprueba(self):
        vol = np.zeros((32, 32, 32), dtype=np.float32)
        with pytest.raises(ValueError):
            refine_in_band(vol, SP, np.zeros((9, 8, 8), dtype=bool), 4, MaskParams(lower=150.0))


def _dcm(vol, modality="CT"):
    return SimpleNamespace(volume=vol, spacing=SP, modality=modality,
                           window_center=90.0, window_width=750.0)


GRANDE = (160, 96, 96)


def _tubo_grande():
    """Un tronco de 4 mm de radio con un saco de 1,5 mm: con la semilla de
    producción (50 mm³) el tubo de 2 mm de los otros tests no siembra."""
    vol = synthetic_tube(shape=GRANDE, spacing=SP, radius_mm=4.0, value=350.0)
    saco = _sphere(GRANDE, SP, (80, 48 + 4.6 / SP[1], 48), 1.5, 350.0) > 0
    vol[saco] = 350.0
    return vol


@pytest.fixture
def semilla_de_fantasma(monkeypatch):
    """La semilla de producción (50 mm³) no siembra un cilindro sintético de
    borde duro (ver test_vascular_mask.SEMILLA); aquí se prueba el enrutado,
    no la siembra."""
    import functools

    import services.vascular_mask as vm
    monkeypatch.setattr(vm, "MaskParams", functools.partial(vm.MaskParams, seed_min_mm3=SEMILLA))


class TestSegmentTubular:
    def test_a_factor_1_no_se_llama_a_la_banda(self, monkeypatch, semilla_de_fantasma):
        import services.band_refine as br
        from routers.segment import segment_tubular
        monkeypatch.setattr(br, "refine_in_band", lambda *a, **k: pytest.fail("no debía llamarse"))
        _, info = segment_tubular(_dcm(_tubo_grande()), lower=150.0, upper=0.0,
                                  strategy="ct_stats", memory_guard=False)
        assert info["downsample_factor"] == 1 and info["band"] is None
        assert info["mesh_spacing_mm"] == info["seg_spacing_mm"]
        assert not info["fallback_mask"]

    def test_la_pasada_gruesa_quita_el_hueso_sin_margen_y_las_baldosas_con_el(self, monkeypatch, semilla_de_fantasma):
        # Zenodo 016: el margen a un vóxel reducido cortaba la carótida en la
        # base del cráneo y la circulación anterior desaparecía de la banda.
        import routers.segment as seg
        import services.band_refine as br
        import services.vascular_mask as vm
        monkeypatch.setattr(seg, "_TUBULAR_MAX_VOXELS", 100_000)
        real = vm.build_vascular_mask
        llamadas: list[tuple[int, float, float]] = []

        def espia(volume, spacing, params, **kw):
            llamadas.append((volume.size, params.bone_margin_mm, params.bone_hu, params.upper))
            return real(volume, spacing, params, **kw)

        monkeypatch.setattr(vm, "build_vascular_mask", espia)
        monkeypatch.setattr(br, "build_vascular_mask", espia)
        vol = _tubo_grande()
        vol[40:120, 60:90, 70:96] = 1500.0            # un bloque de hueso al lado
        _, info = seg.segment_tubular(_dcm(vol), lower=150.0, upper=0.0, strategy="ct_stats",
                                      memory_guard=False)
        assert info["downsample_factor"] == 2 and info["band"]["tiles_active"] >= 1
        gruesa, baldosas = llamadas[0], llamadas[1:]
        # La gruesa: volumen reducido, umbral de hueso alto (el vóxel mezcla),
        # sin margen y sin techo (016: el techo cortaba la carótida del canal).
        assert gruesa[0] < vol.size and gruesa[1] == 0.0 and gruesa[2] == seg.CT_BONE_HU_COARSE
        assert gruesa[3] == 0.0
        assert info["mask_stats"]["bone_vox"] > 0
        # Las baldosas: el umbral nativo con su margen y el techo de TC.
        assert baldosas and all(m == 1.5 and hu == seg.CT_BONE_HU and up == 700.0
                                for _, m, hu, up in baldosas)

    def test_reducido_devuelve_una_malla_nativa_en_coordenadas_del_volumen(self, monkeypatch, semilla_de_fantasma):
        import routers.segment as seg
        monkeypatch.setattr(seg, "_TUBULAR_MAX_VOXELS", 100_000)   # fuerza media resolución
        vol = _tubo_grande()
        poly, info = seg.segment_tubular(_dcm(vol), lower=150.0, upper=0.0, strategy="ct_stats",
                                         memory_guard=False)
        _, sin = seg.segment_tubular(_dcm(vol), lower=150.0, upper=0.0, strategy="ct_stats",
                                     memory_guard=False, band_refine=False)
        assert info["downsample_factor"] == 2 and sin["downsample_factor"] == 2
        assert not info["fallback_mask"], info["fallback_note"]
        assert info["band"]["tiles_active"] >= 1 and sin["band"] is None
        assert info["mesh_spacing_mm"] == [0.4, 0.4, 0.4] and sin["mesh_spacing_mm"] == [0.8, 0.8, 0.8]
        assert "resolución nativa" in info["fallback_note"]
        assert info["vertices"] > sin["vertices"]
        # Coordenadas del volumen entero: el eje del tubo está en x = y = 48 · 0,4 mm.
        x0, x1, y0, y1, z0, z1 = poly.GetBounds()
        assert abs((x0 + x1) / 2 - 48 * SP[2]) < 0.5
        assert y0 > 48 * SP[1] - 4.6 and y1 < 48 * SP[1] + 4.6 + 1.5 + 0.8
        assert z0 > -1.0 and z1 < GRANDE[0] * SP[0] + 1.0
