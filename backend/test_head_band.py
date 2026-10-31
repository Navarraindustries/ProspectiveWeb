"""`services.head_band`: en TC se segmenta solo la banda bajo el techo del cráneo.

La malla vuelve al marco del volumen entero, así que el resultado es el mismo
tubo en el mismo sitio; lo que cambia es cuántos vóxeles hay que mirar.
"""
from __future__ import annotations

import numpy as np

from services.dicom_loader import DicomLoadResult
from services.head_band import HEAD_BAND_MM, HeadBand, head_band, skull_top_index

SP = (1.0, 1.0, 1.0)


def _volumen(nz: int = 200, size: int = 48) -> np.ndarray:
    return np.full((nz, size, size), -1000.0, dtype=np.float32)


def _placa(vol: np.ndarray, z0: int, z1: int, hu: float, radius: float = 12.0) -> None:
    """Un disco de `hu` en los cortes [z0, z1): ≥ 4,5 cm², más que los 2 del techo."""
    size = vol.shape[1]
    y, x = np.mgrid[0:size, 0:size]
    disc = (y - size / 2) ** 2 + (x - size / 2) ** 2 <= radius ** 2
    vol[z0:z1, disc] = hu


def _tubo(vol: np.ndarray, z0: int, z1: int, hu: float = 600.0, radius: float = 3.0) -> None:
    size = vol.shape[1]
    y, x = np.mgrid[0:size, 0:size]
    disc = (y - size / 2) ** 2 + (x - size / 2) ** 2 <= radius ** 2
    vol[z0:z1, disc] = hu


class TestLaBanda:
    def test_en_tc_alto_se_queda_con_150_mm_bajo_el_techo_del_craneo(self):
        vol = _volumen()
        _placa(vol, 185, 190, 1000.0)          # el vértex: techo en el índice 189
        b = head_band(vol, SP, "CT")
        assert b.applied
        assert skull_top_index(vol, SP) == 189
        assert b.top_mm == 189.5
        assert b.z0 == int(189.5 - HEAD_BAND_MM) == 39
        assert b.slices_kept == 200 - 39 and b.slices_total == 200
        assert b.cut_mm == 39.0
        assert b.voxels_kept == (200 - 39) * 48 * 48 and b.voxels_total == 200 * 48 * 48

    def test_un_reposacabezas_por_encima_no_es_el_techo(self):
        vol = _volumen()
        _placa(vol, 185, 190, 1000.0)
        _placa(vol, 192, 199, -50.0)           # espuma o plástico: pasa de −300 HU, no es hueso
        assert head_band(vol, SP, "CT").z0 == 39

    def test_sin_hueso_no_se_recorta(self):
        vol = _volumen()
        _tubo(vol, 20, 180)
        b = head_band(vol, SP, "CT")
        assert b == HeadBand(applied=False, slices_total=200, slices_kept=200,
                             voxels_total=200 * 48 * 48, voxels_kept=200 * 48 * 48)

    def test_un_volumen_mas_bajo_que_la_banda_no_se_recorta(self):
        vol = _volumen(nz=140)
        _placa(vol, 130, 135, 1000.0)
        assert not head_band(vol, SP, "CT").applied

    def test_en_3dra_no_se_mira(self):
        vol = _volumen()
        _placa(vol, 185, 190, 1000.0)
        assert not head_band(vol, SP, "XA").applied
        assert not head_band(vol, SP, None).applied

    def test_el_hueso_tiene_que_cubrir_2_cm2(self):
        vol = _volumen()
        _placa(vol, 185, 190, 1000.0, radius=5.0)   # 0,8 cm²: una mota, no el vértex
        assert skull_top_index(vol, SP) is None
        assert not head_band(vol, SP, "CT").applied

    def test_el_espaciado_cuenta(self):
        vol = _volumen(nz=400)
        _placa(vol, 380, 390, 1000.0)
        b = head_band(vol, (0.5, 1.0, 1.0), "CT")   # 200 mm de alto en 400 cortes
        assert b.applied and b.top_mm == 389.5 * 0.5
        assert b.z0 == int((389.5 * 0.5 - HEAD_BAND_MM) / 0.5) == 89
        assert b.cut_mm == 44.5

    def test_as_dict_redondea(self):
        d = HeadBand(applied=True, slices_total=10, slices_kept=4, z0=6,
                     top_mm=9.4999, cut_mm=6.0001).as_dict()
        assert d["top_mm"] == 9.5 and d["cut_mm"] == 6.0 and d["z0"] == 6


def _dcm(vol: np.ndarray, modality: str = "CT") -> DicomLoadResult:
    return DicomLoadResult(
        volume=vol, spacing=SP, origin=(0.0, 0.0, 0.0), modality=modality,
        series_uid="1.2.3", series_description="", patient_name="", patient_id="",
        study_date="", window_center=300.0, window_width=600.0, n_slices=vol.shape[0],
        is_projection=False, projection_warning=None)


class TestSegmentarConLaBanda:
    def test_la_malla_vuelve_al_marco_del_volumen_entero(self):
        from routers.segment import segment_tubular
        con = _volumen()
        _tubo(con, 60, 150)
        _placa(con, 185, 190, 1000.0)           # el cráneo: la banda se aplica
        sin = _volumen()
        _tubo(sin, 60, 150)                      # sin cráneo: no hay banda
        poly_con, info_con = segment_tubular(_dcm(con), lower=300.0, upper=0.0, memory_guard=False,
                                             keep_volume=True)
        poly_sin, info_sin = segment_tubular(_dcm(sin), lower=300.0, upper=0.0, memory_guard=False,
                                             keep_volume=True)
        assert info_con["head_band"]["applied"] and info_con["head_band"]["z0"] == 39
        assert not info_sin["head_band"]["applied"]
        assert info_con["voxels"] == (200 - 39) * 48 * 48 and info_sin["voxels"] == 200 * 48 * 48
        assert info_con["shape"] == [200, 48, 48]
        # El volumen con el que se midió es la banda, y dice dónde empieza.
        assert info_con["seg_volume"].shape[0] == 200 - 39
        assert info_con["seg_origin_mm"] == (0.0, 0.0, 39.0)
        assert info_sin["seg_origin_mm"] == (0.0, 0.0, 0.0)
        # El mismo tubo, en el mismo sitio (z de 60 a 150), con y sin banda.
        b_con, b_sin = poly_con.GetBounds(), poly_sin.GetBounds()
        assert abs(b_con[4] - 60) < 3 and abs(b_con[5] - 150) < 3
        assert all(abs(a - b) < 1.5 for a, b in zip(b_con, b_sin))
        assert abs(poly_con.GetNumberOfPoints() - poly_sin.GetNumberOfPoints()) < 0.05 * poly_sin.GetNumberOfPoints()

    def test_en_3dra_el_volumen_entero(self):
        from routers.segment import segment_tubular
        vol = _volumen()
        _tubo(vol, 60, 150)
        _placa(vol, 185, 190, 1000.0)
        _poly, info = segment_tubular(_dcm(vol, "XA"), lower=300.0, upper=0.0, memory_guard=False)
        assert not info["head_band"]["applied"] and info["voxels"] == 200 * 48 * 48
