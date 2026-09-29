"""Progreso por sesión: memoria del proceso, GET y WebSocket."""
from __future__ import annotations

import time
from fastapi.testclient import TestClient

from main import app
from services import progress
from services.sessions import create_session
from services.auth_service import COOKIE_NAME, create_access_token

client = TestClient(app, raise_server_exceptions=True)


class TestServicio:
    def test_empieza_vacio_y_avanza_por_fases(self):
        sid = create_session()
        assert progress.get(sid) is None
        progress.start(sid)
        p = progress.get(sid)
        assert p["running"] is True and p["pct"] == 0.0 and p["phase"] == ""
        progress.update(sid, "tubularidad 2/4", 35.0)
        p = progress.get(sid)
        assert p["phase"] == "tubularidad 2/4" and p["pct"] == 35.0
        progress.finish(sid, ok=True)
        p = progress.get(sid)
        assert p["running"] is False and p["ok"] is True and p["pct"] == 100.0

    def test_finish_con_error_guarda_el_mensaje(self):
        sid = create_session()
        progress.start(sid)
        progress.finish(sid, ok=False, message="sin memoria")
        p = progress.get(sid)
        assert p["ok"] is False and p["message"] == "sin memoria"

    def test_el_porcentaje_se_acota_a_0_100(self):
        sid = create_session()
        progress.start(sid)
        progress.update(sid, "x", 140.0)
        assert progress.get(sid)["pct"] == 100.0
        progress.update(sid, "x", -3.0)
        assert progress.get(sid)["pct"] == 0.0


class TestGet:
    def test_sin_progreso_devuelve_parado(self):
        sid = create_session()
        r = client.get(f"/api/progress/{sid}")
        assert r.status_code == 200
        assert r.json()["running"] is False and r.json()["pct"] == 0

    def test_sesion_inexistente_404(self):
        assert client.get("/api/progress/no-existe").status_code == 404

    def test_refleja_el_servicio(self):
        sid = create_session()
        progress.start(sid); progress.update(sid, "superficie", 80.0)
        r = client.get(f"/api/progress/{sid}")
        assert r.json()["phase"] == "superficie" and r.json()["pct"] == 80.0


class TestWebSocket:
    def test_emite_cambios_y_cierra_al_terminar(self):
        sid = create_session()
        client.cookies.set(COOKIE_NAME, create_access_token(subject="admin"))
        progress.start(sid)
        with client.websocket_connect(f"/ws/progress/{sid}") as ws:
            first = ws.receive_json()
            assert first["running"] is True
            progress.update(sid, "máscara", 50.0)
            msg = ws.receive_json()
            assert msg["phase"] == "máscara" and msg["pct"] == 50.0
            progress.finish(sid, ok=True)
            last = ws.receive_json()
            assert last["running"] is False and last["ok"] is True

    def test_token_invalido_cierra_con_4401(self):
        sid = create_session()
        client.cookies.set(COOKIE_NAME, "malo")
        from starlette.websockets import WebSocketDisconnect
        try:
            with client.websocket_connect(f"/ws/progress/{sid}") as ws:
                ws.receive_json()
            assert False, "debía cerrar"
        except WebSocketDisconnect as exc:
            assert exc.code == 4401

    def test_el_token_en_la_query_ya_no_autentica(self):
        """Un JWT en la URL acaba en el log de acceso de uvicorn.

        Aceptarlo «por compatibilidad» mantendría viva la fuga en cuanto un
        cliente volviera a usarlo, así que la query no vale: sin cookie, se
        cierra con 4401 aunque el token sea bueno.
        """
        sid = create_session()
        client.cookies.clear()
        token = create_access_token(subject="admin")
        from starlette.websockets import WebSocketDisconnect
        try:
            with client.websocket_connect(f"/ws/progress/{sid}?token={token}") as ws:
                ws.receive_json()
            assert False, "debía cerrar: la query no autentica"
        except WebSocketDisconnect as exc:
            assert exc.code == 4401

    def test_sesion_inexistente_con_token_valido_cierra_con_4401(self):
        client.cookies.set(COOKIE_NAME, create_access_token(subject="admin"))
        from starlette.websockets import WebSocketDisconnect
        try:
            with client.websocket_connect("/ws/progress/no-existe") as ws:
                ws.receive_json()
            assert False, "debía cerrar"
        except WebSocketDisconnect as exc:
            assert exc.code == 4401
