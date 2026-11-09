"""Foto de perfil propia, separada de la foto del registro."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_profphoto_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine, SessionLocal
from services.db_models import User
from services.auth_service import get_password_hash

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

REG = b"\x89PNG\r\n\x1a\n" + b"R" * 64
PERFIL = b"\x89PNG\r\n\x1a\n" + b"P" * 80


def _make_user(username: str, registro: bool = False, perfil: bool = False, modo: str = "avatar") -> int:
    db = SessionLocal()
    u = User(username=username, full_name="Foto Test", role="medico", is_active=True,
             status="active", hashed_password=get_password_hash("secret12345"), avatar_mode=modo)
    if registro:
        p = Path(_tmp) / f"{username}_reg.png"
        p.write_bytes(REG)
        u.photo_path = str(p)
    if perfil:
        p = Path(_tmp) / f"{username}_perfil.png"
        p.write_bytes(PERFIL)
        u.profile_photo_path = str(p)
    db.add(u)
    db.commit()
    uid = u.id
    db.close()
    return uid


def _h(username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "secret12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _row(username: str) -> User:
    db = SessionLocal()
    u = db.query(User).filter_by(username=username).one()
    db.expunge(u)
    db.close()
    return u


def test_subir_foto_de_perfil_no_toca_la_del_registro():
    _make_user("pf_sube", registro=True)
    antes = _row("pf_sube").photo_path
    r = client.post("/api/auth/me/profile-photo", headers=_h("pf_sube"),
                    files={"photo": ("yo.png", PERFIL, "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["has_profile_photo"] is True
    u = _row("pf_sube")
    assert u.photo_path == antes
    assert Path(antes).read_bytes() == REG
    assert Path(u.profile_photo_path).read_bytes() == PERFIL


def test_copiar_desde_registro():
    _make_user("pf_copia", registro=True)
    h = _h("pf_copia")
    r = client.post("/api/auth/me/profile-photo", headers=h, json={"desde_registro": True})
    assert r.status_code == 200, r.text
    assert r.json()["has_profile_photo"] is True
    u = _row("pf_copia")
    assert u.profile_photo_path != u.photo_path
    assert Path(u.profile_photo_path).suffix == ".png"
    assert Path(u.profile_photo_path).read_bytes() == REG
    assert Path(u.photo_path).exists()


def test_copiar_sin_foto_de_registro_404():
    _make_user("pf_copia0")
    r = client.post("/api/auth/me/profile-photo", headers=_h("pf_copia0"), json={"desde_registro": True})
    assert r.status_code == 404


def test_borrar_foto_de_perfil_deja_la_del_registro_y_vuelve_a_avatar():
    _make_user("pf_borra", registro=True, perfil=True, modo="foto")
    r = client.delete("/api/auth/me/profile-photo", headers=_h("pf_borra"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_profile_photo"] is False
    assert body["avatar_mode"] == "avatar"
    assert body["has_photo"] is True
    u = _row("pf_borra")
    assert Path(u.photo_path).exists()
    assert not u.profile_photo_path
    assert client.get("/api/auth/me/profile-photo", headers=_h("pf_borra")).status_code == 404


def test_get_propia():
    _make_user("pf_get", perfil=True)
    r = client.get("/api/auth/me/profile-photo", headers=_h("pf_get"))
    assert r.status_code == 200
    assert r.content == PERFIL


def test_foto_de_otro_solo_si_eligio_mostrarla():
    b_id = _make_user("pf_b", perfil=True, modo="avatar")
    _make_user("pf_a")
    ha = _h("pf_a")
    assert client.get(f"/api/auth/users/{b_id}/profile-photo", headers=ha).status_code == 404
    db = SessionLocal()
    db.query(User).filter_by(username="pf_b").one().avatar_mode = "foto"
    db.commit()
    db.close()
    r = client.get(f"/api/auth/users/{b_id}/profile-photo", headers=ha)
    assert r.status_code == 200
    assert r.content == PERFIL


def test_foto_de_otro_nunca_devuelve_la_del_registro():
    b_id = _make_user("pf_c", registro=True, modo="foto")
    _make_user("pf_d")
    assert client.get(f"/api/auth/users/{b_id}/profile-photo", headers=_h("pf_d")).status_code == 404


def test_foto_de_otro_exige_sesion():
    b_id = _make_user("pf_e", perfil=True, modo="foto")
    from conftest import anonymous_client
    anonimo = anonymous_client(app)
    assert anonimo.get(f"/api/auth/users/{b_id}/profile-photo").status_code in (401, 403)


def test_foto_de_perfil_mayor_de_6mb_413():
    _make_user("pf_grande")
    big = b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024 + 1)
    r = client.post("/api/auth/me/profile-photo", headers=_h("pf_grande"),
                    files={"photo": ("big.png", big, "image/png")})
    assert r.status_code == 413
    assert not _row("pf_grande").profile_photo_path
