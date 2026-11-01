"""GET /patients/{id}/sessions dice a qué caso y a qué estudio de imagen pertenece cada sesión."""
import uuid

from services.database import SessionLocal
from services.db_models import ImagingStudy, Patient, PlanningSession, Study
from test_access_control import _medico


def test_las_sesiones_del_paciente_traen_caso_y_estudio_de_imagen():
    uid, m = _medico()
    db = SessionLocal()
    try:
        p = Patient(surname="Ficha", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=uid)
        db.add(p); db.commit()
        caso = Study(patient_id=p.id, dx_principal="Aneurisma")
        db.add(caso); db.commit()
        img = ImagingStudy(case_id=caso.id, patient_id=p.id, description="CTA")
        db.add(img); db.commit()
        con, sin = f"s-{uuid.uuid4().hex[:8]}", f"s-{uuid.uuid4().hex[:8]}"
        db.add(PlanningSession(session_id=con, patient_id=p.id, study_id=caso.id,
                               imaging_study_id=img.id, label="con"))
        db.add(PlanningSession(session_id=sin, patient_id=p.id, label="sin"))
        db.commit()
        pid, cid, iid = p.id, caso.id, img.id
    finally:
        db.close()
    r = m.get(f"/api/patients/{pid}/sessions")
    assert r.status_code == 200, r.text
    por_id = {s["session_id"]: s for s in r.json()}
    assert por_id[con]["case_id"] == cid and por_id[con]["imaging_study_id"] == iid
    assert por_id[sin]["case_id"] is None and por_id[sin]["imaging_study_id"] is None
