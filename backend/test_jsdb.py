# -*- coding: utf-8 -*-
"""El Japan Stroke Data Bank, y lo que su llegada arregla.

Tres cosas que estaban mal, y ninguna era un error de cálculo.

1. **El motor tenía una copia a mano de este modelo.** Los factores 9, 10 y 11
   —edad, WFNS y Fisher— salían de aquí: los cortes de 72 y 80 años son
   literalmente los suyos. Estaban peor resueltos (dos niveles de WFNS en vez
   de tres, pesos elegidos a ojo) y, sobre todo, sumaban en el mismo saldo. Con
   el modelo real dentro, mantenerlos sería contar lo mismo dos veces.
2. **El motor solo sabe restar.** Devuelve un saldo, así que un 0 significa
   «empate» y jamás «las dos vías van mal». Dos puntuaciones separadas sí
   pueden decirlo, y es la señal que de verdad manda un caso a sesión.
3. **Faltaba una variable que no estaba en ninguna parte de la aplicación.**
   El ictus previo. Lo más parecido era `earlier_sah` del PHASES, que es otra
   cosa más estrecha.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_jsdb_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from services.jsdb import (AGE_CLIP, AGE_COIL, MAX_CLIP, MAX_COIL,
                           POOR_THRESHOLD, jsdb_scores)
from services.treatment import (LOCATION_BASILAR, LOCATION_MCA,
                                LOCATION_PCOM, LOCATION_UNKNOWN,
                                compute_decision)

MORFO = dict(neck_mm=4.5, aspect_ratio=1.4, dnr=1.8, max_diameter_mm=9.0,
             bottleneck_factor=1.5, undulation_index=0.12)


# ── 1. Dónde aplica, y dónde decir que no ─────────────────────────────────── #

class TestItOnlyClaimsWhatItsCohortSupports:
    def test_an_unruptured_aneurysm_gets_nothing(self):
        # Los 3 547 pacientes son todos HSA. Sobre un incidental este modelo no
        # dice nada, y eso no es un hueco que rellenar.
        assert jsdb_scores(ruptured=False, age=80, wfns_grade=5) is None

    def test_two_zeros_would_have_been_a_claim(self):
        # Devolver 0 y 0 diría «las dos vías salen impecables», que es una
        # afirmación. None dice «aquí no me preguntes».
        d = compute_decision(**MORFO, location=LOCATION_MCA, ruptured=False,
                             patient_age=85, wfns_grade=5, fisher_grade=4)
        assert d["jsdb"] is None

    def test_a_ruptured_aneurysm_gets_both_scores(self):
        d = compute_decision(**MORFO, location=LOCATION_MCA, ruptured=True,
                             patient_age=60, wfns_grade=2, fisher_grade=2,
                             prior_stroke=0)
        # Los topes del modelo se comprueban donde viven: los puntos dejaron de
        # serializarse cuando se retiraron los puntajes de la pantalla.
        assert jsdb_scores(ruptured=True).clip.max_points == MAX_CLIP
        assert jsdb_scores(ruptured=True).coil.max_points == MAX_COIL
        # Y lo que SÍ sale del motor: las dos vías descritas, sin cifras.
        assert d["jsdb"]["clip"]["label"] and d["jsdb"]["coil"]["label"]
        assert "points" not in d["jsdb"]["clip"]


# ── 2. Las asimetrías del modelo, que un solo saldo no puede representar ──── #

class TestTheModelIsAsymmetricAndThatIsThePoint:
    def _r(self, **over):
        # La ACoP no penaliza a ninguna de las dos vías en este modelo, y es un
        # dato CONOCIDO: sirve de cero verdadero. Con la ACM de base, cada
        # prueba de una variable suelta arrastraba el punto de la localización.
        base = dict(ruptured=True, age=60, prior_stroke=0, wfns_grade=1,
                    fisher_grade=1, max_diameter_mm=8.0, location=LOCATION_PCOM)
        base.update(over)
        return jsdb_scores(**base)

    def test_the_baseline_really_is_zero(self):
        r = self._r()
        assert r.clip.points == 0 and r.coil.points == 0 and r.missing == []

    def test_age_penalises_clipping_eight_years_before_coiling(self):
        assert AGE_CLIP == 72 and AGE_COIL == 80
        r = self._r(age=75)
        assert r.clip.points == 1, "a los 75 el clipaje ya paga"
        assert r.coil.points == 0, "y el coiling todavía no"

    def test_one_previous_stroke_penalises_only_coiling(self):
        r = self._r(prior_stroke=1)
        assert r.coil.points == 1
        assert r.clip.points == 0, "al clipaje le penaliza desde el segundo"
        r2 = self._r(prior_stroke=2)
        assert r2.clip.points == 1 and r2.coil.points == 1

    def test_fisher_four_penalises_only_coiling(self):
        # Con hematoma voluminoso el clipaje puede evacuarlo en el mismo acto.
        r = self._r(fisher_grade=4)
        assert r.coil.points == 1 and r.clip.points == 0

    def test_size_over_fifteen_penalises_only_clipping(self):
        r = self._r(max_diameter_mm=18.0)
        assert r.clip.points == 1 and r.coil.points == 0

    def test_location_penalises_opposite_routes(self):
        posterior = self._r(location=LOCATION_BASILAR)
        anterior = self._r(location=LOCATION_MCA)
        assert posterior.clip.points == 1 and posterior.coil.points == 0
        assert anterior.coil.points == 1 and anterior.clip.points == 0

    def test_wfns_is_the_heaviest_variable_and_reaches_three(self):
        assert self._r(wfns_grade=5).clip.points == 3
        assert self._r(wfns_grade=5).coil.points == 3
        # Y difieren en el grado bajo: el clipaje ya paga en II, el coiling no.
        assert self._r(wfns_grade=2).clip.points == 1
        assert self._r(wfns_grade=2).coil.points == 0


# ── 3. Lo que el motor estructuralmente no puede decir ────────────────────── #

class TestItCanSayBothRoutesLookBad:
    def test_a_balance_of_zero_never_meant_both_bad(self):
        # El motor devuelve una resta. Ese es el límite, y es estructural.
        d = compute_decision(**MORFO, location=LOCATION_BASILAR, ruptured=True,
                             patient_age=84, wfns_grade=5, fisher_grade=4,
                             prior_stroke=3)
        assert d["jsdb"]["both_poor"] is True
        jr = jsdb_scores(ruptured=True, location=LOCATION_BASILAR, age=84,
                         wfns_grade=5, fisher_grade=4, prior_stroke=3,
                         max_diameter_mm=MORFO["max_diameter_mm"])
        assert jr.clip.points >= POOR_THRESHOLD
        assert jr.coil.points >= POOR_THRESHOLD
        assert any("DOS vías" in n for n in d["notes"])

    def test_a_good_case_is_not_flagged(self):
        d = compute_decision(**MORFO, location=LOCATION_MCA, ruptured=True,
                             patient_age=45, wfns_grade=1, fisher_grade=1,
                             prior_stroke=0)
        assert d["jsdb"]["both_poor"] is False

    def test_disagreement_with_the_engine_is_said_out_loud(self):
        # Fisher 4 y ACM penalizan al coiling en el modelo; la rotura empuja a
        # endovascular en el motor. Que discrepen no es un fallo de ninguno
        # —miran cosas distintas— pero callarlo sí lo sería.
        d = compute_decision(neck_mm=3.0, aspect_ratio=1.4, dnr=2.5,
                             max_diameter_mm=8.0, bottleneck_factor=1.5,
                             undulation_index=0.1, location=LOCATION_MCA,
                             ruptured=True, patient_age=60, wfns_grade=1,
                             fisher_grade=4, prior_stroke=1)
        assert d["recommendation_key"] == "endo"
        assert d["jsdb"]["favours"] == "clip"
        assert any("DISCREPANCIA" in n for n in d["notes"])


# ── 4. Qué parte del modelo se ha podido rellenar ─────────────────────────── #

class TestItDeclaresWhatItCouldNotSee:
    def test_a_bare_case_names_every_missing_variable(self):
        r = jsdb_scores(ruptured=True)
        assert r.known_pct == 0
        for v in ("edad", "ictus previo", "grado WFNS", "grado de Fisher",
                  "diámetro máximo", "localización"):
            assert v in r.missing

    def test_a_complete_case_is_full(self):
        r = jsdb_scores(ruptured=True, age=60, prior_stroke=0, wfns_grade=2,
                        fisher_grade=3, max_diameter_mm=9.0,
                        location=LOCATION_MCA)
        assert r.known_pct == 100 and r.missing == []

    def test_an_unknown_location_is_missing_not_favourable(self):
        r = jsdb_scores(ruptured=True, age=60, prior_stroke=0, wfns_grade=1,
                        fisher_grade=1, max_diameter_mm=8.0,
                        location=LOCATION_UNKNOWN)
        assert "localización" in r.missing


# ── 5. Nunca se suma al saldo, y dice de dónde sale ───────────────────────── #

class TestItDescribesAndDoesNotVote:
    def test_the_jsdb_never_moves_the_balance(self):
        sin_ = compute_decision(**MORFO, location=LOCATION_MCA, ruptured=True)
        con = compute_decision(**MORFO, location=LOCATION_MCA, ruptured=True,
                               patient_age=84, wfns_grade=5, fisher_grade=4,
                               prior_stroke=3)
        assert con["balance"] == sin_["balance"]
        assert con["clip_points"] == sin_["clip_points"]
        assert con["endo_points"] == sin_["endo_points"]

    def test_it_carries_its_derivation(self):
        r = jsdb_scores(ruptured=True, age=60)
        assert "3 547" in r.source
        assert "mRS > 2 al alta" in r.source, "el desenlace no es la oclusión"
        assert "2021" in r.source

    def test_the_threshold_this_app_invented_is_declared_as_such(self):
        # Los autores no publican bandas. El umbral de aviso es nuestro y el
        # módulo lo dice; que no parezca suyo.
        import services.jsdb as m
        assert POOR_THRESHOLD == 3
        assert "no publican bandas" in m.__doc__ or "NO es suyo" in \
            m.jsdb_scores.__doc__ or "no publican bandas" in \
            open(m.__file__, encoding="utf-8").read()
