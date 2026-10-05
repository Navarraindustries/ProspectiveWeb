"""Orígenes CORS desde la configuración, y el progreso que dice de qué trabajo es."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from services import progress
from services.sessions import create_session, session_subdir

client = TestClient(main.app, raise_server_exceptions=True)


class TestCors:
    def test_sin_configurar_son_los_del_servidor_de_desarrollo(self, monkeypatch):
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        assert "http://localhost:5173" in main.cors_origins()

    def test_la_variable_los_fija(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "https://prospective.example.org/, https://otro.example.org")
        assert main.cors_origins() == ["https://prospective.example.org", "https://otro.example.org"]

    def test_el_comodin_no_se_admite(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "*")
        with pytest.raises(RuntimeError, match="credenciales"):
            main.cors_origins()


class TestProgreso:
    def test_dice_de_que_trabajo_es(self):
        sid = create_session()
        assert progress.running_job(sid) is None
        progress.start(sid, job="segment")
        assert progress.running_job(sid) == "segment"
        assert progress.get(sid)["job"] == "segment"
        progress.finish(sid, ok=True)
        assert progress.running_job(sid) is None

    def test_detectar_espera_a_la_segmentacion(self):
        sid = create_session()
        (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_bytes(b"x")
        progress.start(sid, job="segment")
        try:
            r = client.post(f"/api/detect/{sid}")
            assert r.status_code == 409, r.text
            assert progress.running_job(sid) == "segment"     # no lo ha pisado
        finally:
            progress.finish(sid, ok=True)
