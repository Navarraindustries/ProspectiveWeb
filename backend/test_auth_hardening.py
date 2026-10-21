"""Contraseña inicial obligada a cambiarse y límite de intentos de login.

`admin` / `admin123` se creaba al arrancar y valía indefinidamente; y contra
`/api/auth/login` se podían probar contraseñas sin fin.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from conftest import anonymous_client
from main import app
from services import login_throttle
from services.auth_service import (MUST_CHANGE_DETAIL, create_access_token, flag_default_password,
                                   get_password_hash, seed_default_user, verify_password)
from services.database import Base, SessionLocal
from services.db_models import User

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _sin_bloqueos():
    login_throttle.reset_all()
    yield
    login_throttle.reset_all()


def _usuario(must_change: bool, password="inicial-123") -> tuple[str, TestClient]:
    nombre = f"u-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    db.add(User(username=nombre, hashed_password=get_password_hash(password), role="medico",
                full_name=nombre, must_change_password=must_change))
    db.commit(); db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return nombre, c


class TestContrasenaInicial:
    def test_hasta_cambiarla_no_se_puede_hacer_nada_mas(self):
        _nombre, c = _usuario(must_change=True)
        r = c.get("/api/patients")
        assert r.status_code == 403 and r.json()["detail"] == MUST_CHANGE_DETAIL
        me = c.get("/api/auth/me")
        assert me.status_code == 200 and me.json()["must_change_password"] is True

        assert c.post("/api/auth/change-password", json={
            "current_password": "inicial-123", "new_password": "otra-distinta-456"}).status_code == 200
        assert c.get("/api/patients").status_code == 200
        assert c.get("/api/auth/me").json()["must_change_password"] is False

    def test_una_cuenta_normal_no_se_ve_afectada(self):
        _nombre, c = _usuario(must_change=False)
        assert c.get("/api/patients").status_code == 200

    def test_el_admin_nuevo_nace_obligado_y_el_antiguo_se_marca(self, monkeypatch):
        # Sobre una base en memoria: marcar al admin de la base compartida de
        # los tests dejaría a todos los demás con un 403.
        monkeypatch.delenv("PROSPECTIVE_ALLOW_DEFAULT_ADMIN_PASSWORD", raising=False)
        engine = create_engine("sqlite://")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()

        seed_default_user(db)
        admin = db.query(User).filter_by(username="admin").one()
        assert admin.must_change_password is True and verify_password("admin123", admin.hashed_password)

        # Una instalación anterior: la columna nació a False y sigue con admin123.
        admin.must_change_password = False; db.commit()
        flag_default_password(db)
        assert db.query(User).filter_by(username="admin").one().must_change_password is True

        # Si ya la cambió, no se le vuelve a pedir.
        admin.hashed_password = get_password_hash("ya-cambiada-789"); admin.must_change_password = False
        db.commit()
        flag_default_password(db)
        assert db.query(User).filter_by(username="admin").one().must_change_password is False
        db.close()


class TestLimiteDeIntentos:
    def test_al_sexto_fallo_se_bloquea_aunque_la_contrasena_sea_buena(self):
        nombre, _c = _usuario(must_change=False, password="la-buena-123")
        anon = anonymous_client(app)
        for _ in range(login_throttle.MAX_FAILURES):
            assert anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"}).status_code == 401
        r = anon.post("/api/auth/login", json={"username": nombre, "password": "la-buena-123"})
        assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
        assert "intentos" in r.json()["detail"]

    def test_no_bloquea_a_otro_usuario(self):
        anon = anonymous_client(app)
        for _ in range(login_throttle.MAX_FAILURES):
            anon.post("/api/auth/login", json={"username": "victima", "password": "incorrecta-000"})
        otro, _c = _usuario(must_change=False, password="la-buena-123")
        assert anon.post("/api/auth/login", json={"username": otro, "password": "la-buena-123"}).status_code == 200

    def test_un_acierto_pone_el_contador_a_cero(self):
        nombre, _c = _usuario(must_change=False, password="la-buena-123")
        anon = anonymous_client(app)
        for _ in range(login_throttle.MAX_FAILURES - 1):
            anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"})
        assert anon.post("/api/auth/login", json={"username": nombre, "password": "la-buena-123"}).status_code == 200
        for _ in range(login_throttle.MAX_FAILURES - 1):
            assert anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"}).status_code == 401

    def test_los_fallos_caducan(self, monkeypatch):
        k = login_throttle.key("alguien", "1.2.3.4")
        t = [1000.0]
        monkeypatch.setattr(login_throttle.time, "time", lambda: t[0])
        for _ in range(login_throttle.MAX_FAILURES):
            login_throttle.record_failure(k)
        assert login_throttle.blocked_for(k) > 0
        t[0] += login_throttle.WINDOW_S + 1
        assert login_throttle.blocked_for(k) == 0


class TestContactoYIntentosRestantes:
    """F1-40, F1-42, F1-43: quien no puede entrar debe saber a quién escribir,
    y quien se acerca al bloqueo debe saberlo antes de quedarse fuera."""

    def test_el_401_dice_cuantos_intentos_quedan(self):
        nombre, _c = _usuario(must_change=False, password="la-buena-123")
        anon = anonymous_client(app)
        r = anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"})
        assert r.status_code == 401
        d = r.json()["detail"]
        assert d["message"] == "Credenciales incorrectas"
        assert d["remaining_attempts"] == login_throttle.MAX_FAILURES - 1
        for _ in range(login_throttle.MAX_FAILURES - 2):
            r = anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"})
        assert r.json()["detail"]["remaining_attempts"] == 1

    def test_el_429_lleva_el_contacto_por_si_no_recuerda_la_contrasena(self):
        nombre, _c = _usuario(must_change=False, password="la-buena-123")
        anon = anonymous_client(app)
        for _ in range(login_throttle.MAX_FAILURES):
            anon.post("/api/auth/login", json={"username": nombre, "password": "incorrecta-000"})
        r = anon.post("/api/auth/login", json={"username": nombre, "password": "la-buena-123"})
        assert r.status_code == 429
        assert "pide a un administrador que la restablezca" in r.json()["detail"]

    @pytest.mark.parametrize("estado,activo", [("pending", False), ("rejected", False), ("active", False)])
    def test_los_tres_403_llevan_el_correo_del_administrador(self, estado, activo):
        nombre = f"b-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        db.add(User(username=nombre, hashed_password=get_password_hash("la-buena-123"), role="medico",
                    full_name=nombre, status=estado, is_active=activo))
        db.commit(); db.close()
        r = anonymous_client(app).post("/api/auth/login", json={"username": nombre, "password": "la-buena-123"})
        assert r.status_code == 403
        assert "ingprospective@skullapp.tech" in r.json()["detail"]

    def test_el_registro_avisa_de_que_no_habra_aviso(self):
        nombre = f"r-{uuid.uuid4().hex[:8]}"
        r = anonymous_client(app).post("/api/auth/signup", data={
            "username": nombre, "password": "la-buena-123", "full_name": "Nueva Persona"})
        assert r.status_code in (200, 201), r.text
        assert "no recibirás aviso" in r.json()["message"]
        assert "ingprospective@skullapp.tech" in r.json()["message"]
