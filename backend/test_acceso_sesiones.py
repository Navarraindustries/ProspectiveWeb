"""Una sesión solo la usa quien puede: el dueño si no tiene paciente, quien ve al
paciente si lo tiene. La comprobación es una sola (services/access.py) y aquí se
recorren TODAS las rutas que nombran una sesión, para que un endpoint nuevo no
pueda quedarse sin ella."""
from __future__ import annotations

import re
import uuid

import pytest
from fastapi.routing import APIRoute

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import SessionLocal
from services.db_models import Patient, PatientShare, PlanningSession, User
from services.sessions import (
    create_session, session_owner, session_subdir, snapshot_session, write_state,
)


def _cuenta(rol: str = "medico"):
    nombre = f"u-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role=rol, full_name=nombre)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, c


def _rutas_con_sesion():
    """(método, ruta) de cada endpoint privado que nombra una sesión en la ruta
    o en el cuerpo."""
    out = []
    for r in app.routes:
        if not isinstance(r, APIRoute) or r.path.startswith("/api/auth"):
            continue
        en_ruta = "{session_id}" in r.path or "{previous_session_id}" in r.path
        cuerpo = getattr(r.body_field, "field_info", None)
        cuerpo = getattr(cuerpo, "annotation", None) if cuerpo is not None else None
        campos = getattr(cuerpo, "model_fields", {}) or {}
        en_cuerpo = "session_id" in campos or "previous_session_id" in campos
        if en_ruta or en_cuerpo:
            for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
                out.append((m, r.path, en_ruta))
    return out


_RUTAS = _rutas_con_sesion()


def test_hay_rutas_que_recorrer():
    # Si esto baja mucho, el recorrido de abajo dejó de encontrar las rutas.
    assert len(_RUTAS) > 70


@pytest.fixture(scope="module")
def ajena():
    """Una sesión sin paciente de A, y la cuenta B que no debe tocarla."""
    a_id, _ = _cuenta()
    _, b = _cuenta()
    sid = create_session(owner_id=a_id)
    return sid, b


@pytest.mark.parametrize("metodo,ruta,en_ruta", _RUTAS, ids=[f"{m} {p}" for m, p, _ in _RUTAS])
def test_ninguna_ruta_deja_usar_la_sesion_de_otro(ajena, metodo, ruta, en_ruta):
    sid, b = ajena
    url = ruta.replace("{session_id}", sid).replace("{previous_session_id}", sid)
    url = re.sub(r"\{[^}]+\}", "1", url)                 # el resto de parámetros, cualquiera
    cuerpo = {"session_id": sid}
    r = b.request(metodo, url, json=cuerpo if metodo in {"POST", "PUT", "PATCH", "DELETE"} else None)
    assert r.status_code == 403, f"{metodo} {ruta} → {r.status_code} {r.text[:200]}"


class TestRegla:
    def test_la_sesion_nueva_es_de_quien_sube(self):
        uid, c = _cuenta()
        r = c.post("/api/upload", files=[("files", ("IM0001.dcm", b"x" * 200, "application/dicom"))])
        assert r.status_code == 200, r.text
        assert session_owner(r.json()["session_id"]) == uid

    def test_el_dueno_si_puede_y_otro_no(self):
        a_id, a = _cuenta(); _, b = _cuenta()
        sid = create_session(owner_id=a_id)
        assert a.get(f"/api/treatment-decision/{sid}").status_code != 403
        assert b.get(f"/api/treatment-decision/{sid}").status_code == 403

    def test_el_administrador_puede(self):
        a_id, _ = _cuenta(); _, adm = _cuenta("admin")
        sid = create_session(owner_id=a_id)
        assert adm.get(f"/api/treatment-decision/{sid}").status_code != 403

    def test_una_sesion_antigua_sin_dueno_queda_para_el_primero(self):
        a_id, a = _cuenta(); _, b = _cuenta()
        sid = create_session()                            # como las de antes del cambio
        assert a.get(f"/api/treatment-decision/{sid}").status_code != 403
        assert session_owner(sid) == a_id
        assert b.get(f"/api/treatment-decision/{sid}").status_code == 403

    def test_con_paciente_manda_el_paciente(self):
        """Ligada a un paciente compartido con B, B entra aunque no la abrió."""
        a_id, _ = _cuenta(); b_id, b = _cuenta(); _, c = _cuenta()
        db = SessionLocal()
        p = Patient(surname="Prueba", given_name="Acceso", created_by=a_id)
        db.add(p); db.commit()
        db.add(PatientShare(patient_id=p.id, user_id=b_id))
        sid = create_session(owner_id=a_id)
        db.add(PlanningSession(session_id=sid, patient_id=p.id, label="x"))
        db.commit(); db.close()
        assert b.get(f"/api/treatment-decision/{sid}").status_code != 403
        assert c.get(f"/api/treatment-decision/{sid}").status_code == 403

    def test_la_guardada_sin_paciente_tambien_tiene_dueno(self):
        a_id, a = _cuenta(); _, b = _cuenta()
        sid = create_session(owner_id=a_id)
        write_state(sid, "dicom.series_id", "s")
        snapshot_session(sid)
        db = SessionLocal()
        db.add(PlanningSession(session_id=sid, patient_id=None, label="sin paciente"))
        db.commit(); db.close()
        assert b.post(f"/api/sessions/{sid}/restore").status_code == 403


class TestCasoAjeno:
    """El número de un caso clínico es correlativo: nombrar el de otro no puede
    devolver el nombre de su paciente."""

    def _caso_de(self, uid: int) -> int:
        from services.db_models import Study
        db = SessionLocal()
        p = Patient(surname="Reservado", given_name="Nombre", created_by=uid)
        db.add(p); db.commit()
        s = Study(patient_id=p.id, dx_principal="Aneurisma ajeno")
        db.add(s); db.commit(); cid = s.id; db.close()
        return cid

    def test_la_ficha_de_fabricacion_no_acepta_un_caso_ajeno(self):
        a_id, _ = _cuenta(); b_id, b = _cuenta()
        cid = self._caso_de(a_id)
        sid = create_session(owner_id=b_id)                # su propia sesión
        r = b.post(f"/api/clips/manufacture/{sid}?case_id={cid}")
        assert r.status_code == 403
        assert "Reservado" not in r.text

    def test_tampoco_en_el_cuerpo(self):
        a_id, _ = _cuenta(); b_id, b = _cuenta()
        cid = self._caso_de(a_id)
        sid = create_session(owner_id=b_id)
        r = b.post(f"/api/sessions/{sid}/attach", json={"case_id": cid, "patient_id": 1})
        assert r.status_code == 403

    def test_su_propio_caso_si(self):
        b_id, b = _cuenta()
        cid = self._caso_de(b_id)
        sid = create_session(owner_id=b_id)
        r = b.post(f"/api/clips/manufacture/{sid}?case_id={cid}")
        assert r.status_code != 403


class TestGuardar:
    """«Guardar progreso» no escribe en el caso ni en el estudio de otro paciente,
    ni pasa la sesión a otro paciente sin «Cambiar de paciente o caso»."""

    def _paciente_con_caso(self, uid: int):
        from services.db_models import ImagingStudy, Study
        db = SessionLocal()
        p = Patient(surname="P", given_name=uuid.uuid4().hex[:6], created_by=uid)
        db.add(p); db.commit()
        s = Study(patient_id=p.id, dx_principal="caso")
        db.add(s); db.commit()
        img = ImagingStudy(patient_id=p.id, case_id=s.id)
        db.add(img); db.commit()
        out = (p.id, s.id, img.id); db.close()
        return out

    def _guardar(self, c, sid, **campos):
        return c.post("/api/sessions/save", json={"session_id": sid, "label": "x", "current_step": 1, **campos})

    def test_con_su_paciente_y_su_caso_guarda(self):
        b_id, b = _cuenta()
        pid, cid, img = self._paciente_con_caso(b_id)
        sid = create_session(owner_id=b_id)
        r = self._guardar(b, sid, patient_id=pid, study_id=cid, imaging_study_id=img)
        assert r.status_code == 200, r.text

    def test_el_caso_de_otro_paciente_no(self):
        a_id, _ = _cuenta(); b_id, b = _cuenta()
        _, cid_ajeno, img_ajeno = self._paciente_con_caso(a_id)
        pid, _, _ = self._paciente_con_caso(b_id)
        sid = create_session(owner_id=b_id)
        assert self._guardar(b, sid, patient_id=pid, study_id=cid_ajeno).status_code == 403
        assert self._guardar(b, sid, patient_id=pid, imaging_study_id=img_ajeno).status_code == 403

    def test_su_otro_paciente_tampoco_se_mezcla(self):
        b_id, b = _cuenta()
        pid1, _, _ = self._paciente_con_caso(b_id)
        _, cid2, _ = self._paciente_con_caso(b_id)
        sid = create_session(owner_id=b_id)
        assert self._guardar(b, sid, patient_id=pid1, study_id=cid2).status_code == 409

    def test_guardar_no_pasa_la_sesion_a_otro_paciente(self):
        b_id, b = _cuenta()
        pid1, _, _ = self._paciente_con_caso(b_id)
        pid2, _, _ = self._paciente_con_caso(b_id)
        sid = create_session(owner_id=b_id)
        assert self._guardar(b, sid, patient_id=pid1).status_code == 200
        r = self._guardar(b, sid, patient_id=pid2)
        assert r.status_code == 409
        assert "Cambiar de paciente o caso" in r.json()["detail"]


class TestCapturasDelInforme:
    def _captura(self, uid: int):
        from services.db_models import CaseCapture, ImagingStudy, Study
        db = SessionLocal()
        p = Patient(surname="Foto", given_name=uuid.uuid4().hex[:6], created_by=uid)
        db.add(p); db.commit()
        caso = Study(patient_id=p.id, dx_principal="caso")
        db.add(caso); db.commit()
        img = ImagingStudy(patient_id=p.id, case_id=caso.id)
        db.add(img); db.commit()
        cap = CaseCapture(imaging_study_id=img.id, patient_id=p.id, storage_key="no/existe.png")
        db.add(cap); db.commit()
        out = (p.id, cap.id); db.close()
        return out

    def _sesion_de(self, uid: int, pid: int) -> str:
        sid = create_session(owner_id=uid)
        db = SessionLocal()
        db.add(PlanningSession(session_id=sid, patient_id=pid, label="x")); db.commit(); db.close()
        return sid

    def test_no_incrusta_la_captura_de_otro_paciente(self):
        a_id, _ = _cuenta(); b_id, b = _cuenta()
        _, cap_ajena = self._captura(a_id)
        pid, _ = self._captura(b_id)
        sid = self._sesion_de(b_id, pid)
        r = b.post("/api/report", json={"session_id": sid, "capture_ids": [cap_ajena]})
        assert r.status_code == 403
        assert str(cap_ajena) in r.json()["detail"]

    def test_las_suyas_pasan_el_filtro(self):
        b_id, b = _cuenta()
        pid, cap = self._captura(b_id)
        sid = self._sesion_de(b_id, pid)
        r = b.post("/api/report", json={"session_id": sid, "capture_ids": [cap]})
        assert r.status_code != 403


class TestFicherosDeSesion:
    def test_otro_no_baja_sus_ficheros(self):
        a_id, a = _cuenta(); _, b = _cuenta()
        sid = create_session(owner_id=a_id)
        (session_subdir(sid, "meshes") / "m.vtp").write_text("x")
        assert a.get(f"/data/sessions/{sid}/meshes/m.vtp").status_code == 200
        assert b.get(f"/data/sessions/{sid}/meshes/m.vtp").status_code == 403

    def test_la_carpeta_dicom_no_se_sirve(self):
        a_id, a = _cuenta()
        sid = create_session(owner_id=a_id)
        (session_subdir(sid, "dicom") / "pagina.dcm").write_text("<html></html>")
        assert a.get(f"/data/sessions/{sid}/dicom/pagina.dcm").status_code == 404

    def test_lo_servido_no_se_interpreta_como_pagina(self):
        a_id, a = _cuenta()
        sid = create_session(owner_id=a_id)
        (session_subdir(sid, "reports") / "x.html").write_text("<html></html>")
        r = a.get(f"/data/sessions/{sid}/reports/x.html")
        assert r.headers.get("x-content-type-options") == "nosniff"
        assert r.headers.get("content-disposition") == "attachment"

    def test_la_barra_invertida_no_cuela(self):
        a_id, a = _cuenta()
        sid = create_session(owner_id=a_id)
        assert a.get(f"/data/sessions/{sid}/meshes%5C..%5C..%5Cx").status_code == 404


class TestSubida:
    def test_solo_guarda_lo_que_parece_dicom(self):
        _, c = _cuenta()
        r = c.post("/api/upload", files=[
            ("files", ("IM0001", b"x" * 200, "application/octet-stream")),
            ("files", ("1.2.840.10008.5.1", b"x" * 200, "application/octet-stream")),
            ("files", ("visor.html", b"<script></script>", "text/html")),
            ("files", ("autorun.inf", b"x", "text/plain")),
        ])
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        nombres = sorted(p.name for p in session_subdir(sid, "dicom").iterdir())
        assert nombres == ["1.2.840.10008.5.1", "IM0001"]

    def test_sin_ningun_dicom_lo_dice(self):
        _, c = _cuenta()
        r = c.post("/api/upload", files=[("files", ("visor.html", b"<p>", "text/html"))])
        assert r.status_code == 422
        assert "DICOM" in r.json()["detail"]
