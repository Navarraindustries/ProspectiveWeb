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

#: Cuánto se conserva el resultado de un trabajo terminado. Basta con que el
#: cliente que esperaba lo lea; después sobra. Sin esto el dict crecía una
#: entrada por sesión mientras viviera el proceso, aunque las sesiones se
#: purgan a las 24 h.
FINISHED_TTL_S: float = 15 * 60


def _prune(now: float) -> None:
    """Quita los trabajos terminados hace más de `FINISHED_TTL_S`. Con `_lock`."""
    viejos = [k for k, s in _state.items()
              if not s["running"] and now - s["updated_at"] > FINISHED_TTL_S]
    for k in viejos:
        del _state[k]


def start(session_id: str, job: str = "") -> None:
    """`job` dice de qué trabajo es el progreso («segment», «detect»): los dos
    comparten la clave de la sesión, y sin esto no se distinguían."""
    with _lock:
        _prune(time.time())
        _state[session_id] = {
            "phase": "", "pct": 0.0, "running": True, "ok": None,
            "message": "", "updated_at": time.time(), "job": job,
        }


def running_job(session_id: str) -> str | None:
    """El trabajo en curso de la sesión, o None si no hay ninguno."""
    with _lock:
        s = _state.get(session_id)
        return (s.get("job") or "") if s is not None and s["running"] else None


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
