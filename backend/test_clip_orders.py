"""Requesting a clip: what the form refuses, what it freezes, and what leaves.

The interesting failures here are not crashes. They are an order that looks
fine and is wrong: a piece nobody signed for, dimensions that changed after the
order went out, a workshop packet with a patient's name in it, or a piece
accepted without anyone measuring the force it closes with.

1. **Nobody orders an implant by accident.** Signing needs a responsible
   surgeon, the right role, a workshop and the three declarations.
2. **A signed order is frozen.** Re-running morphometry afterwards must not
   change what was ordered.
3. **The packet carries no patient data.** Checked with a real PDF text
   extractor and a positive control.
4. **The force is not a fact until somebody measures it**, and a piece outside
   the band cannot be accepted in silence.
"""
from __future__ import annotations

import os
import tempfile
import zipfile

_tmp = tempfile.mkdtemp(prefix="prospective_orders_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["CLIP_ORDERS_ROOT"] = f"{_tmp}/clip_orders"

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app
from services import clip_orders as store
from services import navarro
from services.auth_service import get_password_hash
from services.database import Base, SessionLocal, engine
from services.db_models import User
from services.sessions import create_session, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

_HAS_NAVARRO = bool(navarro.list_variants(root=navarro.DEFAULT_ROOT))
pytestmark = pytest.mark.skipif(not _HAS_NAVARRO, reason="biblioteca NAVARRO no instalada")


# ── Fixtures ───────────────────────────────────────────────────────────────── #

@pytest.fixture(autouse=True)
def _clean_store():
    store.clear_store()
    before = os.environ.get("NAVARRO_ROOT")
    os.environ["NAVARRO_ROOT"] = str(navarro.DEFAULT_ROOT)
    navarro.clear_cache()
    yield
    navarro.clear_cache()
    if before is None:
        os.environ.pop("NAVARRO_ROOT", None)
    else:
        os.environ["NAVARRO_ROOT"] = before
    store.clear_store()


def _user(username: str, role: str) -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            return
        db.add(User(username=username, hashed_password=get_password_hash("Secreta123"),
                    full_name=username.title(), role=role, hospital="Hospital de prueba",
                    is_active=True, status=User.STATUS_ACTIVE))
        db.commit()
    finally:
        db.close()


def _headers(username: str, role: str) -> dict:
    _user(username, role)
    r = client.post("/api/auth/login", json={"username": username, "password": "Secreta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def medico() -> dict:
    return _headers("cirujano", "medico")


@pytest.fixture
def residente() -> dict:
    return _headers("residente", "residente")


def _session(neck: float = 6.0, source: str = "rim") -> str:
    sid = create_session()
    write_state(sid, "morpho.neck_mm", str(neck))
    write_state(sid, "morpho.ar", "1.5")
    write_state(sid, "morpho.dome_height_mm", str(neck * 1.5))
    write_state(sid, "morpho.max_diameter_mm", str(neck * 1.8))
    write_state(sid, "morpho.parent_artery_mm", "3.2")
    write_state(sid, "morpho.neck_source", source)
    return sid


def _form(**over) -> dict:
    body = {
        "jaw_mm": 0.0,           # filled by the caller from the prefill
        "quantity": 1,
        "intended_use": "implante",
        "urgency": "programada",
        "steriliser": "hospital",
        "marking": "cuerpo",
        "surgeon": "Dra. Navarro",
        "sign": True,
        "accepts_measurements": True,
        "accepts_force_is_target": True,
        "accepts_not_approved_device": True,
    }
    body.update(over)
    return body


def _workshop(headers: dict, name: str = "Taller Mecánico Sur") -> str:
    """The workshop, registering it the first time and reusing it after."""
    r = client.post("/api/clip-orders/workshops", headers=headers,
                    json={"name": name, "contact_name": "J. Pérez",
                          "email": "taller@example.com", "phone": "600000000"})
    if r.status_code == 409:
        rows = client.get("/api/clip-orders/workshops", headers=headers).json()
        return next(w["id"] for w in rows if w["name"] == name)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _place(headers: dict, sid: str | None = None, **over):
    """A signed order on a fresh session, using whatever the system advises."""
    sid = sid or _session()
    pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=headers).json()
    body = _form(jaw_mm=pre["advised_jaw_mm"], angle_deg=pre["advised_angle_deg"],
                 series=pre["advised_series"],
                 workshop_id=over.pop("workshop_id", None) or _workshop(headers))
    body.update(over)
    return sid, pre, client.post(f"/api/clip-orders/{sid}", headers=headers, json=body)


# ── 1. The form knows the case ─────────────────────────────────────────────── #

class TestThePrefill:
    def test_it_answers_the_geometry_so_nobody_retypes_it(self, medico):
        pre = client.get(f"/api/clip-orders/prefill/{_session()}", headers=medico).json()
        assert pre["can_order"] is True
        assert pre["advised_jaw_mm"] > 0 and pre["advised_series"]
        assert pre["neck_mm"] == pytest.approx(6.0)
        assert pre["stock_sizes_mm"] == list(navarro.STOCK_JAW_MM)
        assert pre["force_band_g"] == [navarro.CLOSING_FORCE_MIN_G, navarro.CLOSING_FORCE_MAX_G]
        assert pre["max_tip_opening_mm"] == 10.0

    def test_an_estimated_neck_asks_for_the_adjacent_sizes(self, medico):
        # The jaw is only as certain as the neck it came from.
        est = client.get(f"/api/clip-orders/prefill/{_session(source='auto')}",
                         headers=medico).json()
        rim = client.get(f"/api/clip-orders/prefill/{_session(source='rim')}",
                         headers=medico).json()
        assert est["suggest_extra_sizes"] is True
        assert rim["suggest_extra_sizes"] is False
        assert len(est["suggested_extra_sizes_mm"]) == 2

    def test_a_resident_is_told_they_cannot_sign(self, residente):
        pre = client.get(f"/api/clip-orders/prefill/{_session()}", headers=residente).json()
        assert pre["can_sign"] is False

    def test_an_unknown_session_is_a_404(self, medico):
        assert client.get("/api/clip-orders/prefill/no-existe", headers=medico).status_code == 404


# ── 2. Signing ─────────────────────────────────────────────────────────────── #

class TestSigning:
    def test_a_signed_order_gets_a_correlative_number(self, medico):
        _sid, _pre, r = _place(medico)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["part_no"].startswith("PR-")
        assert body["status"] == "firmado"
        assert body["surgeon"] == "Dra. Navarro"

    def test_two_orders_never_share_a_number(self, medico):
        # The old scheme derived it from session + jaw, so two clips from one
        # session with different bends collided — on the only thread back.
        sid = _session()
        ws = _workshop(medico)
        a = _place(medico, sid, workshop_id=ws)[2].json()
        b = _place(medico, sid, workshop_id=ws, angle_deg=45.0,
                   override_reason="Se prefiere angulado por el corredor")[2].json()
        assert a["part_no"] != b["part_no"]

    def test_a_resident_cannot_sign(self, residente):
        _sid, _pre, r = _place(residente)
        assert r.status_code == 422
        assert any("médico responsable" in d for d in r.json()["detail"])

    def test_a_resident_can_leave_a_draft(self, residente):
        _sid, _pre, r = _place(residente, sign=False, surgeon="")
        assert r.status_code == 201
        assert r.json()["status"] == "borrador"

    def test_signing_without_the_declarations_is_refused(self, medico):
        _sid, _pre, r = _place(medico, accepts_force_is_target=False)
        assert r.status_code == 422
        assert any("declaraciones" in d for d in r.json()["detail"])

    def test_signing_without_a_surgeon_is_refused(self, medico):
        _sid, _pre, r = _place(medico, surgeon="   ")
        assert r.status_code == 422

    def test_signing_without_a_workshop_is_refused(self, medico):
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=medico).json()
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=pre["advised_jaw_mm"]))
        assert r.status_code == 422

    def test_every_problem_comes_back_at_once(self, medico):
        # One at a time would mean five submissions to find out five things.
        sid = _session()
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=1.0, surgeon="", quantity=1,
                                   intended_use="qué-sé-yo",
                                   accepts_measurements=False,
                                   workshop_id=_workshop(medico)))
        assert r.status_code == 422
        assert len(r.json()["detail"]) >= 3


# ── 3. Ordering something other than what was advised ─────────────────────── #

class TestOverrides:
    def test_a_different_piece_needs_a_reason(self, medico):
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=medico).json()
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=pre["advised_jaw_mm"] + 3.0,
                                   workshop_id=_workshop(medico)))
        assert r.status_code == 422
        assert any("por qué" in d for d in r.json()["detail"])

    def test_with_a_reason_it_goes_through_and_the_reason_is_kept(self, medico):
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=medico).json()
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=pre["advised_jaw_mm"] + 3.0,
                                   override_reason="El cuello se ve mayor en el 3D",
                                   workshop_id=_workshop(medico)))
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["jaw_mm"] == pytest.approx(pre["advised_jaw_mm"] + 3.0)
        assert body["override_reason"]
        assert body["advised_label"], "hay que conservar qué recomendaba el sistema"

    def test_the_ordered_piece_is_the_one_that_was_asked_for(self, medico):
        # Not the advised geometry under an overridden label.
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=medico).json()
        want = pre["advised_jaw_mm"] + 3.0
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=want, override_reason="decisión del cirujano",
                                   workshop_id=_workshop(medico)))
        assert r.json()["spec_snapshot"]["blade_length_mm"] == pytest.approx(want)

    def test_a_jaw_far_outside_the_family_is_refused(self, medico):
        sid = _session()
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=35.0, override_reason="x",
                                   workshop_id=_workshop(medico)))
        assert r.status_code == 422
        assert any("demasiado lejos" in d for d in r.json()["detail"])


# ── 4. The order is frozen ─────────────────────────────────────────────────── #

class TestTheOrderIsFrozen:
    def test_remeasuring_the_case_does_not_change_what_was_ordered(self, medico):
        sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        ordered = r.json()["spec_snapshot"]["blade_length_mm"]

        # The surgeon re-marks the neck and it comes out much wider.
        write_state(sid, "morpho.neck_mm", "11.5")
        again = client.get(f"/api/clip-orders/{part_no}", headers=medico).json()
        assert again["spec_snapshot"]["blade_length_mm"] == pytest.approx(ordered)
        assert again["jaw_mm"] == pytest.approx(r.json()["jaw_mm"])

    def test_the_measurements_it_came_from_are_kept(self, medico):
        _sid, _pre, r = _place(medico)
        order = store.get_order(r.json()["part_no"])
        assert order.case_snapshot["neck_mm"] == pytest.approx(6.0)
        assert order.case_snapshot["neck_source"] == "rim"


# ── 5. What leaves the building ────────────────────────────────────────────── #

def _pdf_text(path) -> str:
    import pymupdf

    return "\n".join(p.get_text() for p in pymupdf.open(str(path)))


class TestThePaperwork:
    def test_signing_produces_the_stl_and_both_dossiers(self, medico):
        _sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        for what in ("stl", "dossier_internal", "dossier_workshop"):
            got = client.get(f"/api/clip-orders/{part_no}/files/{what}", headers=medico)
            assert got.status_code == 200, what
            assert len(got.content) > 1000

    def test_each_order_owns_its_files(self, medico):
        # Fixed per-session names meant a second order overwrote the first's.
        sid = _session()
        ws = _workshop(medico)
        a = _place(medico, sid, workshop_id=ws)[2].json()["part_no"]
        b = _place(medico, sid, workshop_id=ws, angle_deg=45.0,
                   override_reason="corredor estrecho")[2].json()["part_no"]
        assert store.order_dir(a) != store.order_dir(b)
        assert (Path(store.order_dir(a)) / "clip.stl").exists()
        assert (Path(store.order_dir(b)) / "clip.stl").exists()

    def test_the_dossiers_carry_the_order_block(self, medico):
        _sid, _pre, r = _place(medico, needed_by="2026-10-15", quantity=2)
        part_no = r.json()["part_no"]
        for name in ("dossier_interno.pdf", "dossier_taller.pdf"):
            text = _pdf_text(Path(store.order_dir(part_no)) / name)
            assert part_no in text
            assert "2026-10-15" in text
            assert "Esteriliza" in text or "esteril" in text.lower()

    def test_the_internal_copy_records_who_answers_for_it(self, medico):
        _sid, _pre, r = _place(medico)
        text = _pdf_text(Path(store.order_dir(r.json()["part_no"])) / "dossier_interno.pdf")
        for term in ("Dra. Navarro", "Implante en paciente", "Cirujano responsable"):
            assert term in text, term

    def test_the_workshop_copy_carries_no_patient_data(self, medico):
        _sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        text = _pdf_text(Path(store.order_dir(part_no)) / "dossier_taller.pdf")
        # Positive control: the extractor CAN read this document.
        assert part_no in text and "Titanio" in text
        for leak in ("Cirujano responsable", "Uso previsto", "Paciente", _sid):
            assert leak not in text, f"fuga al taller: {leak}"

    def test_the_packet_holds_only_what_the_workshop_needs(self, medico):
        _sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        got = client.get(f"/api/clip-orders/{part_no}/packet", headers=medico)
        assert got.status_code == 200
        blob = Path(_tmp) / "packet.zip"
        blob.write_bytes(got.content)
        names = zipfile.ZipFile(blob).namelist()
        assert sorted(names) == sorted([f"{part_no}_clip.stl", f"{part_no}_especificacion.pdf"])

    def test_a_draft_has_no_paperwork_to_download(self, medico):
        _sid, _pre, r = _place(medico, sign=False)
        part_no = r.json()["part_no"]
        assert client.get(f"/api/clip-orders/{part_no}/packet", headers=medico).status_code == 409


# ── 6. Workshops are typed once ────────────────────────────────────────────── #

class TestWorkshops:
    def test_one_typed_in_the_form_is_saved_for_reuse(self, medico):
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}", headers=medico).json()
        assert pre["workshops"] == []
        r = client.post(f"/api/clip-orders/{sid}", headers=medico,
                        json=_form(jaw_mm=pre["advised_jaw_mm"],
                                   new_workshop={"name": "Taller Nuevo",
                                                 "email": "a@b.c"}))
        assert r.status_code == 201, r.text
        again = client.get(f"/api/clip-orders/prefill/{_session()}", headers=medico).json()
        assert [w["name"] for w in again["workshops"]] == ["Taller Nuevo"]

    def test_the_order_keeps_its_own_copy_of_the_workshop(self, medico):
        # Correcting an address later must not rewrite where a past order went.
        ws = _workshop(medico, "Taller Original")
        _sid, _pre, r = _place(medico, workshop_id=ws)
        client.put(f"/api/clip-orders/workshops/{ws}", headers=medico,
                   json={"name": "Taller Renombrado", "address": "Otra calle"})
        order = store.get_order(r.json()["part_no"])
        assert order.workshop["name"] == "Taller Original"

    def test_a_duplicate_name_is_refused(self, medico):
        _workshop(medico, "Taller Único")
        r = client.post("/api/clip-orders/workshops", headers=medico,
                        json={"name": "taller único"})
        assert r.status_code == 409

    def test_only_an_admin_removes_one(self, medico):
        ws = _workshop(medico)
        assert client.delete(f"/api/clip-orders/workshops/{ws}", headers=medico).status_code == 403
        admin = _headers("jefa", "admin")
        assert client.delete(f"/api/clip-orders/workshops/{ws}", headers=admin).status_code == 200


# ── 7. The piece that comes back ───────────────────────────────────────────── #

class TestReception:
    def _sent(self, medico) -> str:
        _sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        assert client.post(f"/api/clip-orders/{part_no}/status", headers=medico,
                           json={"status": "enviado"}).status_code == 200
        return part_no

    def test_a_piece_within_spec_is_accepted(self, medico):
        part_no = self._sent(medico)
        order = store.get_order(part_no)
        r = client.post(f"/api/clip-orders/{part_no}/reception", headers=medico,
                        json={"measured_jaw_mm": order.jaw_mm, "measured_force_g": 160.0})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "recibida"
        assert r.json()["reception"]["force_within_band"] is True
        ok = client.post(f"/api/clip-orders/{part_no}/verify", headers=medico, json={})
        assert ok.status_code == 200 and ok.json()["status"] == "verificada"

    def test_a_piece_outside_the_force_band_cannot_be_accepted_in_silence(self, medico):
        part_no = self._sent(medico)
        order = store.get_order(part_no)
        client.post(f"/api/clip-orders/{part_no}/reception", headers=medico,
                    json={"measured_jaw_mm": order.jaw_mm, "measured_force_g": 60.0})
        bad = client.post(f"/api/clip-orders/{part_no}/verify", headers=medico, json={})
        assert bad.status_code == 409
        assert "fuera de especificación" in bad.json()["detail"]

        ok = client.post(f"/api/clip-orders/{part_no}/verify", headers=medico,
                         json={"accept_deviation_reason": "Se usará como prototipo, no en paciente"})
        assert ok.status_code == 200
        assert store.get_order(part_no).reception["deviation_accepted"]

    def test_a_wrong_jaw_is_flagged_against_what_was_ordered(self, medico):
        part_no = self._sent(medico)
        order = store.get_order(part_no)
        r = client.post(f"/api/clip-orders/{part_no}/reception", headers=medico,
                        json={"measured_jaw_mm": order.jaw_mm + 1.5, "measured_force_g": 150.0})
        assert r.json()["reception"]["jaw_within_tolerance"] is False

    def test_a_rejection_needs_a_reason(self, medico):
        part_no = self._sent(medico)
        order = store.get_order(part_no)
        client.post(f"/api/clip-orders/{part_no}/reception", headers=medico,
                    json={"measured_jaw_mm": order.jaw_mm, "measured_force_g": 150.0})
        assert client.post(f"/api/clip-orders/{part_no}/reject", headers=medico,
                           json={"reason": ""}).status_code == 422
        ok = client.post(f"/api/clip-orders/{part_no}/reject", headers=medico,
                         json={"reason": "Rebaba en la mordaza"})
        assert ok.status_code == 200 and ok.json()["status"] == "rechazada"

    def test_a_piece_cannot_be_received_before_it_is_sent(self, medico):
        _sid, _pre, r = _place(medico)
        part_no = r.json()["part_no"]
        bad = client.post(f"/api/clip-orders/{part_no}/reception", headers=medico,
                          json={"measured_jaw_mm": 7.0, "measured_force_g": 150.0})
        assert bad.status_code == 409


# ── 8. The register ────────────────────────────────────────────────────────── #

class TestTheRegister:
    def test_a_signed_order_cannot_be_deleted(self, medico):
        # A record that can be deleted is not a record.
        _sid, _pre, r = _place(medico)
        assert client.delete(f"/api/clip-orders/{r.json()['part_no']}",
                             headers=medico).status_code == 409

    def test_a_draft_can_be_deleted(self, medico):
        _sid, _pre, r = _place(medico, sign=False)
        assert client.delete(f"/api/clip-orders/{r.json()['part_no']}",
                             headers=medico).status_code == 200

    def test_orders_are_listed_for_the_session_that_raised_them(self, medico):
        sid, _pre, _r = _place(medico)
        _place(medico)  # another session
        rows = client.get("/api/clip-orders", headers=medico,
                          params={"session_id": sid}).json()
        assert len(rows) == 1 and rows[0]["session_id"] == sid

    def test_a_workflow_jump_is_refused_with_the_states_that_work(self, medico):
        _sid, _pre, r = _place(medico)
        bad = client.post(f"/api/clip-orders/{r.json()['part_no']}/status",
                          headers=medico, json={"status": "verificada"})
        assert bad.status_code == 409
        assert "Enviado al taller" in bad.json()["detail"]

    def test_an_unknown_order_is_a_404(self, medico):
        assert client.get("/api/clip-orders/PR-1999-0001", headers=medico).status_code == 404

    def test_it_needs_authentication(self):
        from conftest import anonymous_client

        assert anonymous_client(app).get("/api/clip-orders").status_code == 401
