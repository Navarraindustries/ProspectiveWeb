"""Un profesional no ve los datos de los pacientes de otro.

La regla solo estaba en `routers/patients.py`. La galería de estudios, las
capturas (con ids consecutivos), las sesiones guardadas, el seguimiento y los
ficheros de `/data` no la aplicaban. Y `/data` servía la carpeta `data/`
entera: `/data/prospective.db` era la base de datos completa para cualquiera
con una cuenta.
"""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_acceso_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import ImagingStudy, Patient, PlanningSession, Study, User
from services.sessions import create_session, snapshot_session, write_state
from test_captures import _guardar

Base.metadata.create_all(bind=engine)
admin = TestClient(app, raise_server_exceptions=True)


def _medico() -> tuple[int, TestClient]:
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico", full_name=nombre)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, c


@pytest.fixture(scope="module")
def caso():
    """Un paciente de la médica A con estudio, captura y sesión guardada; y B, que no es nadie suyo."""
    a_id, a = _medico()
    _b_id, b = _medico()
    db = SessionLocal()
    p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=a_id)
    db.add(p); db.commit()
    c = Study(patient_id=p.id, dx_principal="Caso de A"); db.add(c); db.commit()
    img = ImagingStudy(case_id=c.id, patient_id=p.id, modality="XA"); db.add(img); db.commit()
    sid = create_session()
    write_state(sid, "dicom.modality", "XA")
    db.add(PlanningSession(session_id=sid, patient_id=p.id, study_id=c.id, imaging_study_id=img.id))
    db.commit()
    ids = dict(patient=p.id, case=c.id, img=img.id, sid=sid)
    db.close()
    snapshot_session(sid)
    ids["capture"] = _guardar(ids["img"])["id"]
    return a, b, ids


class TestOtroProfesional:
    def test_no_ve_sus_estudios_en_la_galeria(self, caso):
        a, b, ids = caso
        assert ids["img"] in [s["id"] for s in a.get("/api/studies").json()]
        assert ids["img"] not in [s["id"] for s in b.get("/api/studies").json()]
        assert b.get(f"/api/studies?patient_id={ids['patient']}").json() == []
        assert ids["img"] in [s["id"] for s in admin.get("/api/studies").json()]

    def test_no_abre_ni_previsualiza_el_estudio(self, caso):
        _a, b, ids = caso
        assert b.get(f"/api/studies/{ids['img']}/thumbnail").status_code == 403
        assert b.post(f"/api/studies/{ids['img']}/open").status_code == 403

    def test_no_ve_ni_toca_sus_capturas(self, caso):
        a, b, ids = caso
        cap = ids["capture"]
        assert a.get(f"/api/captures/{cap}/image").status_code == 200
        assert b.get(f"/api/captures/{cap}/image").status_code == 403
        assert b.patch(f"/api/captures/{cap}", json={"label": "mía"}).status_code == 403
        assert b.delete(f"/api/captures/{cap}").status_code == 403
        assert b.get(f"/api/captures?imaging_study_id={ids['img']}").json() == []
        assert len(a.get(f"/api/captures?imaging_study_id={ids['img']}").json()) == 1
        assert b.post("/api/captures", json={"imaging_study_id": ids["img"], "png_b64": "x"}).status_code == 403

    def test_no_reanuda_su_sesion_ni_ve_su_seguimiento(self, caso):
        a, b, ids = caso
        assert b.post(f"/api/sessions/{ids['sid']}/restore").status_code == 403
        assert b.get(f"/api/longitudinal/{ids['sid']}").status_code == 403
        assert b.get(f"/api/followup/{ids['sid']}/studies").status_code == 403
        assert ids["sid"] not in [s["session_id"] for s in b.get("/api/sessions").json()]
        assert ids["sid"] in [s["session_id"] for s in a.get("/api/sessions").json()]

    def test_no_descarga_los_ficheros_de_su_sesion(self, caso):
        a, b, ids = caso
        url = f"/data/sessions/{ids['sid']}/state.txt"
        assert a.get(url).status_code == 200
        assert b.get(url).status_code == 403

    def test_no_confirma_la_lesion_en_su_estudio(self, caso):
        _a, b, ids = caso
        mia = create_session()
        r = b.post("/api/ground-truth", json={"session_id": mia, "imaging_study_id": ids["img"], "source": "no_lesion"})
        assert r.status_code == 403
        assert b.get(f"/api/ground-truth/current?imaging_study_id={ids['img']}").status_code == 403


class TestFichaAjena:
    """F1-33/F1-34: la ficha, los casos y las sesiones de un paciente ajeno se
    abrían con solo poner su id en la URL; editar y borrar sí estaban cerrados."""

    def test_no_abre_su_ficha(self, caso):
        a, b, ids = caso
        r = b.get(f"/api/patients/{ids['patient']}")
        assert r.status_code == 403
        assert r.json()["detail"] == "No autorizado sobre este paciente."
        assert a.get(f"/api/patients/{ids['patient']}").status_code == 200

    def test_no_ve_sus_casos(self, caso):
        a, b, ids = caso
        assert b.get(f"/api/patients/{ids['patient']}/studies").status_code == 403
        assert a.get(f"/api/patients/{ids['patient']}/studies").status_code == 200

    def test_no_ve_sus_sesiones(self, caso):
        a, b, ids = caso
        assert b.get(f"/api/patients/{ids['patient']}/sessions").status_code == 403
        assert a.get(f"/api/patients/{ids['patient']}/sessions").status_code == 200
        assert admin.get(f"/api/patients/{ids['patient']}/sessions").status_code == 200


class TestDataNoEsUnaCarpetaPublica:
    @pytest.mark.parametrize("ruta", [
        "/data/prospective.db", "/data/prospective.db-wal", "/data/audit/chain.db",
        "/data/session_saves/x/state.txt", "/data/sessions/no-es-uuid/state.txt",
    ])
    def test_solo_se_sirven_ficheros_de_una_sesion(self, ruta):
        # Ni al administrador: no hay motivo para descargar la base por HTTP.
        assert admin.get(ruta).status_code == 404

    def test_una_sesion_sin_paciente_se_sirve_a_quien_tiene_su_id(self):
        _uid, c = _medico()
        sid = create_session()
        write_state(sid, "k", "v")
        assert c.get(f"/data/sessions/{sid}/state.txt").status_code == 200

    def test_sin_credenciales_sigue_siendo_401(self):
        assert anonymous_client(app).get("/data/prospective.db").status_code == 401


class TestRutasDeReanudar:
    """Las rutas nuevas de la familia S escriben y leen el trabajo de una sesión
    ligada a un paciente: solo quien ve a ese paciente."""

    _CLIPS = {"clips": [{"key": 1, "clip_id": "c1", "name": "C", "position": [0, 0, 0],
                         "rotation_deg": 0, "azimuthDeg": 0, "elevationDeg": 0}], "plan": None}

    def test_otro_profesional_no_escribe_clips_ni_ventana_ni_lee_la_decision(self, caso):
        _a, b, ids = caso
        sid = ids["sid"]
        assert b.put(f"/api/devices/{sid}/placed-clips", json=self._CLIPS).status_code == 403
        assert b.put(f"/api/volume/{sid}/window", json={"wc": 40, "ww": 400}).status_code == 403
        assert b.get(f"/api/treatment-decision/{sid}").status_code == 403

    def test_el_dueno_si(self, caso):
        a, _b, ids = caso
        sid = ids["sid"]
        assert a.put(f"/api/devices/{sid}/placed-clips", json=self._CLIPS).status_code == 200
        assert a.put(f"/api/volume/{sid}/window", json={"wc": 40, "ww": 400}).status_code == 200
        assert a.post("/api/treatment-decision", json={"session_id": sid}).status_code == 200
        assert a.get(f"/api/treatment-decision/{sid}").status_code == 200


@pytest.fixture(scope="module")
def compartido(caso):
    """El paciente de A compartido con C; D es un tercero sin invitación."""
    from services import clip_orders as store
    a, _b, ids = caso
    c_id, c = _medico()
    _d_id, d = _medico()
    r = a.put(f"/api/patients/{ids['patient']}/shares", json={"user_ids": [c_id]})
    assert r.status_code == 200
    o = store.create_order(
        session_id=ids["sid"], case_id=ids["case"], patient="DeA", case_label="Caso de A",
        patient_id=ids["patient"], requested_by="otra", requested_by_name="otra", institution="",
        series="Navarro", angle_deg=0.0, jaw_mm=5.0, is_drawn_size=True,
        quantity=1, extra_sizes_mm=[], intended_use="research", needed_by="", urgency="normal",
        steriliser="", marking="", notes="", authorization_ref="", workshop=None,
        accepts_measurements=False, accepts_force_is_target=False, accepts_not_approved_device=False,
        spec_snapshot={}, case_snapshot={},
    )
    return c, d, dict(ids, part_no=o.part_no)


class TestPacienteCompartido:
    """F2-75: compartir abre TODO lo del paciente (ficha, casos, estudios,
    sesiones, pedidos) a la cuenta invitada por la misma regla de
    services/access.py, y nada a un tercero."""

    def test_ve_la_ficha_y_los_casos(self, compartido):
        c, d, ids = compartido
        pid = ids["patient"]
        assert c.get(f"/api/patients/{pid}").status_code == 200
        assert c.get(f"/api/patients/{pid}/studies").status_code == 200
        assert pid in [p["id"] for p in c.get("/api/patients").json()]
        assert d.get(f"/api/patients/{pid}").status_code == 403
        assert d.get(f"/api/patients/{pid}/studies").status_code == 403
        assert pid not in [p["id"] for p in d.get("/api/patients").json()]

    def test_ve_los_estudios_de_imagen(self, compartido):
        c, d, ids = compartido
        assert ids["img"] in [s["id"] for s in c.get("/api/studies").json()]
        assert c.get(f"/api/studies/{ids['img']}/thumbnail").status_code != 403
        assert ids["img"] not in [s["id"] for s in d.get("/api/studies").json()]
        assert d.get(f"/api/studies/{ids['img']}/thumbnail").status_code == 403

    def test_ve_las_sesiones(self, compartido):
        c, d, ids = compartido
        pid = ids["patient"]
        assert c.get(f"/api/patients/{pid}/sessions").status_code == 200
        assert ids["sid"] in [s["session_id"] for s in c.get("/api/sessions").json()]
        assert d.get(f"/api/patients/{pid}/sessions").status_code == 403
        assert ids["sid"] not in [s["session_id"] for s in d.get("/api/sessions").json()]

    def test_ve_los_pedidos(self, compartido):
        c, d, ids = compartido
        assert c.get(f"/api/clip-orders/{ids['part_no']}").status_code == 200
        assert ids["part_no"] in [o["part_no"] for o in c.get("/api/clip-orders").json()]
        assert d.get(f"/api/clip-orders/{ids['part_no']}").status_code == 403
        assert ids["part_no"] not in [o["part_no"] for o in d.get("/api/clip-orders").json()]

    def test_ve_la_lista_de_compartidos_pero_no_la_cambia(self, compartido):
        c, d, ids = compartido
        pid = ids["patient"]
        assert c.get(f"/api/patients/{pid}/shares").status_code == 200
        assert d.get(f"/api/patients/{pid}/shares").status_code == 403
        assert c.put(f"/api/patients/{pid}/shares", json={"user_ids": []}).status_code == 403
