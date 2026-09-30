# -*- coding: utf-8 -*-
"""Un solo proceso sobre `data/`: el segundo no arranca, y al morir el primero
el siguiente sí (el cerrojo es del sistema operativo, no un fichero que quede)."""
from __future__ import annotations

import os
import subprocess
import sys
import textwrap
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent

_PROG = textwrap.dedent("""
    import sys, time
    sys.path.insert(0, r"{backend}")
    from pathlib import Path
    from services import single_process
    try:
        single_process.acquire(Path(r"{datos}"))
    except single_process.SecondProcessError as e:
        print("RECHAZADO", e, flush=True); sys.exit(3)
    print("TENGO", flush=True)
    time.sleep({dormir})
""")


def _lanza(datos: Path, dormir: float) -> subprocess.Popen:
    env = {k: v for k, v in os.environ.items() if k != "PROSPECTIVE_ALLOW_MULTI_PROCESS"}
    code = _PROG.format(backend=_BACKEND, datos=datos, dormir=dormir)
    return subprocess.Popen([sys.executable, "-c", code], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def test_el_segundo_proceso_no_arranca_y_el_tercero_si(tmp_path):
    primero = _lanza(tmp_path, dormir=30)
    try:
        assert primero.stdout.readline().strip() == "TENGO"
        segundo = _lanza(tmp_path, dormir=0)
        out, _ = segundo.communicate(timeout=30)
        assert segundo.returncode == 3 and "RECHAZADO" in out
        assert "--workers" in out, "el mensaje tiene que decir qué hacer"
    finally:
        primero.kill()
        primero.wait(timeout=30)
    time.sleep(0.2)
    tercero = _lanza(tmp_path, dormir=0)
    out, _ = tercero.communicate(timeout=30)
    assert tercero.returncode == 0 and "TENGO" in out


def test_desactivado_para_los_tests(tmp_path, monkeypatch):
    from services import single_process
    monkeypatch.setenv("PROSPECTIVE_ALLOW_MULTI_PROCESS", "1")
    assert single_process.acquire(tmp_path) is False
