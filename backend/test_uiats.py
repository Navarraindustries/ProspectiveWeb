"""UIATS (Etminan, Neurology 2015, figura 2): cada valor y casos completos.

Las tablas de abajo son la transcripción de la figura 2 del PDF del
artículo, renglón por renglón. Si alguien cambia un punto en el servicio,
este test lo dice.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from services import uiats as u
from services.report_generator import build_report_data_from_session
from services.sessions import create_session, read_state

client = TestClient(app, raise_server_exceptions=True)


def test_tablas_tal_como_la_figura_2():
    assert u.RISK_FACTORS == {"previous_sah": 4, "familial": 3, "ethnicity": 2, "smoking": 3,
                              "hypertension": 2, "adpkd": 2, "drug_abuse": 2, "alcohol_abuse": 1}
    assert u.SYMPTOMS == {"cranial_nerve_deficit": 4, "mass_effect": 4, "thromboembolic": 3, "epilepsy": 1}
    assert u.PATIENT_OTHER == {"fear_of_rupture": 2, "multiplicity": 1}
    assert u.MORPHOLOGY == {"irregular": 3, "sr_ar": 1}
    assert u.LOCATION == {"basilar_bifurcation": 5, "vertebrobasilar": 4, "acom_pcom": 2, "other": 0}
    assert u.ANEURYSM_OTHER == {"growth": 4, "de_novo": 3, "contralateral_stenoocclusive": 1}
    assert u.LIFE_EXPECTANCY == {"lt5": 4, "5to10": 3, "gt10": 1}
    assert u.COMORBID == {"neurocognitive": 3, "coagulopathy": 2, "psychiatric": 2}
    assert u.COMPLEXITY == {"high": 3, "low": 0}
    assert u.INTERVENTION_CONSTANT == 5


@pytest.mark.parametrize("edad,tratar,vigilar", [
    (25, 4, 0), (39, 4, 0), (40, 3, 1), (60, 3, 1), (61, 2, 3), (70, 2, 3),
    (71, 1, 4), (80, 1, 4), (81, 0, 5)])
def test_edad_en_las_dos_columnas(edad, tratar, vigilar):
    assert u.age_repair_points(edad) == tratar
    assert u.age_conservative_points(edad) == vigilar


@pytest.mark.parametrize("mm,pts", [(3.9, 0), (4.0, 1), (6.9, 1), (7.0, 2), (12.9, 2), (13.0, 3), (24.9, 3), (25.0, 4)])
def test_diametro(mm, pts):
    assert u.diameter_points(mm) == pts


@pytest.mark.parametrize("mm,pts", [(5.9, 0), (6.0, 1), (10.0, 1), (10.1, 3), (20.0, 3), (20.1, 5)])
def test_riesgo_por_tamano(mm, pts):
    assert u.size_risk_points(mm) == pts


def _caso(**over):
    base = dict(age=55, risk_factors=[], symptoms=[], patient_other=[], diameter_mm=5.0,
                morphology=[], location="other", aneurysm_other=[], life_expectancy=None,
                comorbid=[], complexity="low")
    base.update(over)
    return u.compute_uiats(**base)


def test_caso_a_favor_de_tratar():
    # 45 años (3) + fumador (3) + HTA (2) + 8 mm (2) + irregular (3) + AComA (2) + creció (4) = 19
    # vigilar: edad 41-60 (1) + 8 mm (1) + baja complejidad (0) + constante (5) = 7
    s = _caso(age=45, risk_factors=["smoking", "hypertension"], diameter_mm=8.0,
              morphology=["irregular"], location="acom_pcom", aneurysm_other=["growth"])
    assert (s.repair, s.conservative, s.difference, s.recommendation) == (19, 7, 12, "repair")


def test_caso_a_favor_de_vigilar():
    # 82 años (0) + 3,5 mm (0) = 0 ; vigilar: >80 (5) + <6 mm (0) + vida 5-10 (3) + cognitivo (3) + alta (3) + 5 = 19
    s = _caso(age=82, diameter_mm=3.5, life_expectancy="5to10", comorbid=["neurocognitive"], complexity="high")
    assert (s.repair, s.conservative, s.recommendation) == (0, 19, "conservative")


def test_dos_puntos_o_menos_no_es_concluyente():
    # tratar: 55 (3) + 5 mm (1) + AComA (2) + fumador (3) = 9 ; vigilar: 1 + 0 + 0 + 5 = 6 → +3 ya es tratar
    assert _caso(location="acom_pcom", risk_factors=["smoking"]).recommendation == "repair"
    # quitando el fumador: 6 frente a 6 → no concluyente
    s = _caso(location="acom_pcom")
    assert (s.repair, s.conservative, s.recommendation) == (6, 6, "not_definitive")


def test_un_valor_desconocido_se_rechaza():
    with pytest.raises(ValueError):
        _caso(risk_factors=["otra_cosa"])


def test_registrado_llega_al_informe_y_avisa_de_los_40():
    sid = create_session()
    r = client.post("/api/uiats", json={"session_id": sid, "age_years": 40, "diameter_mm": 8.0,
                                        "risk_factors": ["smoking"], "location": "acom_pcom"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert any("40 años" in n for n in j["notes"])
    assert json.loads(read_state(sid, "uiats.json"))["repair"] == j["repair"]
    assert build_report_data_from_session(sid).uiats["recommendation"] == j["recommendation"]


def test_menores_de_18_fuera():
    assert client.post("/api/uiats", json={"age_years": 15, "diameter_mm": 5}).status_code == 422
