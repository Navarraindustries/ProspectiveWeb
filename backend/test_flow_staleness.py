# -*- coding: utf-8 -*-
"""Una recomendación no puede sobrevivir a las medidas de las que salió.

`_clear_detection_state` ya lo protegía en la ruta de re-detectar, con el
razonamiento escrito al lado: «leaving them behind made the PDF recommend a
treatment for an aneurysm the same PDF reported as unmeasured». Faltaban las dos
rutas por las que ese mismo dato cambia de verdad en el uso normal.

**Volver a medir el cuello a mano.** La morfometría automática de un casquete
abierto da cuello 0. Se evalúa el tratamiento igualmente —el factor del cuello se
salta— y después se marca el plano y el cuello pasa a medir 3 mm. La
recomendación guardada seguía siendo la anterior.

**Recalcular el PHASES.** Desde que el atajo del aneurisma pequeño consulta la
banda de riesgo, corregir la hipertensión o una HSA previa cambia lo que el motor
habría contestado, y lo guardado no se enteraba.

En los dos casos se invalida SÓLO cuando el número cambia: reanudar una sesión
vuelve a pasar por la morfometría para reproducir el plano marcado a mano, y
borrar la decisión en cada lectura la haría desaparecer por abrir el paso.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_stale_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest

import test_morphometry_sac as M
from services.sessions import read_state
from services.treatment import LOCATIONS


def _decided(client, sid: str) -> dict:
    r = client.post("/api/treatment-decision", json={
        "session_id": sid, "location": LOCATIONS[1], "is_ruptured": False})
    assert r.status_code == 200, r.text
    return r.json()


def _stored(sid: str) -> str:
    return read_state(sid, "treatment.recommendation", "")


# ── 1. Volver a medir el cuello ───────────────────────────────────────────── #

class TestReMeasuringTheNeckInvalidatesTheDecision:
    def test_the_premise_the_automatic_neck_is_unusable_here(self):
        # Un casquete abierto: el cuello sale 0 y la recomendación se calcula
        # sin él. Es el punto de partida del fallo, no un caso rebuscado.
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        assert float(read_state(sid, "morpho.neck_mm", "0") or 0) == 0.0

    def test_a_hand_marked_neck_clears_the_earlier_recommendation(self):
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        assert _decided(client, sid)["recommendation"]
        assert _stored(sid), "la premisa: había una recomendación guardada"

        client.post(f"/api/morphometry/{sid}/neck-plane", json=M._NECK_PLANE_BODY)

        assert float(read_state(sid, "morpho.neck_mm")) > 2.0, "el cuello cambió"
        assert _stored(sid) == "", "y la recomendación anterior ya no describe este caso"

    def test_the_phases_score_goes_with_it(self):
        # Se calcula sobre las mismas medidas; dejarlo sería el mismo problema.
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        client.post("/api/phases", json={
            "session_id": sid, "population": "other", "hypertension": False,
            "age_years": 50, "size_mm": 8.0, "earlier_sah": False, "site": "ica"})
        _decided(client, sid)
        client.post(f"/api/morphometry/{sid}/neck-plane", json=M._NECK_PLANE_BODY)
        assert read_state(sid, "phases.json", "") == ""

    def test_replaying_the_same_measurement_keeps_it(self):
        # Reanudar una sesión vuelve a pedir la morfometría para reproducir el
        # plano marcado. Si eso borrase la decisión, abrir el paso la perdería.
        client, sid = M._session_with_synthetic_tree()
        client.post(f"/api/morphometry/{sid}/neck-plane", json=M._NECK_PLANE_BODY)
        _decided(client, sid)
        antes = _stored(sid)
        assert antes

        client.get(f"/api/morphometry/{sid}")          # la relectura del reanudar
        assert _stored(sid) == antes


# ── 2. Recalcular el PHASES ───────────────────────────────────────────────── #

class TestRecomputingPhasesInvalidatesTheDecision:
    BASE = dict(population="other", hypertension=False, age_years=50,
                size_mm=2.8, earlier_sah=False, site="ica")

    def _phases(self, client, sid: str, **over):
        body = dict(self.BASE, session_id=sid)
        body.update(over)
        r = client.post("/api/phases", json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def test_a_changed_risk_clears_the_decision_that_consulted_it(self):
        # El atajo del aneurisma pequeño devuelve «vigilancia» o «discusión
        # multidisciplinaria» según la banda, así que la banda es una entrada.
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        bajo = self._phases(client, sid)
        assert bajo["risk_band"] == "low"
        _decided(client, sid)
        assert _stored(sid)

        alto = self._phases(client, sid, population="finland",
                            hypertension=True, earlier_sah=True,
                            site="aca_pcom_posterior")
        assert alto["risk_band"] == "high", "la premisa: el riesgo cambia de banda"
        assert _stored(sid) == ""

    def test_recomputing_the_same_score_keeps_it(self):
        # Volver a abrir la calculadora y pulsar sin tocar nada no puede borrar
        # una decisión.
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        self._phases(client, sid)
        _decided(client, sid)
        antes = _stored(sid)
        assert antes

        self._phases(client, sid)
        assert _stored(sid) == antes

    def test_a_first_score_does_not_clear_anything(self):
        # Sin score previo no hay nada que contradecir: calcularlo por primera
        # vez después de decidir no invalida la decisión, la completa.
        client, sid = M._session_with_synthetic_tree()
        client.get(f"/api/morphometry/{sid}")
        _decided(client, sid)
        antes = _stored(sid)
        self._phases(client, sid)
        assert _stored(sid) == antes
