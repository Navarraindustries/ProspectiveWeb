"""Segmentación en segundo plano y rastro en la cadena de lo que cambia el plan.

Antes `/api/segment` era una sola petición de minutos: detrás de un proxy con
un tiempo límite corto el navegador recibía un 504 mientras el servidor
terminaba igualmente y sustituía la malla, así que el panel decía «falló» con
la malla ya cambiada. Con `background=true` responde 202 al instante y el
resultado se recoge aparte.

Y la segmentación y la colocación de dispositivos —sobre las que se mide y se
decide todo lo demás— no dejaban ningún bloque en la cadena aunque las
constantes existían.
"""
from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from main import app
from services.audit import SkullChain
from services.coils import catalogue_to_api as coils_api
from services.sessions import create_session
from test_segment_tubular import _tube_series

client = TestClient(app, raise_server_exceptions=True)   # autenticado como admin (conftest)


def _body(sid: str, **over) -> dict:
    body = {"session_id": sid, "series_id": "", "lower": 300.0, "upper": 0.0,
            "smoothing": 3, "cleanup": 0, "main_tree_only": False, "method": "threshold"}
    body.update(over)
    return body


def _esperar(sid: str, limite_s: float = 120.0):
    fin = time.time() + limite_s
    while time.time() < fin:
        r = client.get(f"/api/segment/result/{sid}")
        if r.status_code != 409:
            return r
        time.sleep(0.2)
    raise AssertionError("la segmentación no terminó")


def _bloques(accion: str) -> list[dict]:
    out = []
    for b in SkullChain.instance().get_all_blocks():
        if b["action"] == accion:
            b["payload"] = json.loads(b["payload_json"])
            out.append(b)
    return out


class TestSegundoPlano:
    def test_responde_al_instante_y_el_resultado_se_recoge_aparte(self):
        sid = create_session(); _tube_series(sid)
        r = client.post("/api/segment?background=true", json=_body(sid))
        assert r.status_code == 202, r.text
        assert r.json()["result_url"] == f"/api/segment/result/{sid}"

        res = _esperar(sid)
        assert res.status_code == 200, res.text
        assert res.json()["vertices"] > 0

    def test_lo_que_se_comprueba_antes_falla_en_el_post(self):
        # Sin serie DICOM no se lanza nada: el error llega en la propia petición.
        sid = create_session()
        r = client.post("/api/segment?background=true", json=_body(sid))
        assert r.status_code == 422, r.text

    def test_el_error_del_trabajo_llega_con_su_codigo(self, monkeypatch):
        # Lo que falla DENTRO del trabajo llega al recogerlo con el código que
        # habría dado la petición síncrona, no como un 500 genérico.
        import routers.segment as seg

        def falla(*_a, **_k):
            raise ValueError("Umbral sin vóxeles")
        monkeypatch.setattr(seg, "_run_segmentation_sync", falla)
        sid = create_session(); _tube_series(sid)
        r = client.post("/api/segment?background=true", json=_body(sid))
        assert r.status_code == 202
        res = _esperar(sid)
        assert res.status_code == 422 and res.json()["detail"] == "Umbral sin vóxeles"

    def test_sin_nada_lanzado_es_404(self):
        sid = create_session()
        assert client.get(f"/api/segment/result/{sid}").status_code == 404

    def test_sin_background_sigue_siendo_sincrono(self):
        sid = create_session(); _tube_series(sid)
        r = client.post("/api/segment", json=_body(sid))
        assert r.status_code == 200 and r.json()["vertices"] > 0


class TestAuditoria:
    def test_la_segmentacion_queda_en_la_cadena(self):
        sid = create_session(); _tube_series(sid)
        assert client.post("/api/segment", json=_body(sid)).status_code == 200
        b = [x for x in _bloques("SEGMENTATION_COMPLETE") if x["payload"]["session_id"] == sid]
        assert b, "la segmentación no dejó bloque"
        assert b[-1]["username"] == "admin"
        assert b[-1]["payload"]["method"] == "threshold" and b[-1]["payload"]["vertices"] > 0

    def test_la_diferida_tambien(self):
        sid = create_session(); _tube_series(sid)
        client.post("/api/segment?background=true", json=_body(sid))
        assert _esperar(sid).status_code == 200
        assert [x for x in _bloques("SEGMENTATION_COMPLETE") if x["payload"]["session_id"] == sid]

    def test_colocar_coils_queda_en_la_cadena(self):
        sid = create_session()
        coil = coils_api()[0]["id"]
        r = client.post("/api/coils/plan", json={"session_id": sid, "placements": [
            {"coil_id": coil, "position": {"x": 0, "y": 0, "z": 0}, "packing_density": 0},
        ]})
        assert r.status_code == 200, r.text
        b = [x for x in _bloques("DEVICE_PLACED") if x["payload"]["session_id"] == sid]
        assert b and b[-1]["payload"]["kind"] == "coils"
        assert b[-1]["payload"]["coils"] == [coil] and b[-1]["username"] == "admin"
