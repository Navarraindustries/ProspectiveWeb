"""Progreso de la sesión: GET siempre, WebSocket cuando el proxy lo deja pasar."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from services import progress
from services.auth_service import COOKIE_NAME, user_for_token
from services.database import SessionLocal
from services.sessions import session_exists

router = APIRouter(prefix="/api", tags=["progress"])
ws_router = APIRouter(tags=["progress"])

_IDLE = {"phase": "", "pct": 0.0, "running": False, "ok": None, "message": "", "updated_at": 0.0, "job": ""}


@router.get("/progress/{session_id}", summary="Fase y porcentaje del trabajo en curso")
async def get_progress(session_id: str) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return progress.get(session_id) or dict(_IDLE)


@ws_router.websocket("/ws/progress/{session_id}")
async def ws_progress(websocket: WebSocket, session_id: str) -> None:
    # El navegador no puede mandar Authorization en un WebSocket, así que el
    # token sale de la COOKIE de sesión, la misma que ya usa el guard de
    # `/data` (`auth_service.COOKIE_NAME`). El handshake es una petición
    # same-origin más y el navegador la manda solo.
    #
    # Antes venía en la query, y uvicorn registra la línea de petición entera:
    # cada conexión escribía un JWT válido en el log de acceso.
    #
    #   WebSocket /ws/progress/0d2acaf9-…?token=eyJhbGciOiJIUzI1NiIs…
    #
    # Cualquiera con acceso al log —o un proxy inverso, o un agregador— podía
    # suplantar al usuario hasta que el token caducara. El parámetro ya no se
    # acepta: dejarlo como alternativa mantendría viva la fuga en cuanto un
    # cliente volviera a usarlo.
    token = websocket.cookies.get(COOKIE_NAME, "")
    db = SessionLocal()
    try:
        user = user_for_token(db, token)
    finally:
        db.close()
    # El código de cierre solo llega al navegador si el handshake se aceptó
    # antes: un uvicorn real rechaza un WS sin aceptar con un HTTP 403 llano y
    # el código 4401 se pierde por el camino, así que se acepta primero y se
    # cierra después con ese código cuando el token o la sesión no valen.
    await websocket.accept()
    if user is None or not session_exists(session_id):
        await websocket.close(code=4401)
        return
    # El bucle solo ENVÍA, y enviar no falla hasta que hay algo que mandar: con
    # una sesión sin trabajo el estado no cambia nunca y un cliente que se fue
    # dejaba la tarea girando a 4 Hz para siempre. Se escucha a la vez: la
    # desconexión llega como un mensaje `websocket.disconnect`.
    escucha = asyncio.ensure_future(websocket.receive())
    last: dict | None = None
    try:
        while True:
            if escucha.done():
                msg = escucha.result()
                if msg.get("type") == "websocket.disconnect":
                    return
                escucha = asyncio.ensure_future(websocket.receive())
            cur = progress.get(session_id) or dict(_IDLE)
            if cur != last:
                await websocket.send_json(cur)
                last = cur
                if not cur["running"] and cur["ok"] is not None:
                    break
            await asyncio.wait({escucha}, timeout=0.25)
    except (WebSocketDisconnect, RuntimeError):
        return
    finally:
        if not escucha.done():
            escucha.cancel()
    await websocket.close()
