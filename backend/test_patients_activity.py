"""Actividad reciente de los pacientes visibles (panel de pacientes, tarea 3)."""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_actividad_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from conftest import anonymous_client
from main import app
from services.audit import SkullChain, audit_patient
from services.database import SessionLocal
from services.db_models import Patient
from test_access_control import _medico, admin


def _paciente(uid: int, apellido: str) -> Patient:
    db = SessionLocal()
    p = Patient(surname=apellido, hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
    db.add(p); db.commit(); db.refresh(p); db.close()
    return p


def _bloque(accion: str, p: Patient | None, usuario: str = "alguien") -> None:
    args = audit_patient(p) if p is not None else {}
    SkullChain.instance().append(accion, {}, usuario, **args)


def test_solo_la_actividad_de_los_pacientes_visibles_mas_reciente_primero():
    a_id, a = _medico()
    b_id, b = _medico()
    p1 = _paciente(a_id, "PropioActividad")
    p2 = _paciente(b_id, "CompartidoActividad")
    p3 = _paciente(b_id, "AjenoActividad")
    assert b.put(f"/api/patients/{p2.id}/shares", json={"user_ids": [a_id]}).status_code == 200
    _bloque("SESSION_SAVED", p3)
    _bloque("CAPTURE_SAVED", p1, "dra-a")
    _bloque("REPORT_GENERATED", p2, "dr-b")
    r = a.get("/api/patients/activity")
    assert r.status_code == 200
    filas = r.json()
    # El compartir deja su propio bloque PATIENT_SHARED en P2: es de un paciente visible.
    assert [(f["patient_id"], f["action"]) for f in filas[:2]] == [
        (p2.id, "REPORT_GENERATED"), (p1.id, "CAPTURE_SAVED")]
    assert filas[0]["patient_name"] == p2.full_name and filas[0]["username"] == "dr-b"
    assert filas[1]["username"] == "dra-a" and filas[1]["at"].endswith("Z")
    assert all(f["patient_id"] != p3.id for f in filas)


def test_los_eventos_de_cuentas_y_sin_hash_no_entran():
    a_id, a = _medico()
    p = _paciente(a_id, "ExcluidasActividad")
    _bloque("USER_CREATED", None)
    _bloque("LOGIN", None)
    _bloque("USER_ROLE_CHANGED", p)
    _bloque("INTEGRITY_CHECK", p)
    _bloque("password_change", p)
    _bloque("password_reset", p)
    _bloque("SESSION_SAVED", p)
    for cliente in (a, admin):
        acciones = [f["action"] for f in cliente.get("/api/patients/activity?limit=50").json()]
        assert not [x for x in acciones if x.startswith("USER_")
                    or x in {"LOGIN", "INTEGRITY_CHECK", "GENESIS", "password_change", "password_reset"}]
    assert a.get("/api/patients/activity").json()[0]["action"] == "SESSION_SAVED"


def test_el_limite_se_respeta_y_se_acota():
    a_id, a = _medico()
    p = _paciente(a_id, "LimiteActividad")
    for _ in range(3):
        _bloque("CAPTURE_SAVED", p)
    _bloque("LOGIN", p)  # excluido: no debe gastar plaza del límite
    assert len(a.get("/api/patients/activity?limit=2").json()) == 2
    assert a.get("/api/patients/activity?limit=0").status_code == 422
    assert a.get("/api/patients/activity?limit=99").status_code == 422


def test_el_administrador_ve_la_de_todos():
    a_id, _a = _medico()
    p = _paciente(a_id, "TodosActividad")
    _bloque("REPORT_GENERATED", p)
    primera = admin.get("/api/patients/activity").json()[0]
    assert primera["patient_id"] == p.id and primera["action"] == "REPORT_GENERATED"


def test_anonimo_401():
    assert anonymous_client(app).get("/api/patients/activity").status_code == 401
