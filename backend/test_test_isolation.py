"""Las pruebas no escriben en backend/data (sesiones y guardados reales)."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from services import sessions as S

_DATA = Path(__file__).resolve().parent / "data"


def _bajo(p: Path, raiz: Path) -> bool:
    return raiz.resolve() in Path(p).resolve().parents


def test_las_raices_son_las_del_entorno_y_no_las_reales():
    assert S.SESSIONS_ROOT == Path(os.environ["PROSPECTIVE_SESSIONS_ROOT"])
    assert S.SAVES_ROOT == Path(os.environ["PROSPECTIVE_SAVES_ROOT"])
    assert not _bajo(S.SESSIONS_ROOT, _DATA)
    assert not _bajo(S.SAVES_ROOT, _DATA)


def test_create_y_snapshot_escriben_en_el_temporal():
    sid = S.create_session()
    assert (S.SESSIONS_ROOT / sid).is_dir()
    S.snapshot_session(sid)
    assert (S.SAVES_ROOT / sid).is_dir()
    assert not (_DATA / "sessions" / sid).exists()
    assert not (_DATA / "session_saves" / sid).exists()


def test_sin_variables_se_usan_las_rutas_de_siempre():
    env = {k: v for k, v in os.environ.items()
           if k not in ("PROSPECTIVE_SESSIONS_ROOT", "PROSPECTIVE_SAVES_ROOT")}
    out = subprocess.run(
        [sys.executable, "-c",
         "from services import sessions as S; print(S.SESSIONS_ROOT); print(S.SAVES_ROOT)"],
        cwd=str(Path(__file__).resolve().parent), env=env,
        capture_output=True, text=True, check=True).stdout.split("\n")
    assert Path(out[0]) == _DATA / "sessions"
    assert Path(out[1]) == _DATA / "session_saves"
