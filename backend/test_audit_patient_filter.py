"""Auditoría por paciente y exportación en español (F2-46, F2-58, F2-59)."""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_audpac_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from conftest import anonymous_client
from main import app
from services.audit import SkullChain, audit_patient, patient_hash_for
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import Patient, User
from starlette.testclient import TestClient

Base.metadata.create_all(bind=engine)
admin = TestClient(app)


def _paciente(**kw) -> Patient:
    db = SessionLocal()
    p = Patient(surname="Aud", dob=kw.get("dob", "1980-01-01"),
                hospital_id=kw.get("hospital_id", f"HC-{uuid.uuid4().hex[:6]}"))
    db.add(p); db.commit(); db.refresh(p); db.expunge(p); db.close()
    return p


def _bloque(p: Patient, accion: str) -> None:
    SkullChain.instance().append(accion, {"x": 1}, "admin", **audit_patient(p))


def test_filtra_por_paciente_y_sin_parametro_devuelve_todo():
    a, b = _paciente(), _paciente(dob="1990-05-05")
    _bloque(a, "ACCION_A"); _bloque(b, "ACCION_B"); _bloque(a, "ACCION_A2")
    todos = admin.get("/api/audit/blocks").json()
    assert {"ACCION_A", "ACCION_B", "ACCION_A2"} <= {x["action"] for x in todos}
    solo_a = admin.get(f"/api/audit/blocks?patient_id={a.id}").json()
    assert [x["action"] for x in solo_a] == ["ACCION_A", "ACCION_A2"]
    solo_b = admin.get(f"/api/audit/blocks?patient_id={b.id}").json()
    assert [x["action"] for x in solo_b] == ["ACCION_B"]


def test_paciente_sin_historia_clinica_usa_el_id_como_en_los_routers():
    p = _paciente(hospital_id="")
    _bloque(p, "SIN_HC")
    assert [x["action"] for x in admin.get(f"/api/audit/blocks?patient_id={p.id}").json()] == ["SIN_HC"]


def test_paciente_inexistente_404():
    r = admin.get("/api/audit/blocks?patient_id=99999999")
    assert r.status_code == 404
    assert r.json()["detail"] == "Paciente no encontrado."


def test_medico_no_filtra():
    db = SessionLocal()
    db.add(User(username="med_filtro", hashed_password=get_password_hash("x" * 12),
                role="medico", full_name="m", is_active=True)); db.commit(); db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject='med_filtro')}"
    assert c.get("/api/audit/blocks?patient_id=1").status_code == 403


def test_hash_compartido_coincide_con_lo_que_guarda_append():
    p = _paciente()
    args = audit_patient(p)
    SkullChain.instance().append("HASH_CHECK", {}, "admin", **args)
    ultimo = SkullChain.instance().get_all_blocks()[-1]
    assert ultimo["patient_hash"] == patient_hash_for(args["patient_id"], args["patient_dob"])
    assert patient_hash_for("", "") == ""


def test_export_en_espanol():
    txt = admin.get("/api/audit/export").text
    assert "Registro de auditoría de PROSPECTIVE Web" in txt
    assert "Exportado el" in txt and "por admin" in txt
    assert "Nº" in txt and "Fecha y hora" in txt
    assert "Bloques:" in txt
    assert "Integridad: correcta" in txt
    assert "SkullChain" not in txt


def test_informe_de_una_sesion_adjunta_sale_al_filtrar_por_su_paciente():
    # REPORT_GENERATED / SR_GENERATED se escribían con la historia clínica del
    # formulario y sin fecha de nacimiento: el hash nunca coincidía con el del
    # filtro. Generar el PDF en test es caro: se prueba el helper que da los
    # argumentos de paciente del bloque.
    from routers.report import _paciente_auditoria
    from services.db_models import PlanningSession
    p = _paciente(dob="1975-03-03")
    sid = uuid.uuid4().hex
    db = SessionLocal()
    try:
        db.add(PlanningSession(session_id=sid, patient_id=p.id)); db.commit()
        args = _paciente_auditoria(db, sid, "HC-DEL-FORMULARIO")
    finally:
        db.close()
    assert args == audit_patient(p)
    SkullChain.instance().append("REPORT_GENERATED", {"session_id": sid}, "admin", **args)
    assert [x["action"] for x in admin.get(f"/api/audit/blocks?patient_id={p.id}").json()] == ["REPORT_GENERATED"]


def test_informe_sin_sesion_adjunta_usa_la_historia_del_formulario():
    from routers.report import _paciente_auditoria
    db = SessionLocal()
    try:
        assert _paciente_auditoria(db, uuid.uuid4().hex, "HC-9") == {"patient_id": "HC-9"}
    finally:
        db.close()
