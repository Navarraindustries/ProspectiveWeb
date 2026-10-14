"""Sesiones guardadas (F2-73, F2-74): renombrar, borrar y tamaño en disco.

Patrón de clientes con rol de test_access_control.py (`_medico`, `admin`,
`anonymous_client`)."""
import json
import uuid
from datetime import datetime

from main import app
from sqlalchemy import update

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
    # La aplicación no puede cerrar una sesión abierta: el detail dice cuándo
    # caduca sola (su .created_at + TTL), no una instrucción imposible.
    from datetime import datetime
    from services.sessions import SESSIONS_ROOT, SESSION_TTL_SEC
    creada = float((SESSIONS_ROOT / viva / ".created_at").read_text())
    caduca = datetime.fromtimestamp(creada + SESSION_TTL_SEC)
    detail = r.json()["detail"]
    assert "caduca sola" in detail
    assert caduca.strftime("%H:%M") in detail and caduca.strftime("%d/%m") in detail
    assert "ciérrala" not in detail
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


def _fijar_antigua(sid: str, **extra) -> datetime:
    """Deja la fila con un updated_at antiguo conocido (explícito, para que onupdate no actúe)."""
    antigua = datetime(2026, 9, 25, 10, 0, 0)
    db = SessionLocal()
    db.execute(update(PlanningSession).where(PlanningSession.session_id == sid)
               .values(updated_at=antigua, **extra))
    db.commit(); db.close()
    return antigua


def _updated_at(sid: str) -> datetime:
    db = SessionLocal()
    try:
        return db.query(PlanningSession).filter_by(session_id=sid).first().updated_at
    finally:
        db.close()


def test_cachear_el_tamano_no_toca_updated_at():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    antigua = _fijar_antigua(sid, size_bytes=None)
    for _ in range(2):
        item = next(s for s in _lista(m, pid) if s["session_id"] == sid)
        assert item["size_bytes"] > 0
    assert _updated_at(sid) == antigua
    db = SessionLocal()
    try:
        assert db.query(PlanningSession).filter_by(session_id=sid).first().size_bytes > 0
    finally:
        db.close()


def test_renombrar_no_toca_updated_at():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    antigua = _fijar_antigua(sid)
    r = m.patch(f"/api/sessions/saved/{sid}", json={"label": "Otro nombre"})
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "Otro nombre"
    assert _updated_at(sid) == antigua
    assert next(s for s in _lista(m, pid) if s["session_id"] == sid)["label"] == "Otro nombre"


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


def test_la_pestana_hermana_con_origen_reapuntado_bloquea_el_borrado():
    from services.sessions import delete_session
    uid, m = _medico(); pid = _paciente_de(uid); a = _guardada(m, pid)
    l1 = m.post(f"/api/sessions/{a}/restore").json()["session_id"]
    l2 = m.post(f"/api/sessions/{a}/restore").json()["session_id"]
    # Guardar sobre el origen desde l1: la fila pasa a l1 y A queda reapuntada.
    r = m.post("/api/sessions/save", json={"session_id": l1, "current_step": 3, "patient_id": pid})
    assert r.status_code == 200, r.text
    assert (SAVES_ROOT / f"{a}.reapuntada").read_text(encoding="utf-8").strip() == l1
    delete_session(l1)
    r = m.delete(f"/api/sessions/saved/{l1}")
    assert r.status_code == 409 and (SAVES_ROOT / l1).is_dir()
    delete_session(l2)
    assert m.delete(f"/api/sessions/saved/{l1}").status_code == 204
    assert not (SAVES_ROOT / f"{a}.reapuntada").exists()


def test_la_guardada_de_la_pestana_abierta_no_se_borra():
    from services.sessions import delete_session
    uid, m = _medico(); pid = _paciente_de(uid); a = _guardada(m, pid)
    l1 = m.post(f"/api/sessions/{a}/restore").json()["session_id"]
    assert m.post("/api/sessions/save", json={"session_id": l1, "current_step": 3,
                                              "patient_id": pid}).status_code == 200
    r = m.delete(f"/api/sessions/saved/{l1}")      # l1 sigue abierta
    assert r.status_code == 409 and (SAVES_ROOT / l1).is_dir()
    assert any(s["session_id"] == l1 for s in _lista(m, pid))
    delete_session(l1)
    assert m.delete(f"/api/sessions/saved/{l1}").status_code == 204


def test_un_compartido_reanuda_pero_no_renombra_ni_borra():
    """Spec §6.2: renombrar y borrar guardados es del creador del paciente o de
    un administrador; quien lo tiene compartido trabaja con ellos y los ve."""
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid)
    b_id, b = _medico()
    assert m.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).status_code == 200
    r = b.patch(f"/api/sessions/saved/{sid}", json={"label": "x"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Solo quien creó al paciente o un administrador puede cambiar sus guardados."
    r = b.delete(f"/api/sessions/saved/{sid}")
    assert r.status_code == 403
    assert r.json()["detail"] == "Solo quien creó al paciente o un administrador puede cambiar sus guardados."
    assert (SAVES_ROOT / sid).is_dir()
    lista = b.get(f"/api/patients/{pid}/sessions")
    assert lista.status_code == 200 and any(s["session_id"] == sid for s in lista.json())


def _reanudar_y_guardar(m, sid: str, pid: int, label: str) -> None:
    viva = m.post(f"/api/sessions/{sid}/restore").json()["session_id"]
    r = m.post("/api/sessions/save",
               json={"session_id": viva, "current_step": 3, "label": label,
                     "patient_id": pid, "overwrite_origin": True})
    assert r.status_code == 200, r.text


def test_guardar_progreso_respeta_el_nombre_puesto_a_mano():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid, "Juan · Detección")
    assert m.patch(f"/api/sessions/saved/{sid}", json={"label": "Caso 3 · revisión"}).status_code == 200
    _reanudar_y_guardar(m, sid, pid, "Juan · Morfometría")
    filas = _lista(m, pid)
    assert [s["label"] for s in filas] == ["Caso 3 · revisión"]
    assert filas[0]["current_step"] == 3


def test_guardar_progreso_refresca_la_etiqueta_automatica():
    uid, m = _medico(); pid = _paciente_de(uid); sid = _guardada(m, pid, "Juan · Detección")
    _reanudar_y_guardar(m, sid, pid, "Juan · Morfometría")
    assert [s["label"] for s in _lista(m, pid)] == ["Juan · Morfometría"]
