"""La cadena de auditoría solo la lee y escribe el administrador (F1-5, F1-30, F1-31)."""
import os, tempfile
_tmp = tempfile.mkdtemp(prefix="prospective_aud_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
from conftest import anonymous_client
from main import app
from services.database import Base, engine, SessionLocal
from services.db_models import User
from services.auth_service import create_access_token, get_password_hash
Base.metadata.create_all(bind=engine)


def _client(role: str, nombre: str):
    db = SessionLocal()
    db.add(User(username=nombre, hashed_password=get_password_hash("x" * 12), role=role, full_name=nombre, is_active=True)); db.commit(); db.close()
    c = anonymous_client(app); c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return c


def test_medico_no_lee_ni_escribe_la_cadena():
    c = _client("medico", "med_aud")
    assert c.get("/api/audit/blocks").status_code == 403
    assert c.get("/api/audit/export").status_code == 403
    assert c.get("/api/audit/verify").status_code == 403
    assert c.post("/api/audit", json={"action": "x", "payload": {}, "username": "admin"}).status_code in (403, 404, 405)


def test_nadie_escribe_la_cadena_por_la_api():
    """La escribe el servidor al hacer cada acción. La ruta que había dejaba a
    un administrador añadir bloques con cualquier acción."""
    c = _client("admin", "adm_aud")
    antes = len(c.get("/api/audit/blocks").json())
    r = c.post("/api/audit", json={"action": "prueba", "payload": {}, "username": "otro"})
    assert r.status_code in (404, 405)
    assert len(c.get("/api/audit/blocks").json()) == antes
