# -*- coding: utf-8 -*-
"""`os.replace` con reintento: en Windows falla si alguien tiene el destino
abierto un instante. El estado de sesión no reintentaba y hacía fallar
`test_manual_neck_plane_survives_save_and_restore` en la suite completa."""
from __future__ import annotations

import os

import pytest

from services import atomic


def _falla(n, real=os.replace):
    cuenta = {"n": 0}

    def replace(a, b):
        cuenta["n"] += 1
        if cuenta["n"] <= n:
            raise PermissionError(13, "El proceso no tiene acceso al archivo")
        return real(a, b)
    return replace, cuenta


def test_reintenta_hasta_que_el_destino_queda_libre(tmp_path, monkeypatch):
    src, dst = tmp_path / "a.tmp", tmp_path / "a"
    src.write_text("nuevo"); dst.write_text("viejo")
    rep, cuenta = _falla(3)
    monkeypatch.setattr(atomic.os, "replace", rep)
    monkeypatch.setattr(atomic.time, "sleep", lambda s: None)
    atomic.replace(src, dst)
    assert dst.read_text() == "nuevo" and cuenta["n"] == 4 and not src.exists()


def test_se_rinde_sin_dejar_el_temporal(tmp_path, monkeypatch):
    src, dst = tmp_path / "a.tmp", tmp_path / "a"
    src.write_text("nuevo"); dst.write_text("viejo")
    rep, _ = _falla(10_000)
    monkeypatch.setattr(atomic.os, "replace", rep)
    monkeypatch.setattr(atomic.time, "sleep", lambda s: None)
    with pytest.raises(PermissionError):
        atomic.replace(src, dst)
    assert dst.read_text() == "viejo" and not src.exists()


def test_el_estado_de_sesion_lo_usa(monkeypatch):
    from services.sessions import create_session, read_state, write_state
    sid = create_session()
    rep, cuenta = _falla(2)
    monkeypatch.setattr(atomic.os, "replace", rep)
    monkeypatch.setattr(atomic.time, "sleep", lambda s: None)
    write_state(sid, "morpho.neck_mm", "3.4")
    assert read_state(sid, "morpho.neck_mm", "") == "3.4" and cuenta["n"] == 3
