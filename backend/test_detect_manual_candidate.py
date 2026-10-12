# -*- coding: utf-8 -*-
"""F1-146: el punto marcado a mano que no coincide con ningún candidato pasa a
la lista como un candidato «marcado a mano».

Antes se guardaba la confirmación y nada más: la lista seguía sin un sitio que
elegir, y en un fallo del detector Morfometría quedaba cerrada. Ahora el punto
entra en `detect.*` con `channels = "manual"` (se lista, se elige, se guarda
con la sesión y se va al re-detectar). No tiene saco detectado que aislar, así
que la morfometría automática sobre él responde un 422 que dice qué hacer.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_manualcand_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest
from fastapi.testclient import TestClient

from eval.synthetic import saco_en_borde
from main import app
from services.database import Base, engine
from services.segmentation import write_vtp
from services.sessions import create_session, read_state, session_subdir, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)   # admin (conftest)

LEJOS = {"x": 500.0, "y": 500.0, "z": 500.0}
TEXTO_422 = ("Candidato marcado a mano: no hay saco detectado que aislar. "
             "Mide en Morfometría marcando el cuello y el ápice.")


@pytest.fixture
def sesion_detectada() -> tuple[str, dict]:
    sid = create_session()
    write_vtp(saco_en_borde()[0], session_subdir(sid, "meshes") / "vessel_tree.vtp")
    write_state(sid, "dicom.modality", "XA")
    r = client.post(f"/api/detect/{sid}")
    assert r.status_code == 200, r.text
    return sid, r.json()


def _listado(sid: str) -> dict:
    r = client.post(f"/api/detect/{sid}", params={"cached": "true"})
    assert r.status_code == 200, r.text
    return r.json()


def _ids(res: dict) -> list[str]:
    return [c["id"] for c in res["candidates"]] + [c["id"] for c in res["rejected"]]


def test_un_punto_lejano_se_lista_como_candidato_marcado_a_mano(sesion_detectada):
    sid, det = sesion_detectada
    n = len(_ids(det))
    assert det["rejected"], "el caso tiene descartados: el id nuevo va detrás de ellos"
    r = client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": LEJOS})
    assert r.status_code == 201, r.text
    j = r.json()
    nuevo = f"cand-{n + 1:03d}"
    assert j["candidate_id"] == nuevo
    # No estaba en la lista del detector: para la estadística sigue siendo un fallo.
    assert j["candidate_rank"] is None
    assert j["n_candidates"] == len(det["candidates"])

    lista = _listado(sid)
    # Los ids del detector no se mueven; el marcado a mano va con los aceptados.
    assert [i for i in _ids(lista) if i != nuevo] == _ids(det)
    assert [c["id"] for c in lista["candidates"]][-1] == nuevo
    manual = next(c for c in lista["candidates"] if c["id"] == nuevo)
    assert manual["channels"] == ["manual"] and manual["patch_kind"] == "manual"
    assert manual["max_diameter_mm"] == 0 and manual["dome_mesh_url"] == ""
    assert manual["center_mm"] == LEJOS and manual["veto"] is None


def test_volver_a_marcar_el_mismo_sitio_no_duplica(sesion_detectada):
    sid, det = sesion_detectada
    a = client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": LEJOS}).json()
    cerca = {"x": 501.0, "y": 500.0, "z": 500.0}
    b = client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": cerca}).json()
    assert b["candidate_id"] == a["candidate_id"]
    assert len(_ids(_listado(sid))) == len(_ids(det)) + 1


def test_el_candidato_marcado_a_mano_se_puede_confirmar(sesion_detectada):
    sid, _det = sesion_detectada
    cid = client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": LEJOS}).json()["candidate_id"]
    r = client.post("/api/ground-truth", json={"session_id": sid, "source": "candidate", "candidate_id": cid})
    assert r.status_code == 201, r.text
    assert r.json()["candidate_id"] == cid and r.json()["candidate_rank"] is None


def test_la_morfometria_automatica_sobre_el_dice_que_marques_cuello_y_apice(sesion_detectada):
    sid, _det = sesion_detectada
    cid = client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": LEJOS}).json()["candidate_id"]
    m = client.get(f"/api/morphometry/{sid}", params={"candidate_id": cid})
    assert m.status_code == 422
    assert m.json()["detail"] == TEXTO_422
    # No queda como «el medido»: el informe buscaría una malla que no existe.
    assert read_state(sid, "detect.selected_candidate", "") != cid


def test_re_detectar_lo_quita(sesion_detectada):
    sid, det = sesion_detectada
    client.post("/api/ground-truth", json={"session_id": sid, "source": "marked", "position": LEJOS})
    again = client.post(f"/api/detect/{sid}").json()
    assert _ids(again) == _ids(det)
    assert _ids(_listado(sid)) == _ids(det)
    assert read_state(sid, "detect.n_manual", "0") in ("", "0")
    assert all("manual" not in c["channels"] for c in _listado(sid)["candidates"])


def test_un_descartado_se_puede_confirmar_y_no_cuenta_como_puesto(sesion_detectada):
    sid, det = sesion_detectada
    cid = det["rejected"][0]["id"]
    r = client.post("/api/ground-truth", json={"session_id": sid, "source": "candidate", "candidate_id": cid})
    assert r.status_code == 201, r.text
    assert r.json()["candidate_id"] == cid and r.json()["candidate_rank"] is None


class TestMedirAMano:
    """Revisión de F1-146: el panel manda medir marcando cuello y ápice, así que
    esa medida tiene que funcionar sobre un candidato marcado a mano. La ruta
    del plano de cuello recorta `vessel_tree.vtp` y no necesita la malla del
    candidato, que este no tiene."""

    PLANO = {
        "origin": {"x": 0.0, "y": 3.0, "z": 0.0},
        "normal": [0.0, 1.0, 0.0],
        "dome_seed": {"x": 0.0, "y": 7.0, "z": 0.0},
    }

    def _sesion_fallo_del_detector(self) -> tuple[str, str]:
        """El árbol sintético de esfera sobre cilindro, con una detección que no
        encontró nada, y la lesión confirmada a mano en el domo."""
        from test_morphometry_sac import _vessel_tree
        sid = create_session()
        write_vtp(_vessel_tree(), session_subdir(sid, "meshes") / "vessel_tree.vtp")
        write_state(sid, "detect.n_candidates", "0")
        write_state(sid, "detect.n_rejected", "0")
        r = client.post("/api/ground-truth", json={
            "session_id": sid, "source": "marked", "position": {"x": 0.0, "y": 7.0, "z": 0.0}})
        assert r.status_code == 201, r.text
        return sid, r.json()["candidate_id"]

    def test_cuello_y_apice_miden_el_saco_del_candidato_marcado_a_mano(self):
        sid, cid = self._sesion_fallo_del_detector()
        assert cid == "cand-001"
        assert client.get(f"/api/morphometry/{sid}", params={"candidate_id": cid}).status_code == 422
        m = client.post(f"/api/morphometry/{sid}/neck-plane", json={**self.PLANO, "candidate_id": cid})
        assert m.status_code == 200, m.text
        j = m.json()
        assert j["neck_source"] == "manual" and j["reliable"] is True
        assert j["candidate_id"] == cid and 2.0 < j["neck_mm"] < 4.0
        assert read_state(sid, "detect.selected_candidate") == cid

    def test_reanudar_repite_la_medida_hecha_a_mano(self):
        sid, cid = self._sesion_fallo_del_detector()
        hecha = client.post(f"/api/morphometry/{sid}/neck-plane",
                            json={**self.PLANO, "candidate_id": cid}).json()
        # Con el id (volver a Morfometría) y sin él («Reanudar»): la misma medida.
        for params in ({"candidate_id": cid}, {}):
            r = client.get(f"/api/morphometry/{sid}", params=params)
            assert r.status_code == 200, r.text
            assert r.json()["candidate_id"] == cid
            assert r.json()["neck_source"] == "manual"
            assert r.json()["neck_mm"] == hecha["neck_mm"]

    def test_el_plano_de_otro_candidato_no_se_aplica_al_marcado_a_mano(self):
        sid, cid = self._sesion_fallo_del_detector()
        client.post(f"/api/morphometry/{sid}/neck-plane", json=self.PLANO)   # sin id: de otro sitio
        write_state(sid, "detect.selected_candidate", "")
        r = client.get(f"/api/morphometry/{sid}", params={"candidate_id": cid})
        assert r.status_code == 422 and r.json()["detail"] == TEXTO_422

    def test_un_id_que_no_esta_en_la_lista_se_rechaza(self):
        sid, _cid = self._sesion_fallo_del_detector()
        r = client.post(f"/api/morphometry/{sid}/neck-plane", json={**self.PLANO, "candidate_id": "cand-009"})
        assert r.status_code == 422
