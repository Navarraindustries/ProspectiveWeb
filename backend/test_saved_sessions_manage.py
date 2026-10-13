"""Sesiones guardadas (F2-73, F2-74): renombrar, borrar y tamaño en disco.

Patrón de clientes con rol de test_access_control.py (`_medico`, `admin`,
`anonymous_client`)."""
import json
import uuid

from main import app
from services.database import SessionLocal
from services.db_models import Patient, PlanningSession
from services.sessions import SAVES_ROOT, create_session, session_subdir, write_state
from test_access_control import _medico, admin, anonymous_client


def _paciente_de(uid: int) -> int:
    db = SessionLocal()
    p = Patient(surname="Guardado", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def _guardada(client, pid: int, label: str = "Mi sesión") -> str:
    sid = create_session()
    (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("malla")
    write_state(sid, "dicom.modality", "CT")
    r = client.post("/api/sessions/save",
                    json={"session_id": sid, "current_step": 2, "label": label, "patient_id": pid})
    assert r.status_code == 200, r.text
    return sid


def _suma(sid: str) -> int:
    return sum(f.stat().st_size for f in (SAVES_ROOT / sid).rglob("*") if f.is_file())


def _lista(client, pid):
    return client.get(f"/api/patients/{pid}/sessions").json()


def test_renombrar_cambia_la_etiqueta_y_la_lista_la_devuelve():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    r = m.patch(f"/api/sessions/saved/{sid}", json={"label": "  Antes de la embolización  "})
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "Antes de la embolización" and r.json()["session_id"] == sid
    assert r.json()["size_bytes"] > 0
    assert next(s for s in _lista(m, pid) if s["session_id"] == sid)["label"] == "Antes de la embolización"


def test_etiqueta_vacia_o_larga_es_422_en_castellano():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    for malo in ("", "   ", "x" * 257):
        r = m.patch(f"/api/sessions/saved/{sid}", json={"label": malo})
        assert r.status_code == 422, malo
        assert "nombre" in json.dumps(r.json(), ensure_ascii=False).lower()


def test_borrar_quita_fila_carpeta_y_marca():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    marca = SAVES_ROOT / f"{sid}.reapuntada"
    marca.write_text("otra", encoding="utf-8")
    assert (SAVES_ROOT / sid).is_dir()
    assert m.delete(f"/api/sessions/saved/{sid}").status_code == 204
    assert not (SAVES_ROOT / sid).exists() and not marca.exists()
    db = SessionLocal()
    try:
        assert db.query(PlanningSession).filter_by(session_id=sid).first() is None
    finally:
        db.close()
    assert sid not in [s["session_id"] for s in _lista(m, pid)]
    assert m.delete(f"/api/sessions/saved/{sid}").status_code == 404


def test_borrar_deja_bloque_de_auditoria():
    from services.audit import SkullChain
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid, "Para borrar")
    m.patch(f"/api/sessions/saved/{sid}", json={"label": "Nuevo"})
    m.delete(f"/api/sessions/saved/{sid}")
    bl = SkullChain.instance().get_all_blocks()
    ren = [b for b in bl if b["action"] == "SAVED_SESSION_RENAMED"][-1]
    assert json.loads(ren["payload_json"]) == {"session_id": sid, "label_from": "Para borrar", "label_to": "Nuevo"}
    bor = [b for b in bl if b["action"] == "SAVED_SESSION_DELETED"][-1]
    assert json.loads(bor["payload_json"]) == {"session_id": sid, "label": "Nuevo"}


def test_el_origen_de_una_sesion_viva_no_se_borra():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    viva = m.post(f"/api/sessions/{sid}/restore").json()["session_id"]
    r = m.delete(f"/api/sessions/saved/{sid}")
    assert r.status_code == 409
    assert r.json()["detail"] == ("Esta sesión guardada es el origen de una sesión abierta: "
                                  "ciérrala antes de borrarla.")
    assert (SAVES_ROOT / sid).is_dir()
    assert any(s["session_id"] == sid for s in _lista(m, pid))
    # Al cerrar la viva ya se puede borrar.
    from services.sessions import delete_session
    delete_session(viva)
    assert m.delete(f"/api/sessions/saved/{sid}").status_code == 204


def test_el_tamano_es_la_suma_de_la_carpeta():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    item = next(s for s in _lista(m, pid) if s["session_id"] == sid)
    assert item["size_bytes"] > 0 and item["size_bytes"] == _suma(sid)
    db = SessionLocal()
    try:
        assert db.query(PlanningSession).filter_by(session_id=sid).first().size_bytes == _suma(sid)
    finally:
        db.close()
    glob = next(s for s in m.get("/api/sessions").json() if s["session_id"] == sid)
    assert glob["size_bytes"] == _suma(sid)


def test_fila_antigua_sin_tamano_se_calcula_y_se_guarda():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    db = SessionLocal()
    db.query(PlanningSession).filter_by(session_id=sid).update({"size_bytes": None})
    db.commit(); db.close()
    item = next(s for s in _lista(m, pid) if s["session_id"] == sid)
    assert item["size_bytes"] == _suma(sid)
    db = SessionLocal()
    try:
        assert db.query(PlanningSession).filter_by(session_id=sid).first().size_bytes == _suma(sid)
    finally:
        db.close()


def test_sin_acceso_403_anonimo_401_y_404():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    _o, otro = _medico()
    assert otro.patch(f"/api/sessions/saved/{sid}", json={"label": "x"}).status_code == 403
    assert otro.delete(f"/api/sessions/saved/{sid}").status_code == 403
    assert (SAVES_ROOT / sid).is_dir()
    anon = anonymous_client(app)
    assert anon.patch(f"/api/sessions/saved/{sid}", json={"label": "x"}).status_code == 401
    assert anon.delete(f"/api/sessions/saved/{sid}").status_code == 401
    r = m.delete(f"/api/sessions/saved/{uuid.uuid4().hex}")
    assert r.status_code == 404 and r.json()["detail"] == "Sesión guardada no encontrada."
    assert admin.patch(f"/api/sessions/saved/{sid}", json={"label": "admin"}).status_code == 200


def test_sesion_suelta_solo_el_administrador():
    uid, m = _medico()
    sid = _guardada(admin, None)  # sin paciente
    assert m.patch(f"/api/sessions/saved/{sid}", json={"label": "x"}).status_code == 403
    assert admin.delete(f"/api/sessions/saved/{sid}").status_code == 204
