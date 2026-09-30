"""`os.replace` con reintento, para Windows.

En Windows `os.replace` falla con PermissionError si otro proceso o hilo tiene
el destino abierto en ese instante: un lector del estado de la sesión, el
navegador descargando una malla, el antivirus indexando. La ventana es de
milisegundos, así que se reintenta un poco antes de rendirse. Fuera de
Windows el primer intento basta.

Lo usaba ya `segmentation.write_vtp`; el estado de sesión no, y eso hizo
fallar `test_manual_neck_plane_survives_save_and_restore` en la suite completa.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

INTENTOS: int = 10


def replace(src: str | Path, dst: str | Path) -> None:
    """`os.replace(src, dst)`, reintentando si el destino está abierto.

    Si no lo consigue borra `src` y relanza el último PermissionError.
    """
    ultimo: PermissionError | None = None
    for intento in range(INTENTOS):
        try:
            os.replace(src, dst)
            return
        except PermissionError as exc:
            ultimo = exc
            time.sleep(0.05 * (intento + 1))
    Path(src).unlink(missing_ok=True)
    assert ultimo is not None
    raise ultimo
