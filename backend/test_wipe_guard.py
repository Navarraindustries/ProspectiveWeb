"""Los vaciados «solo para tests» no pueden tocar las carpetas reales.

Pasó: `test_clip_orders` vació la carpeta real de pedidos porque otro test
había importado la app antes y el módulo tenía ya la raíz real.
"""
from __future__ import annotations

import pytest

from services import clip_library, clip_orders


def test_la_suite_no_trabaja_sobre_las_carpetas_reales():
    assert clip_orders.ORDERS_ROOT.resolve() != clip_orders._REAL_ROOT.resolve()
    assert clip_library.LIBRARY_ROOT.resolve() != clip_library._REAL_ROOT.resolve()


def test_el_vaciado_se_niega_si_la_raiz_es_la_real(monkeypatch):
    monkeypatch.setattr(clip_orders, "ORDERS_ROOT", clip_orders._REAL_ROOT)
    with pytest.raises(RuntimeError, match="carpeta real"):
        clip_orders.clear_store()
    monkeypatch.setattr(clip_library, "LIBRARY_ROOT", clip_library._REAL_ROOT)
    with pytest.raises(RuntimeError, match="biblioteca real"):
        clip_library.clear_library()


def test_el_linaje_de_una_sesion_reanudada_incluye_la_guardada():
    from services.sessions import create_session, session_lineage, snapshot_session, rehydrate_session, write_state
    guardada = create_session()
    snapshot_session(guardada)
    viva = rehydrate_session(guardada)
    write_state(viva, "origin.saved_session_id", guardada)
    assert session_lineage(viva) == {viva, guardada}
    assert session_lineage(guardada) == {guardada}
    assert session_lineage("no-es-un-uuid") == set()


def test_los_pedidos_de_la_sesion_guardada_se_ven_desde_la_reanudada():
    from services.sessions import create_session, session_lineage, snapshot_session, rehydrate_session, write_state
    guardada = create_session()
    snapshot_session(guardada)
    viva = rehydrate_session(guardada)
    write_state(viva, "origin.saved_session_id", guardada)
    todos = [type("O", (), {"session_id": s})() for s in (guardada, "otra")]
    assert [o.session_id for o in todos if o.session_id in session_lineage(viva)] == [guardada]
