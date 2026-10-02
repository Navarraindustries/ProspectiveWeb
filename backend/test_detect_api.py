# -*- coding: utf-8 -*-
"""POST /detect devuelve los descartados con su motivo, y re-detectar invalida
la morfometría cuando el candidato elegido ya no está donde estaba.

Los vetos (`services/candidate_vetoes.py`) no borran sitios: los apartan con un
motivo legible, para que el clínico vea qué se descartó y por qué. Un
descartado sigue siendo medible —su malla se escribe igual— porque el veto es
geométrico y puede equivocarse.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_detapi_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest
from fastapi.testclient import TestClient

from eval.synthetic import saco_en_borde, tubo_con_saco, tubo_curvo_sin_saco
from main import app
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _session_with_mesh(poly) -> str:
    sid = create_session()
    write_vtp(poly, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    write_state(sid, "dicom.modality", "XA")
    return sid


@pytest.fixture
def session_con_saco() -> str:
    return _session_with_mesh(tubo_con_saco()[0])


@pytest.fixture
def session_con_saco_en_borde() -> str:
    return _session_with_mesh(saco_en_borde()[0])


@pytest.fixture
def session_tubo_liso() -> str:
    # El tubo curvo, no el recto: sobre un tubo recto desnudo calibre y
    # cociente dan cinco picos en la pared (`_peaks` no tiene valor mínimo de
    # pico, ver la fila `tubo_mas_isla` del banco), y ningún veto los caza
    # porque no son borde, isla, bifurcación ni forma. El curvo es la fila del
    # banco que da 0 aceptados y 0 descartados.
    return _session_with_mesh(tubo_curvo_sin_saco())


def test_la_respuesta_separa_aceptados_y_descartados_con_ids_consecutivos(session_con_saco_en_borde):
    r = client.post(f"/api/detect/{session_con_saco_en_borde}").json()
    ids = [c["id"] for c in r["candidates"]] + [c["id"] for c in r["rejected"]]
    assert ids == [f"cand-{i:03d}" for i in range(1, len(ids) + 1)]
    assert all(c["veto"] is None for c in r["candidates"])
    assert all(c["veto"]["label"] for c in r["rejected"])
    assert r["diagnostics"]["n_rejected"] == len(r["rejected"])
    assert [c["rank"] for c in r["candidates"]] == list(range(1, len(r["candidates"]) + 1))
    assert len(r["candidates"]) <= 5


def test_un_descartado_se_puede_medir(session_con_saco_en_borde):
    r = client.post(f"/api/detect/{session_con_saco_en_borde}").json()
    assert r["rejected"], "este caso tiene un extremo cortado que se descarta"
    cid = r["rejected"][0]["id"]
    m = client.get(f"/api/morphometry/{session_con_saco_en_borde}", params={"candidate_id": cid})
    assert m.status_code == 200


def test_re_detectar_sin_medida_previa_no_invalida_nada(session_con_saco):
    r1 = client.post(f"/api/detect/{session_con_saco}").json()
    assert r1["morphometry_invalidated"] is False


def test_re_detectar_con_el_elegido_movido_limpia_la_morfometria(session_con_saco):
    client.post(f"/api/detect/{session_con_saco}")
    client.get(f"/api/morphometry/{session_con_saco}", params={"candidate_id": "cand-001"})
    from services.sessions import write_state
    # Simula que la detección anterior tenía el elegido 10 mm más allá.
    write_state(session_con_saco, "detect.cand_001.centroid_x", "999")
    r = client.post(f"/api/detect/{session_con_saco}").json()
    assert r["morphometry_invalidated"] is True
    from services.sessions import read_state
    assert read_state(session_con_saco, "detect.selected_candidate") in ("", None)


def test_sin_candidatos_rejected_vacio(session_tubo_liso):
    r = client.post(f"/api/detect/{session_tubo_liso}").json()
    assert r["candidates"] == [] and r["rejected"] == [] and r["diagnostics"]["n_rejected"] == 0


def test_re_detectar_la_misma_malla_conserva_la_medida(session_con_saco):
    from services.sessions import read_state
    client.post(f"/api/detect/{session_con_saco}")
    m = client.get(f"/api/morphometry/{session_con_saco}", params={"candidate_id": "cand-001"})
    assert m.status_code == 200
    before = read_state(session_con_saco, "morpho.max_diameter_mm")
    assert before
    r = client.post(f"/api/detect/{session_con_saco}").json()
    assert r["morphometry_invalidated"] is False
    assert read_state(session_con_saco, "detect.selected_candidate") == "cand-001"
    assert read_state(session_con_saco, "morpho.max_diameter_mm") == before


def test_re_detectar_con_el_elegido_renumerado_sigue_al_sitio(session_con_saco):
    """Una sesión anterior a los vetos midió el sitio bajo otro id: mismo sitio,
    otro número. La elección se reescribe y la medida se conserva."""
    from services.sessions import read_state
    r1 = client.post(f"/api/detect/{session_con_saco}").json()
    client.get(f"/api/morphometry/{session_con_saco}", params={"candidate_id": "cand-001"})
    before = read_state(session_con_saco, "morpho.max_diameter_mm")
    assert before
    site = r1["candidates"][0]["center_mm"]
    # El estado antiguo: el sitio medido se llamaba cand-002 y estaba donde la
    # detección nueva pone cand-001.
    write_state(session_con_saco, "detect.selected_candidate", "cand-002")
    for a in "xyz":
        write_state(session_con_saco, f"detect.cand_002.centroid_{a}", str(site[a]))
    r = client.post(f"/api/detect/{session_con_saco}").json()
    assert r["morphometry_invalidated"] is False
    assert read_state(session_con_saco, "detect.selected_candidate") == "cand-001"
    assert read_state(session_con_saco, "morpho.max_diameter_mm") == before


def test_morfometria_sin_id_ni_eleccion_guarda_lo_medido(session_con_saco):
    from services.sessions import read_state
    client.post(f"/api/detect/{session_con_saco}")
    assert not read_state(session_con_saco, "detect.selected_candidate", "")
    m = client.get(f"/api/morphometry/{session_con_saco}")
    assert m.status_code == 200
    assert m.json()["candidate_id"] == "cand-001"
    assert read_state(session_con_saco, "detect.selected_candidate") == "cand-001"
