"""`services.numero.cifra`: coma decimal para el texto que lee una persona."""
from __future__ import annotations

import math

from services.numero import cifra, cifra_corta, coordenadas


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


def test_espejo_del_frontend_redondeo_por_coma_flotante():
    # Mismo criterio que `Number.prototype.toFixed`: el redondeo del binario.
    assert cifra(1.005, 2) == f"{1.005:.2f}".replace(".", ",")
    assert cifra(2.675, 2) == f"{2.675:.2f}".replace(".", ",")
