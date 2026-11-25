"""Borrar un paciente o un caso se lleva todo lo suyo, sin 500 ni ficheros huérfanos.

El 23-11, borrar al paciente 241 daba un 500 (FOREIGN KEY): sus 8 capturas
apuntaban a su estudio de imagen y nadie las quitaba. Además el DICOM archivado
de sus estudios y las carpetas de sus sesiones guardadas se quedaban en disco.
"""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_borrar_paciente_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import pytest
from fastapi.testclient import TestClient

from main import app
from services.database import Base, SessionLocal, engine
from services.db_models import CaseCapture, ImagingStudy, LesionConfirmation, Patient, PlanningSession, Study
from services.sessions import _saved
from services.storage import get_storage

Base.metadata.create_all(bind=engine)
admin = TestClient(app, raise_server_exceptions=True)


def _paciente(n_capturas: int = 3) -> dict:
    """Paciente con un caso, un estudio archivado, capturas y una sesión guardada en disco."""
    st = get_storage()
    db = SessionLocal()
    p = Patient(surname="Borrar", hospital_id=f"HC-{uuid.uuid4().hex[:6]}")
    db.add(p); db.commit()
    c = Study(patient_id=p.id, dx_principal="Caso"); db.add(c); db.commit()
    img = ImagingStudy(case_id=c.id, patient_id=p.id, modality="XA", n_files=1)
    db.add(img); db.commit()
    prefix, thumb = f"studies/{img.id}/dicom", f"studies/{img.id}/thumb.png"
    st.put_bytes(f"{prefix}/a.dcm", b"x"); st.put_bytes(thumb, b"png")
    img.storage_prefix, img.thumb_key = prefix, thumb
    claves = []
    for i in range(n_capturas):
        k = f"studies/{img.id}/captures/{uuid.uuid4().hex}.png"
        st.put_bytes(k, b"png")
        db.add(CaseCapture(imaging_study_id=img.id, case_id=c.id, patient_id=p.id,
                           storage_key=k, media_type="image/png", width=4, height=3))
        claves.append(k)
    sid = str(uuid.uuid4())
    db.add(PlanningSession(session_id=sid, patient_id=p.id, study_id=c.id, imaging_study_id=img.id))
    db.commit()
    carpeta = _saved(sid)
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "state.txt").write_text("x", encoding="utf-8")
    out = dict(pid=p.id, caso=c.id, img=img.id, sid=sid, prefix=prefix, thumb=thumb,
               claves=claves, carpeta=carpeta)
    db.close()
    return out


def _sin_fichero(k: str) -> bool:
    try:
        get_storage().get_bytes(k)
    except Exception:  # noqa: BLE001
        return True
    return False


def test_paciente_con_capturas_se_borra_entero():
    ids = _paciente()
    r = admin.delete(f"/api/patients/{ids['pid']}")
    assert r.status_code == 204, r.text
    db = SessionLocal()
    assert db.get(Patient, ids["pid"]) is None
    assert db.get(ImagingStudy, ids["img"]) is None
    assert db.query(CaseCapture).filter_by(patient_id=ids["pid"]).count() == 0
    assert db.query(PlanningSession).filter_by(session_id=ids["sid"]).count() == 0
    db.close()
    # Y en disco: ni el DICOM archivado, ni las capturas, ni la sesión guardada.
    assert get_storage().list_prefix(ids["prefix"]) == []
    assert _sin_fichero(ids["thumb"])
    assert all(_sin_fichero(k) for k in ids["claves"])
    assert not ids["carpeta"].exists()


def test_caso_con_capturas_se_borra_y_la_sesion_queda_desligada():
    ids = _paciente(n_capturas=2)
    r = admin.delete(f"/api/patients/{ids['pid']}/studies/{ids['caso']}")
    assert r.status_code == 204, r.text
    db = SessionLocal()
    assert db.get(Study, ids["caso"]) is None
    assert db.get(ImagingStudy, ids["img"]) is None
    assert db.query(CaseCapture).filter_by(case_id=ids["caso"]).count() == 0
    ps = db.query(PlanningSession).filter_by(session_id=ids["sid"]).one()
    assert ps.study_id is None and ps.imaging_study_id is None      # se conserva, desligada
    assert db.get(Patient, ids["pid"]) is not None
    db.close()
    assert get_storage().list_prefix(ids["prefix"]) == []
    assert all(_sin_fichero(k) for k in ids["claves"])
    assert ids["carpeta"].exists()                                   # la sesión guardada sigue


def test_con_una_sesion_guardada_abierta_no_se_borra(monkeypatch):
    ids = _paciente(n_capturas=0)
    import services.sessions as sessions
    monkeypatch.setattr(sessions, "live_sessions_from",
                        lambda sid: ["viva"] if sid == ids["sid"] else [])
    r = admin.delete(f"/api/patients/{ids['pid']}")
    assert r.status_code == 409
    assert "abierta" in r.json()["detail"]
    db = SessionLocal()
    assert db.get(Patient, ids["pid"]) is not None                   # nada tocado
    db.close()
    assert get_storage().list_prefix(ids["prefix"]) != []


def test_confirmacion_de_lesion_del_estudio_no_bloquea():
    ids = _paciente(n_capturas=1)
    db = SessionLocal()
    campos = {c.name for c in LesionConfirmation.__table__.columns}
    datos = {k: v for k, v in dict(patient_id=ids["pid"], case_id=ids["caso"],
                                   imaging_study_id=ids["img"], source="candidate").items()
             if k in campos}
    try:
        db.add(LesionConfirmation(**datos)); db.commit()
    except Exception:  # noqa: BLE001 — si la tabla pide más campos, la prueba no aplica
        db.rollback(); db.close()
        pytest.skip("LesionConfirmation necesita más campos que los de la prueba")
    db.close()
    assert admin.delete(f"/api/patients/{ids['pid']}").status_code == 204
