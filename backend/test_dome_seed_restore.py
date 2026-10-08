"""El ápice marcado a mano vuelve con la morfometría al reanudar.

Volvían los puntos del borde del cuello pero no el ápice, y sin él «Medir saco
cerrado» quedaba apagado: para corregir una medida había que marcarlo de nuevo.
"""
from __future__ import annotations

from routers.detect import _read_dome_seed
from services.sessions import create_session, write_states


def _sesion(**estado) -> str:
    sid = create_session()
    write_states(sid, {k.replace("__", "."): v for k, v in estado.items()})
    return sid


def test_con_el_cuello_marcado_a_mano_devuelve_el_apice():
    for fuente in ("rim", "manual"):
        sid = _sesion(morpho__neck_source=fuente, morpho__plane_seed_x="72.0",
                      morpho__plane_seed_y="65.7", morpho__plane_seed_z="84.9")
        p = _read_dome_seed(sid)
        assert (p.x, p.y, p.z) == (72.0, 65.7, 84.9)


def test_en_la_medida_automatica_no_hay_apice_que_devolver():
    sid = _sesion(morpho__neck_source="auto", morpho__plane_seed_x="1", morpho__plane_seed_y="2",
                  morpho__plane_seed_z="3")
    assert _read_dome_seed(sid) is None


def test_un_apice_a_medias_o_ilegible_no_se_inventa():
    assert _read_dome_seed(_sesion(morpho__neck_source="rim", morpho__plane_seed_x="1")) is None
    assert _read_dome_seed(_sesion(morpho__neck_source="rim", morpho__plane_seed_x="nan",
                                   morpho__plane_seed_y="2", morpho__plane_seed_z="3")) is None
