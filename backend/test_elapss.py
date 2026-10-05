"""ELAPSS (Backes, Neurology 2017): puntos y riesgo de crecimiento por banda.

Las cifras esperadas salen de la tabla publicada (reproducida en J Stroke
2019 y en el Stroke Manual, que coinciden), calculadas a mano.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from models.elapss import ElapssRequest
from services.elapss import age_points, compute_elapss, size_points
from services.report_generator import build_report_data_from_session
from services.sessions import create_session, read_state

client = TestClient(app, raise_server_exceptions=True)


@pytest.mark.parametrize("mm,pts", [(0.5, 0), (2.9, 0), (3.0, 4), (4.9, 4), (5.0, 10),
                                    (6.9, 10), (7.0, 13), (9.9, 13), (10.0, 22), (25, 22)])
def test_tamano(mm, pts):
    assert size_points(mm) == pts


@pytest.mark.parametrize("edad,pts", [(40, 0), (60, 0), (61, 1), (65, 1), (66, 2), (70, 2),
                                      (75, 3), (80, 4), (85, 5), (90, 6), (95, 7), (96, 8), (110, 8)])
def test_edad_un_punto_cada_cinco_anos(edad, pts):
    assert age_points(edad) == pts


def test_la_hsa_previa_resta_como_en_la_tabla():
    # Contraintuitivo pero publicado así: sin HSA previa por otro aneurisma, 1.
    base = dict(location="ica_aca_acom", age_years=50, population="other", size_mm=2.0, irregular=False)
    assert compute_elapss(ElapssRequest(earlier_sah=False, **base)).earlier_sah_pts == 1
    assert compute_elapss(ElapssRequest(earlier_sah=True, **base)).earlier_sah_pts == 0


def test_caso_completo_y_su_banda():
    # Sin HSA (1) + ACM (3) + 68 años (2) + Europa (0) + 7,7 mm (13) + irregular (4) = 23
    r = compute_elapss(ElapssRequest(earlier_sah=False, location="mca", age_years=68,
                                     population="other", size_mm=7.7, irregular=True))
    assert r.total_score == 23 and r.score_band == "20-24"
    assert (r.growth_3yr_pct, r.growth_5yr_pct) == (25.8, 39.9)


@pytest.mark.parametrize("total_args,banda,g3,g5", [
    (dict(earlier_sah=True, location="ica_aca_acom", age_years=50, population="other", size_mm=2.0), "<5", 5.0, 8.4),
    (dict(earlier_sah=False, location="ica_aca_acom", age_years=50, population="other", size_mm=3.5), "5-9", 7.8, 13.0),
    (dict(earlier_sah=False, location="pcom_posterior", age_years=50, population="finland", size_mm=12.0, irregular=True), "≥25", 42.7, 60.8),
])
def test_bandas(total_args, banda, g3, g5):
    r = compute_elapss(ElapssRequest(**total_args))
    assert (r.score_band, r.growth_3yr_pct, r.growth_5yr_pct) == (banda, g3, g5)


def test_registrado_en_la_sesion_llega_al_informe():
    sid = create_session()
    r = client.post("/api/elapss", json={"session_id": sid, "earlier_sah": False, "location": "mca",
                                         "age_years": 68, "population": "other", "size_mm": 7.7,
                                         "irregular": True})
    assert r.status_code == 200 and r.json()["total_score"] == 23
    guardado = json.loads(read_state(sid, "elapss.json"))
    assert guardado["inputs"]["size_mm"] == 7.7 and guardado["points"]["shape"] == 4
    assert build_report_data_from_session(sid).elapss["total_score"] == 23


def test_sin_sesion_es_un_calculo_suelto():
    r = client.post("/api/elapss", json={"size_mm": 4.0})
    assert r.status_code == 200 and r.json()["notes"]
