"""No perder trabajo: el guardado no destruye el anterior antes de tener el
nuevo, la limpieza borra por inactividad y no por antigüedad, y un fallo de la
auditoría o del registro no pasa en silencio."""
from __future__ import annotations

import logging
import os
import time

import pytest

from services import sessions
from services.sessions import (
    SESSION_TTL_SEC, create_session, purge_expired_sessions, saved_session_dir,
    session_exists, session_subdir, snapshot_session, touch_session, write_state,
)


class TestGuardar:
    def test_el_guardado_nuevo_sustituye_al_anterior(self):
        sid = create_session()
        write_state(sid, "x", "1")
        snapshot_session(sid)
        write_state(sid, "x", "2")
        snapshot_session(sid)
        assert "x=2" in (saved_session_dir(sid) / "state.txt").read_text(encoding="utf-8")
        assert not any(p.name.startswith(sid + ".") for p in sessions.SAVES_ROOT.iterdir())

    def test_si_la_copia_falla_el_guardado_anterior_sigue_entero(self, monkeypatch):
        sid = create_session()
        write_state(sid, "x", "antes")
        snapshot_session(sid)
        write_state(sid, "x", "despues")

        def _disco_lleno(src, dst):
            dst.mkdir(parents=True, exist_ok=True)
            (dst / "a_medias").write_text("x")
            raise OSError(28, "No space left on device")
        monkeypatch.setattr(sessions, "_clone_tree", _disco_lleno)
        with pytest.raises(OSError):
            snapshot_session(sid)
        assert "x=antes" in (saved_session_dir(sid) / "state.txt").read_text(encoding="utf-8")
        assert not (sessions.SAVES_ROOT / f"{sid}.nuevo").exists()


class TestCaducidad:
    def _envejecer(self, sid: str, segundos: float) -> None:
        d = sessions.SESSIONS_ROOT / sid
        (d / ".created_at").write_text(str(time.time() - segundos))
        marca = d / sessions.LAST_USED_FILE
        if marca.exists():
            viejo = time.time() - segundos
            os.utime(marca, (viejo, viejo))

    def test_una_sesion_usada_hace_poco_no_se_borra_aunque_sea_vieja(self):
        sid = create_session()
        self._envejecer(sid, SESSION_TTL_SEC + 3600)
        touch_session(sid)                       # se usó ahora
        purge_expired_sessions()
        assert session_exists(sid)

    def test_una_sesion_sin_usar_pasado_el_plazo_se_borra(self):
        sid = create_session()
        touch_session(sid)
        self._envejecer(sid, SESSION_TTL_SEC + 3600)
        purge_expired_sessions()
        assert not session_exists(sid)

    def test_cada_peticion_la_mantiene_viva(self):
        from fastapi.testclient import TestClient
        from main import app
        c = TestClient(app)
        c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        sid = create_session()
        self._envejecer(sid, SESSION_TTL_SEC - 60)
        c.get(f"/api/treatment-decision/{sid}")
        purge_expired_sessions()
        assert session_exists(sid)
        assert sessions.live_session_expires_at(sid) > time.time() + SESSION_TTL_SEC - 120


class TestAuditoria:
    def test_un_fallo_al_escribir_se_ve_en_health(self, monkeypatch):
        from fastapi.testclient import TestClient
        from main import app
        from services import audit

        class _Rota:
            def append(self, *a, **k):
                raise OSError("disco de solo lectura")
        real = audit.SkullChain.instance
        monkeypatch.setattr(audit.SkullChain, "instance", classmethod(lambda cls: _Rota()))
        audit.audit_append("prueba", {})
        r = TestClient(app).get("/health")
        assert r.status_code == 200                  # el contenedor sigue viéndolo vivo
        assert r.json()["status"] == "degraded"
        assert "solo lectura" in r.json()["audit"]["error"]

        monkeypatch.setattr(audit.SkullChain, "instance", real)
        audit.audit_append("prueba", {})
        assert TestClient(app).get("/health").json()["status"] == "ok"


class TestRegistro:
    def test_escribe_con_fecha_en_su_carpeta(self):
        from services.registro import configurar_registro
        configurar_registro()                        # ya lo hizo main: no duplica
        logging.getLogger("prueba.registro").info("mensaje de prueba")
        for h in logging.getLogger().handlers:
            h.flush()
        fichero = os.path.join(os.environ["PROSPECTIVE_LOG_DIR"], "backend.log")
        texto = open(fichero, encoding="utf-8").read()
        assert "mensaje de prueba" in texto
        linea = [l for l in texto.splitlines() if "mensaje de prueba" in l][-1]
        assert linea[:4].isdigit()                   # empieza por la fecha
        assert len([h for h in logging.getLogger().handlers
                    if getattr(h, "baseFilename", "").endswith("backend.log")]) == 1
