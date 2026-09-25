"""Progreso de la sesión: GET siempre, WebSocket cuando el proxy lo deja pasar."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from services import progress
from services.auth_service import user_for_token
from services.database import SessionLocal
from services.sessions import session_exists

router = APIRouter(prefix="/api", tags=["progress"])
ws_router = APIRouter(tags=["progress"])

_IDLE = {"phase": "", "pct": 0.0, "running": False, "ok": None, "message": "", "updated_at": 0.0}


@router.get("/progress/{session_id}", summary="Fase y porcentaje del trabajo en curso")
async def get_progress(session_id: str) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return progress.get(session_id) or dict(_IDLE)


@ws_router.websocket("/ws/progress/{session_id}")
async def ws_progress(websocket: WebSocket, session_id: str, token: str = "") -> None:
    # El navegador no puede mandar Authorization en un WebSocket: el JWT va en
    # la query y se valida igual que en el guard de /data.
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
    last: dict | None = None
    try:
        while True:
            cur = progress.get(session_id) or dict(_IDLE)
            if cur != last:
                await websocket.send_json(cur)
                last = cur
                if not cur["running"] and cur["ok"] is not None:
                    break
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return
    await websocket.close()
