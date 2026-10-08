"""Lo que la auditoría del 2026-10-08 encontró abierto en la API.

- Una cuenta bloqueada (pendiente, rechazada, desactivada) confirmaba la
  contraseña: 401 si estaba mal y 403 con el motivo si estaba bien. Quien
  probara contraseñas contra una cuenta desactivada sabía en qué momento
  acertaba, y ese acierto no contaba para el límite de intentos.
- La subida de DICOM acotaba cada fichero (500 MB) y el número de ficheros
  (20 000), pero no el total: 20 000 × 500 MB.
- `/docs` y `/openapi.json` eran públicos. No sirven datos, pero enseñan la
  superficie entera de una API que guarda imágenes de pacientes.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services import login_throttle
from services.auth_service import get_password_hash
from services.database import SessionLocal
from services.db_models import User

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _sin_bloqueos():
    login_throttle.reset_all()
    yield
    login_throttle.reset_all()


def _cuenta(*, is_active: bool = True, status: str = User.STATUS_ACTIVE,
            password: str = "correcta-123") -> str:
    nombre = f"u-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    db.add(User(username=nombre, hashed_password=get_password_hash(password), role="medico",
                full_name=nombre, is_active=is_active, status=status))
    db.commit(); db.close()
    return nombre


def _login(nombre: str, password: str):
    return anonymous_client(app).post("/api/auth/login", json={"username": nombre, "password": password})


class TestCuentaBloqueada:
    def test_una_cuenta_desactivada_responde_igual_con_la_contrasena_mal(self):
        nombre = _cuenta(is_active=False)
        mal = _login(nombre, "equivocada-999")
        bien = _login(nombre, "correcta-123")
        assert mal.status_code == bien.status_code == 403
        assert mal.json()["detail"] == bien.json()["detail"]

    def test_una_cuenta_pendiente_responde_igual_con_la_contrasena_mal(self):
        nombre = _cuenta(status=User.STATUS_PENDING)
        mal = _login(nombre, "equivocada-999")
        assert mal.status_code == 403 and "pendiente" in mal.json()["detail"]

    def test_los_intentos_contra_una_cuenta_bloqueada_tambien_cuentan(self):
        nombre = _cuenta(is_active=False)
        for _ in range(login_throttle.MAX_FAILURES):
            assert _login(nombre, "correcta-123").status_code == 403
        assert _login(nombre, "correcta-123").status_code == 429

    def test_una_cuenta_activa_sigue_entrando(self):
        nombre = _cuenta()
        assert _login(nombre, "correcta-123").status_code == 200
        assert _login(nombre, "equivocada-999").status_code == 401


class TestTopeTotalDeSubida:
    def test_la_suma_de_los_ficheros_tiene_tope(self, monkeypatch):
        from routers import upload
        monkeypatch.setattr(upload, "_MAX_UPLOAD_TOTAL_BYTES", 10)
        files = [("files", (f"f{i}.dcm", b"12345678", "application/octet-stream")) for i in range(2)]
        r = client.post("/api/upload", files=files)
        assert r.status_code == 413, r.text
        assert "total" in r.json()["detail"].lower()

    def test_por_debajo_del_tope_entra(self, monkeypatch):
        from routers import upload
        monkeypatch.setattr(upload, "_MAX_UPLOAD_TOTAL_BYTES", 100)
        files = [("files", (f"f{i}.dcm", b"12345678", "application/octet-stream")) for i in range(2)]
        assert client.post("/api/upload", files=files).status_code == 200


class TestDocumentacionDeLaApi:
    def test_anonimo_no_ve_la_documentacion(self):
        anon = anonymous_client(app)
        assert anon.get("/docs").status_code == 401
        assert anon.get("/openapi.json").status_code == 401
        assert anon.get("/redoc").status_code == 401

    def test_con_sesion_si(self):
        assert client.get("/docs").status_code == 200
        esquema = client.get("/openapi.json")
        assert esquema.status_code == 200 and "/api/auth/login" in esquema.json()["paths"]
