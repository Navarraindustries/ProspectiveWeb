"""Compartir por paciente (F2): quien creó al paciente, o un administrador, elige
con qué cuentas lo comparte; el compartido lo ve pero no lo comparte; un tercero
sigue sin verlo. Patrón de clientes con rol de test_access_control.py."""
# Mismo patrón que test_access_control.py: `_medico()` crea una cuenta «medico»
# con uuid y devuelve (id, TestClient con Bearer); `admin` es el TestClient del
# administrador de la suite; `anonymous_client(app)` el cliente sin sesión.
import uuid
from main import app
from services.database import SessionLocal
from services.db_models import Patient
from test_access_control import _medico, admin, anonymous_client


def _paciente_de(uid: int) -> int:
    db = SessionLocal()
    p = Patient(surname="Compartido", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def test_el_creador_comparte_y_el_compartido_ve_pero_no_comparte():
    a_id, a = _medico(); b_id, b = _medico(); c_id, c = _medico()
    pid = _paciente_de(a_id)
    r = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    assert r.status_code == 200 and [s["user_id"] for s in r.json()] == [b_id]
    assert b.get(f"/api/patients/{pid}").status_code == 200
    assert c.get(f"/api/patients/{pid}").status_code == 403
    r = b.put(f"/api/patients/{pid}/shares", json={"user_ids": [c_id]})
    assert r.status_code == 403
    assert "creó al paciente" in r.json()["detail"]


def test_la_lista_de_pacientes_marca_lo_compartido():
    a_id, a = _medico(); b_id, b = _medico()
    pid = _paciente_de(a_id)
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    mine = next(p for p in a.get("/api/patients").json() if p["id"] == pid)
    theirs = next(p for p in b.get("/api/patients").json() if p["id"] == pid)
    assert mine["shared_with_count"] == 1 and mine["is_shared_with_me"] is False
    assert theirs["is_shared_with_me"] is True and theirs["owner_id"] == a_id


def test_quitar_de_la_lista_quita_el_acceso_y_el_admin_siempre_puede():
    a_id, a = _medico(); b_id, b = _medico()
    pid = _paciente_de(a_id)
    assert admin.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).status_code == 200
    assert b.get(f"/api/patients/{pid}/sessions").status_code == 200
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": []})
    assert b.get(f"/api/patients/{pid}").status_code == 403


def test_anonimo_y_cuentas_breves():
    assert anonymous_client(app).get("/api/patients/1/shares").status_code == 401
    _id, m = _medico()
    r = m.get("/api/auth/users/brief")
    assert r.status_code == 200 and {"id", "username", "full_name", "role"} <= set(r.json()[0])


# ── Más allá del brief: bordes de PUT y el bloque de auditoría ──────────────── #

def test_una_cuenta_que_no_existe_es_422_y_no_toca_la_lista():
    a_id, a = _medico(); b_id, _b = _medico()
    pid = _paciente_de(a_id)
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    r = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id, 10**9]})
    assert r.status_code == 422 and "no existe" in r.json()["detail"]
    assert [s["user_id"] for s in a.get(f"/api/patients/{pid}/shares").json()] == [b_id]


def test_el_creador_y_los_repetidos_no_cuentan():
    a_id, a = _medico(); b_id, _b = _medico()
    pid = _paciente_de(a_id)
    r = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [a_id, b_id, b_id]})
    assert r.status_code == 200 and [s["user_id"] for s in r.json()] == [b_id]


def test_volver_a_guardar_conserva_la_fecha():
    a_id, a = _medico(); b_id, _b = _medico(); c_id, _c = _medico()
    pid = _paciente_de(a_id)
    antes = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).json()[0]["shared_at"]
    despues = a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id, c_id]}).json()
    assert despues[0]["user_id"] == b_id and despues[0]["shared_at"] == antes


def test_cada_cambio_deja_un_bloque_de_auditoria():
    import json
    from services.audit import SkullChain
    a_id, a = _medico(); b_id, _b = _medico()
    pid = _paciente_de(a_id)
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]})
    bloques = [b for b in SkullChain.instance().get_all_blocks() if b["action"] == "PATIENT_SHARED"]
    payload = json.loads(bloques[-1]["payload_json"])
    assert payload == {"patient_id": pid, "user_ids": [b_id]}
    assert bloques[-1]["patient_hash"] and "Compartido" not in bloques[-1]["payload_json"]


def test_paciente_que_no_existe_es_404():
    _id, m = _medico()
    assert m.get("/api/patients/999999999/shares").status_code == 404
    assert admin.put("/api/patients/999999999/shares", json={"user_ids": []}).status_code == 404


def test_borrar_cuentas_no_choca_con_lo_compartido():
    # Con las claves foráneas activas: la cuenta invitada se lleva su fila
    # (CASCADE) y la que compartió deja `shared_by` en nulo (SET NULL).
    from services.db_models import PatientShare
    a_id, a = _medico(); b_id, _b = _medico(); c_id, _c = _medico()
    pid = _paciente_de(a_id)
    a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id, c_id]})
    assert admin.delete(f"/api/auth/users/{b_id}").status_code in (200, 204)
    assert admin.delete(f"/api/auth/users/{a_id}").status_code in (200, 204)
    db = SessionLocal()
    filas = [(s.user_id, s.shared_by) for s in db.query(PatientShare).filter_by(patient_id=pid)]
    db.close()
    assert filas == [(c_id, None)]
