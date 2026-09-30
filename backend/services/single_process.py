"""Un solo proceso sirviendo `data/`, defendido y no solo documentado.

El progreso de cada trabajo y el semáforo que deja correr una sola
segmentación tubular viven en la memoria del proceso. Con `--workers 4` el
progreso se consultaría en un proceso que no segmenta, y dos tubulares podrían
correr a la vez y agotar la RAM. El README lo decía; nada lo impedía.

Se toma un cerrojo EXCLUSIVO del sistema operativo sobre `data/.proceso.lock`.
El sistema lo suelta cuando el proceso muere —también si lo matan—, así que
`--reload` y los reinicios funcionan. Un segundo proceso sobre los mismos datos
no arranca y dice por qué.

`PROSPECTIVE_ALLOW_MULTI_PROCESS=1` lo desactiva: lo usan los tests, que
arrancan la app varias veces en paralelo contra bases de datos temporales.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import IO

_handle: IO | None = None


class SecondProcessError(RuntimeError):
    pass


def acquire(data_dir: Path) -> bool:
    """Toma el cerrojo. Devuelve False si está desactivado; lanza si otro lo tiene."""
    global _handle
    if os.environ.get("PROSPECTIVE_ALLOW_MULTI_PROCESS") == "1":
        return False
    if _handle is not None:
        return True
    data_dir.mkdir(parents=True, exist_ok=True)
    fh = open(data_dir / ".proceso.lock", "a+b")
    try:
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        fh.close()
        raise SecondProcessError(
            "Ya hay otro proceso de PROSPECTIVE sirviendo esta carpeta de datos "
            f"({data_dir}). Arranca uvicorn con un único worker (sin --workers N): "
            "el progreso y el límite de una segmentación tubular a la vez viven en "
            "la memoria del proceso. Busca el otro servidor (un uvicorn antiguo que "
            "siga vivo, por ejemplo) y páralo."
        ) from exc
    _handle = fh
    return True


def release() -> None:
    global _handle
    if _handle is None:
        return
    try:
        if os.name == "nt":
            import msvcrt
            _handle.seek(0)
            msvcrt.locking(_handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(_handle.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    _handle.close()
    _handle = None
