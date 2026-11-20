"""Las dos piezas de `referencia_dkfz.py` que no necesitan el modelo."""
import numpy as np
import pytest

from referencia_dkfz import a_indice_original, centro_stl


def test_indice_deshace_remuestreo_y_recortes():
    # Mapa de 50 vóxeles por eje sobre un recorte de 100: el centro del vóxel 0 cae en 0,5.
    idx = a_indice_original((0, 24, 49), (50, 50, 50), (100, 100, 100), (10, 0, 5), (200, 30, 0))
    assert idx == pytest.approx([0.5 + 210, 48.5 + 30, 98.5 + 5])


def test_indice_sin_remuestreo_es_solo_desplazar():
    assert a_indice_original((3, 4, 5), (10, 10, 10), (10, 10, 10), (1, 1, 1), (0, 0, 0)) == pytest.approx([4, 5, 6])


def test_centro_y_radio_de_un_stl_binario(tmp_path):
    tri = np.zeros(2, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]))
    tri["v"][0] = [[0, 0, 0], [2, 0, 0], [0, 2, 0]]
    tri["v"][1] = [[2, 2, 0], [2, 0, 0], [0, 2, 0]]
    ruta = tmp_path / "an_001.stl"
    ruta.write_bytes(b"\0" * 80 + np.uint32(2).tobytes() + tri.tobytes())
    centro, radio = centro_stl(ruta)
    assert centro == pytest.approx([1, 1, 0])
    assert radio == pytest.approx(2 ** 0.5)


def test_centro_de_un_stl_de_texto(tmp_path):
    ruta = tmp_path / "an_002.stl"
    ruta.write_text("solid Object01\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n"
                    "      vertex 4 0 0\n      vertex 2 6 0\n    endloop\n  endfacet\nendsolid Object01\n")
    centro, radio = centro_stl(ruta)
    assert centro == pytest.approx([2, 2, 0])
    assert radio == pytest.approx(4.0)
