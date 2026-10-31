"""`services.head_mask`: lo que no está dentro de la cabeza no es vaso.

Un fantoma a 1 mm: una cabeza esférica con cráneo y un seno de aire abierto al
exterior, una cuna curva separada por aire y una placa fina pegada a la piel.
La envolvente debe quedarse con la cabeza entera (seno incluido) y dejar fuera
las dos láminas; en XA no se aplica.
"""
from __future__ import annotations

import numpy as np
import pytest

from services.head_mask import HeadMask, head_mask

SP = (1.0, 1.0, 1.0)
C = (55, 65, 65)
R = 50      # 524 cm³: una cabeza (el mínimo para aplicar la regla son 400)


def _fantoma() -> np.ndarray:
    vol = np.full((110, 130, 130), -1000.0, dtype=np.float32)
    z, y, x = np.mgrid[0:110, 0:130, 0:130]
    d = np.sqrt((z - C[0]) ** 2 + (y - C[1]) ** 2 + (x - C[2]) ** 2)
    vol[d <= R] = 40.0                         # partes blandas
    vol[(d <= R) & (d > R - 4)] = 1000.0       # cráneo
    # seno de aire abierto al exterior por un canal (el relleno de agujeros no lo cierra)
    sinus = np.sqrt((z - C[0]) ** 2 + (y - C[1]) ** 2 + (x - (C[2] - 12)) ** 2) <= 7
    vol[sinus] = -1000.0
    vol[C[0] - 1:C[0] + 2, C[1] - 1:C[1] + 2, 0:C[2] - 12] = -1000.0
    # un vaso dentro
    vessel = np.sqrt((y - C[1]) ** 2 + (x - (C[2] + 8)) ** 2) <= 2
    vol[(d <= R - 6) & vessel] = 400.0
    # cuna curva a 8 mm de la piel, 3 mm de grosor, 200 HU
    rc = np.sqrt((y - C[1]) ** 2 + (x - C[2]) ** 2)
    vol[(rc >= R + 8) & (rc < R + 11) & (y > C[1])] = 200.0
    # placa fina pegada a la piel por el otro lado, 3 mm, 200 HU
    vol[:, C[1] - R - 3:C[1] - R, C[2] - 20:C[2] + 20] = 200.0
    return vol


def test_en_xa_no_se_aplica():
    hm = head_mask(_fantoma(), SP, "XA")
    assert not hm.applied and hm.mask is None


def test_la_envolvente_se_queda_la_cabeza_y_deja_fuera_las_laminas():
    vol = _fantoma()
    hm = head_mask(vol, SP, "CT")
    assert hm.applied and hm.stride == (3, 3, 3)
    inside = hm.inside(vol.shape)
    # cabeza entera dentro, incluido el seno abierto y el vaso
    z, y, x = np.mgrid[0:110, 0:130, 0:130]
    d = np.sqrt((z - C[0]) ** 2 + (y - C[1]) ** 2 + (x - C[2]) ** 2)
    assert inside[d <= R - 4].mean() > 0.99
    assert inside[C[0], C[1], C[2] - 12]            # el seno
    assert inside[(d <= R - 6) & (np.sqrt((y - C[1]) ** 2 + (x - (C[2] + 8)) ** 2) <= 2)].all()
    # las dos láminas fuera
    rc = np.sqrt((y - C[1]) ** 2 + (x - C[2]) ** 2)
    cuna = (rc >= R + 8) & (rc < R + 11) & (y > C[1])
    assert inside[cuna].mean() < 0.02
    placa = np.zeros_like(cuna); placa[:, C[1] - R - 3:C[1] - R, C[2] - 20:C[2] + 20] = True
    assert inside[placa].mean() < 0.15     # el borde de la envolvente roza la placa pegada
    assert hm.head_cm3 == pytest.approx(4 / 3 * np.pi * R ** 3 / 1000, rel=0.15)
    assert hm.removed_cm3 > 5


def test_inside_box_es_un_trozo_de_inside_y_respeta_el_factor():
    vol = _fantoma()
    hm = head_mask(vol, SP, "CT")
    inside = hm.inside(vol.shape)
    box = (slice(10, 30), slice(20, 60), slice(0, 130))
    assert np.array_equal(hm.inside_box(box), inside[box])
    # reducido por 2: la misma envolvente a su escala (el centro, dentro; el borde, fuera)
    red = hm.inside((55, 65, 65), factor=2)
    assert red.shape == (55, 65, 65) and red[C[0] // 2, C[1] // 2, C[2] // 2] and not red[0, 0, 0]
    assert np.array_equal(hm.inside_box((slice(5, 20), slice(0, 65), slice(10, 40)), factor=2), red[5:20, 0:65, 10:40])
    # el volumen no se toca nunca: la regla restringe la máscara, no los HU
    assert vol[C] == 40.0


def test_sin_aplicar_todo_esta_dentro():
    assert HeadMask(applied=False).inside((4, 4, 4)).all()
    assert HeadMask(applied=False).inside_box((slice(1, 3), slice(0, 4), slice(2, 4))).shape == (2, 4, 2)


def test_as_dict_no_lleva_la_mascara():
    d = head_mask(_fantoma(), SP, "CT").as_dict()
    assert "mask" not in d and d["applied"] and d["stride"] == [3, 3, 3]
