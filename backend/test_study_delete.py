"""Borrar un estudio de imagen archivado: solo quien creó al paciente o un administrador."""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_borrar_estudio_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.database import Base, SessionLocal, engine
from services.db_models import ImagingStudy, Patient, PatientShare, PlanningSession, Study
from services.sessions import create_session
from services.storage import get_storage
from test_access_control import _medico

Base.metadata.create_all(bind=engine)
admin = TestClient(app, raise_server_exceptions=True)


def _caso(owner_id: int, shared_with: int | None = None) -> dict:
    """Paciente con un estudio archivado de verdad en el almacén y una sesión ligada."""
    st = get_storage()
    db = SessionLocal()
    p = Patient(surname="Borrar", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=owner_id)
    db.add(p); db.commit()
    c = Study(patient_id=p.id, dx_principal="Caso"); db.add(c); db.commit()
    img = ImagingStudy(case_id=c.id, patient_id=p.id, modality="CT", n_files=1)
    db.add(img); db.commit()
    prefix, thumb = f"studies/{img.id}/dicom", f"studies/{img.id}/thumb.png"
    st.put_bytes(f"{prefix}/a.dcm", b"x"); st.put_bytes(thumb, b"png")
    img.storage_prefix, img.thumb_key = prefix, thumb
    sid = create_session()
    db.add(PlanningSession(session_id=sid, patient_id=p.id, study_id=c.id, imaging_study_id=img.id))
    db.commit()
    if shared_with is not None:
        db.add(PatientShare(patient_id=p.id, user_id=shared_with, shared_by=owner_id)); db.commit()
    out = dict(img=img.id, sid=sid, prefix=prefix, thumb=thumb)
    db.close()
    return out


def test_el_creador_borra_y_quedan_sin_objetos_y_la_sesion_desligada():
    uid, a = _medico()
    ids = _caso(uid)
    assert a.delete(f"/api/studies/{ids['img']}").status_code == 204
    db = SessionLocal()
    assert db.get(ImagingStudy, ids["img"]) is None
    ps = db.query(PlanningSession).filter_by(session_id=ids["sid"]).one()
    assert ps.imaging_study_id is None
    db.close()
    st = get_storage()
    assert st.list_prefix(ids["prefix"]) == []
    with pytest.raises(Exception):
        st.get_bytes(ids["thumb"])
    assert a.delete(f"/api/studies/{ids['img']}").status_code == 404


def test_el_administrador_borra():
    uid, _a = _medico()
    ids = _caso(uid)
    assert admin.delete(f"/api/studies/{ids['img']}").status_code == 204


def test_el_compartido_no_borra_y_el_ajeno_no_se_entera():
    uid, _a = _medico()
    sid_, shared = _medico()
    _oid, otro = _medico()
    ids = _caso(uid, shared_with=sid_)
    r = shared.delete(f"/api/studies/{ids['img']}")
    assert r.status_code == 403
    assert r.json()["detail"] == "Solo quien creó al paciente o un administrador puede borrar un estudio archivado."
    assert otro.delete(f"/api/studies/{ids['img']}").status_code == 403
    assert get_storage().list_prefix(ids["prefix"]) != []


def test_anonimo_401():
    uid, _a = _medico()
    ids = _caso(uid)
    assert anonymous_client(app).delete(f"/api/studies/{ids['img']}").status_code == 401


def test_la_galeria_dice_quien_creo_al_paciente():
    uid, a = _medico()
    ids = _caso(uid)
    card = next(s for s in a.get("/api/studies").json() if s["id"] == ids["img"])
    assert card["owner_id"] == uid


def test_con_capturas_guardadas_no_se_borra():
    from test_captures import _guardar
    uid, a = _medico()
    ids = _caso(uid)
    _guardar(ids["img"])
    r = a.delete(f"/api/studies/{ids['img']}")
    assert r.status_code == 409
    assert get_storage().list_prefix(ids["prefix"]) != []
