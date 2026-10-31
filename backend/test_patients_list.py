"""La lista de pacientes (F2-19, F2-24): cada fila trae su última sesión y su
último caso, para ordenar por última actividad y reanudar en un clic, y la
lista se arma con consultas agrupadas, no con una por paciente."""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import event

from services.database import SessionLocal, engine
from services.db_models import CaseCapture, ImagingStudy, Patient, PlanningSession, Study
from test_access_control import _medico


def _paciente(uid: int, **kw) -> int:
    db = SessionLocal()
    p = Patient(surname="Lista", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid, **kw)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def _caso(pid: int, dx: str, cuando: datetime) -> int:
    db = SessionLocal()
    s = Study(patient_id=pid, dx_principal=dx, created_at=cuando)
    db.add(s); db.commit(); sid = s.id; db.close()
    return sid


def _sesion(pid: int, paso: int, cuando: datetime, study_id: int | None = None,
            riesgo: str | None = None) -> str:
    db = SessionLocal()
    sid = uuid.uuid4().hex
    db.add(PlanningSession(session_id=sid, patient_id=pid, study_id=study_id,
                           current_step=paso, created_at=cuando, updated_at=cuando,
                           rupture_risk_label=riesgo))
    db.commit(); db.close()
    return sid


def _imagen(pid: int, cuando: datetime, thumb_key: str = "t") -> int:
    # El estudio de imagen exige un caso: se crea uno propio para no pisar los del test.
    db = SessionLocal()
    caso = Study(patient_id=pid, dx_principal="", created_at=cuando)
    db.add(caso); db.flush()
    im = ImagingStudy(case_id=caso.id, patient_id=pid, thumb_key=thumb_key, created_at=cuando)
    db.add(im); db.commit(); iid = im.id; db.close()
    return iid


def _captura(pid: int, imaging_study_id: int, cuando: datetime, media_type: str = "image/png") -> int:
    db = SessionLocal()
    cap = CaseCapture(imaging_study_id=imaging_study_id, patient_id=pid, storage_key="k",
                      media_type=media_type, created_at=cuando)
    db.add(cap); db.commit(); cid = cap.id; db.close()
    return cid


def _fila(c, pid: int) -> dict:
    return next(p for p in c.get("/api/patients").json() if p["id"] == pid)


def test_la_fila_trae_el_riesgo_de_la_misma_sesion_que_el_paso():
    # La sesión antigua tenía riesgo «Alto»; la reciente no tiene → None, no se hereda.
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    _sesion(pid, 2, t0, riesgo="Alto")
    _sesion(pid, 5, t0 + timedelta(days=1))
    fila = _fila(c, pid)
    assert fila["last_session_step"] == 5 and fila["last_risk_label"] is None


def test_el_riesgo_sale_cuando_la_ultima_sesion_lo_tiene():
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    _sesion(pid, 2, t0, riesgo="Alto")
    _sesion(pid, 5, t0 + timedelta(days=1), riesgo="Moderado")
    assert _fila(c, pid)["last_risk_label"] == "Moderado"


def test_la_captura_mas_reciente_es_de_imagen_y_de_cualquier_caso():
    # PNG antiguo en un estudio, vídeo más reciente en otro → gana el PNG.
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    a, b = _imagen(pid, t0), _imagen(pid, t0)
    png_antiguo = _captura(pid, a, t0)
    _captura(pid, b, t0 + timedelta(days=1), media_type="video/webm")
    assert _fila(c, pid)["last_capture_id"] == png_antiguo


def test_sin_png_la_captura_viene_vacia():
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    _captura(pid, _imagen(pid, t0), t0, media_type="video/webm")
    assert _fila(c, pid)["last_capture_id"] is None


def test_la_vista_previa_es_del_estudio_mas_reciente_con_miniatura():
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    con_miniatura = _imagen(pid, t0, thumb_key="t")
    _imagen(pid, t0 + timedelta(days=1), thumb_key="")
    assert _fila(c, pid)["last_imaging_study_id"] == con_miniatura


def test_los_campos_nuevos_no_rompen_la_fila_sin_nada():
    uid, c = _medico()
    fila = _fila(c, _paciente(uid))
    assert fila["last_risk_label"] is None and fila["last_capture_id"] is None and fila["last_imaging_study_id"] is None


def test_la_fila_trae_la_ultima_sesion_y_el_ultimo_caso():
    uid, c = _medico()
    pid = _paciente(uid)
    t0 = datetime(2026, 10, 1, 8, 0)
    _caso(pid, "Aneurisma ACoA", t0)
    caso2 = _caso(pid, "Aneurisma ACM derecha", t0 + timedelta(days=2))
    _sesion(pid, 2, t0 + timedelta(hours=1))
    reciente = _sesion(pid, 5, t0 + timedelta(days=3), study_id=caso2)
    _sesion(pid, 1, t0 + timedelta(days=1))

    fila = next(p for p in c.get("/api/patients").json() if p["id"] == pid)
    assert fila["last_session_id"] == reciente
    assert fila["last_session_step"] == 5
    assert fila["last_session_at"].startswith("2026-10-04T08:00")
    assert fila["last_case_label"] == "Aneurisma ACM derecha"
    assert fila["study_count"] == 2


def test_sin_sesiones_ni_casos_los_campos_vienen_vacios():
    uid, c = _medico()
    pid = _paciente(uid)
    fila = next(p for p in c.get("/api/patients").json() if p["id"] == pid)
    assert fila["last_session_id"] is None
    assert fila["last_session_step"] is None
    assert fila["last_session_at"] is None
    assert fila["last_case_label"] == ""
    assert fila["study_count"] == 0


def test_crear_un_paciente_devuelve_los_campos_vacios():
    _uid, c = _medico()
    r = c.post("/api/patients", json={"surname": "Nuevo", "hospital_id": f"HC-{uuid.uuid4().hex[:6]}"})
    assert r.status_code in (200, 201)
    assert r.json()["last_session_id"] is None and r.json()["last_case_label"] == ""


def _consultas_de_la_lista(c) -> int:
    n = 0

    def contar(*_a, **_k):
        nonlocal n
        n += 1

    event.listen(engine, "before_cursor_execute", contar)
    try:
        assert c.get("/api/patients").status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", contar)
    return n


def test_la_lista_no_hace_una_consulta_por_paciente():
    # Con uno o con seis pacientes (cada uno con caso y sesión), las mismas consultas.
    uid, c = _medico()
    t0 = datetime(2026, 10, 1, 8, 0)
    pid = _paciente(uid)
    _sesion(pid, 1, t0, study_id=_caso(pid, "dx", t0))
    _captura(pid, _imagen(pid, t0), t0)
    con_uno = _consultas_de_la_lista(c)
    for i in range(5):
        pid = _paciente(uid)
        _sesion(pid, i, t0 + timedelta(days=i), study_id=_caso(pid, f"dx {i}", t0))
        _captura(pid, _imagen(pid, t0), t0)
    assert _consultas_de_la_lista(c) == con_uno
