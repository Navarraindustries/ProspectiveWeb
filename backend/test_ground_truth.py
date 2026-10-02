"""«Confirmar lesión»: cada caso confirmado mide al detector.

Lo que se defiende:
- el puesto que se guarda es el de la lista que vio el profesional, también
  cuando marca el punto a mano (un clic sobre el domo de un candidato ES ese
  candidato);
- una confirmación nueva del mismo estudio sustituye a la anterior sin borrarla;
- el resumen cuenta sobre las vigentes, y sin texto libre ni nombres;
- lo que hace falta para rehacer la malla viaja con la confirmación.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_gt_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from routers.ground_truth import match_rank
from services.audit import SkullChain
from services.database import Base, engine
from services.sessions import create_session, write_states
from test_captures import _estudio

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # admin (conftest)


def _sesion_con_candidatos(modality: str = "XA") -> str:
    """Tres candidatos en fila sobre x, como los deja la detección en el estado."""
    sid = create_session()
    vals = {"detect.n_candidates": "3", "dicom.modality": modality,
            "seg.method": "tubular", "seg.threshold_lower": "1470",
            "seg.params": json.dumps({"series_id": "S1", "lower": 1470.0})}
    for rank, x in ((1, 0.0), (2, 30.0), (3, 60.0)):
        p = f"detect.cand_{rank:03d}"
        vals |= {f"{p}.centroid_x": str(x), f"{p}.centroid_y": "0", f"{p}.centroid_z": "0",
                 f"{p}.diameter_mm": "6.0", f"{p}.channels": "curvatura"}
    write_states(sid, vals)
    return sid


def _confirmar(**body):
    return client.post("/api/ground-truth", json=body)


class TestPuesto:
    def test_confirmar_un_candidato_guarda_su_puesto(self):
        sid = _sesion_con_candidatos()
        r = _confirmar(session_id=sid, source="candidate", candidate_id="cand-002")
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["candidate_rank"] == 2 and j["n_candidates"] == 3
        assert j["position"] == {"x": 30.0, "y": 0.0, "z": 0.0}
        assert j["reproducible"] is False and j["created_by"] == "admin"

    def test_un_clic_sobre_el_domo_de_un_candidato_es_ese_candidato(self):
        sid = _sesion_con_candidatos()
        j = _confirmar(session_id=sid, source="marked",
                       position={"x": 62.0, "y": 3.0, "z": 0.0}).json()
        assert j["source"] == "marked" and j["candidate_rank"] == 3

    def test_un_punto_lejos_de_todos_es_un_fallo_del_detector(self):
        sid = _sesion_con_candidatos()
        j = _confirmar(session_id=sid, source="marked",
                       position={"x": 15.0, "y": 20.0, "z": 0.0}).json()
        assert j["candidate_rank"] is None

    def test_un_candidato_que_no_esta_en_la_lista_se_rechaza(self):
        sid = _sesion_con_candidatos()
        assert _confirmar(session_id=sid, source="candidate",
                          candidate_id="cand-007").status_code == 422

    def test_marcar_sin_punto_se_rechaza(self):
        sid = _sesion_con_candidatos()
        assert _confirmar(session_id=sid, source="marked").status_code == 422

    def test_radio_de_acierto(self):
        cands = [{"rank": 1, "position": [0, 0, 0], "diameter_mm": 12.0, "channels": ""}]
        assert match_rank((11.0, 0, 0), cands)["rank"] == 1   # dentro de su diámetro
        assert match_rank((13.0, 0, 0), cands) is None
        pequeño = [{"rank": 1, "position": [0, 0, 0], "diameter_mm": 2.0, "channels": ""}]
        assert match_rank((4.5, 0, 0), pequeño)["rank"] == 1  # nunca menos de 5 mm


class TestVigente:
    def test_la_nueva_sustituye_a_la_anterior_y_la_anterior_queda(self):
        sid = _sesion_con_candidatos()
        a = _confirmar(session_id=sid, source="candidate", candidate_id="cand-001").json()
        b = _confirmar(session_id=sid, source="no_lesion").json()
        cur = client.get(f"/api/ground-truth/current?session_id={sid}").json()
        assert cur["id"] == b["id"] and cur["source"] == "no_lesion"
        assert cur["position"] is None
        retiradas = [x for x in SkullChain.instance().get_all_blocks()
                     if x["action"] == "LESION_CONFIRMED"
                     and json.loads(x["payload_json"])["confirmation"] == a["id"]]
        assert retiradas, "la primera sigue en la cadena"

    def test_por_estudio_archivado_sobrevive_a_la_sesion(self):
        # La sesión se purga a las 24 h; al reanudar llega otra. Lo que une
        # las dos es el estudio.
        _pid, _caso, img = _estudio("ConfirmaGT")
        s1 = _sesion_con_candidatos()
        j = _confirmar(session_id=s1, imaging_study_id=img, source="candidate",
                       candidate_id="cand-001").json()
        assert j["reproducible"] is True
        s2 = create_session()
        cur = client.get(f"/api/ground-truth/current?session_id={s2}&imaging_study_id={img}").json()
        assert cur["id"] == j["id"]

    def test_sin_confirmacion_responde_null(self):
        sid = create_session()
        r = client.get(f"/api/ground-truth/current?session_id={sid}")
        assert r.status_code == 200 and r.json() is None

    def test_retirar(self):
        sid = _sesion_con_candidatos()
        j = _confirmar(session_id=sid, source="no_lesion").json()
        assert client.delete(f"/api/ground-truth/{j['id']}").status_code == 204
        assert client.get(f"/api/ground-truth/current?session_id={sid}").json() is None
        assert client.delete(f"/api/ground-truth/{j['id']}").status_code == 404


class TestResumenYExport:
    def test_el_resumen_cuenta_puestos_y_fallos(self):
        antes = client.get("/api/ground-truth/summary").json()
        _confirmar(session_id=_sesion_con_candidatos(), source="candidate", candidate_id="cand-001")
        _confirmar(session_id=_sesion_con_candidatos(), source="candidate", candidate_id="cand-003")
        _confirmar(session_id=_sesion_con_candidatos(), source="marked",
                   position={"x": 15.0, "y": 20.0, "z": 0.0})
        _confirmar(session_id=_sesion_con_candidatos(), source="no_lesion")
        d = client.get("/api/ground-truth/summary").json()
        delta = {k: d[k] - antes[k] for k in ("confirmed", "first", "top3", "top5", "missed", "no_lesion")}
        assert delta == {"confirmed": 3, "first": 1, "top3": 2, "top5": 2, "missed": 1, "no_lesion": 1}

    def test_el_export_lleva_lo_necesario_para_rehacer_la_malla_y_nada_del_paciente(self):
        _pid, _caso, img = _estudio("NombreQueNoDebeSalir")
        sid = _sesion_con_candidatos()
        _confirmar(session_id=sid, imaging_study_id=img, source="candidate", candidate_id="cand-002")
        r = client.get("/api/ground-truth/export")
        assert r.status_code == 200
        fila = next(x for x in r.json() if x["imaging_study_id"] == img)
        assert fila["seg_params"]["series_id"] == "S1" and fila["seg_params"]["method"] == "tubular"
        assert "mesh_edits" in fila["seg_params"]
        assert [c["rank"] for c in fila["candidates"]] == [1, 2, 3]
        assert "NombreQueNoDebeSalir" not in r.text

    def test_el_export_es_solo_para_administradores(self):
        assert anonymous_client(app).get("/api/ground-truth/export").status_code == 401
