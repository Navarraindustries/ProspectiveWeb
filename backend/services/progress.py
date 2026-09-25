"""Progreso de trabajos largos, por sesión, en memoria del proceso.

Una segmentación tubular en 1 vCPU tarda minutos, y una barra indeterminada no
dice si el servidor sigue vivo. Esto guarda fase y porcentaje para que el GET
y el WebSocket los enseñen. Vive en memoria: con un solo proceso uvicorn es
exacto, y si el proceso se reinicia el progreso desaparece con el trabajo.
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_state: dict[str, dict] = {}


def start(session_id: str) -> None:
    with _lock:
        _state[session_id] = {
            "phase": "", "pct": 0.0, "running": True, "ok": None,
            "message": "", "updated_at": time.time(),
        }


def update(session_id: str, phase: str, pct: float) -> None:
    with _lock:
        s = _state.get(session_id)
        if s is None or not s["running"]:
            return
        s["phase"] = phase
        s["pct"] = float(min(100.0, max(0.0, pct)))
        s["updated_at"] = time.time()


def finish(session_id: str, ok: bool, message: str = "") -> None:
    with _lock:
        s = _state.get(session_id)
        if s is None:
            return
        s.update(running=False, ok=bool(ok), message=message,
                 pct=100.0 if ok else s["pct"], updated_at=time.time())


def get(session_id: str) -> dict | None:
    with _lock:
        s = _state.get(session_id)
        return dict(s) if s is not None else None
