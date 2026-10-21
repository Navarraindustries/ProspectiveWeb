"""Historial de cuentas: rechazar marca `rejected_at`; `?status=` filtra (F2-51)."""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_pendhist_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import User
from starlette.testclient import TestClient

Base.metadata.create_all(bind=engine)
admin = TestClient(app)


def _cuenta(status: str = "pending", role: str = "medico") -> tuple[int, str]:
    nombre = f"u-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role=role,
             full_name=nombre, status=status, is_active=(status == "active"))
    db.add(u); db.commit(); uid = u.id; db.close()
    return uid, nombre


def _fila(uid: int, estado: str | None = None) -> dict | None:
    r = admin.get("/api/auth/users", params={"status": estado} if estado else None)
    assert r.status_code == 200
    return next((u for u in r.json() if u["id"] == uid), None)


def test_rechazar_marca_fecha_y_estado():
    uid, _ = _cuenta()
    assert _fila(uid)["rejected_at"] is None
    assert admin.post(f"/api/auth/pending/{uid}/reject").status_code == 200
    f = _fila(uid)
    assert f["status"] == "rejected" and f["is_active"] is False
    assert f["rejected_at"] and f["rejected_at"].endswith("+00:00")


def test_aprobar_no_marca_fecha():
    uid, _ = _cuenta()
    assert admin.post(f"/api/auth/pending/{uid}/approve").status_code == 200
    f = _fila(uid)
    assert f["status"] == "active" and f["rejected_at"] is None


def test_desactivar_a_mano_no_es_rechazo():
    uid, _ = _cuenta("active")
    assert admin.put(f"/api/auth/users/{uid}", json={"is_active": False}).status_code == 200
    assert _fila(uid)["rejected_at"] is None


def test_desactivar_a_mano_no_sale_en_rechazadas():
    uid, _ = _cuenta("active")
    admin.put(f"/api/auth/users/{uid}", json={"is_active": False})
    assert _fila(uid)["status"] == "rejected"
    assert _fila(uid, "rejected") is None


def test_aprobar_o_reactivar_borra_la_fecha_de_rechazo():
    uid, _ = _cuenta()
    admin.post(f"/api/auth/pending/{uid}/reject")
    assert _fila(uid, "rejected")
    admin.post(f"/api/auth/pending/{uid}/approve")
    assert _fila(uid)["rejected_at"] is None and _fila(uid, "rejected") is None
    uid2, _ = _cuenta()
    admin.post(f"/api/auth/pending/{uid2}/reject")
    admin.put(f"/api/auth/users/{uid2}", json={"is_active": True})
    assert _fila(uid2)["rejected_at"] is None


def test_foto_solo_admin():
    uid, nombre = _cuenta("active")
    med = anonymous_client(app)
    med.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    f = {"photo": ("a.png", b"PNG-falso", "image/png")}
    assert med.post(f"/api/auth/users/{uid}/photo", files=f).status_code == 403
    assert anonymous_client(app).post(f"/api/auth/users/{uid}/photo", files=f).status_code == 401


def test_filtro_por_estado():
    pend, _ = _cuenta("pending"); act, _ = _cuenta("active"); rej, _ = _cuenta("pending")
    admin.post(f"/api/auth/pending/{rej}/reject")
    assert _fila(pend, "pending") and not _fila(act, "pending") and not _fila(rej, "pending")
    assert _fila(act, "approved") and not _fila(pend, "approved") and not _fila(rej, "approved")
    assert _fila(rej, "rejected") and not _fila(act, "rejected") and not _fila(pend, "rejected")
    assert admin.get("/api/auth/users", params={"status": "otro"}).status_code == 422


def test_editar_campos_profesionales():
    uid, _ = _cuenta("active")
    r = admin.put(f"/api/auth/users/{uid}", json={
        "specialty": "Neurocirugía", "hospital": " H. Navarra ", "university": "UNAV", "position": "Jefe"})
    assert r.status_code == 200
    j = r.json()
    assert (j["specialty"], j["hospital"], j["university"], j["position"]) == (
        "Neurocirugía", "H. Navarra", "UNAV", "Jefe")


def test_foto_se_reemplaza():
    uid, _ = _cuenta("active")
    r = admin.post(f"/api/auth/users/{uid}/photo", files={"photo": ("a.png", b"PNG-falso", "image/png")})
    assert r.status_code == 200 and r.json()["has_photo"] is True


def test_medico_403_y_anonimo_401():
    _, nombre = _cuenta("active")
    med = anonymous_client(app)
    med.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    anon = anonymous_client(app)
    for ruta in ("/api/auth/users?status=pending",):
        assert med.get(ruta).status_code == 403
        assert anon.get(ruta).status_code == 401
