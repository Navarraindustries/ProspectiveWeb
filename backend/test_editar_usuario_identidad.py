"""«Editar usuario» corrige también cédula, nº de colegiado, ORCID y CV (UNI-84, F2-45).

El alta los recogía pero luego no había forma de cambiarlos. El CV se valida por
contenido, como la foto: nada que no sea PDF, DOC o DOCX se guarda.
"""
from __future__ import annotations

import io
import uuid
import zipfile
from pathlib import Path

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import User
from starlette.testclient import TestClient

Base.metadata.create_all(bind=engine)
admin = TestClient(app)  # el conftest le pone la sesión del admin

PDF = b"%PDF-1.4\n%fake\n"
DOC = bytes.fromhex("d0cf11e0a1b11ae1") + b"\0" * 64
HTML = b"<html><script>alert(1)</script></html>"


def _docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
    return buf.getvalue()


def _zip_sin_word() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("otra.txt", "hola")
    return buf.getvalue()


def _cuenta() -> tuple[int, str]:
    nombre = f"u-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico",
             full_name=nombre, status="active", is_active=True,
             national_id="111", professional_id="CM-1", orcid="0000-0000-0000-0001")
    db.add(u); db.commit(); uid = u.id; db.close()
    return uid, nombre


def _cv_path(uid: int) -> str | None:
    db = SessionLocal()
    try:
        return db.get(User, uid).cv_path
    finally:
        db.close()


def test_listado_trae_los_campos_de_identidad():
    uid, _ = _cuenta()
    fila = next(u for u in admin.get("/api/auth/users").json() if u["id"] == uid)
    assert (fila["national_id"], fila["professional_id"], fila["orcid"]) == ("111", "CM-1", "0000-0000-0000-0001")


def test_put_cambia_cedula_colegiado_y_orcid():
    uid, _ = _cuenta()
    r = admin.put(f"/api/auth/users/{uid}", json={
        "national_id": " 1020304050 ", "professional_id": "RM-889", "orcid": "0000-0002-1825-0097"})
    assert r.status_code == 200
    j = r.json()
    assert (j["national_id"], j["professional_id"], j["orcid"]) == ("1020304050", "RM-889", "0000-0002-1825-0097")


def test_put_sin_esos_campos_no_los_borra():
    uid, _ = _cuenta()
    j = admin.put(f"/api/auth/users/{uid}", json={"hospital": "H. Navarra"}).json()
    assert (j["national_id"], j["professional_id"], j["orcid"]) == ("111", "CM-1", "0000-0000-0000-0001")


def test_put_se_puede_vaciar_y_rechaza_mas_de_64():
    uid, _ = _cuenta()
    assert admin.put(f"/api/auth/users/{uid}", json={"orcid": ""}).json()["orcid"] == ""
    assert admin.put(f"/api/auth/users/{uid}", json={"national_id": "9" * 65}).status_code == 422


def test_cv_pdf_doc_y_docx_se_guardan_con_su_extension():
    uid, _ = _cuenta()
    for datos, ext in ((PDF, ".pdf"), (DOC, ".doc"), (_docx(), ".docx")):
        r = admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("cv.bin", datos, "application/octet-stream")})
        assert r.status_code == 200, r.text
        assert r.json()["has_cv"] is True
        assert Path(_cv_path(uid)).suffix == ext


def test_cv_nuevo_borra_el_anterior_con_otra_extension():
    uid, _ = _cuenta()
    admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("a.docx", _docx(), "application/zip")})
    viejo = Path(_cv_path(uid))
    assert viejo.exists()
    admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("a.pdf", PDF, "application/pdf")})
    assert not viejo.exists()
    assert Path(_cv_path(uid)).read_bytes() == PDF


def test_cv_que_no_es_documento_415_y_no_toca_el_actual():
    uid, _ = _cuenta()
    admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("a.pdf", PDF, "application/pdf")})
    antes = _cv_path(uid)
    for datos in (HTML, _zip_sin_word(), b"PK\x03\x04roto"):
        r = admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("cv.pdf", datos, "application/pdf")})
        assert r.status_code == 415
    assert _cv_path(uid) == antes and Path(antes).read_bytes() == PDF


def test_cv_de_mas_de_6_mb_413():
    uid, _ = _cuenta()
    r = admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("a.pdf", PDF + b"0" * (6 * 1024 * 1024), "application/pdf")})
    assert r.status_code == 413


def test_cv_se_descarga_como_adjunto():
    uid, nombre = _cuenta()
    admin.post(f"/api/auth/users/{uid}/cv", files={"cv": ("a.pdf", PDF, "application/pdf")})
    r = admin.get(f"/api/auth/pending/{uid}/cv")
    assert r.status_code == 200 and r.content == PDF
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_cv_cuenta_inexistente_404_y_solo_admin():
    assert admin.post("/api/auth/users/999999/cv", files={"cv": ("a.pdf", PDF, "application/pdf")}).status_code == 404
    uid, nombre = _cuenta()
    med = anonymous_client(app)
    med.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    f = {"cv": ("a.pdf", PDF, "application/pdf")}
    assert med.post(f"/api/auth/users/{uid}/cv", files=f).status_code == 403
    assert anonymous_client(app).post(f"/api/auth/users/{uid}/cv", files=f).status_code == 401
    assert med.put(f"/api/auth/users/{uid}", json={"orcid": "x"}).status_code == 403
