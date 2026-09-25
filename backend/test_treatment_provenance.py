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

    def test_every_weight_that_votes_admits_it_is_heuristic(self):
        # Un 25 sin procedencia se lee como si estuviera derivado de algo.
        votantes = [f for f in self._factors() if f["votes"]]
        assert votantes
        assert all("heurístico" in f["source"].lower() for f in votantes)

    def test_the_shape_indices_do_not_vote_and_say_why(self):
        # AR, BF y UI vienen de literatura de riesgo de ROTURA, no de elección
        # de modalidad. Se enseñan —borrar una medida la esconde— pero no suman.
        for key in ("ar", "bf", "ui"):
            assert "ROTURA" in _SOURCE[key]
            assert "Ya no vota" in _SOURCE[key]
            assert "sin validación para elegir modalidad" in _SOURCE[key]
        mudos = [f for f in self._factors() if not f["votes"]]
        # Cuatro: los tres índices de forma más el DNR, que desde que el cuello
        # y él son un solo criterio se enseña sin volver a puntuar.
        assert len(mudos) == 4
        assert all(f["points"] == 0 for f in mudos)

    def test_the_aspect_ratio_says_the_evidence_points_the_other_way(self):
        # Daba +20 a endovascular llamándolo «geometría favorable para coiling»,
        # y la evidencia más directa sobre el AR y el coiling es que un AR ≥ 1.6
        # multiplica por cuatro las probabilidades de recanalización.
        assert "RECANALIZACIÓN" in _SOURCE["ar"]
        assert "4.15" in _SOURCE["ar"]

    def test_the_published_thresholds_are_credited(self):
        assert "Brinjikji" in _SOURCE["neck"]
        assert "Clase I" in _SOURCE["ruptured"]

    def test_the_neck_and_the_dnr_are_one_criterion_and_say_so(self):
        # Eran dos factores que medían la misma cosa —el DNR es domo ÷ cuello—
        # y entre los dos se llevaban 40 puntos, más que la rotura. Y no eran
        # dos criterios: son las dos mitades de la definición de cuello ancho.
        assert "O DNR < 2" in _SOURCE["neck"]
        assert "una sola vez" in _SOURCE["neck"]
        assert "Ya no es un factor propio" in _SOURCE["dnr"]

    def test_the_clinical_grades_say_who_scores_them_now(self):
        for key in ("wfns", "fisher"):
            assert "Ya no puntúa aquí" in _SOURCE[key]
            assert "JSDB" in _SOURCE[key]

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

    def test_the_reasoning_is_persisted_and_the_sum_is_not(self):
        # Las notas son el razonamiento y viajan al informe. El sumatorio ya no
        # se guarda: no se enseña ni se imprime, y dejarlo en el estado era
        # dejar la puerta abierta a que volviera por el PDF.
        sid = self._session(HIGH)
        self._decide(sid)
        assert json.loads(read_state(sid, "treatment.notes_json", "[]"))
        assert read_state(sid, "treatment.clip_points", "") == ""
        assert read_state(sid, "treatment.clip_pct", "") == ""

    def test_the_sources_are_persisted_with_the_factors(self):
        sid = self._session(LOW)
        write_state(sid, "morpho.max_diameter_mm", "8.0")   # un caso con factores
        self._decide(sid)
        factors = json.loads(read_state(sid, "treatment.factors_json", "[]"))
        assert factors and all(f.get("source") for f in factors)
        assert not any("points" in f for f in factors), (
            "un factor con su peso dentro es un puntaje por la puerta de atrás"
        )

    def test_clearing_the_decision_also_clears_them(self):
        sid = self._session(HIGH)
        self._decide(sid)
        assert client.delete(f"/api/treatment-decision/{sid}").status_code in (200, 204)
        assert read_state(sid, "treatment.notes_json", "") == ""
        assert read_state(sid, "treatment.clip_points", "") == ""


# ── 5. Faltar un dato no es lo mismo que no inclinar ──────────────────────── #

class TestTheScoreSaysHowMuchOfTheCaseItSaw:
    """Nada es obligatorio, y dos de los datos no pueden serlo.

    WFNS gradúa una hemorragia y Fisher la sangre del TC: en un aneurisma
    incidental no existen. Lo que había que arreglar no era eso, era que la
    confianza salía de |saldo| y el saldo crece sumando factores. Con un único
    dato —el cuello— el motor emitía «CLIPPING QUIRÚRGICO» con confianza
    Moderada: un veredicto sobre una sola medida, presentado como medio fiable.
    """

    MORFO = dict(neck_mm=6.5, aspect_ratio=1.1, dnr=1.2, max_diameter_mm=8.0,
                 bottleneck_factor=1.1, undulation_index=0.25)

    def test_a_full_case_is_full_coverage(self):
        d = compute_decision(**self.MORFO, location=LOCATION_MCA, patient_age=55)
        assert d["coverage_pct"] == 100
        assert d["missing_inputs"] == []

    def test_one_measurement_alone_is_not_a_confident_verdict(self):
        d = compute_decision(neck_mm=6.5, aspect_ratio=0.0, dnr=0.0,
                             max_diameter_mm=0.0, bottleneck_factor=0.0,
                             undulation_index=0.0)
        assert d["coverage_pct"] < 50
        assert d["confidence"] == "Baja", "antes salía Moderada con un solo dato"

    def test_confidence_is_capped_by_what_was_not_seen(self):
        # Mismo saldo, distinta cobertura: la de menos datos no puede declarar
        # más certeza. El acuerdo entre factores no sustituye a los que faltan.
        partial = compute_decision(neck_mm=6.5, aspect_ratio=1.1, dnr=0.0,
                                   max_diameter_mm=0.0, bottleneck_factor=0.0,
                                   undulation_index=0.0, location=LOCATION_MCA)
        full = compute_decision(**self.MORFO, location=LOCATION_MCA, patient_age=55)
        assert partial["coverage_pct"] < full["coverage_pct"]
        assert partial["confidence"] != "Alta"

    def test_it_names_what_is_missing(self):
        d = compute_decision(neck_mm=6.5, aspect_ratio=0.0, dnr=0.0,
                             max_diameter_mm=0.0, bottleneck_factor=0.0,
                             undulation_index=0.0)
        assert "localización" in d["missing_inputs"]
        assert "edad del paciente" in d["missing_inputs"]
        assert any("Evaluado el" in n for n in d["notes"])

    def test_a_neutral_factor_is_not_a_missing_one(self):
        # Un diámetro de 8 mm cae en la franja neutra y no suma puntos, pero es
        # un dato conocido: el motor lo miró y decidió que no inclina.
        d = compute_decision(neck_mm=6.5, aspect_ratio=1.1, dnr=1.2,
                             max_diameter_mm=8.0, bottleneck_factor=1.1,
                             undulation_index=0.25, location=LOCATION_MCA,
                             patient_age=55)
        assert "diámetro máximo" not in d["missing_inputs"]
        assert not any(f["name"].startswith("Aneurisma") for f in d["factors"])

    def test_the_engine_no_longer_asks_for_the_clinical_grades(self):
        # Se los lleva el JSDB. Pedirlos en los dos sitios haría que faltar un
        # dato bajase dos barras de cobertura distintas por el mismo motivo.
        roto = compute_decision(**self.MORFO, location=LOCATION_MCA,
                                patient_age=55, ruptured=True)
        assert "grado WFNS" not in roto["missing_inputs"]
        assert "grado de Fisher" not in roto["missing_inputs"]
        # Pero alguien sí los echa en falta, y dice cuántos le faltan.
        assert "grado WFNS" in roto["jsdb"]["missing"]
        assert "grado de Fisher" in roto["jsdb"]["missing"]
        assert roto["jsdb"]["known_pct"] < 100

    def test_the_verdict_is_still_produced_without_them(self):
        # No son obligatorios: se contesta con lo que hay y se dice cuánto era.
        roto = compute_decision(**self.MORFO, location=LOCATION_MCA, ruptured=True)
        assert roto["recommendation_key"] in ("clip", "endo", "mdt")
        assert roto["coverage_pct"] > 0

    def test_the_age_stops_counting_twice_on_a_ruptured_aneurysm(self):
        # Los cortes 72/80 del motor SON los del JSDB. En un roto aplica el
        # modelo entero, así que la copia a mano deja de votar; en un
        # incidental el JSDB no aplica y la copia es lo único que hay.
        electivo = compute_decision(**self.MORFO, location=LOCATION_MCA,
                                    ruptured=False, patient_age=82)
        roto = compute_decision(**self.MORFO, location=LOCATION_MCA,
                                ruptured=True, patient_age=82)
        assert any("Edad" in f["name"] for f in electivo["factors"])
        assert not any("Edad" in f["name"] for f in roto["factors"])
        # Los puntos del JSDB ya no salen serializados — no se enseñan— así que
        # se comprueban donde viven ahora, que es el objeto del modelo.
        from services.jsdb import jsdb_scores
        jr = jsdb_scores(ruptured=True, age=82, location=LOCATION_MCA,
                         max_diameter_mm=self.MORFO["max_diameter_mm"])
        assert jr.clip.points >= 1, "pero el JSDB sí la cuenta"
        assert "edad del paciente" not in roto["missing_inputs"]


# ── 6. El grado clínico, y lo que pesa la rotura ──────────────────────────── #

class TestTheClinicalGradesAndTheWeightOfRupture:
    NEUTRAL = dict(neck_mm=0.0, aspect_ratio=0.0, dnr=0.0, max_diameter_mm=8.0,
                   bottleneck_factor=0.0, undulation_index=0.0)

    def test_a_ruptured_mca_no_longer_falls_to_clipping_on_location_alone(self):
        # Era el punto donde el motor contradecía a la guía: rotura valía 15 y
        # una localización en ACM valía 20, así que la volteaba ella sola pese a
        # apoyarse en una recomendación Clase I nivel A.
        electivo = compute_decision(**self.NEUTRAL, location=LOCATION_MCA)
        roto = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, ruptured=True)
        assert electivo["recommendation_key"] == "clip"
        assert roto["recommendation_key"] != "clip"

    def test_no_single_factor_outweighs_the_class_I_recommendation(self):
        # La regla con la que se eligió el 30, escrita para que se pueda discutir.
        from services.treatment import _MAX_WEIGHT
        others = {k: v for k, v in _MAX_WEIGHT.items() if k != "ruptured"}
        assert _MAX_WEIGHT["ruptured"] > max(others.values())

    def test_a_poor_grade_no_longer_moves_the_heuristic_balance(self):
        # Movía el saldo con un peso elegido a ojo. Ahora lo mueve el modelo
        # ajustado, que es donde esa variable estaba medida desde el principio.
        base = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, ruptured=True)
        malo = compute_decision(**self.NEUTRAL, location=LOCATION_MCA,
                                ruptured=True, wfns_grade=5)
        assert malo["balance"] == base["balance"]
        # El modelo sigue contándolo por dentro, que es lo que se comprueba:
        # sus puntos ya no se serializan porque no se enseñan.
        from services.jsdb import jsdb_scores
        jr_base = jsdb_scores(ruptured=True, location=LOCATION_MCA)
        jr_malo = jsdb_scores(ruptured=True, location=LOCATION_MCA, wfns_grade=5)
        assert jr_malo.clip.points > jr_base.clip.points
        assert jr_malo.coil.points > jr_base.coil.points

    def test_a_poor_grade_is_shown_even_though_it_does_not_vote_here(self):
        # Borrarlo de la pantalla porque cambió de dueño lo escondería.
        malo = compute_decision(**self.NEUTRAL, location=LOCATION_MCA,
                                ruptured=True, wfns_grade=5)
        grado = [f for f in malo["factors"] if "Grado clínico" in f["name"]]
        assert grado and not grado[0]["votes"]
        assert "WFNS 5" in grado[0]["name"]

    def test_fisher_four_penalises_only_the_endovascular_arm(self):
        # Sangre voluminosa: el modelo penaliza ahí al coiling, porque el
        # clipaje permite evacuarla en el mismo acto. Es asimétrico, y el peso
        # heurístico de 10 puntos que había no capturaba esa asimetría.
        from services.jsdb import jsdb_scores
        sin_ = jsdb_scores(ruptured=True, location=LOCATION_MCA, wfns_grade=5)
        con = jsdb_scores(ruptured=True, location=LOCATION_MCA, wfns_grade=5,
                          fisher_grade=4)
        assert con.coil.points > sin_.coil.points
        assert con.clip.points == sin_.clip.points

    def test_the_grades_are_ignored_on_an_unruptured_aneurysm(self):
        # No es que se descarten por prudencia: es que no existen.
        a = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, ruptured=False)
        b = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, ruptured=False,
                             wfns_grade=5, fisher_grade=4)
        assert a["balance"] == b["balance"]
        assert len(a["factors"]) == len(b["factors"])

    def test_advanced_age_leans_endovascular_but_not_hard(self):
        # El metaanálisis de 2025 sobre 51 415 pacientes no halló diferencia de
        # resultado en ≥60 años, así que el peso es contenido a propósito.
        from services.treatment import _MAX_WEIGHT
        assert _MAX_WEIGHT["age"] < min(v for k, v in _MAX_WEIGHT.items()
                                        if k != "age")
        joven = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, patient_age=50)
        mayor = compute_decision(**self.NEUTRAL, location=LOCATION_MCA, patient_age=82)
        assert mayor["balance"] < joven["balance"]

    def test_the_grades_left_the_weight_table_with_their_factors(self):
        # Si una variable deja de votar y se queda en la tabla de pesos, sigue
        # bajando la cobertura por un dato que ya no usa nadie aquí.
        from services.treatment import _MAX_WEIGHT
        assert "wfns" not in _MAX_WEIGHT and "fisher" not in _MAX_WEIGHT
        assert "dnr" not in _MAX_WEIGHT, "el cuello y el DNR son un solo grupo"


# ── 7. Lo que la imagen no puede ver, dicho por anatomía ──────────────────── #

class TestTheExpectedPerforatorTerritory:
    """Una perforante mide 0,1-0,5 mm y el vóxel de una angio-TC ronda 0,5-1,0.

    Medido sobre los estudios de este proyecto: una de 0,3 mm ocupa el 8 % de un
    vóxel de 0,96 mm y el 28 % de uno de 0,50, y con lumen a ~350 HU sobre
    parénquima a ~40 el vóxel se lee a 64 y 128 HU. No hay umbral que lo separe
    del ruido. Así que no se detecta: se sabe por dónde está el aneurisma.
    """

    def _perf(self, location: str):
        return compute_decision(neck_mm=6.0, aspect_ratio=1.4, dnr=1.8,
                                max_diameter_mm=9.0, bottleneck_factor=1.5,
                                undulation_index=0.1,
                                location=location)["perforators"]

    def test_the_basilar_apex_names_what_costs_most(self):
        from services.treatment import LOCATION_BASILAR

        t = self._perf(LOCATION_BASILAR)
        assert "alamoperforantes" in t["arteries"]
        assert "coma" in t["consequence"]
        assert t["sources"], "una tabla clínica sin fuente es una opinión"

    def test_the_acom_names_the_recurrent_artery(self):
        from services.treatment import LOCATION_ACA_ACOA

        t = self._perf(LOCATION_ACA_ACOA)
        assert "Heubner" in t["arteries"]

    def test_the_mca_names_the_lenticulostriates(self):
        t = self._perf(LOCATION_MCA)
        assert "entriculoestriadas" in t["arteries"] or "enticuloestriadas" in t["arteries"]

    def test_where_it_does_not_apply_it_says_so(self):
        # Un silencio en la carótida cavernosa significa algo distinto que en la
        # basilar, y callarlo igual en las dos sería perder esa diferencia.
        from services.treatment import LOCATION_ICA_PROX

        t = self._perf(LOCATION_ICA_PROX)
        assert t is not None
        assert "Sin perforantes cerebrales" in t["arteries"]

    def test_no_location_invents_no_territory(self):
        from services.treatment import LOCATION_UNKNOWN

        assert self._perf(LOCATION_UNKNOWN) is None

    def test_every_territory_that_claims_a_risk_carries_a_source(self):
        from services.perforator_anatomy import TERRITORIES

        for loc, t in TERRITORIES.items():
            if "Sin perforantes" in t.arteries:
                continue          # la entrada que dice que aquí no aplica
            assert t.sources, f"{loc} afirma un riesgo sin fuente"
