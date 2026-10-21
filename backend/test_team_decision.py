"""F1-176: la decisión del equipo, aparte de la recomendación del algoritmo.

La pantalla solo tenía «Evaluar CLIP vs ENDOVASCULAR» y «Re-evaluar»: lo que
salía en el informe era lo que el motor recomendaba, nunca lo que el equipo
decidía. Ahora el equipo registra su decisión (clipaje, endovascular, vigilar u
otra) y quién decide; se guarda con la sesión, vuelve al reanudar y va al PDF.
"""
from __future__ import annotations

import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="prospective_team_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient  # noqa: E402

from conftest import anonymous_client  # noqa: E402
from main import app  # noqa: E402
from routers.treatment import clear_decision_only, clear_treatment_state  # noqa: E402
from services.auth_service import create_access_token, get_password_hash  # noqa: E402
from services.database import Base, SessionLocal, engine  # noqa: E402
from services.db_models import Patient, PlanningSession, User  # noqa: E402
from services.sessions import create_session, read_state, write_states  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # admin (conftest)


def _sid() -> str:
    sid = create_session()
    write_states(sid, {"morpho.max_diameter_mm": "8.2", "morpho.neck_mm": "3.5"})
    return sid


def _put(sid: str, c: TestClient = client, **body):
    return c.put(f"/api/treatment-decision/{sid}/team", json=body)


class TestLaRuta:
    def test_put_guarda_y_get_la_devuelve(self):
        sid = _sid()
        r = _put(sid, team_decision="clipaje", decided_by="Comité neurovascular")
        assert r.status_code == 200, r.text
        assert r.json() == {"team_decision": "clipaje", "decided_by": "Comité neurovascular",
                            "other_text": ""}
        assert read_state(sid, "treatment.team_decision", "") == "clipaje"
        assert read_state(sid, "treatment.decided_by", "") == "Comité neurovascular"
        assert client.get(f"/api/treatment-decision/{sid}/team").json()["team_decision"] == "clipaje"

    def test_otra_guarda_su_texto(self):
        sid = _sid()
        _put(sid, team_decision="otra", decided_by="Dra. Ruiz", other_text="Bypass y trapping")
        assert read_state(sid, "treatment.team_other", "") == "Bypass y trapping"

    def test_sin_decision_get_dice_null(self):
        r = client.get(f"/api/treatment-decision/{_sid()}/team")
        assert r.status_code == 200
        assert r.json()["team_decision"] is None

    def test_null_la_borra(self):
        sid = _sid()
        _put(sid, team_decision="vigilar", decided_by="X")
        r = _put(sid, team_decision=None, decided_by="")
        assert r.status_code == 200 and r.json()["team_decision"] is None
        assert read_state(sid, "treatment.team_decision", "") == ""

    def test_valores_fuera_de_la_lista_o_nombre_largo_422(self):
        sid = _sid()
        assert _put(sid, team_decision="cirugia", decided_by="").status_code == 422
        assert _put(sid, team_decision="clipaje", decided_by="x" * 121).status_code == 422

    def test_sesion_inexistente_404(self):
        assert _put("no-existe", team_decision="clipaje", decided_by="").status_code == 404


class TestViajaConLaRecomendacion:
    def test_la_recomendacion_la_lleva(self):
        sid = _sid()
        r = client.post("/api/treatment-decision", json={"session_id": sid})
        assert r.status_code == 200, r.text
        assert r.json()["team"] is None
        _put(sid, team_decision="endovascular", decided_by="Comité")
        got = client.get(f"/api/treatment-decision/{sid}").json()
        assert got["team"] == {"team_decision": "endovascular", "decided_by": "Comité",
                               "other_text": ""}
        # Re-evaluar no la pisa: es del equipo, no del motor.
        again = client.post("/api/treatment-decision", json={"session_id": sid}).json()
        assert again["team"]["team_decision"] == "endovascular"

    def test_borrar_la_recomendacion_no_borra_la_del_equipo(self):
        sid = _sid()
        client.post("/api/treatment-decision", json={"session_id": sid})
        _put(sid, team_decision="clipaje", decided_by="Comité")
        clear_decision_only(sid)
        assert read_state(sid, "treatment.team_decision", "") == "clipaje"
        assert client.get(f"/api/treatment-decision/{sid}/team").json()["team_decision"] == "clipaje"

    def test_las_medidas_nuevas_no_borran_la_del_equipo(self):
        # Re-medir invalida la recomendación (sale de las medidas); la decisión
        # del equipo es trabajo a mano y no se pierde sin que nadie lo pida.
        sid = _sid()
        _put(sid, team_decision="clipaje", decided_by="Comité")
        clear_treatment_state(sid)
        assert read_state(sid, "treatment.team_decision", "") == "clipaje"

    def test_limpiar_no_la_borra(self):
        # «Limpiar decisión y PHASES» quita lo del motor. La decisión del
        # equipo es trabajo a mano: solo se quita desde su tarjeta.
        sid = _sid()
        client.post("/api/treatment-decision", json={"session_id": sid})
        _put(sid, team_decision="otra", decided_by="Comité", other_text="Bypass")
        assert client.delete(f"/api/treatment-decision/{sid}").status_code == 200
        assert read_state(sid, "treatment.recommendation_key", "") == ""
        assert read_state(sid, "treatment.team_decision", "") == "otra"
        assert read_state(sid, "treatment.decided_by", "") == "Comité"
        assert read_state(sid, "treatment.team_other", "") == "Bypass"


class TestElPdfConTextoTecleado:
    def test_marcas_en_quien_decide_salen_literales(self, tmp_path):
        # «<b>comité» rompía el Paragraph de ReportLab y el PDF no salía.
        from services.report_generator import (ReportGenerator,
                                               build_report_data_from_session)
        sid = _sid()
        _put(sid, team_decision="otra", decided_by="<b>comité & cía",
             other_text="<i>bypass")
        gen = ReportGenerator(build_report_data_from_session(sid))
        # Lo que se lee impreso (getPlainText), no el marcado de ReportLab.
        textos = [f.getPlainText() for f in gen._build_story() if hasattr(f, "getPlainText")]
        linea = next(t for t in textos if t.startswith("Decisión del equipo"))
        assert "<b>comité & cía" in linea and "<i>bypass" in linea
        # Y el documento entero se escribe.
        assert gen.generate(tmp_path / "informe.pdf").stat().st_size > 0


def _medico() -> tuple[int, TestClient]:
    nombre = f"med-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    u = User(username=nombre, hashed_password=get_password_hash("x" * 12), role="medico",
             full_name=nombre)
    db.add(u); db.commit(); uid = u.id; db.close()
    c = anonymous_client(app)
    c.headers["Authorization"] = f"Bearer {create_access_token(subject=nombre)}"
    return uid, c


class TestOtroProfesional:
    def test_no_lee_ni_escribe_la_decision_de_otro(self):
        a_id, a = _medico()
        _b_id, b = _medico()
        db = SessionLocal()
        p = Patient(surname="DeA", hospital_id=f"HC-{uuid.uuid4().hex[:6]}", created_by=a_id)
        db.add(p); db.commit()
        sid = _sid()
        db.add(PlanningSession(session_id=sid, patient_id=p.id)); db.commit(); db.close()
        assert _put(sid, b, team_decision="clipaje", decided_by="B").status_code == 403
        assert b.get(f"/api/treatment-decision/{sid}/team").status_code == 403
        # Limpiar la decisión también es tocar trabajo de esa sesión.
        assert b.delete(f"/api/treatment-decision/{sid}").status_code == 403
        assert _put(sid, a, team_decision="clipaje", decided_by="A").status_code == 200
        assert a.get(f"/api/treatment-decision/{sid}/team").json()["decided_by"] == "A"
        assert a.delete(f"/api/treatment-decision/{sid}").status_code == 200
