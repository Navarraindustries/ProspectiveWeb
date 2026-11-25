"""Integridad de los datos: estudios migrados abiertos y archivados por su
prefijo, pedidos que siguen a la sesión movida, y rastro de lo que no lo dejaba."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from main import app
from services.database import SessionLocal
from services.db_models import ImagingStudy, Patient, Study
from services.storage import get_storage

client = TestClient(app)


def _estudio_migrado(prefijo: str) -> int:
    """Un estudio como los que deja la migración: vive en la carpeta de su caso
    antiguo, no en la de su número nuevo."""
    db = SessionLocal()
    try:
        p = Patient(surname="Migrado", hospital_id=f"HC-{uuid.uuid4().hex[:8]}", created_by=1)
        db.add(p); db.commit()
        c = Study(patient_id=p.id); db.add(c); db.commit()
        img = ImagingStudy(case_id=c.id, patient_id=p.id, modality="CT", storage_prefix=prefijo, n_files=1)
        db.add(img); db.commit()
        return img.id
    finally:
        db.close()


class TestEstudiosMigrados:
    def test_se_abre_por_el_prefijo_guardado(self):
        prefijo = f"studies/legado-{uuid.uuid4().hex[:6]}"
        get_storage().put_bytes(f"{prefijo}/dicom/a.dcm", b"DICM-falso")
        img_id = _estudio_migrado(prefijo)
        r = client.post(f"/api/studies/{img_id}/open")
        # El fichero no es un DICOM de verdad: lo que importa es que se
        # encontró (antes: 409 «no tiene DICOM archivado», o el de otro).
        assert r.status_code != 409, r.text

    def test_archivar_no_vacia_la_carpeta_de_un_migrado(self):
        from services.study_archive import archive_session_dicom
        from services.sessions import create_session, session_subdir
        st = get_storage()
        ajeno = f"studies/{uuid.uuid4().hex[:6]}"
        st.put_bytes(f"{ajeno}/dicom/ajeno.dcm", b"del otro paciente")
        sid = create_session()
        (session_subdir(sid, "dicom") / "mio.dcm").write_bytes(b"mio")
        info = archive_session_dicom(sid, 1, prefix="imaging/prueba-dat2")
        assert info["storage_prefix"] == "imaging/prueba-dat2"
        assert st.exists("imaging/prueba-dat2/dicom/mio.dcm")
        assert st.exists(f"{ajeno}/dicom/ajeno.dcm")


class TestPedidosQueSiguenAlPaciente:
    def _pedidos(self, *filas):
        from services import clip_orders as co
        with co._LOCK:
            previos = co._read(co._ORDERS_FILE)
            co._write(co._ORDERS_FILE, previos + [dict(part_no=f"T-{uuid.uuid4().hex[:6]}", **f) for f in filas])

    def _por_sesion(self, sid):
        from services import clip_orders as co
        return [e for e in co._read(co._ORDERS_FILE) if e.get("session_id") == sid]

    def test_mover_la_sesion_mueve_sus_pedidos(self):
        from services.clip_orders import mover_pedidos
        sid = f"s-{uuid.uuid4().hex[:8]}"
        self._pedidos({"session_id": sid, "patient_id": 1, "patient": "Antes", "case_id": 1})
        assert mover_pedidos([sid], 77, "Después", 88, "Caso nuevo") == 1
        e = self._por_sesion(sid)[0]
        assert (e["patient_id"], e["patient"], e["case_id"]) == (77, "Después", 88)

    def test_borrar_el_paciente_suelta_sus_pedidos(self):
        from services.clip_orders import soltar_pedidos
        sid = f"s-{uuid.uuid4().hex[:8]}"
        self._pedidos({"session_id": sid, "patient_id": 424242, "patient": "Borrado", "case_id": 515151})
        assert soltar_pedidos(patient_id=424242, case_ids=[515151]) == 1
        e = self._por_sesion(sid)[0]
        assert e["patient_id"] is None and e["case_id"] is None and e["patient"] == "Borrado"


class TestRastroEnLaAuditoria:
    def _acciones(self, pid):
        return [b["action"] for b in client.get(f"/api/audit/blocks?patient_id={pid}").json()]

    def test_crear_y_editar_un_paciente_dejan_bloque_y_su_historia_no_se_pierde(self):
        hc = f"HC-{uuid.uuid4().hex[:8]}"
        r = client.post("/api/patients", json={"surname": "Rastro", "hospital_id": hc, "dob": "1970-01-01"})
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        assert "PATIENT_CREATED" in self._acciones(pid)
        datos = client.get(f"/api/patients/{pid}").json()
        datos["hospital_id"] = hc + "-NUEVA"          # cambia el hash del paciente
        r = client.put(f"/api/patients/{pid}", json={k: datos[k] for k in datos if k in _CAMPOS_PACIENTE})
        assert r.status_code == 200, r.text
        acciones = self._acciones(pid)
        # El bloque de creación (con la HC vieja) sigue en su ficha.
        assert "PATIENT_CREATED" in acciones and "PATIENT_EDITED" in acciones

    def test_crear_un_caso_deja_bloque(self):
        r = client.post("/api/patients", json={"surname": "Caso", "hospital_id": f"HC-{uuid.uuid4().hex[:8]}"})
        pid = r.json()["id"]
        r = client.post(f"/api/patients/{pid}/studies", json={"dx_principal": "Aneurisma"})
        assert r.status_code in (200, 201), r.text
        assert "CASE_CREATED" in self._acciones(pid)


_CAMPOS_PACIENTE = {"surname", "given_name", "hospital_id", "dob", "sex", "institution", "ocupacion",
                    "antecedentes_patologicos", "antecedentes_toxicologicos", "antecedentes_quirurgicos",
                    "antecedentes_alergicos", "antecedentes_farmacologicos", "notes"}
