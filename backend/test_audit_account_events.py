"""Las cuentas dejan rastro en la cadena: alta, aprobación, rechazo, creación,
cambio de rol y (des)activación (F1-102). Solo cuando algo cambia de verdad."""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_auditcuentas_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.audit import SkullChain
from services.database import Base, SessionLocal, engine
from services.db_models import User

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # autenticado como admin (conftest)


def _bloques() -> list[dict]:
    out = []
    for b in SkullChain.instance().get_all_blocks():
        b = dict(b)
        b["payload"] = json.loads(b["payload_json"])
        out.append(b)
    return out


def _desde(n: int) -> list[dict]:
    return _bloques()[n:]


def _alta(username: str) -> int:
    r = client.post("/api/auth/signup", data={
        "username": username, "password": "claveSegura1", "full_name": "Persona " + username,
    })
    assert r.status_code == 201, r.text
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == username).one().id
    finally:
        db.close()


def test_alta_aprobacion_y_rechazo():
    n = len(_bloques())
    uid = _alta("cuenta_a")
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_SIGNUP_REQUESTED"]
    assert nuevos[0]["username"] == "cuenta_a"
    assert nuevos[0]["payload"]["username"] == "cuenta_a" and nuevos[0]["payload"]["role"]

    n = len(_bloques())
    assert client.post(f"/api/auth/pending/{uid}/approve").status_code == 200
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_APPROVED"]
    assert nuevos[0]["username"] == "admin" and nuevos[0]["payload"] == {"target": "cuenta_a"}

    uid2 = _alta("cuenta_b")
    n = len(_bloques())
    assert client.post(f"/api/auth/pending/{uid2}/reject").status_code == 200
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_REJECTED"]
    assert nuevos[0]["username"] == "admin" and nuevos[0]["payload"] == {"target": "cuenta_b"}


def test_crear_cambiar_rol_y_activar():
    n = len(_bloques())
    r = client.post("/api/auth/users", data={
        "username": "cuenta_c", "password": "claveSegura1", "full_name": "Persona C", "role": "medico",
    })
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_CREATED"]
    assert nuevos[0]["username"] == "admin"
    assert nuevos[0]["payload"] == {"target": "cuenta_c", "role": "medico"}

    # Corregir solo el nombre no deja bloque.
    n = len(_bloques())
    assert client.put(f"/api/auth/users/{uid}", json={"full_name": "Otro nombre"}).status_code == 200
    assert _desde(n) == []

    n = len(_bloques())
    assert client.put(f"/api/auth/users/{uid}", json={"role": "admin"}).status_code == 200
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_ROLE_CHANGED"]
    assert nuevos[0]["payload"] == {"target": "cuenta_c", "role_from": "medico", "role_to": "admin"}
    assert nuevos[0]["username"] == "admin"

    # Mismo rol y mismo estado: nada.
    n = len(_bloques())
    assert client.put(f"/api/auth/users/{uid}", json={"role": "admin", "is_active": True}).status_code == 200
    assert _desde(n) == []

    n = len(_bloques())
    assert client.put(f"/api/auth/users/{uid}", json={"is_active": False}).status_code == 200
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_DEACTIVATED"]
    assert nuevos[0]["payload"] == {"target": "cuenta_c"}

    n = len(_bloques())
    assert client.put(f"/api/auth/users/{uid}", json={"is_active": True}).status_code == 200
    nuevos = _desde(n)
    assert [b["action"] for b in nuevos] == ["USER_REACTIVATED"]
    assert nuevos[0]["payload"] == {"target": "cuenta_c"}
