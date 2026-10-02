"""«Adjuntar a un caso»: una sesión empezada sin paciente se liga después.

Lo que se defiende:
- la cabecera DICOM solo PROPONE los datos, y se busca antes si el paciente ya
  existe (el riesgo de este flujo son los duplicados);
- adjuntar archiva el DICOM como estudio, liga la sesión y pasa al estudio la
  confirmación de lesión hecha antes;
- un nº de historia repetido no crea otro paciente, y si algo falla no queda
  paciente ni caso a medias;
- una sesión ya adjunta no se adjunta dos veces.
"""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_attach_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import json

import pydicom
from fastapi.testclient import TestClient

from main import app
from services.audit import SkullChain
from services.database import Base, SessionLocal, engine
from services.db_models import ImagingStudy, LesionConfirmation, Patient, Study
from services.sessions import create_session, session_subdir, write_states
from test_volume_chunks import _write_classic_ct_series

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _sesion(hc: str | None = None, nombre="PEREZ^ANA MARIA") -> tuple[str, str]:
    """Sesión con un DICOM cuya cabecera dice `nombre` y un nº de historia único."""
    hc = hc or f"HC-{uuid.uuid4().hex[:8]}"
    sid = create_session()
    _write_classic_ct_series(sid, nz=3, size=8)
    for f in session_subdir(sid, "dicom").iterdir():
        ds = pydicom.dcmread(str(f))
        ds.PatientName, ds.PatientID = nombre, hc
        ds.PatientBirthDate, ds.PatientSex, ds.StudyDate = "19700131", "F", "20260915"
        ds.save_as(str(f))
    write_states(sid, {"dicom.modality": "CT"})
    return sid, hc


def _contar(model) -> int:
    db = SessionLocal()
    try:
        return db.query(model).count()
    finally:
        db.close()


class TestIdentidad:
    def test_propone_los_datos_de_la_cabecera_sin_escribir_nada(self):
        sid, hc = _sesion()
        antes = _contar(Patient)
        j = client.get(f"/api/sessions/{sid}/identity").json()
        assert j["suggestion"] == {"surname": "Perez", "given_name": "Ana Maria", "hospital_id": hc,
                                   "dob": "1970-01-31", "sex": "F"}
        assert j["study_date"] == "2026-09-15" and j["modality"] == "CT"
        assert j["matches"] == [] and j["attached"] is False
        assert _contar(Patient) == antes

    def test_encuentra_al_paciente_que_ya_existe_por_su_historia(self):
        sid, hc = _sesion()
        db = SessionLocal()
        p = Patient(surname="Pérez", given_name="Ana", hospital_id=hc)
        db.add(p); db.commit(); pid = p.id; db.close()
        m = client.get(f"/api/sessions/{sid}/identity").json()["matches"]
        assert [x["id"] for x in m] == [pid] and m[0]["reason"] == "hospital_id"


class TestAdjuntar:
    def test_paciente_y_caso_nuevos_archivan_y_ligan(self):
        sid, hc = _sesion()
        # Una confirmación hecha ANTES de adjuntar, sin estudio.
        write_states(sid, {"detect.n_candidates": "1", "detect.cand_001.centroid_x": "1",
                           "detect.cand_001.centroid_y": "2", "detect.cand_001.centroid_z": "3",
                           "detect.cand_001.diameter_mm": "5"})
        assert client.post("/api/ground-truth", json={
            "session_id": sid, "source": "candidate", "candidate_id": "cand-001"}).status_code == 201

        r = client.post(f"/api/sessions/{sid}/attach", json={
            "new_patient": {"surname": "Pérez", "given_name": "Ana María", "hospital_id": hc,
                            "dob": "1970-01-31", "sex": "F"},
            "new_case": {"dx_principal": "Aneurisma basilar", "study_date": "2026-09-15"},
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["patient"]["hospital_id"] == hc and j["case_label"] == "Aneurisma basilar"
        assert j["relinked_confirmations"] == 1

        db = SessionLocal()
        try:
            img = db.get(ImagingStudy, j["imaging_study_id"])
            assert img.archived and img.case_id == j["case_id"] and img.n_files == 3
            conf = db.query(LesionConfirmation).filter_by(session_id=sid).one()
            assert conf.imaging_study_id == img.id and conf.patient_id == j["patient"]["id"]
        finally:
            db.close()

        # La vigente ahora se encuentra por el estudio, también desde otra sesión.
        otra = create_session()
        cur = client.get(f"/api/ground-truth/current?session_id={otra}&imaging_study_id={j['imaging_study_id']}").json()
        assert cur and cur["reproducible"] is True

        bloque = [b for b in SkullChain.instance().get_all_blocks() if b["action"] == "SESSION_ATTACHED"][-1]
        assert json.loads(bloque["payload_json"])["session_id"] == sid
        assert "Pérez" not in bloque["payload_json"] and bloque["patient_hash"]

        assert client.get(f"/api/sessions/{sid}/identity").json()["attached"] is True
        assert client.post(f"/api/sessions/{sid}/attach", json={
            "patient_id": j["patient"]["id"], "case_id": j["case_id"]}).status_code == 409

    def test_paciente_y_caso_existentes(self):
        sid, _ = _sesion()
        db = SessionLocal()
        p = Patient(surname="Gómez", hospital_id=f"HC-{uuid.uuid4().hex[:6]}")
        db.add(p); db.commit()
        c = Study(patient_id=p.id, description="Control", dx_principal="Control anual")
        db.add(c); db.commit(); pid, cid = p.id, c.id; db.close()
        j = client.post(f"/api/sessions/{sid}/attach", json={"patient_id": pid, "case_id": cid}).json()
        assert j["patient"]["id"] == pid and j["case_id"] == cid

    def test_una_historia_repetida_no_crea_otro_paciente_ni_deja_nada(self):
        sid, hc = _sesion()
        db = SessionLocal()
        db.add(Patient(surname="Ya", hospital_id=hc)); db.commit(); db.close()
        pacientes, casos = _contar(Patient), _contar(Study)
        r = client.post(f"/api/sessions/{sid}/attach", json={
            "new_patient": {"surname": "Otro", "hospital_id": hc},
            "new_case": {"dx_principal": "X"}})
        assert r.status_code == 409 and "Elígelo" in r.json()["detail"]
        assert (_contar(Patient), _contar(Study)) == (pacientes, casos)

    def test_si_el_archivado_falla_no_queda_paciente_ni_caso(self, monkeypatch):
        import routers.studies as st
        sid, _ = _sesion()
        pacientes, casos = _contar(Patient), _contar(Study)

        def falla(*_a, **_k):
            raise RuntimeError("almacén caído")
        monkeypatch.setattr(st, "archive_session_dicom", falla)
        with __import__("pytest").raises(RuntimeError):
            client.post(f"/api/sessions/{sid}/attach", json={
                "new_patient": {"surname": "Fallo"}, "new_case": {"dx_principal": "X"}})
        assert (_contar(Patient), _contar(Study)) == (pacientes, casos)

    def test_un_caso_de_otro_paciente_se_rechaza(self):
        sid, _ = _sesion()
        db = SessionLocal()
        a = Patient(surname="A"); b = Patient(surname="B"); db.add_all([a, b]); db.commit()
        c = Study(patient_id=b.id, dx_principal="de B"); db.add(c); db.commit()
        aid, cid = a.id, c.id; db.close()
        r = client.post(f"/api/sessions/{sid}/attach", json={"patient_id": aid, "case_id": cid})
        assert r.status_code == 404

    def test_hay_que_elegir_uno_de_los_dos(self):
        sid, _ = _sesion()
        r = client.post(f"/api/sessions/{sid}/attach", json={"new_case": {"dx_principal": "X"}})
        assert r.status_code == 422

    def test_sin_dicom(self):
        r = client.post(f"/api/sessions/{create_session()}/attach", json={
            "new_patient": {"surname": "X"}, "new_case": {"dx_principal": "X"}})
        assert r.status_code == 422 and "DICOM" in r.json()["detail"]
