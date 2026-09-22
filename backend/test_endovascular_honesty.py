# -*- coding: utf-8 -*-
"""Las cifras de coils y stents dicen lo que miden, ni más ni menos.

Este fichero existe por dos números concretos que llegaron a la interfaz con
aspecto de medición y no lo eran:

1. `estimated_occlusion_pct = 100 * (1 - exp(-packing / 0.10))`, una curva
   ajustada a ojo, sin fuente, pintada con un decimal.
2. La cobertura del stent, `32 + min(18, (diámetro - cuello) * 6)`, sin fuente,
   comparada contra el cuello en vez de contra la arteria portadora, y con el
   signo al revés: sobredimensionar ABRE la trenza y baja la cobertura.

Los tests de abajo fijan las dos correcciones para que no vuelvan.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.coils import (
    PACKING_AIM, PACKING_MAX, PACKING_MIN, COIL_CATALOGUE,
    estimate_coil_count, packing_assessment,
)
from services.endovascular import (
    DEFAULT_NECK_MM, LANDING_ZONE_MM, stent_bridging,
)

client = TestClient(app)


def _session(**morpho) -> str:
    from services.sessions import create_session, write_state
    sid = create_session()
    defaults = dict(neck_mm="4.2", volume_mm3="210.5", max_diameter_mm="9.1")
    defaults.update(morpho)
    for k, v in defaults.items():
        write_state(sid, f"morpho.{k}", str(v))
    return sid


# ══════════════════════════════════════════════════════════════════════════════
# Empaquetamiento de coils
# ══════════════════════════════════════════════════════════════════════════════

class TestPackingAssessment:

    def test_sin_coils_no_avisa(self):
        a = packing_assessment(0.0, 0)
        assert a.warning is None
        assert not a.meets_minimum
        assert "Morfometr" in a.durability

    def test_por_debajo_del_minimo_avisa(self):
        a = packing_assessment(0.12, 2)
        assert not a.meets_minimum
        assert a.warning is not None

    def test_por_encima_del_minimo_no_avisa(self):
        a = packing_assessment(0.31, 6)
        assert a.meets_minimum
        assert a.warning is None

    @pytest.mark.parametrize("packing", [0.05, 0.19, 0.20, 0.25, 0.40, 0.55])
    def test_nunca_promete_oclusion(self, packing):
        """Ni el texto ni las fuentes deben prometer un porcentaje de oclusión."""
        a = packing_assessment(packing, 4)
        texto = (a.durability + " " + (a.warning or "")).lower()
        assert "oclusión del" not in texto
        assert "% de oclusión" not in texto
        # Raymond puede citarse como fuente, pero no como cifra pronosticada.
        assert "raymond" not in a.durability.lower()

    def test_el_minimo_que_se_cita_es_el_constante(self):
        """El aviso citaba 20 % y el objetivo 25 % sin que nadie lo dijera."""
        a = packing_assessment(0.10, 3)
        assert f"{PACKING_MIN * 100:.0f} %" in a.warning
        assert f"{PACKING_AIM * 100:.0f} %" in a.warning

    def test_planificar_apunta_por_encima_del_minimo(self):
        assert PACKING_AIM > PACKING_MIN
        assert PACKING_MAX > PACKING_AIM
        # `estimate_coil_count` debe usar el objetivo, no el mínimo.
        n_aim = estimate_coil_count(500.0, COIL_CATALOGUE[0])
        n_min = estimate_coil_count(500.0, COIL_CATALOGUE[0],
                                    target_packing_pct=PACKING_MIN * 100.0)
        assert n_aim > n_min


class TestCoilPlanApi:

    def test_no_devuelve_porcentaje_de_oclusion(self):
        sid = _session()
        r = client.post("/api/coils/plan", json={
            "session_id": sid,
            "placements": [{"coil_id": "target-360-4mm-8cm",
                            "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                            "packing_density": 0.25}],
        })
        assert r.status_code == 200
        d = r.json()
        assert "estimated_occlusion_pct" not in d
        assert d["durability"] and d["sources"]
        assert d["packing_min"] == PACKING_MIN

    def test_el_empaque_sigue_siendo_real(self):
        """Más coils, más empaquetamiento: la magnitud medida no se ha perdido."""
        sid = _session()
        def plan(n):
            r = client.post("/api/coils/plan", json={
                "session_id": sid,
                "placements": [{"coil_id": "target-360-8mm-20cm",
                                "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                                "packing_density": 0.25}] * n,
            })
            return r.json()["total_packing_density"]
        assert plan(4) > plan(1)


# ══════════════════════════════════════════════════════════════════════════════
# Dimensionado del stent
# ══════════════════════════════════════════════════════════════════════════════

class TestStentBridging:

    def test_dispositivo_largo_cruza_el_cuello(self):
        b = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=3.75,
                           min_diameter_mm=2.5, max_diameter_mm=5.0)
        assert b.coverage_pct == 100.0
        assert b.deployed
        assert b.warnings == []

    def test_dispositivo_corto_no_lo_cruza(self):
        b = stent_bridging(neck_mm=4.2, length_mm=10, diameter_mm=3.75,
                           min_diameter_mm=2.5, max_diameter_mm=5.0)
        assert b.coverage_pct < 100.0
        assert not b.deployed
        assert any("insuficiente" in w.lower() for w in b.warnings)

    def test_longitud_exigida_incluye_anclaje_a_ambos_lados(self):
        b = stent_bridging(neck_mm=6.0, length_mm=30, diameter_mm=3.75)
        assert b.required_length_mm == pytest.approx(6.0 + 2 * LANDING_ZONE_MM)

    def test_diametro_fuera_de_rango_no_despliega(self):
        b = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=9.0,
                           min_diameter_mm=2.5, max_diameter_mm=5.0)
        assert not b.diameter_ok
        assert not b.deployed

    def test_sin_ficha_no_se_inventa_un_rango(self):
        """Con min/max a cero no hay contra qué comparar: no se penaliza."""
        b = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=9.0)
        assert b.diameter_ok

    def test_sin_morfometria_avisa_y_supone(self):
        b = stent_bridging(neck_mm=0.0, length_mm=25, diameter_mm=3.75)
        assert b.neck_covered_mm == 0.0
        assert b.required_length_mm == pytest.approx(DEFAULT_NECK_MM + 2 * LANDING_ZONE_MM)
        assert any("morfometr" in w.lower() for w in b.warnings)

    # ── La regresión que motiva el fichero ────────────────────────────── #

    def test_sobredimensionar_no_aumenta_la_cobertura(self):
        """El cálculo viejo sumaba cobertura por sobredimensionar, al revés.

        Una trenza desplegada con holgura se alarga y su cobertura metálica
        BAJA. Aquí `coverage_pct` ya no es cobertura metálica en absoluto, así
        que el diámetro no puede moverla: sólo la longitud la mueve.
        """
        base = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=3.0)
        gordo = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=5.0)
        assert gordo.coverage_pct == base.coverage_pct

    def test_dice_que_no_calcula_la_cobertura_metalica(self):
        b = stent_bridging(neck_mm=4.2, length_mm=25, diameter_mm=3.75)
        notas = " ".join(b.notes).lower()
        assert "cobertura met" in notas
        assert "portadora" in notas
        assert b.sources


class TestStentPlanApi:

    def test_la_cobertura_ya_no_parte_de_32(self):
        """El valor viejo era 32 % + bonificación; el nuevo es geométrico."""
        sid = _session()
        r = client.post("/api/plan", json={
            "session_id": sid,
            "stent": {"stent_id": "pipeline-flex-3.75-25", "diameter_mm": 3.75,
                      "length_mm": 25, "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                      "rotation_deg": 0.0},
        })
        assert r.status_code == 200
        d = r.json()
        assert d["coverage_pct"] == 100.0          # 25 mm cruzan 4.2 + 10
        assert d["required_length_mm"] == pytest.approx(14.2)
        assert d["notes"] and d["sources"]

    def test_stent_corto_avisa(self):
        sid = _session()
        r = client.post("/api/plan", json={
            "session_id": sid,
            "stent": {"stent_id": "pipeline-flex-3.75-25", "diameter_mm": 3.75,
                      "length_mm": 10, "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                      "rotation_deg": 0.0},
        })
        d = r.json()
        assert d["coverage_pct"] < 100.0
        assert d["deployed"] is False
        assert d["warning"]


class TestPackingSinVolumen:
    """Sin volumen del saco no hay densidad: antes se rellenaba con 0.08/coil."""

    def test_el_servicio_no_inventa_densidad(self):
        a = packing_assessment(0.0, 3, volume_known=False)
        assert a.packing == 0.0
        assert not a.meets_minimum
        assert "Morfometr" in a.durability
        assert a.warning is not None

    def test_la_api_no_inventa_densidad(self):
        from services.sessions import create_session
        sid = create_session()          # sesión sin morfometría
        r = client.post("/api/coils/plan", json={
            "session_id": sid,
            "placements": [{"coil_id": "target-360-4mm-8cm",
                            "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                            "packing_density": 0.25}] * 3,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["total_packing_density"] == 0.0     # no 0.24 inventado
        assert d["warning"]
