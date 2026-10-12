"""Las fechas de usuario salen con zona UTC explícita (F1-83).

SQLite guarda `created_at` sin zona. Sin «+00:00» el navegador leía las 03:28 UTC
como las 03:28 locales, y en UTC−5 el administrador veía una hora de más.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_utcdates_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.auth_service import get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import User

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _headers() -> dict:
    db = SessionLocal()
    db.add(User(username="adm", full_name="Admin", role="admin", is_active=True, status="active",
                hashed_password=get_password_hash("secret12345")))
    db.add(User(username="pend", full_name="Pendiente", role="viewer", is_active=False, status="pending",
                hashed_password=get_password_hash("secret12345")))
    db.commit(); db.close()
    r = client.post("/api/auth/login", json={"username": "adm", "password": "secret12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_created_at_lleva_zona_utc():
    h = _headers()
    users = client.get("/api/auth/users", headers=h).json()
    assert users and all(u["created_at"].endswith("+00:00") for u in users)
    pend = client.get("/api/auth/pending", headers=h).json()
    assert pend and all(u["created_at"].endswith("+00:00") for u in pend)
