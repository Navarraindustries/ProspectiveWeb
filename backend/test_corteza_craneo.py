"""La corteza de la cabeza (30-10): en la banda exterior de la envolvente, lo que
supera `shell_hu` es cráneo aunque no llegue a `bone_hu`.

Visto en Zenodo 084 (cráneo de 650 HU como máximo) y 123 (tabla interna a
530–620): la máscara de hueso de 700 no los veía y la bóveda entera entraba en
la malla. Aquí: la corteza es la banda de SHELL_MM hacia dentro desde la piel,
se muestrea por cajas como la envolvente, y la máscara vascular quita dentro de
ella una placa de 500 HU sin tocar el tubo del centro.
"""
from __future__ import annotations

import numpy as np

from services.head_mask import SHELL_MM, head_mask
from services.vascular_mask import MaskParams, build_vascular_mask
from test_head_mask import C, R, SP, _fantoma
from test_vesselness import synthetic_tube


def test_la_corteza_es_la_banda_exterior_de_la_envolvente():
    vol = _fantoma()
    hm = head_mask(vol, SP, "CT")
    assert hm.applied and hm.shell_mm == SHELL_MM
    shell = hm.shell_in(vol.shape)
    z, y, x = np.mgrid[0:110, 0:130, 0:130]
    d = np.sqrt((z - C[0]) ** 2 + (y - C[1]) ** 2 + (x - C[2]) ** 2)
    # el cráneo del fantoma (los 4 mm bajo la piel) está en la corteza
    assert shell[(d <= R - 1) & (d > R - 4)].mean() > 0.9
    # a 20 mm de la piel ya no (el vaso del fantoma, a R − 6 o más dentro, queda fuera de ella en su mayoría)
    assert not shell[d < R - SHELL_MM - 6].any()
    # por cajas y con factor, igual que la envolvente
    box = (slice(10, 30), slice(20, 60), slice(0, 130))
    assert np.array_equal(hm.shell_box(box), shell[box])
    red = hm.shell_in((55, 65, 65), factor=2)
    assert red.shape == (55, 65, 65) and not red[C[0] // 2, C[1] // 2, C[2] // 2]
    # dentro de la envolvente siempre
    assert not (shell & ~hm.inside(vol.shape)).any()
    assert "shell" not in hm.as_dict() and hm.as_dict()["shell_mm"] == SHELL_MM


def test_sin_envolvente_no_hay_corteza():
    hm = head_mask(np.zeros((20, 20, 20), dtype=np.float32), SP, "XA")
    assert not hm.applied
    assert not hm.shell_in((20, 20, 20)).any()
    assert hm.inside((20, 20, 20)).all()


def test_una_placa_de_hueso_flojo_en_la_corteza_se_quita_y_el_tubo_no():
    # un vaso con contraste (400 HU: por debajo del hueso de 700, que si no se lo llevaría como cráneo)
    vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0, value=400.0)
    tube = vol > 0
    # placa de 500 HU (por debajo de los 700 del hueso) pegada a un borde, dentro de la corteza
    vol[:, 2:6, :] = 500.0
    shell = np.zeros(vol.shape, dtype=bool)
    shell[:, 0:12, :] = True
    con = build_vascular_mask(vol, SP, MaskParams(lower=150.0, bone_hu=700.0, shell_hu=300.0,
                                                   bone_margin_mm=1.0), shell=shell)
    sin = build_vascular_mask(vol, SP, MaskParams(lower=150.0, bone_hu=700.0), shell=shell)
    assert sin.stats["shell_vox"] == 0
    assert con.stats["shell_vox"] >= 4 * 64 * 64              # la placa entera
    assert con.stats["m0_vox"] < sin.stats["m0_vox"]
    # el tubo sigue entero
    assert con.mask[tube].mean() > 0.95
    assert not con.mask[:, 2:6, :].any()
