"""El tramo de un desviador de flujo cabe entero en la línea si puede.

En Case 3 (22-11), con el punto distal cerca del cuello, un Pipeline de 16 mm
se dibujó de 5,2 a 21,0 mm (15,8 mm, recortado por el final de la línea) y la
cobertura calculó para ese tramo una «longitud de catálogo» de 13 mm.
"""
from __future__ import annotations

import pytest

from services.braid_coverage import ventana_en_linea


def test_centrada_si_cabe():
    assert ventana_en_linea(20.0, 10.0, 50.0) == pytest.approx((15.0, 25.0))


def test_se_corre_hacia_dentro_en_vez_de_recortarse():
    a, b = ventana_en_linea(13.1, 19.0, 21.0)       # el caso de Case 3
    assert b == pytest.approx(21.0)
    assert b - a == pytest.approx(19.0)            # entero, no 15,8
    a, b = ventana_en_linea(2.0, 10.0, 50.0)       # junto al origen
    assert (a, b) == pytest.approx((0.0, 10.0))


def test_linea_mas_corta_que_el_dispositivo():
    # No cabe de ninguna forma: queda cortado por el final (el dimensionado ya
    # avisa del anclaje truncado).
    assert ventana_en_linea(5.0, 30.0, 12.0) == pytest.approx((0.0, 12.0))
