# -*- coding: utf-8 -*-
"""La morfología describe la vía endovascular en lugar de votar la modalidad.

Cuatro de los ocho factores del motor eran índices de forma sacados de
literatura de RIESGO DE ROTURA (Dhar 2008, Raghavan 2005). Ninguno de esos
trabajos estudia la elección entre clipaje y coiling, y ninguno de los dos
modelos validados que sí la estudian usa un índice de forma.

Donde la morfología sí tiene respaldo es en otra pregunta —cómo sería la vía
endovascular— y ahí el respaldo es bueno:

- «Cuello ancho» (≥ 4 mm o DNR < 2) existe como definición porque predice la
  necesidad de balón o stent, con gradiente medido: por encima de 1.6 no suelen
  hacer falta, por debajo de 1.2 casi siempre (Brinjikji, AJNR 2009).
- Un aspect ratio ≥ 1.6 se asocia a recanalización tras coiling: OR 4.15
  (IC 95 % 1.57–11.00), 307 aneurismas, 79 meses de seguimiento medio
  (Neurol Med Chir 2022).

Ese segundo dato apunta al contrario que el motor, que daba +20 a endovascular
por un AR alto llamándolo «favorable para coiling».
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_endo_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest

from services.endovascular import (AR_RECANALIZATION, DNR_ALWAYS_ADJUNCT,
                                   WIDE_DNR, WIDE_NECK_MM, endovascular_profile)
from services.treatment import LOCATION_MCA, compute_decision


# ── 1. La técnica, con la definición publicada ────────────────────────────── #

class TestTheTechniqueFollowsTheWideNeckDefinition:
    def test_a_narrow_neck_needs_no_adjunct(self):
        p = endovascular_profile(neck_mm=2.5, dnr=2.6)
        assert p.technique == "simple"
        assert "Brinjikji" in " ".join(p.sources)

    def test_a_neck_at_or_past_four_millimetres_is_wide(self):
        # El umbral, no un número redondo elegido aquí.
        justo = endovascular_profile(neck_mm=WIDE_NECK_MM, dnr=2.6)
        antes = endovascular_profile(neck_mm=WIDE_NECK_MM - 0.5, dnr=2.6)
        assert justo.technique == "assisted"
        assert antes.technique == "simple"

    def test_a_low_dome_to_neck_ratio_is_wide_even_with_a_small_neck(self):
        p = endovascular_profile(neck_mm=2.5, dnr=WIDE_DNR - 0.1)
        assert p.technique == "assisted"

    def test_below_one_point_two_it_says_almost_always(self):
        # El gradiente medido: por debajo de 1.2 casi siempre hace falta.
        p = endovascular_profile(neck_mm=3.0, dnr=DNR_ALWAYS_ADJUNCT - 0.05)
        assert p.technique == "assisted"
        assert "casi siempre" in p.rationale

    def test_a_giant_aneurysm_changes_the_family_of_device(self):
        p = endovascular_profile(neck_mm=6.0, dnr=1.4, max_diameter_mm=28.0)
        assert p.technique == "diverter"
        assert "25 %" in p.rationale, "la tasa de complicación se dice, no se calla"
        assert any("efecto de masa" in c for c in p.cautions)

    def test_a_large_one_raises_it_without_deciding_it(self):
        p = endovascular_profile(neck_mm=6.0, dnr=1.4, max_diameter_mm=14.0)
        assert p.technique == "assisted"
        assert any("diversión de flujo" in c for c in p.cautions)

    def test_without_geometry_it_says_so_instead_of_guessing(self):
        p = endovascular_profile()
        assert p.technique == "unknown"
        assert "Morfometría" in p.rationale


# ── 2. La durabilidad, que es donde el AR sí está medido ──────────────────── #

class TestTheAspectRatioTalksAboutDurability:
    def test_a_high_aspect_ratio_warns_about_recanalization(self):
        p = endovascular_profile(neck_mm=2.5, dnr=2.6,
                                 aspect_ratio=AR_RECANALIZATION + 0.4)
        assert "recanalización" in p.durability
        assert "4.15" in p.durability

    def test_it_does_not_turn_that_into_a_contraindication(self):
        # Un OR de 4 sobre la recurrencia no cierra la vía: cambia el plan.
        p = endovascular_profile(neck_mm=2.5, dnr=2.6, aspect_ratio=2.4)
        assert p.technique == "simple"
        assert "No contraindica" in p.durability

    def test_a_low_aspect_ratio_is_reported_too(self):
        p = endovascular_profile(neck_mm=2.5, dnr=2.6, aspect_ratio=1.1)
        assert p.durability and "1.6" in p.durability

    def test_an_irregular_dome_is_flagged_as_unvalidated(self):
        # Razonable no es lo mismo que medido, y la diferencia se dice.
        p = endovascular_profile(neck_mm=2.5, dnr=2.6, undulation_index=0.28)
        caution = " ".join(p.cautions)
        assert "ROTURA" in caution
        assert "no se ha encontrado validación" in caution


# ── 3. El motor deja de votar con la forma, y describe con ella ───────────── #

class TestTheDecisionUsesTheProfileInsteadOfVoting:
    FULL = dict(neck_mm=6.5, aspect_ratio=2.4, dnr=1.15, max_diameter_mm=14.0,
                bottleneck_factor=2.2, undulation_index=0.25)

    def test_the_shape_indices_are_shown_but_score_nothing(self):
        d = compute_decision(**self.FULL, location=LOCATION_MCA)
        mudos = [f for f in d["factors"] if not f["votes"]]
        assert {f["points"] for f in mudos} == {0}
        assert len(mudos) == 3, "aspect ratio, bottleneck y undulación"

    def test_the_points_no_longer_include_them(self):
        d = compute_decision(**self.FULL, location=LOCATION_MCA)
        total = sum(f["points"] for f in d["factors"])
        assert d["clip_points"] + d["endo_points"] == total

    def test_the_profile_travels_with_the_decision(self):
        d = compute_decision(**self.FULL, location=LOCATION_MCA)
        assert d["endovascular"]["technique"] == "assisted"
        assert "4.15" in d["endovascular"]["durability"]

    def test_it_is_computed_even_when_clipping_wins(self):
        # Una sesión multidisciplinar compara las dos opciones, no sólo la que
        # gana: describir sólo la ganadora deja media conversación fuera.
        d = compute_decision(**self.FULL, location=LOCATION_MCA)
        assert d["recommendation_key"] == "clip"
        assert d["endovascular"]["technique"] != "unknown"

    def test_missing_shape_indices_no_longer_cost_confidence(self):
        # Ya no deciden nada, así que su ausencia no puede restar certeza a la
        # decisión. Sí limita lo que se puede decir del perfil, y eso lo dice él.
        con = compute_decision(**self.FULL, location=LOCATION_MCA, patient_age=55)
        sin_ = compute_decision(neck_mm=6.5, aspect_ratio=0.0, dnr=1.15,
                                max_diameter_mm=14.0, bottleneck_factor=0.0,
                                undulation_index=0.0, location=LOCATION_MCA,
                                patient_age=55)
        assert con["coverage_pct"] == sin_["coverage_pct"] == 100
        assert con["confidence"] == sin_["confidence"]
        assert sin_["endovascular"]["durability"] == ""

    def test_the_verdict_changed_where_the_evidence_says_it_should(self):
        # Un AR alto ya no empuja 20 puntos hacia endovascular por sí solo.
        alto = compute_decision(neck_mm=3.0, aspect_ratio=2.4, dnr=2.6,
                                max_diameter_mm=8.0, bottleneck_factor=0.0,
                                undulation_index=0.0)
        bajo = compute_decision(neck_mm=3.0, aspect_ratio=1.1, dnr=2.6,
                                max_diameter_mm=8.0, bottleneck_factor=0.0,
                                undulation_index=0.0)
        assert alto["balance"] == bajo["balance"], "el AR ya no mueve el saldo"
        assert alto["endovascular"]["durability"] != bajo["endovascular"]["durability"]
