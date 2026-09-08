# -*- coding: utf-8 -*-
"""Qué dice el motor de tratamiento, y de dónde dice que lo saca.

Tres cosas que estaban mal y no eran bugs de cálculo, sino de honestidad.

1. **«Tratar o vigilar» se decidía sobre un milímetro.** El atajo de menos de
   3 mm devolvía «vigilancia activa» con confianza Alta sin mirar el PHASES que
   el paso de morfometría ya había calculado. Dos pacientes con el mismo
   aneurisma de 2.8 mm y riesgos a cinco años de 17.0 % y 0.4 % —42 veces— salían
   con el mismo veredicto y la misma confianza.
2. **Los pesos no decían de dónde venían.** Los umbrales están mayormente
   publicados; los números (25, 20, 15…) no los atribuye nada, y cuatro factores
   proceden de literatura de RIESGO DE ROTURA, no de elección de modalidad.
3. **El razonamiento se tiraba.** `notes` se calculaba y no salía del motor: ni
   la pantalla ni el informe lo vieron nunca.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_treatment_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from models.phases import PhasesRequest
from services.database import Base, engine
from services.phases import compute_phases
from services.sessions import create_session, read_state, write_state
from services.treatment import (LOCATION_ACA_ACOA, LOCATION_MCA, _SOURCE,
                                compute_decision)

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

SMALL = dict(neck_mm=2.0, aspect_ratio=1.8, dnr=2.2, max_diameter_mm=2.8,
             bottleneck_factor=1.9, undulation_index=0.08)


def _phases(**over) -> dict:
    base = dict(population="other", hypertension=False, age_years=45,
                size_mm=2.8, earlier_sah=False, site="ica")
    base.update(over)
    return compute_phases(PhasesRequest(**base)).model_dump()


HIGH = _phases(population="finland", hypertension=True, earlier_sah=True,
               site="aca_pcom_posterior")          # PHASES 14 → 17.0 %
LOW = _phases()                                     # PHASES 0  → 0.4 %


# ── 1. El riesgo de rotura entra en «tratar o vigilar» ────────────────────── #

class TestSmallAneurysmConsultsThePhasesScore:
    def test_the_premise_two_patients_forty_two_times_apart(self):
        assert HIGH["risk_5yr_pct"] == pytest.approx(17.0)
        assert LOW["risk_5yr_pct"] == pytest.approx(0.4)
        assert HIGH["risk_band"] == "high" and LOW["risk_band"] == "low"

    def test_a_high_rupture_risk_is_not_answered_with_surveillance(self):
        d = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=HIGH)
        assert d["recommendation_key"] == "mdt"
        assert d["confidence"] == "Baja"
        assert any("17.0" in n for n in d["notes"]), d["notes"]

    def test_a_low_rupture_risk_still_gets_surveillance(self):
        d = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=LOW)
        assert d["recommendation_key"] == "surveillance"
        assert d["confidence"] == "Alta"
        assert any("0.4" in n for n in d["notes"]), d["notes"]

    def test_the_two_patients_no_longer_get_the_same_answer(self):
        # El fallo, en una línea.
        a = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=HIGH)
        b = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=LOW)
        assert (a["recommendation_key"], a["confidence"]) != \
               (b["recommendation_key"], b["confidence"])

    def test_without_a_phases_score_it_says_so_instead_of_claiming_certainty(self):
        d = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=None)
        assert d["recommendation_key"] == "surveillance"
        assert d["confidence"] == "Baja", "sin riesgo estimado no hay confianza alta"
        assert any("PHASES" in n for n in d["notes"])

    def test_a_ruptured_aneurysm_is_never_a_surveillance_case(self):
        # PHASES está validado en aneurismas incidentales; sobre uno roto no dice
        # nada, y el tamaño no reabre la pregunta de vigilar.
        d = compute_decision(**SMALL, location=LOCATION_ACA_ACOA,
                             ruptured=True, phases=LOW)
        assert d["recommendation_key"] != "surveillance"
        assert any("roto" in n.lower() for n in d["notes"])


# ── 2. Cada peso dice de dónde sale ───────────────────────────────────────── #

class TestEveryWeightCarriesItsProvenance:
    def _factors(self):
        return compute_decision(neck_mm=6.0, aspect_ratio=1.1, dnr=1.2,
                                max_diameter_mm=8.0, bottleneck_factor=1.1,
                                undulation_index=0.25, location=LOCATION_MCA,
                                ruptured=True)["factors"]

    def test_no_factor_arrives_without_a_source(self):
        assert all(f["source"] for f in self._factors())

    def test_the_heuristic_weights_admit_it(self):
        # Un 25 sin procedencia se lee como si estuviera derivado de algo.
        assert all("heurístico" in f["source"].lower() for f in self._factors())

    def test_the_shape_indices_say_which_question_they_answer(self):
        # AR, BF y UI vienen de literatura de riesgo de ROTURA, no de elección
        # de modalidad. Es la extrapolación más grande del motor.
        for key in ("ar", "bf", "ui"):
            assert "ROTURA" in _SOURCE[key]
            assert "no está validado" in _SOURCE[key] or "No validado" in _SOURCE[key]

    def test_the_published_thresholds_are_credited(self):
        assert "Brinjikji" in _SOURCE["neck"] and "Brinjikji" in _SOURCE["dnr"]
        assert "Clase I" in _SOURCE["ruptured"]

    def test_the_small_aneurysm_cutoff_does_not_pretend_to_be_a_guideline(self):
        assert "heurístico" in _SOURCE["small"].lower()
        assert "ESO 2022" in _SOURCE["small"]


# ── 3. El resultado dice lo que se ha sumado ──────────────────────────────── #

class TestTheNumbersAreWhatWasActuallyAdded:
    def _d(self):
        return compute_decision(neck_mm=6.0, aspect_ratio=1.1, dnr=1.2,
                                max_diameter_mm=8.0, bottleneck_factor=1.1,
                                undulation_index=0.25, location=LOCATION_MCA)

    def test_the_raw_points_are_published(self):
        d = self._d()
        clip = sum(f["points"] for f in d["factors"] if f["direction"] == "clip")
        endo = sum(f["points"] for f in d["factors"] if f["direction"] == "endo")
        assert d["clip_points"] == clip and d["endo_points"] == endo
        assert d["balance"] == clip - endo

    def test_the_percentage_is_only_the_ratio_of_those_points(self):
        # Se conserva para dibujar una barra proporcional; lo que deja de
        # imprimirse como cifra es el porcentaje.
        d = self._d()
        total = d["clip_points"] + d["endo_points"]
        assert d["clip_pct"] == round(d["clip_points"] / total * 100)
        assert d["clip_pct"] + d["endo_pct"] == 100

    def test_the_reasoning_leaves_the_engine(self):
        # `notes` se calculaba y se descartaba en el serialiser.
        d = compute_decision(**SMALL, location=LOCATION_ACA_ACOA, phases=None)
        assert d["notes"] and isinstance(d["notes"], list)


# ── 4. De extremo a extremo, por el endpoint ──────────────────────────────── #

class TestThePhasesScoreTravelsFromTheMorphometryStep:
    def _session(self, phases: dict | None) -> str:
        sid = create_session()
        for k, v in (("morpho.neck_mm", "2.0"), ("morpho.ar", "1.8"),
                     ("morpho.dnr", "2.2"), ("morpho.max_diameter_mm", "2.8"),
                     ("morpho.bf", "1.9"), ("morpho.ui", "0.08")):
            write_state(sid, k, v)
        if phases is not None:
            write_state(sid, "phases.json", json.dumps(phases))
        return sid

    def _decide(self, sid: str) -> dict:
        r = client.post("/api/treatment-decision", json={
            "session_id": sid, "location": LOCATION_ACA_ACOA,
            "is_ruptured": False, "patient_age": 45, "has_comorbidities": False})
        assert r.status_code == 200, r.text
        return r.json()

    def test_the_endpoint_reads_the_stored_score(self):
        assert self._decide(self._session(HIGH))["recommendation_key"] == "mdt"
        assert self._decide(self._session(LOW))["recommendation_key"] == "surveillance"

    def test_the_notes_and_the_points_are_persisted_for_the_report(self):
        sid = self._session(HIGH)
        self._decide(sid)
        assert json.loads(read_state(sid, "treatment.notes_json", "[]"))
        assert read_state(sid, "treatment.clip_points", "") != ""

    def test_the_sources_are_persisted_with_the_factors(self):
        sid = self._session(LOW)
        write_state(sid, "morpho.max_diameter_mm", "8.0")   # un caso con factores
        self._decide(sid)
        factors = json.loads(read_state(sid, "treatment.factors_json", "[]"))
        assert factors and all(f.get("source") for f in factors)

    def test_clearing_the_decision_also_clears_them(self):
        sid = self._session(HIGH)
        self._decide(sid)
        assert client.delete(f"/api/treatment-decision/{sid}").status_code in (200, 204)
        assert read_state(sid, "treatment.notes_json", "") == ""
        assert read_state(sid, "treatment.clip_points", "") == ""
