"""Un Médico no ve ni toca los pedidos de clips de los pacientes de otro (F1-4, F1-32, F1-258).

El registro de pedidos era común a todos: cualquier cuenta listaba los
pedidos de todos los pacientes (con nombre y caso), los firmaba, los recibía,
los borraba y descargaba sus ficheros. «prefill» y la creación aceptaban
cualquier sesión, así que también devolvían el nombre del paciente ajeno.
"""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_pedidos_acceso_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["CLIP_ORDERS_ROOT"] = f"{_tmp}/clip_orders"

import pytest
from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services import clip_orders as store
from services.auth_service import create_access_token, get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import Patient, PlanningSession, Study, User
from services.sessions import create_session

Base.metadata.create_all(bind=engine)
admin = TestClient(app, raise_server_exceptions=True)


def _medico() -> tuple[int, str, TestClient]:
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico", full_name=nombre)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, nombre, c


def _pedido(*, por: str, patient_id: int | None, session_id: str, case_id: int | None = None) -> str:
    o = store.create_order(
        session_id=session_id, case_id=case_id, patient="Paciente de prueba", case_label="Caso",
        patient_id=patient_id, requested_by=por, requested_by_name=por, institution="",
        series="Navarro", angle_deg=0.0, jaw_mm=5.0, is_drawn_size=True,
        quantity=1, extra_sizes_mm=[], intended_use="research", needed_by="", urgency="normal",
        steriliser="", marking="", notes="", authorization_ref="", workshop=None,
        accepts_measurements=False, accepts_force_is_target=False, accepts_not_approved_device=False,
        spec_snapshot={}, case_snapshot={},
    )
    return o.part_no


@pytest.fixture(scope="module")
def caso():
    """Un paciente de A con su caso, su sesión y un pedido; B no tiene nada suyo."""
    store.clear_store()
    a_id, a_nombre, a = _medico()
    _b_id, _b_nombre, b = _medico()
    db = SessionLocal()
    p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=a_id)
    db.add(p); db.commit()
    c = Study(patient_id=p.id, dx_principal="Caso de A"); db.add(c); db.commit()
    sid = create_session()
    db.add(PlanningSession(session_id=sid, patient_id=p.id, study_id=c.id)); db.commit()
    ids = dict(patient=p.id, case=c.id, sid=sid)
    db.close()
    ids["part_no"] = _pedido(por=a_nombre, patient_id=ids["patient"], session_id=sid, case_id=ids["case"])
    # Un borrador «sin paciente» de A: su número es correlativo, así que no hace de llave.
    ids["suelto"] = _pedido(por=a_nombre, patient_id=None, session_id=create_session())
    return a, b, ids


class TestRegistro:
    def test_b_no_ve_los_pedidos_de_a(self, caso):
        a, b, ids = caso
        de_a = [o["part_no"] for o in a.get("/api/clip-orders").json()]
        assert ids["part_no"] in de_a and ids["suelto"] in de_a
        de_b = [o["part_no"] for o in b.get("/api/clip-orders").json()]
        assert ids["part_no"] not in de_b and ids["suelto"] not in de_b
        assert b.get(f"/api/clip-orders?patient_id={ids['patient']}").json() == []
        todos = [o["part_no"] for o in admin.get("/api/clip-orders").json()]
        assert ids["part_no"] in todos and ids["suelto"] in todos

    def test_el_resumen_solo_cuenta_los_suyos(self, caso):
        a, b, _ids = caso
        assert sum(b.get("/api/clip-orders/summary").json()["counts"].values()) == 0
        assert sum(a.get("/api/clip-orders/summary").json()["counts"].values()) == 2


class TestPedidoAjeno:
    @pytest.mark.parametrize("pedido", ["part_no", "suelto"])
    def test_b_recibe_403_en_cada_ruta(self, caso, pedido):
        _a, b, ids = caso
        pn = ids[pedido]
        assert b.get(f"/api/clip-orders/{pn}").status_code == 403
        assert b.post(f"/api/clip-orders/{pn}/status", json={"status": "firmado"}).status_code == 403
        assert b.post(f"/api/clip-orders/{pn}/reception",
                      json={"measured_jaw_mm": 5.0, "measured_force_g": 100}).status_code == 403
        assert b.post(f"/api/clip-orders/{pn}/verify", json={}).status_code == 403
        assert b.post(f"/api/clip-orders/{pn}/reject", json={"reason": "no sirve"}).status_code == 403
        assert b.get(f"/api/clip-orders/{pn}/files/stl").status_code == 403
        assert b.get(f"/api/clip-orders/{pn}/packet").status_code == 403
        assert b.delete(f"/api/clip-orders/{pn}").status_code == 403
        assert store.get_order(pn) is not None   # el borrado de B no llegó a pasar

    def test_a_sigue_abriendo_los_suyos(self, caso):
        a, _b, ids = caso
        assert a.get(f"/api/clip-orders/{ids['part_no']}").status_code == 200
        assert a.get(f"/api/clip-orders/{ids['suelto']}").status_code == 200
        assert admin.get(f"/api/clip-orders/{ids['part_no']}").status_code == 200

    def test_un_pedido_que_no_existe_sigue_siendo_404(self, caso):
        _a, b, _ids = caso
        assert b.get("/api/clip-orders/NO-EXISTE").status_code == 404


class TestSesionAjena:
    def test_prefill_de_una_sesion_ajena_es_403(self, caso):
        _a, b, ids = caso
        r = b.get(f"/api/clip-orders/prefill/{ids['sid']}")
        assert r.status_code == 403
        assert r.json()["detail"] == "No autorizado sobre este paciente."

    def test_prefill_con_el_caso_de_otro_es_403(self, caso):
        # Una sesión propia «sin paciente» con el case_id ajeno devolvía el nombre
        # del paciente de A en la cabecera del formulario.
        _a, b, ids = caso
        mia = create_session()
        assert b.get(f"/api/clip-orders/prefill/{mia}?case_id={ids['case']}").status_code == 403

    def test_crear_un_pedido_en_una_sesion_ajena_es_403(self, caso):
        _a, b, ids = caso
        r = b.post(f"/api/clip-orders/{ids['sid']}", json={"jaw_mm": 5.0})
        assert r.status_code == 403
