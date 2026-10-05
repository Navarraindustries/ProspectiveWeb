"""Límite de intentos fallidos de inicio de sesión.

Sin esto se podían probar contraseñas sin fin contra `/api/auth/login`. Tras
`MAX_FAILURES` fallos en `WINDOW_S` para el mismo usuario desde la misma
dirección, se rechaza con 429 hasta que caduque el más antiguo. Por usuario Y
dirección: bloquear solo por usuario dejaría a cualquiera cerrarle la puerta a
un compañero con cinco contraseñas mal puestas.

En memoria del proceso, como el progreso: hay un solo proceso
(services/single_process.py), y un reinicio lo pone a cero.
"""
from __future__ import annotations

import threading
import time
from collections import deque

MAX_FAILURES = 5
WINDOW_S = 15 * 60

_lock = threading.Lock()
_failures: dict[tuple[str, str], deque[float]] = {}


def key(username: str, host: str) -> tuple[str, str]:
    return (username.strip().lower(), host or "")


def _recent(k: tuple[str, str], now: float) -> deque[float]:
    q = _failures.get(k)
    if q is None:
        return deque()
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if not q:
        _failures.pop(k, None)
    return q


def blocked_for(k: tuple[str, str]) -> float:
    """Segundos que faltan para poder volver a intentarlo; 0 si se puede."""
    now = time.time()
    with _lock:
        q = _recent(k, now)
        if len(q) < MAX_FAILURES:
            return 0.0
        return max(0.0, WINDOW_S - (now - q[0]))


def record_failure(k: tuple[str, str]) -> None:
    now = time.time()
    with _lock:
        _recent(k, now)
        _failures.setdefault(k, deque()).append(now)


def clear(k: tuple[str, str]) -> None:
    with _lock:
        _failures.pop(k, None)


def reset_all() -> None:
    """Para los tests."""
    with _lock:
        _failures.clear()
