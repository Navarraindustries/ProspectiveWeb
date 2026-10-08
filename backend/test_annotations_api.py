"""Las anotaciones viven en la carpeta de la sesión y solo las ve quien ve al paciente."""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.audit import SkullChain
from services.auth_service import create_access_token, get_password_hash
from services.database import SessionLocal
from services.db_models import Patient, PlanningSession, User
from services.sessions import create_session, rehydrate_session, session_dir, snapshot_session

admin = TestClient(app, raise_server_exceptions=True)   # autenticado como admin (conftest)

REGLA = {"id": "a1", "kind": "regla", "points": [{"x": 0, "y": 0, "z": 0}, {"x": 3, "y": 4, "z": 0}],
         "plane": {"plane": "axial", "index": 3}, "label": "R1", "note": "", "visible": True,
         "created_at": "", "created_by": ""}


def _medico() -> tuple[int, TestClient]:
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico", full_name=nombre)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, c


@pytest.fixture(scope="module")
def sesion_de_a():
    """Una sesión ligada a un paciente de la médica A; B no es nadie suyo."""
    a_id, a = _medico()
    _b_id, b = _medico()
    db = SessionLocal()
    p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=a_id)
    db.add(p); db.commit()
    sid = create_session()
    db.add(PlanningSession(session_id=sid, patient_id=p.id))
    db.commit(); db.close()
    return a, b, sid


def _eventos(accion: str) -> list[dict]:
    out = []
    for b in SkullChain.instance().get_all_blocks():
        if b["action"] == accion:
            b["payload"] = json.loads(b["payload_json"])
            out.append(b)
    return out


def test_sin_usuario_401():
    assert anonymous_client(app).get(f"/api/annotations/{create_session()}").status_code == 401


def test_sesion_inexistente_404():
    assert admin.get(f"/api/annotations/{uuid.uuid4()}").status_code == 404
    assert admin.put(f"/api/annotations/{uuid.uuid4()}", json={"annotations": []}).status_code == 404
    assert admin.get("/api/annotations/no-es-uuid").status_code in (404, 422)
    assert admin.get("/api/annotations/../../etc").status_code in (404, 422)


def test_sin_fichero_lista_vacia():
    assert admin.get(f"/api/annotations/{create_session()}").json() == {"annotations": []}


def test_ida_y_vuelta_y_created_by():
    sid = create_session()
    r = admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    assert r.status_code == 200
    a = r.json()["annotations"][0]
    assert a["created_by"] == "admin" and a["created_at"]
    assert admin.get(f"/api/annotations/{sid}").json()["annotations"][0]["label"] == "R1"
    f = session_dir(sid) / "annotations.json"
    assert json.loads(f.read_text(encoding="utf-8")) == r.json()


def test_la_autoria_la_decide_el_servidor(sesion_de_a):
    medica, _b, _sid = sesion_de_a
    sid = create_session()
    # Una nueva lleva el usuario de la petición aunque el cliente diga otro.
    r = medica.put(f"/api/annotations/{sid}", json={"annotations": [
        {**REGLA, "created_by": "otro", "created_at": "1999-01-01T00:00:00+00:00"}]})
    a = r.json()["annotations"][0]
    assert a["created_by"] != "otro" and a["created_by"].startswith("med-")
    assert a["created_at"] != "1999-01-01T00:00:00+00:00"
    # Una que ya existía conserva los suyos, venga lo que venga.
    for falso in ({"created_by": "otro", "created_at": "2000-01-01"}, {"created_by": "", "created_at": ""}):
        admin.put(f"/api/annotations/{sid}", json={"annotations": [{**REGLA, **falso}]})
        g = admin.get(f"/api/annotations/{sid}").json()["annotations"][0]
        assert (g["created_by"], g["created_at"]) == (a["created_by"], a["created_at"])


def test_ids_repetidos_422():
    sid = create_session()
    r = admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA, {**REGLA, "label": "R2"}]})
    assert r.status_code == 422
    assert not (session_dir(sid) / "annotations.json").exists()


def test_fichero_corrupto_lista_vacia():
    sid = create_session()
    (session_dir(sid) / "annotations.json").write_text("{no es json", encoding="utf-8")
    assert admin.get(f"/api/annotations/{sid}").json() == {"annotations": []}


def test_validacion_por_tipo_no_toca_el_fichero():
    sid = create_session()
    mala = {**REGLA, "kind": "region"}                       # región de 2 puntos
    assert admin.put(f"/api/annotations/{sid}", json={"annotations": [mala]}).status_code == 422
    sin_plano = {**REGLA, "kind": "region", "plane": None, "points": [{"x": 0, "y": 0, "z": 0}] * 3}
    assert admin.put(f"/api/annotations/{sid}", json={"annotations": [sin_plano]}).status_code == 422
    angulo_corto = {**REGLA, "kind": "angulo"}
    assert admin.put(f"/api/annotations/{sid}", json={"annotations": [angulo_corto]}).status_code == 422
    assert admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA] * 201}).status_code == 422
    assert admin.put(f"/api/annotations/{sid}", json={"annotations": [{**REGLA, "label": "x" * 41}]}).status_code == 422
    assert not (session_dir(sid) / "annotations.json").exists()


def test_viaja_con_snapshot_y_restore():
    sid = create_session()
    admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    snapshot_session(sid)
    nuevo = rehydrate_session(sid)
    assert admin.get(f"/api/annotations/{nuevo}").json()["annotations"][0]["id"] == "a1"


def test_otro_paciente_403(sesion_de_a):
    a, b, sid = sesion_de_a
    assert a.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]}).status_code == 200
    assert a.get(f"/api/annotations/{sid}").status_code == 200
    assert b.get(f"/api/annotations/{sid}").status_code == 403
    assert b.put(f"/api/annotations/{sid}", json={"annotations": []}).status_code == 403
    assert admin.get(f"/api/annotations/{sid}").json()["annotations"][0]["id"] == "a1"


def test_auditoria_solo_al_borrar():
    sid = create_session()
    admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA, {**REGLA, "id": "a2", "label": "R2"}]})
    assert not [e for e in _eventos("ANNOTATIONS_DELETED") if e["payload"]["session_id"] == sid]
    admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    ev = [e for e in _eventos("ANNOTATIONS_DELETED") if e["payload"]["session_id"] == sid]
    assert len(ev) == 1
    assert ev[0]["payload"] == {"session_id": sid, "deleted": ["a2"], "remaining": 1}
    assert ev[0]["username"] == "admin"


def test_sustituir_por_otra_del_mismo_numero_es_borrar():
    sid = create_session()
    admin.put(f"/api/annotations/{sid}", json={"annotations": [REGLA]})
    admin.put(f"/api/annotations/{sid}", json={"annotations": [{**REGLA, "id": "a3"}]})
    ev = [e for e in _eventos("ANNOTATIONS_DELETED") if e["payload"]["session_id"] == sid]
    assert len(ev) == 1 and ev[0]["payload"]["deleted"] == ["a1"] and ev[0]["payload"]["remaining"] == 1


def test_auditoria_lleva_el_paciente(sesion_de_a):
    a, _b, sid = sesion_de_a
    a.put(f"/api/annotations/{sid}", json={"annotations": [REGLA, {**REGLA, "id": "z9"}]})
    a.put(f"/api/annotations/{sid}", json={"annotations": []})
    ev = [e for e in _eventos("ANNOTATIONS_DELETED") if e["payload"]["session_id"] == sid][-1]
    assert "z9" in ev["payload"]["deleted"] and ev["patient_hash"]
