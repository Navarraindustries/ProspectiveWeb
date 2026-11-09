"""El indicador de cráneo flojo decide si se aplica la corteza (08-11).

Fantoma de cabeza (test_head_mask): esfera de partes blandas con un cráneo de
4 mm. Con cráneo denso entero (1 000 HU) el anillo de 1,5–3 mm alrededor del
hueso cae sobre partes blandas: indicador bajo. Con la tabla interna floja
(los 3 mm de dentro a 550 HU, como Zenodo 123) el hueso denso es solo la tabla
externa y el anillo cae sobre la tabla floja: indicador alto. La corteza se
aplica solo en el segundo caso.
"""
from __future__ import annotations

import numpy as np
import pytest

from services.craneo_flojo import UMBRAL, es_flojo, indicador
from services.head_mask import head_mask
from test_head_mask import C, R, SP, _fantoma


def _distancia() -> np.ndarray:
    z, y, x = np.mgrid[0:110, 0:130, 0:130]
    return np.sqrt((z - C[0]) ** 2 + (y - C[1]) ** 2 + (x - C[2]) ** 2)


def _cabeza(vol: np.ndarray) -> np.ndarray:
    return head_mask(vol, SP, "CT").inside(vol.shape)


def test_craneo_denso_da_indicador_bajo_y_no_pide_corteza():
    vol = _fantoma()
    v = indicador(vol, SP, _cabeza(vol))
    assert v is not None and v < 0.1
    assert not es_flojo(v)


def test_tabla_interna_floja_da_indicador_alto_y_pide_corteza():
    vol = _fantoma()
    d = _distancia()
    # el cráneo: 1 mm de tabla externa densa y 3 mm de tabla interna a 550 HU
    vol[(d <= R - 1) & (d > R - 4)] = 550.0
    v = indicador(vol, SP, _cabeza(vol))
    assert v is not None and v >= UMBRAL
    assert es_flojo(v)


def test_sin_hueso_denso_o_sin_cabeza_no_hay_indicador():
    vol = _fantoma()
    vol[vol > 700] = 40.0
    assert indicador(vol, SP, _cabeza(vol)) is None
    assert indicador(vol, SP, np.zeros(vol.shape, dtype=bool)) is None
    assert not es_flojo(None)


def test_la_cabeza_tiene_que_tener_la_forma_del_volumen():
    vol = _fantoma()
    with pytest.raises(ValueError):
        indicador(vol, SP, np.ones((10, 10, 10), dtype=bool))


def test_el_umbral_es_el_de_octubre():
    # No se ajustó a la detección: es el que separaba en octubre los estudios
    # con la bóveda dentro del modelo (Zenodo 123, 180, 127, 084…).
    assert UMBRAL == 0.2
