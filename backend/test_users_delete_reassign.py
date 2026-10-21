"""Borrar una cuenta traspasa sus pacientes (F2-60)."""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_delusr_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from conftest import anonymous_client
from main import app
from services.audit import SkullChain
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import Patient, PatientShare, User
from starlette.testclient import TestClient

Base.metadata.create_all(bind=engine)
admin = TestClient(app)


def _medico(activo: bool = True):
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico",
             full_name=nombre, is_active=activo)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, nombre, c


def _pacientes(uid: int, n: int = 2) -> list[int]:
    db = SessionLocal(); ids = []
    for _ in range(n):
        p = Patient(surname="P", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
        db.add(p); db.commit(); ids.append(p.id)
    db.close()
    return ids


def _creadores(ids: list[int]) -> list[int | None]:
    db = SessionLocal()
    try:
        return [db.get(Patient, i).created_by for i in ids]
    finally:
        db.close()


def _admin_id() -> int:
    return admin.get("/api/auth/me").json()["id"]


def test_reasigna_al_medico_indicado():
    a_id, _, _ = _medico(); b_id, _, b = _medico()
    ids = _pacientes(a_id)
    assert admin.delete(f"/api/auth/users/{a_id}?reassign_to={b_id}").status_code == 204
    assert _creadores(ids) == [b_id, b_id]
    listados = {p["id"] for p in b.get("/api/patients").json()}
    assert set(ids) <= listados


def test_sin_parametro_pasan_al_administrador():
    a_id, _, _ = _medico()
    ids = _pacientes(a_id)
    assert admin.delete(f"/api/auth/users/{a_id}").status_code == 204
    assert _creadores(ids) == [_admin_id()] * 2


def test_reasignar_al_propio_borrado_400():
    a_id, _, _ = _medico()
    ids = _pacientes(a_id)
    r = admin.delete(f"/api/auth/users/{a_id}?reassign_to={a_id}")
    assert r.status_code == 400 and r.json()["detail"]
    assert _creadores(ids) == [a_id, a_id]


def test_destino_inexistente_o_inactivo_400():
    a_id, _, _ = _medico(); off_id, _, _ = _medico(activo=False)
    ids = _pacientes(a_id)
    assert admin.delete(f"/api/auth/users/{a_id}?reassign_to=99999999").status_code == 400
    assert admin.delete(f"/api/auth/users/{a_id}?reassign_to={off_id}").status_code == 400
    assert _creadores(ids) == [a_id, a_id]


def test_comparticion_del_destino_se_quita_y_shared_by_se_traspasa():
    a_id, _, _ = _medico(); b_id, _, _ = _medico(); c_id, _, _ = _medico()
    ids = _pacientes(a_id)
    db = SessionLocal()
    db.add(PatientShare(patient_id=ids[0], user_id=b_id, shared_by=a_id))
    db.add(PatientShare(patient_id=ids[1], user_id=c_id, shared_by=a_id))
    db.commit(); db.close()
    assert admin.delete(f"/api/auth/users/{a_id}?reassign_to={b_id}").status_code == 204
    db = SessionLocal()
    try:
        assert db.query(PatientShare).filter_by(patient_id=ids[0], user_id=b_id).count() == 0
        restante = db.query(PatientShare).filter_by(patient_id=ids[1], user_id=c_id).one()
        assert restante.shared_by == b_id
    finally:
        db.close()


def test_deja_bloque_user_deleted_y_ningun_paciente_sin_creador():
    a_id, a_nombre, _ = _medico(); b_id, b_nombre, _ = _medico()
    _pacientes(a_id)
    assert admin.delete(f"/api/auth/users/{a_id}?reassign_to={b_id}").status_code == 204
    bloques = [x for x in SkullChain.instance().get_all_blocks() if x["action"] == "USER_DELETED"]
    assert any(f'"deleted": "{a_nombre}"' in x["payload_json"]
               and f'"reassigned_to": "{b_nombre}"' in x["payload_json"]
               and '"patients": 2' in x["payload_json"] for x in bloques)
    assert bloques[-1]["username"] == "admin"
    db = SessionLocal()
    try:
        assert db.query(Patient).filter(Patient.created_by.is_(None)).count() == 0
    finally:
        db.close()
