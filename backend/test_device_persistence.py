"""Tests for placed-device persistence → report/session (Feature 4)."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_devpersist_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.sessions import create_session, session_subdir, write_state
from services.report_generator import build_report_data_from_session, ReportGenerator
from services.device_state import read_stent, read_clips, read_coils, save_clips, clear_devices
from services.clips import catalogue_to_api as clips_api
from services.coils import catalogue_to_api as coils_api

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _session_with_volume() -> str:
    sid = create_session()
    write_state(sid, "morpho.volume_mm3", "120.0")
    return sid


def _some_clip_id() -> str:
    """Any clip the app actually offers, for tests that just need one placed.

    Skips rather than fails when nothing is installed: the offered catalogue is
    read off disk, and the NAVARRO™ library is not part of the repository.
    """
    cat = clips_api()
    if not cat:
        import pytest
        pytest.skip("no hay catálogo instalado (biblioteca NAVARRO ausente)")
    return cat[0]["id"]


class TestPersistence:
    def test_clip_plan_persists_to_report(self):
        sid = _session_with_volume()
        clip_id = _some_clip_id()
        r = client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": clip_id, "position": {"x": 1, "y": 2, "z": 3}, "normal": [0, 0, 1], "rotation_deg": 15},
        ]})
        assert r.status_code == 200
        data = build_report_data_from_session(sid)
        assert len(data.clips) == 1
        assert data.clips[0].position_mm == (1.0, 2.0, 3.0)
        assert data.clips[0].orientation_deg == (0.0, 0.0, 15.0)
        assert data.clips[0].name  # non-empty catalogue name

    def test_coil_plan_persists_to_report(self):
        sid = _session_with_volume()
        coil_id = coils_api()[0]["id"]
        r = client.post("/api/coils/plan", json={"session_id": sid, "placements": [
            {"coil_id": coil_id, "position": {"x": 4, "y": 5, "z": 6}, "packing_density": 0},
            {"coil_id": coil_id, "position": {"x": 4, "y": 5, "z": 6}, "packing_density": 0},
        ]})
        assert r.status_code == 200
        data = build_report_data_from_session(sid)
        assert len(data.coils) == 2
        assert data.coils[0].diameter_mm > 0
        assert data.coils[0].manufacturer
        assert isinstance(data.coils[0].coil_type, str)  # JSON-safe (not an enum)

    def test_stent_plan_persists(self):
        sid = _session_with_volume()
        st = client.get("/api/stents").json()[0]
        r = client.post("/api/plan", json={"session_id": sid, "stent": {
            "stent_id": st["id"], "diameter_mm": st["min_diameter_mm"],
            "length_mm": st["available_lengths_mm"][0], "position": {"x": 0, "y": 0, "z": 0}, "rotation_deg": 0,
        }})
        assert r.status_code == 200
        stent = read_stent(sid)
        assert stent.get("name")
        assert stent.get("coverage_pct") is not None

    def test_pdf_builds_with_devices(self):
        sid = _session_with_volume()
        # Enough morphometry for a meaningful report body.
        for k, v in [("morpho.max_diameter_mm", "7.5"), ("morpho.neck_mm", "3.2"), ("morpho.dnr", "1.8")]:
            write_state(sid, k, v)
        clip_id = clips_api()[0]["id"]
        client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": clip_id, "position": {"x": 1, "y": 2, "z": 3}, "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        data = build_report_data_from_session(sid)
        out = session_subdir(sid, "reports")
        out.mkdir(parents=True, exist_ok=True)
        pdf = ReportGenerator(data).generate(out / "r.pdf")
        assert pdf.stat().st_size > 1000

    def test_empty_session_has_no_devices(self):
        sid = create_session()
        data = build_report_data_from_session(sid)
        assert data.clips == []
        assert data.coils == []

    def test_clear_devices(self):
        sid = create_session()
        save_clips(sid, [{"index": 0, "name": "X", "position": [0, 0, 0], "orientation": [0, 0, 0]}])
        assert len(read_clips(sid)) == 1
        clear_devices(sid)
        assert read_clips(sid) == []
        assert read_coils(sid) == []


class TestStentReachesTheReport:
    """A deployed stent used to stop at session state: the PDF and the DICOM SR
    both dropped it, so the report showed clips and coils but never the stent.
    """

    def _straight_stent_session(self) -> str:
        sid = _session_with_volume()
        for k, v in [("morpho.max_diameter_mm", "7.5"), ("morpho.neck_mm", "3.2")]:
            write_state(sid, k, v)
        st = client.get("/api/stents").json()[0]
        r = client.post("/api/plan", json={"session_id": sid, "stent": {
            "stent_id": st["id"], "diameter_mm": st["min_diameter_mm"],
            "length_mm": st["available_lengths_mm"][0],
            "position": {"x": 0, "y": 0, "z": 0}, "rotation_deg": 0,
        }})
        assert r.status_code == 200, r.text
        return sid

    def test_straight_stent_appears_in_report_data_and_pdf(self):
        sid = self._straight_stent_session()

        data = build_report_data_from_session(sid)
        assert data.stent is not None, "el informe no vería el stent desplegado"
        assert data.stent.kind == "straight"
        assert data.stent.name
        assert data.stent.diameter_mm > 0

        gen = ReportGenerator(data)
        section = gen._section_stent()
        assert section, "la sección de stent no se emite"
        assert "desviador de flujo" in section[0].text
        # …and it must actually reach the document, not just exist.
        titles = [f.text for f in gen._build_story() if hasattr(f, "text")]
        assert any("desviador de flujo" in t for t in titles),             "la sección de stent no se añade al documento"

        out = session_subdir(sid, "reports")
        out.mkdir(parents=True, exist_ok=True)
        assert ReportGenerator(data).generate(out / "r.pdf").stat().st_size > 1000

    def test_centerline_stent_coverage_is_labelled_as_a_fit_ratio(self):
        """The two planners store different quantities under `coverage_pct`;
        printing the centreline ratio as «cobertura del cuello» would read a
        1.01 fit as 101 % of neck covered."""
        from services.device_state import save_stent

        sid = _session_with_volume()
        save_stent(sid, {
            "name": "Stent guiado por centerline", "manufacturer": "",
            "diameter_mm": 3.25, "length_mm": 22.0,
            "coverage_pct": 101.0, "kind": "centerline",
        })

        data = build_report_data_from_session(sid)
        assert data.stent is not None and data.stent.kind == "centerline"

        section = ReportGenerator(data)._section_stent()
        assert "línea central" in section[0].text
        # F1-233: la tabla va junta (KeepTogether) y cada valor lleva su
        # referencia en la misma celda, debajo.
        tabla = section[1]._content[0]
        cells = [getattr(c, "text", str(c)) for row in tabla._cellvalues for c in row]
        assert any("Ø stent / Ø vaso" in c for c in cells)
        assert any(c.startswith("1.01<br/>") for c in cells)   # ratio, not "101.0 %"
        assert not any("Cobertura del cuello" in c for c in cells)

    def test_empty_session_has_no_stent(self):
        assert build_report_data_from_session(create_session()).stent is None


class TestDicomSrCarriesDevices:
    def test_sr_includes_clips_coils_and_stent(self):
        import pydicom
        from services.device_state import save_stent

        sid = _session_with_volume()
        for k, v in [("morpho.max_diameter_mm", "7.5"), ("morpho.neck_mm", "3.2")]:
            write_state(sid, k, v)
        clip_id = clips_api()[0]["id"]
        client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": clip_id, "position": {"x": 1, "y": 2, "z": 3},
             "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        coil_id = coils_api()[0]["id"]
        client.post("/api/coils/plan", json={"session_id": sid, "placements": [
            {"coil_id": coil_id, "position": {"x": 0, "y": 0, "z": 0}, "packing_density": 0},
        ]})
        save_stent(sid, {"name": "Pipeline Flex", "manufacturer": "Medtronic",
                         "diameter_mm": 4.0, "length_mm": 20.0,
                         "coverage_pct": 32.0, "kind": "straight"})

        r = client.post("/api/report/dicom-sr", json={"session_id": sid})
        assert r.status_code == 200, r.text

        sr_path = session_subdir(sid, "reports") / f"{sid}_sr.dcm"
        text = str(pydicom.dcmread(sr_path))
        # Concept names render as their code meanings, so assert on the
        # containers' meanings plus the device names themselves.
        assert "Endovascular Device Plan" in text, "el SR no lleva el stent"
        assert "Pipeline Flex" in text
        assert "Clip Model" in text, "el SR no lleva los clips"
        assert "Coil Model" in text, "el SR no lleva los coils"


class TestClipEditable:
    """F1-28: reanudar devolvía los clips como malla y nada más. La lista que
    edita el panel (pose e inclinación de cada clip) y su verificación se
    guardan aparte y vuelven con GET /devices."""

    _LISTA = [{"key": 3, "clip_id": "c1", "name": "Clip 1", "position": [1.0, 2.0, 3.0],
               "rotation_deg": 20.0, "azimuthDeg": 15.0, "elevationDeg": -10.0}]

    def test_la_lista_vuelve_y_limpiar_la_borra(self):
        sid = _session_with_volume()
        (session_subdir(sid, "meshes") / "clips_placed.vtp").write_text("x")
        plan = {"clips_mesh_url": "/data/sessions/OTRA/meshes/clips_placed.vtp",
                "neck_coverage_pct": 88.0}
        r = client.put(f"/api/devices/{sid}/placed-clips", json={"clips": self._LISTA, "plan": plan})
        assert r.status_code == 200, r.text
        got = client.get(f"/api/devices/{sid}").json()["placed_clips"]
        assert got["clips"] == self._LISTA
        # La malla es la de esta sesión, no la de la que colocó.
        assert got["plan"]["clips_mesh_url"].startswith(f"/data/sessions/{sid}/meshes/clips_placed.vtp")
        client.delete(f"/api/devices/{sid}")
        assert client.get(f"/api/devices/{sid}").json()["placed_clips"] is None

    def test_sin_malla_de_clips_la_verificacion_no_vuelve(self):
        sid = _session_with_volume()
        client.put(f"/api/devices/{sid}/placed-clips", json={
            "clips": self._LISTA,
            "plan": {"clips_mesh_url": "x", "neck_coverage_pct": 88.0}})
        got = client.get(f"/api/devices/{sid}").json()["placed_clips"]
        assert got["clips"] == self._LISTA and got["plan"] is None


class TestLaEstrategiaDelEquipo:
    """F1-188: «En el plan (n)» listaba lo colocado, pero nada decía cuál de
    esas familias era la estrategia elegida. El informe las daba todas como
    planificadas."""

    def test_la_estrategia_elegida_se_guarda_y_vuelve_en_get(self):
        sid = create_session()
        assert client.get(f"/api/devices/{sid}").json()["strategy"] is None
        r = client.put(f"/api/devices/{sid}/strategy", json={"strategy": "coils"})
        assert r.status_code == 200, r.text
        assert r.json() == {"strategy": "coils"}
        assert client.get(f"/api/devices/{sid}").json()["strategy"] == "coils"
        assert build_report_data_from_session(sid).device_strategy == "coils"

    def test_null_la_quita_y_un_valor_fuera_de_la_lista_es_422(self):
        sid = create_session()
        client.put(f"/api/devices/{sid}/strategy", json={"strategy": "web"})
        assert client.put(f"/api/devices/{sid}/strategy", json={"strategy": None}).json() == {"strategy": None}
        assert client.get(f"/api/devices/{sid}").json()["strategy"] is None
        assert client.put(f"/api/devices/{sid}/strategy", json={"strategy": "balon"}).status_code == 422
        assert client.put("/api/devices/no-existe/strategy", json={"strategy": "clips"}).status_code == 404

    def test_limpiar_los_dispositivos_no_borra_la_estrategia(self):
        # La estrategia es del equipo; limpiar es probar otra colocación.
        sid = create_session()
        client.put(f"/api/devices/{sid}/strategy", json={"strategy": "clips"})
        client.delete(f"/api/devices/{sid}")
        assert client.get(f"/api/devices/{sid}").json()["strategy"] == "clips"

    def test_get_cuenta_lo_colocado_por_familia(self):
        # F1-220: el resumen del informe dice «Clips · 2 en el plan».
        from services.device_state import save_coils, save_stent
        sid = create_session()
        save_coils(sid, [{"name": "a"}, {"name": "b"}])
        save_stent(sid, {"name": "Pipeline", "kind": "centerline"})
        counts = client.get(f"/api/devices/{sid}").json()["placed_counts"]
        assert counts == {"clips": 0, "coils": 2, "stent": 0, "stent_cl": 1}


# ══════════════════════════════════════════════════════════════════════════════
# Otro profesional (ola final F1a): la sesión de un paciente ajeno es 403.
# ══════════════════════════════════════════════════════════════════════════════

def _dos_medicos_y_sesion_de_a():
    """Dos médicos y una sesión ligada a un paciente creado por el primero.

    Mismo patrón que `test_team_decision.py::TestOtroProfesional`: con solo el
    login global, cualquiera que supiera la UUID tocaba la sesión de otro.
    """
    import uuid

    from conftest import anonymous_client
    from services.auth_service import create_access_token, get_password_hash
    from services.database import Base, SessionLocal, engine
    from services.db_models import Patient, PlanningSession, User

    Base.metadata.create_all(bind=engine)
    clientes = []
    db = SessionLocal()
    for _ in range(2):
        nombre = f"med-{uuid.uuid4().hex[:8]}"
        u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico",
                 full_name=nombre)
        db.add(u); db.commit()
        c = anonymous_client(app)
        c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
        clientes.append((u.id, c))
    p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=clientes[0][0])
    db.add(p); db.commit()
    return db, p.id, clientes[0][1], clientes[1][1]


class TestOtroProfesional:
    def test_no_marca_la_estrategia_de_otro(self):
        from services.db_models import PlanningSession
        db, pid, a, b = _dos_medicos_y_sesion_de_a()
        sid = create_session()
        db.add(PlanningSession(session_id=sid, patient_id=pid)); db.commit(); db.close()
        assert b.put(f"/api/devices/{sid}/strategy", json={"strategy": "coils"}).status_code == 403
        r = a.put(f"/api/devices/{sid}/strategy", json={"strategy": "coils"})
        assert r.status_code == 200 and r.json() == {"strategy": "coils"}
