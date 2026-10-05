"""Lo que la segmentación deja atrás: resultados sin recoger y mapas de
seguimiento que ya no corresponden a la malla.
"""
from __future__ import annotations

import time

from routers import segment
from services.sessions import create_session, delete_session, session_subdir


def test_un_resultado_caducado_o_de_una_sesion_borrada_se_tira():
    segment._RESULTS.clear()
    viva, vieja, borrada, nueva = (create_session() for _ in range(4))
    segment._keep_result(viva, {"status": 200, "result": "a"})
    segment._keep_result(vieja, {"status": 200, "result": "b"})
    segment._keep_result(borrada, {"status": 200, "result": "c"})
    segment._RESULTS[vieja]["at"] = time.time() - segment.RESULT_TTL_S - 1
    delete_session(borrada)

    segment._keep_result(nueva, {"status": 422, "detail": "x"})

    assert set(segment._RESULTS) == {viva, nueva}
    assert segment._RESULTS[nueva]["status"] == 422


def test_volver_a_segmentar_borra_los_mapas_de_seguimiento():
    sid = create_session()
    m = session_subdir(sid, "meshes")
    for nombre in ("seguimiento_mapa.vtp", "seguimiento_saco_anterior.vtp", "vessel_tree.vtp"):
        (m / nombre).write_bytes(b"x")

    segment._drop_followup_maps(sid)

    assert sorted(p.name for p in m.iterdir()) == ["vessel_tree.vtp"]
