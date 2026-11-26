"""FE-9: recargar la página no pierde la sesión en curso. El navegador pide
reabrirla y el servidor devuelve lo mismo que «Reanudar», sin copiar nada."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.auth_service import create_access_token, get_password_hash
from services.database import SessionLocal
from services.db_models import User
from services.sessions import create_session, session_subdir, write_state

client = TestClient(app)


def _sesion_con_malla() -> str:
    from services.devices import make_clip
    from services.segmentation import write_vtp
    sid = create_session(owner_id=_id_admin())
    write_vtp(make_clip(9.0), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    write_state(sid, "seg.n_vertices", "120")
    write_state(sid, "dicom.modality", "XA")
    write_state(sid, "morpho.max_diameter_mm", "6.5")
    return sid


def _id_admin() -> int:
    return client.get("/api/auth/me").json()["id"]


def _otro_medico() -> TestClient:
    nombre = f"otro-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    db.add(User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico",
                full_name=nombre, is_active=True, status="active"))
    db.commit(); db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return c


def test_reabre_la_misma_sesion_en_el_paso_en_que_estaba():
    sid = _sesion_con_malla()
    r = client.post(f"/api/sessions/{sid}/reopen?step=3")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["session_id"] == sid                 # la misma, no una copia
    assert d["current_step"] == 3
    assert d["has_segmentation"] and d["mesh_url"].startswith(f"/data/sessions/{sid}/meshes/vessel_tree.vtp")
    assert d["has_morphometry"] is True
    assert d["modality"] == "XA" and d["n_vertices"] == 120


def test_el_paso_se_acota():
    sid = _sesion_con_malla()
    assert client.post(f"/api/sessions/{sid}/reopen?step=99").json()["current_step"] == 7
    assert client.post(f"/api/sessions/{sid}/reopen?step=-4").json()["current_step"] == 0


def test_una_sesion_purgada_contesta_404_con_que_hacer():
    r = client.post(f"/api/sessions/{uuid.uuid4()}/reopen?step=2")
    assert r.status_code == 404
    assert "reanúdala desde la ficha" in r.json()["detail"]


def test_la_sesion_de_otro_no_se_reabre():
    sid = _sesion_con_malla()
    r = _otro_medico().post(f"/api/sessions/{sid}/reopen?step=2")
    assert r.status_code in (403, 404)
