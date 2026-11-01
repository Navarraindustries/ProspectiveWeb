"""`services.numero.cifra`: coma decimal para el texto que lee una persona."""
from __future__ import annotations

import math

from services.numero import cifra, cifra_corta, coordenadas, punto_decimal


def test_punto_decimal_es_la_forma_de_maquina_de_un_rotulo():
    assert punto_decimal("NAVARRO™ T1 Recto 7,0 mm") == "NAVARRO™ T1 Recto 7.0 mm"
    assert punto_decimal("NAVARRO™ T1 Recto 7.0 mm") == "NAVARRO™ T1 Recto 7.0 mm"
    assert punto_decimal("Yasargil Recto, 7mm") == "Yasargil Recto, 7mm"
    assert punto_decimal("serie T1,2") == "serie T1,2"
    assert punto_decimal("1,2,3") == "1,2,3"
    assert punto_decimal("de 7,5 a 9,25 mm") == "de 7.5 a 9.25 mm"
    assert punto_decimal("") == ""


def test_cifra_corta_sin_ceros_de_relleno():
    assert cifra_corta(2) == "2"
    assert cifra_corta(1.6) == "1,6"
    assert cifra_corta(0.05) == "0,05"
    assert cifra_corta(-0.0) == "0"
    assert cifra_corta(None) == "—"
    assert cifra_corta(math.nan) == "—"


def test_coordenadas_con_punto_y_coma_y_menos_tipografico():
    assert coordenadas([1.23, 4.56, -7.89]) == "(1,2; 4,6; −7,9)"
    assert coordenadas((0, -0.001, 2), 2) == "(0,00; 0,00; 2,00)"
    assert coordenadas(None) == "—"


def test_coma_decimal_y_decimales():
    assert cifra(11) == "11,0"
    assert cifra(7.5) == "7,5"
    assert cifra(7.25, 2) == "7,25"
    assert cifra(1.5, 2) == "1,50"
    assert cifra(125, 0) == "125"
    assert cifra(3) == "3,0"


def test_sin_valor_es_raya():
    assert cifra(None) == "—"
    assert cifra(math.nan) == "—"
    assert cifra(math.inf) == "—"
    assert cifra(-math.inf, 2) == "—"


def test_menos_cero_sin_signo():
    assert cifra(-0.0) == "0,0"
    assert cifra(-0.04) == "0,0"
    assert cifra(-0.004, 2) == "0,00"
    assert cifra(-0.4, 0) == "0"


def test_negativos_conservan_el_signo():
    assert cifra(-7.26, 1) == "-7,3"
    assert cifra(-1.5) == "-1,5"


def test_signo_explicito():
    assert cifra(0.3, 2, signo=True) == "+0,30"
    assert cifra(-0.25, 2, signo=True) == "-0,25"
    assert cifra(-0.001, 2, signo=True) == "+0,00"
    assert cifra(None, signo=True) == "—"


def test_acepta_enteros_y_tipos_numpy():
    import numpy as np

    assert cifra(np.float32(2.5)) == "2,5"
    assert cifra(np.int64(4), 0) == "4"
    assert cifra(np.float64("nan")) == "—"


def test_redondea_como_tofixed_del_frontend():
    # Los mismos casos están en frontend/src/lib/numero.test.ts. Un empate
    # exacto en binario se aleja del cero (el `format` de Python lo llevaba al
    # par: 0.125 → «0,12», 2.5 → «2»); lo que no es empate en binario se queda
    # en su lado (1.005 es 1.00499… y 2.675 es 2.67499…).
    assert cifra(0.125, 2) == "0,13"
    assert cifra(2.5, 0) == "3"
    assert cifra(-2.5, 0) == "-3"
    assert cifra(0.5, 0) == "1"
    assert cifra(1.005, 2) == "1,00"
    assert cifra(2.675, 2) == "2,67"
    assert cifra(-0.125, 2) == "-0,13"


def test_cifra_corta_nunca_en_notacion_cientifica():
    # La misma regla que `cifraCorta`: 6 decimales como toFixed(6), sin ceros.
    assert cifra_corta(1234567) == "1234567"
    assert cifra_corta(1e-5) == "0,00001"
    assert cifra_corta(-1e-9) == "0"
    assert cifra_corta(123.4567891) == "123,456789"
    assert cifra_corta(1e21) == "1000000000000000000000"
    assert cifra_corta(2.5) == "2,5"
