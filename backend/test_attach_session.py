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


class TestAdjuntarUnaSesionReanudada:
    """Reanudar da a la sesión viva un id nuevo. Adjuntar buscaba la fila por
    ese id exacto, no la encontraba y creaba otra: la sesión guardada salía dos
    veces en «Sesiones guardadas», una de ellas sin instantánea que reanudar."""

    def _guardada_y_reanudada(self) -> tuple[str, str]:
        sid, _ = _sesion()
        assert client.post("/api/sessions/save", json={
            "session_id": sid, "current_step": 2, "label": "sin paciente"}).status_code == 200
        r = client.post(f"/api/sessions/{sid}/restore")
        assert r.status_code == 200, r.text
        return sid, r.json()["session_id"]

    def _filas(self, *ids: str):
        from services.db_models import PlanningSession
        db = SessionLocal()
        try:
            return db.query(PlanningSession).filter(PlanningSession.session_id.in_(ids)).all()
        finally:
            db.close()

    def test_adjuntar_la_reanudada_reutiliza_la_fila_de_origen(self):
        sid, vivo = self._guardada_y_reanudada()
        id_fila = self._filas(sid)[0].id
        r = client.post(f"/api/sessions/{vivo}/attach", json={
            "new_patient": {"surname": "Reanudada"}, "new_case": {"dx_principal": "Control"}})
        assert r.status_code == 200, r.text
        filas = self._filas(sid, vivo)
        assert len(filas) == 1 and filas[0].id == id_fila
        assert filas[0].imaging_study_id == r.json()["imaging_study_id"]
        assert filas[0].patient_id == r.json()["patient"]["id"]
        # Y «Guardar progreso» después sigue cayendo en esa misma fila.
        assert client.post("/api/sessions/save", json={
            "session_id": vivo, "current_step": 3}).status_code == 200
        assert [f.id for f in self._filas(sid, vivo)] == [id_fila]

    def test_la_reanudada_de_una_adjunta_no_se_adjunta_otra_vez(self):
        sid, vivo = self._guardada_y_reanudada()
        assert client.post(f"/api/sessions/{vivo}/attach", json={
            "new_patient": {"surname": "Primera"}, "new_case": {"dx_principal": "X"}}).status_code == 200
        # Otra pestaña reanuda la misma guardada: ya está adjunta por su origen.
        otra = client.post(f"/api/sessions/{sid}/restore").json()["session_id"]
        assert client.get(f"/api/sessions/{otra}/identity").json()["attached"] is True
        assert client.post(f"/api/sessions/{otra}/attach", json={
            "new_patient": {"surname": "Segunda"}, "new_case": {"dx_principal": "Y"}}).status_code == 409


def _paciente_con_caso(apellido: str, hc: str = "", motivo="Aneurisma basilar") -> tuple[int, int]:
    db = SessionLocal()
    p = Patient(surname=apellido, hospital_id=hc or f"HC-{uuid.uuid4().hex[:8]}")
    db.add(p); db.commit()
    c = Study(patient_id=p.id, description=motivo, dx_principal=motivo)
    db.add(c); db.commit(); pid, cid = p.id, c.id; db.close()
    return pid, cid


class TestElPacienteDeLaSesion:
    """UNI-178: la sesión ya era de un paciente (guardada en su ficha, sin estudio
    archivado) y el diálogo propuso otro, uno antiguo creado con el mismo DICOM,
    que además tenía un caso con el mismo nombre. Se adjuntó al equivocado."""

    def test_propone_el_paciente_y_el_caso_de_la_sesion(self):
        sid, hc = _sesion()
        de_la_sesion, caso = _paciente_con_caso("Sesión")
        antiguo, _ = _paciente_con_caso("Antiguo", hc=hc)       # el que casa con la cabecera
        assert client.post("/api/sessions/save", json={
            "session_id": sid, "current_step": 3, "patient_id": de_la_sesion,
            "study_id": caso}).status_code == 200
        j = client.get(f"/api/sessions/{sid}/identity").json()
        assert j["session_patient"]["id"] == de_la_sesion and j["session_patient"]["reason"] == "session"
        assert j["session_case_id"] == caso
        # La coincidencia de la cabecera sigue saliendo: el diálogo avisa de ella.
        assert [m["id"] for m in j["matches"]] == [antiguo]

    def test_una_sesion_sin_paciente_no_propone_ninguno(self):
        sid, _ = _sesion()
        j = client.get(f"/api/sessions/{sid}/identity").json()
        assert j["session_patient"] is None and j["session_case_id"] is None


class TestMoverUnaSesionAdjunta:
    """UNI-178: adjunta al paciente equivocado, no había forma de corregirlo."""

    def _adjunta(self) -> tuple[str, int, int, dict]:
        sid, _ = _sesion()
        pa, ca = _paciente_con_caso("Equivocado")
        r = client.post(f"/api/sessions/{sid}/attach", json={"patient_id": pa, "case_id": ca})
        assert r.status_code == 200, r.text
        return sid, pa, ca, r.json()

    def test_mueve_el_estudio_la_sesion_y_la_confirmacion(self):
        from services.db_models import PlanningSession
        sid, pa, ca, adj = self._adjunta()
        write_states(sid, {"detect.n_candidates": "1", "detect.cand_001.centroid_x": "1",
                           "detect.cand_001.centroid_y": "2", "detect.cand_001.centroid_z": "3",
                           "detect.cand_001.diameter_mm": "5"})
        assert client.post("/api/ground-truth", json={
            "session_id": sid, "source": "candidate", "candidate_id": "cand-001",
            "imaging_study_id": adj["imaging_study_id"]}).status_code == 201
        pb, cb = _paciente_con_caso("Correcto")

        r = client.post(f"/api/sessions/{sid}/move", json={"patient_id": pb, "case_id": cb})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["patient"]["id"] == pb and j["case_id"] == cb
        assert j["imaging_study_id"] == adj["imaging_study_id"]        # el mismo, no otra copia
        db = SessionLocal()
        try:
            img = db.get(ImagingStudy, adj["imaging_study_id"])
            assert (img.patient_id, img.case_id) == (pb, cb)
            fila = db.query(PlanningSession).filter_by(imaging_study_id=img.id).one()
            assert (fila.patient_id, fila.study_id) == (pb, cb)
            conf = db.query(LesionConfirmation).filter_by(session_id=sid).one()
            assert (conf.patient_id, conf.case_id) == (pb, cb)
            assert db.query(ImagingStudy).filter_by(case_id=ca).count() == 0
        finally:
            db.close()
        bloque = [b for b in SkullChain.instance().get_all_blocks() if b["action"] == "SESSION_MOVED"][-1]
        p = json.loads(bloque["payload_json"])
        assert p["session_id"] == sid and (p["from_patient"], p["from_case"]) == (pa, ca)
        assert (p["patient"], p["case"]) == (pb, cb)
        assert "Correcto" not in bloque["payload_json"]

    def test_a_un_caso_nuevo_del_mismo_paciente(self):
        sid, pa, ca, adj = self._adjunta()
        r = client.post(f"/api/sessions/{sid}/move", json={
            "patient_id": pa, "new_case": {"dx_principal": "Control"}})
        assert r.status_code == 200, r.text
        assert r.json()["case_id"] != ca and r.json()["case_label"] == "Control"

    def test_al_mismo_caso_no_hace_nada(self):
        sid, pa, ca, _ = self._adjunta()
        r = client.post(f"/api/sessions/{sid}/move", json={"patient_id": pa, "case_id": ca})
        assert r.status_code == 409 and "ya está" in r.json()["detail"]

    def test_una_sesion_sin_adjuntar_se_adjunta_no_se_mueve(self):
        sid, _ = _sesion()
        pb, cb = _paciente_con_caso("X")
        r = client.post(f"/api/sessions/{sid}/move", json={"patient_id": pb, "case_id": cb})
        assert r.status_code == 409 and "Adjuntar" in r.json()["detail"]

    def test_con_el_paciente_solo_compartido_no_se_puede_mover(self):
        """Ver no basta. Quien tiene el paciente compartido se lo
        llevaba a un paciente suyo y el creador dejaba de verlo."""
        a_id, a = TestHistoriaDeOtroProfesional._medico()
        b_id, b = TestHistoriaDeOtroProfesional._medico()
        sid, _ = _sesion()
        db = SessionLocal()
        p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:8]}", created_by=a_id)
        db.add(p); db.commit()
        c = Study(patient_id=p.id, description="Caso", dx_principal="Caso")
        db.add(c); db.commit(); pid, cid = p.id, c.id; db.close()
        assert a.post(f"/api/sessions/{sid}/attach", json={"patient_id": pid, "case_id": cid}).status_code == 200
        assert a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).status_code == 200

        r = b.post(f"/api/sessions/{sid}/move", json={
            "new_patient": {"surname": "DeB"}, "new_case": {"dx_principal": "X"}})
        assert r.status_code == 403
        db = SessionLocal()
        try:
            assert db.query(ImagingStudy).filter_by(case_id=cid).count() == 1
            assert db.query(Patient).filter_by(surname="DeB").count() == 0
        finally:
            db.close()
        # El creador sí puede.
        r = a.post(f"/api/sessions/{sid}/move", json={"patient_id": pid, "new_case": {"dx_principal": "Otro"}})
        assert r.status_code == 200, r.text

    def test_un_caso_de_otro_paciente_se_rechaza_y_no_mueve_nada(self):
        sid, pa, ca, adj = self._adjunta()
        pb, _ = _paciente_con_caso("B")
        _, cc = _paciente_con_caso("C")
        r = client.post(f"/api/sessions/{sid}/move", json={"patient_id": pb, "case_id": cc})
        assert r.status_code == 404
        db = SessionLocal()
        try:
            assert db.get(ImagingStudy, adj["imaging_study_id"]).case_id == ca
        finally:
            db.close()


class TestHistoriaDeOtroProfesional:
    """Revisión T7: el 409 por historia repetida no nombra a un paciente que
    quien adjunta no ve; al compartido sí, y puede adjuntar con caso nuevo."""

    @staticmethod
    def _medico():
        from conftest import anonymous_client
        from services.auth_service import create_access_token, get_password_hash
        from services.db_models import User
        nombre = f"med-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico", full_name=nombre)
        db.add(u); db.commit(); uid = u.id; db.close()
        c = anonymous_client(app)
        c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
        return uid, c

    def _de(self, uid: int, hc: str) -> int:
        db = SessionLocal()
        p = Patient(surname="Reservado", given_name="Nombre", hospital_id=hc, created_by=uid)
        db.add(p); db.commit(); pid = p.id; db.close()
        return pid

    def test_no_dice_el_nombre_de_un_paciente_ajeno(self):
        a_id, _a = self._medico(); _b_id, b = self._medico()
        sid, hc = _sesion()
        self._de(a_id, hc)
        r = b.post(f"/api/sessions/{sid}/attach", json={
            "new_patient": {"surname": "Otro", "hospital_id": hc}, "new_case": {"dx_principal": "X"}})
        assert r.status_code == 409
        assert "Reservado" not in r.json()["detail"] and "comparta contigo" in r.json()["detail"]

    def test_al_compartido_si_y_adjunta_con_caso_nuevo(self):
        a_id, a = self._medico(); b_id, b = self._medico()
        sid, hc = _sesion()
        pid = self._de(a_id, hc)
        assert a.put(f"/api/patients/{pid}/shares", json={"user_ids": [b_id]}).status_code == 200
        r = b.post(f"/api/sessions/{sid}/attach", json={
            "new_patient": {"surname": "Otro", "hospital_id": hc}, "new_case": {"dx_principal": "X"}})
        assert r.status_code == 409 and "Reservado" in r.json()["detail"]
        r = b.post(f"/api/sessions/{sid}/attach", json={"patient_id": pid, "new_case": {"dx_principal": "X"}})
        assert r.status_code == 200 and r.json()["patient"]["is_shared_with_me"] is True
