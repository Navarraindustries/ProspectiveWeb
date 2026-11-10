"""Foto y CV del registro: nada de lo que suba alguien sin cuenta puede ejecutarse
en el navegador de quien lo abre (el admin al revisar la solicitud).

Antes se guardaba con la extensión que mandaba el cliente y se servía con el tipo
deducido de ella y sin `nosniff`: un «photo.html» se abría como página en el origen
de la app con la sesión del admin.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import User
from starlette.testclient import TestClient

Base.metadata.create_all(bind=engine)
admin = TestClient(app)  # el conftest le pone la sesión del admin
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
HTML = b"<html><script>alert(1)</script></html>"


def _signup(**ficheros) -> tuple[int, str]:
    nombre = f"sol-{uuid.uuid4().hex[:8]}"
    r = anonymous_client(app).post(
        "/api/auth/signup",
        data={"username": nombre, "password": "x" * 12, "full_name": "Solicitante"},
        files=ficheros,
    )
    return r.status_code, nombre


def _id(nombre: str) -> int | None:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == nombre).one_or_none()
        return u.id if u else None
    finally:
        db.close()


def test_signup_con_html_como_foto_415_y_no_crea_la_cuenta():
    codigo, nombre = _signup(photo=("foto.html", HTML, "text/html"))
    assert codigo == 415
    assert _id(nombre) is None


def test_signup_png_con_nombre_html_se_guarda_como_png():
    codigo, nombre = _signup(photo=("foto.html", PNG, "text/html"))
    assert codigo == 201
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == nombre).one()
        assert Path(u.photo_path).suffix == ".png"
    finally:
        db.close()


def test_foto_pendiente_se_sirve_como_imagen_con_nosniff():
    _, nombre = _signup(photo=("yo.png", PNG, "image/png"))
    r = admin.get(f"/api/auth/pending/{_id(nombre)}/photo")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_foto_guardada_antes_que_no_es_imagen_no_se_sirve(tmp_path):
    # Una foto subida con el código antiguo (extensión del cliente, sin validar).
    _, nombre = _signup()
    uid = _id(nombre)
    vieja = tmp_path / f"{uid}.html"
    vieja.write_bytes(HTML)
    db = SessionLocal()
    u = db.get(User, uid); u.photo_path = str(vieja); db.commit(); db.close()
    assert admin.get(f"/api/auth/pending/{uid}/photo").status_code == 404


def test_mi_foto_del_registro_con_nosniff():
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, full_name="Médico", role="medico", is_active=True, status="active",
             hashed_password=get_password_hash("x" * 12))
    db.add(u); db.commit(); uid = u.id; db.close()
    admin.post(f"/api/auth/users/{uid}/photo", files={"photo": ("a.png", PNG, "image/png")})
    med = anonymous_client(app)
    med.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    r = med.get("/api/auth/me/photo")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_admin_no_puede_poner_html_como_foto():
    _, nombre = _signup()
    r = admin.post(f"/api/auth/users/{_id(nombre)}/photo", files={"photo": ("x.html", HTML, "text/html")})
    assert r.status_code == 415


def test_cv_html_se_descarga_sin_ejecutarse():
    _, nombre = _signup(cv=("cv.html", HTML, "text/html"))
    r = admin.get(f"/api/auth/pending/{_id(nombre)}/cv")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_cv_pdf_sigue_siendo_pdf_en_descarga():
    _, nombre = _signup(cv=("cv.pdf", b"%PDF-1.4 x", "application/pdf"))
    r = admin.get(f"/api/auth/pending/{_id(nombre)}/cv")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"].startswith("attachment")
