"""Frangi por lonchas: tubos altos, láminas bajas, y la loncha no cambia el resultado."""
from __future__ import annotations

import numpy as np
import pytest

from services.vesselness import SCALES_MM, auto_gamma, objectness_max

SP = (0.5, 0.5, 0.5)


def synthetic_tube(shape=(48, 48, 48), spacing=SP, radius_mm=1.5, value=1000.0, axis=0):
    """Un cilindro brillante a lo largo de `axis` sobre fondo 0."""
    z, y, x = np.mgrid[0:shape[0], 0:shape[1], 0:shape[2]].astype(np.float32)
    c = [s / 2 for s in shape]
    coords = [z, y, x]
    del coords[axis]
    cc = [c[i] for i in range(3) if i != axis]
    sp = [spacing[i] for i in range(3) if i != axis]
    d2 = ((coords[0] - cc[0]) * sp[0]) ** 2 + ((coords[1] - cc[1]) * sp[1]) ** 2
    return np.where(d2 <= radius_mm ** 2, value, 0.0).astype(np.float32)


def synthetic_plate(shape=(48, 48, 48), spacing=SP, thickness_mm=0.5, value=1000.0):
    """Una lámina brillante en el plano z = centro."""
    vol = np.zeros(shape, dtype=np.float32)
    half = max(1, int(round(thickness_mm / spacing[0] / 2)))
    zc = shape[0] // 2
    vol[zc - half:zc + half + 1] = value
    return vol


class TestFormas:
    def test_un_tubo_tiene_tubularidad_alta_en_su_eje_y_baja_fuera(self):
        vol = synthetic_tube()
        v = objectness_max(vol, SP, dimension=1)
        assert v.shape == vol.shape and v.dtype == np.float32
        centro = v[24, 24, 24]
        fuera = v[24, 4, 4]
        assert centro > 0 and fuera < centro * 0.05

    def test_una_lamina_puntua_como_lamina_y_no_como_tubo(self):
        vol = synthetic_plate()
        tubo = objectness_max(vol, SP, dimension=1)
        lamina = objectness_max(vol, SP, dimension=2)
        assert lamina[24, 24, 24] > 5 * tubo[24, 24, 24]

    def test_gamma_automatica_sale_de_la_intensidad(self):
        vol = synthetic_tube(value=2000.0)
        assert auto_gamma(vol) == pytest.approx(0.1 * (np.percentile(vol, 99.9) - np.percentile(vol, 50)), rel=1e-3)
        assert auto_gamma(np.zeros((4, 4, 4), np.float32)) == 1.0


class TestLonchas:
    def test_las_lonchas_no_dejan_costuras(self):
        vol = synthetic_tube(shape=(80, 40, 40), axis=0)
        entero = objectness_max(vol, SP, dimension=1, slab=1000, overlap=0)
        por_lonchas = objectness_max(vol, SP, dimension=1, slab=20, overlap=8)
        np.testing.assert_allclose(por_lonchas, entero, rtol=1e-3, atol=1e-3)

    def test_informa_del_progreso_por_loncha(self):
        vol = synthetic_tube(shape=(60, 32, 32))
        seen: list[tuple[int, int]] = []
        objectness_max(vol, SP, dimension=1, slab=20, overlap=4, on_progress=lambda i, n: seen.append((i, n)))
        assert seen[0] == (1, 3) and seen[-1] == (3, 3)

    def test_las_escalas_por_defecto_son_las_del_diseno(self):
        assert SCALES_MM == (0.4, 0.7, 1.2, 2.0)
