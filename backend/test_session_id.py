"""El identificador de sesión llega de fuera y acaba siendo una ruta.

Sin validarlo, «..» era una sesión válida (`data/sessions/..` es `data/`) y
«Guardar progreso» con ese id hacía `rmtree` de `data/session_saves/..`: la
carpeta `data/` entera. Estos tests trabajan sobre carpetas temporales: aunque
la validación fallara, no tocan los datos reales.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services import sessions as S

client = TestClient(app, raise_server_exceptions=True)

MALOS = ["..", "../..", ".", "", "../session_saves", "a/b", "..\..", "no-es-un-uuid",
         "00000000-0000-0000-0000-00000000000Z", "A" * 36]


@pytest.fixture
def raices(tmp_path, monkeypatch):
    """Sesiones y guardados en un árbol temporal, con un testigo al lado."""
    (tmp_path / "sessions").mkdir(); (tmp_path / "session_saves").mkdir()
    (tmp_path / "testigo.db").write_text("no me borres")
    monkeypatch.setattr(S, "SESSIONS_ROOT", tmp_path / "sessions")
    monkeypatch.setattr(S, "SAVES_ROOT", tmp_path / "session_saves")
    return tmp_path


@pytest.mark.parametrize("sid", MALOS)
def test_un_id_que_no_es_uuid_no_es_una_sesion(sid, raices):
    assert not S.valid_session_id(sid)
    assert S.session_exists(sid) is False
    assert S.has_saved_session(sid) is False
    for f in (S.session_dir, S.snapshot_session, S.delete_session, S.delete_saved_session,
              S.rehydrate_session, S.saved_session_dir):
        with pytest.raises(S.InvalidSessionId):
            f(sid)
    with pytest.raises(S.InvalidSessionId):
        S.session_subdir(sid, "meshes")
    with pytest.raises(S.InvalidSessionId):
        S.write_state(sid, "k", "v")
    assert (raices / "testigo.db").read_text() == "no me borres"
    assert sorted(p.name for p in raices.iterdir()) == ["session_saves", "sessions", "testigo.db"]


def test_guardar_progreso_con_dos_puntos_no_borra_nada(raices):
    # El camino exacto del fallo: POST /api/sessions/save con session_id «..».
    r = client.post("/api/sessions/save", json={"session_id": "..", "current_step": 0})
    assert r.status_code == 404
    assert (raices / "testigo.db").exists()


def test_un_uuid_de_verdad_sigue_funcionando(raices):
    sid = S.create_session()
    assert S.valid_session_id(sid) and S.session_exists(sid)
    S.write_state(sid, "k", "v")
    assert S.read_state(sid, "k") == "v"
    assert S.snapshot_session(sid) >= 0 and S.has_saved_session(sid)


def test_un_id_invalido_en_la_url_es_404():
    assert client.get("/api/followup/no-es-un-uuid/studies").status_code in (200, 404)
    r = client.post("/api/followup/no-es-un-uuid", json={"previous_session_id": ".."})
    assert r.status_code == 404
