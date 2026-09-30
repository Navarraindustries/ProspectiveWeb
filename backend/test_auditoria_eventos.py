"""Lo irreversible y lo que pasa al caso deja rastro en la cadena (SkullChain).

Antes solo quedaban el inicio de sesión, las contraseñas, los informes y los
pedidos de clips. Borrar un paciente, un caso o una captura, guardar una
captura o una grabación, y la recomendación de tratamiento no dejaban nada.

Se defiende también:
- que quien firma es el usuario que ha iniciado sesión y no el texto libre del
  formulario del informe, con el que cualquiera podía firmar como otro;
- que en la cadena no entra el nombre del paciente: va su hash.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_auditoria_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

from fastapi.testclient import TestClient

from main import app
from services.audit import SkullChain
from services.database import Base, engine
from services.sessions import create_session, write_state
from test_captures import _estudio, _guardar
from test_grabaciones import _subir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # autenticado como admin (conftest)


def _ultimo(accion: str) -> dict:
    bloques = [b for b in SkullChain.instance().get_all_blocks() if b["action"] == accion]
    assert bloques, f"no hay ningún {accion} en la cadena"
    b = bloques[-1]
    b["payload"] = json.loads(b["payload_json"])
    return b


def test_borrar_un_paciente_queda_registrado_sin_su_nombre():
    pid, _caso, _img = _estudio("Borrable")
    assert client.delete(f"/api/patients/{pid}").status_code == 204
    b = _ultimo("PATIENT_DELETED")
    assert b["username"] == "admin"
    assert b["payload"]["patient"] == pid and b["payload"]["cases"] == 1
    assert b["patient_hash"], "el paciente va identificado por su hash"
    assert "Borrable" not in b["payload_json"]


def test_borrar_un_caso_queda_registrado():
    pid, caso, _img = _estudio("CasoBorrable")
    assert client.delete(f"/api/patients/{pid}/studies/{caso}").status_code == 204
    b = _ultimo("CASE_DELETED")
    assert b["payload"] == {"patient": pid, "case": caso} and b["patient_hash"]


def test_guardar_y_borrar_capturas_y_grabaciones():
    _pid, _caso, img = _estudio("CapturasAudit")
    cap = _guardar(img, label="Rótulo con el nombre de alguien")
    b = _ultimo("CAPTURE_SAVED")
    assert b["payload"]["capture"] == cap["id"] and b["payload"]["media_type"] == "image/png"
    assert "Rótulo" not in b["payload_json"], "lo que escribe el profesional no va a la cadena"

    vid = _subir(img).json()
    b = _ultimo("RECORDING_SAVED")
    assert b["payload"]["capture"] == vid["id"] and b["payload"]["duration_s"] == 12.4

    assert client.delete(f"/api/captures/{vid['id']}").status_code == 204
    b = _ultimo("CAPTURE_DELETED")
    assert b["payload"]["capture"] == vid["id"] and b["payload"]["media_type"] == "video/mp4"
    assert b["patient_hash"]


def test_la_recomendacion_de_tratamiento_queda_registrada():
    sid = create_session()
    for k, v in {"morpho.max_diameter_mm": "7.5", "morpho.neck_mm": "3.2", "morpho.ar": "1.8"}.items():
        write_state(sid, k, v)
    r = client.post("/api/treatment-decision", json={"session_id": sid})
    assert r.status_code == 200, r.text
    b = _ultimo("TREATMENT_DECISION")
    assert b["username"] == "admin"
    assert b["payload"]["session_id"] == sid
    assert b["payload"]["recommendation"] == r.json()["recommendation_key"]


def test_el_informe_lo_firma_quien_ha_iniciado_sesion_no_el_formulario():
    sid = create_session()
    write_state(sid, "dicom.modality", "CT")
    r = client.post("/api/report", json={"session_id": sid, "surgeon_name": "Otro Cirujano"})
    assert r.status_code == 200, r.text
    assert _ultimo("REPORT_GENERATED")["username"] == "admin"
