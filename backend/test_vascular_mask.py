"""La máscara vascular: núcleo relleno, hueso fuera, sacos dentro."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from services.vascular_mask import MaskParams, build_vascular_mask
from test_vesselness import SP, synthetic_tube

# Mínimo de semilla a la escala de los fantasmas. Las semillas son M0 ∧ V ≥ p90,
# es decir, a lo sumo el 10 % de M0; un fantasma de 64³ a 0,5 mm tiene 300-460
# mm³ de M0, así que su subconjunto p90 nunca llega a los 50 mm³ de producción
# (medido: 46 mm³ como mucho) y todo caería al umbral. Además, en un cilindro de
# borde duro Frangi es casi plano por dentro y el p90 son líneas de 64 vóxeles
# (8 mm³) en las esquinas de la pared. 5 mm³ deja sembrar al tubo grueso.
SEMILLA = 5.0


def _sphere(shape, spacing, center, radius_mm, value):
    z, y, x = np.mgrid[0:shape[0], 0:shape[1], 0:shape[2]].astype(np.float32)
    d2 = ((z - center[0]) * spacing[0]) ** 2 + ((y - center[1]) * spacing[1]) ** 2 + ((x - center[2]) * spacing[2]) ** 2
    return np.where(d2 <= radius_mm ** 2, value, 0.0).astype(np.float32)


class TestNucleo:
    def test_un_tubo_con_el_centro_por_encima_del_techo_sale_macizo(self):
        vol = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0, value=1000.0)
        core = synthetic_tube(shape=(64, 48, 48), radius_mm=0.8, value=3000.0)
        vol = np.maximum(vol, core)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, upper=2000.0, seed_min_mm3=SEMILLA))
        # Con el techo aplicado ANTES del relleno el centro quedaría hueco.
        assert r.mask[32, 24, 24]
        assert not r.fallback
        assert r.stats["final_vox"] >= 0.95 * (vol >= 500).sum()

    def test_lo_que_supera_el_techo_y_asoma_fuera_se_quita(self):
        # El techo sigue sirviendo para algo: un bloque más brillante que el techo
        # pegado al vaso (el hueso denso) no está envuelto por pared y se va.
        vol = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0, value=1000.0)
        vol[24:40, 24:34, 28:40] = 3000.0
        con = build_vascular_mask(vol, SP, MaskParams(lower=500.0, upper=2000.0, seed_min_mm3=SEMILLA))
        sin = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA))
        assert con.stats["m0_vox"] < sin.stats["m0_vox"]
        assert not con.mask[32, 30, 38]
        assert con.mask[32, 24, 24]


class TestHueso:
    def test_una_lamina_suelta_no_entra(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        # El tubo recorre todo z; se corta antes de z = 14 para que la lámina esté
        # suelta de verdad (si no, el tubo la atraviesa y [9, 32, 32] es tubo).
        vol[:14] = 0.0
        vol[8:11, :, :] = 1000.0          # lámina lejos del tubo
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA))
        assert not r.mask[9, 32, 32]
        assert not r.mask[8:11].any()
        assert r.mask[32, 32, 32]

    def test_una_lamina_en_contacto_no_vuelve_con_la_recuperacion(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        vol[31:33, 20:64, 34:64] = 1000.0  # lámina que toca el tubo por un lado
        con = build_vascular_mask(vol, SP, MaskParams(lower=500.0, plate_veto=True, seed_min_mm3=SEMILLA))
        sin = build_vascular_mask(vol, SP, MaskParams(lower=500.0, plate_veto=False, seed_min_mm3=SEMILLA))
        lamina = np.zeros_like(vol, dtype=bool); lamina[31:33, 20:64, 44:64] = True
        assert con.mask[lamina].mean() < 0.15
        assert sin.mask[lamina].mean() > con.mask[lamina].mean()
        assert con.stats["vetoed_vox"] > 0
        assert con.mask[32, 32, 32]


class TestSaco:
    def test_un_saco_pegado_al_tubo_se_conserva(self):
        # Bola de 2 mm con el centro a 2,5 mm del eje: todo el saco queda a ≤ 3 mm
        # del tubo que crece. (Una bola de 3 mm a 3 mm del eje tiene un casquete
        # a 4,5 mm de la pared, fuera del alcance de la recuperación: 70 %.)
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        saco = _sphere((64, 64, 64), SP, (32, 32 + 5, 32), 2.0, 1000.0)   # bola pegada al lado
        vol = np.maximum(vol, saco)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, reclaim_mm=3.0, seed_min_mm3=SEMILLA))
        assert not r.fallback
        assert r.mask[saco > 0].mean() > 0.9
        r0 = build_vascular_mask(vol, SP, MaskParams(lower=500.0, reclaim_mm=0.0, seed_min_mm3=SEMILLA))
        assert r0.mask[saco > 0].mean() < r.mask[saco > 0].mean()


class TestSemillas:
    def test_sin_semillas_cae_al_umbral_y_lo_dice(self):
        vol = synthetic_tube(shape=(32, 32, 32), radius_mm=0.6, value=1000.0)  # demasiado fino para 50 mm³
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=50.0))
        assert r.fallback is True
        assert r.stats["seeds"] == 0
        np.testing.assert_array_equal(r.mask, ndimage.binary_fill_holes(vol >= 500.0))

    def test_una_rama_suelta_sin_semilla_se_descarta(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0)
        # 0,7 mm y 12 mm de largo: Frangi puntúa más un tubo fino que uno grueso
        # (1 373 frente a 207 en el eje), así que una rama fina de lado a lado
        # siembra por sí sola (p90 de 8 mm³); corta, su p90 queda en ~3 mm³.
        rama = synthetic_tube(shape=(64, 64, 64), radius_mm=0.7, axis=2)
        rama[:, :, :20] = 0.0
        rama[:, :, 44:] = 0.0
        rama[:, :, :] = np.roll(rama, 20, axis=1)      # tubo fino separado del grueso
        vol = np.maximum(vol, rama)
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA))
        assert r.mask[32, 32, 32] and not r.mask[32, 52, 32]
        assert r.stats["kept_components"] == 1


class TestContrato:
    def test_las_stats_llevan_todas_las_claves_y_el_progreso_llega_al_final(self):
        vol = synthetic_tube(shape=(64, 48, 48), radius_mm=2.0)
        seen: list[tuple[str, float]] = []
        r = build_vascular_mask(vol, SP, MaskParams(lower=500.0, seed_min_mm3=SEMILLA),
                                on_progress=lambda f, p: seen.append((f, p)))
        for k in ("m0_vox", "core_vox", "seeds", "grow_components", "kept_components", "reclaimed_vox",
                  "vetoed_vox", "final_vox", "kept_fraction", "thresholds"):
            assert k in r.stats
        assert set(r.stats["thresholds"]) == {"gate", "seed", "grow"}
        assert r.mask.dtype == bool and r.mask.shape == vol.shape
        assert seen[-1][1] == 100 and [p for _, p in seen] == sorted(p for _, p in seen)
