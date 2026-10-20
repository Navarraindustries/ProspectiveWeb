"""Oráculo de región de interés a resolución nativa (`scripts/zenodo_roi_oracle.py`).

Mide el techo de dos correcciones sobre el dataset Zenodo: segmentar solo una
caja alrededor de la lesión, a la resolución del DICOM (el servidor reduce
por 2–6 el volumen entero), y con o sin techo de HU para dejar fuera el hueso.
"""
from __future__ import annotations

import numpy as np

from scripts import zenodo_roi_oracle as ro


class TestCaja:
    def test_la_caja_se_recorta_en_voxeles_y_devuelve_su_origen_en_mm(self):
        # Volumen (z, y, x) de 100³ a 0,5 mm; punto de malla (x, y, z) en mm.
        sl, offset = ro.crop_box((25.0, 10.0, 40.0), 5.0, (0.5, 0.5, 0.5), (100, 100, 100))
        assert sl == (slice(70, 91), slice(10, 31), slice(40, 61))
        assert offset == (20.0, 5.0, 35.0)

    def test_la_caja_se_queda_dentro_del_volumen(self):
        sl, offset = ro.crop_box((1.0, 1.0, 49.0), 5.0, (0.5, 0.5, 0.5), (100, 100, 100))
        assert sl[2].start == 0 and sl[1].start == 0 and sl[0].stop == 100
        assert offset == (0.0, 0.0, 44.0)

    def test_el_punto_pasa_a_coordenadas_del_recorte(self):
        assert ro.to_crop((25.0, 10.0, 40.0), (20.0, 5.0, 35.0)) == (5.0, 5.0, 5.0)

    def test_el_recorte_contiene_el_punto(self):
        vol = np.zeros((100, 100, 100), dtype=np.float32)
        vol[80, 20, 50] = 7.0                      # z=40 mm, y=10 mm, x=25 mm
        sl, offset = ro.crop_box((25.0, 10.0, 40.0), 5.0, (0.5, 0.5, 0.5), vol.shape)
        sub = vol[sl]
        x, y, z = ro.to_crop((25.0, 10.0, 40.0), offset)
        assert sub[int(round(z / 0.5)), int(round(y / 0.5)), int(round(x / 0.5))] == 7.0
