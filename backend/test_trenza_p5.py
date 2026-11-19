"""P5 (18-11): la trenza de cada flow diverter del catálogo en este vaso —
cobertura, porosidad y densidad de poros delante del cuello, y cuánto se alarga.

Se defiende con la geometría de la trenza (sin ajustar a estos tests) y con
las cifras publicadas que el modelo debe reproducir.
"""
from __future__ import annotations

import math

import numpy as np

from routers.plan import _STENT_LIBRARY
from services.braid_coverage import (BRAIDS, PIPELINE, SURPASS, braid_for, coverage_at,
                                     estimar_en_vaso, longitud_desplegada, pore_density)
from services.fd_sizing import size_flow_diverter
from test_fd_sizing import _vaso

LIB = [s.model_dump() for s in _STENT_LIBRARY]


# ── La trenza sola ─────────────────────────────────────────────────────── #

def test_la_densidad_de_poros_sale_de_los_hilos_y_su_angulo():
    # N²·tan α / (2π²D²) con N = 48, α = 67°, D = 4: 17,2 poros/mm².
    esperado = 48 ** 2 * math.tan(math.radians(67)) / (2 * math.pi ** 2 * 16)
    assert abs(float(pore_density(PIPELINE, 4.0, [4.0])[0]) - esperado) < 1e-9
    assert 16 < esperado < 18.5


def test_el_surpass_cae_en_su_densidad_de_poros_publicada():
    """21–32 poros/mm² publicados; con el ángulo despejado, los cuatro
    tamaños publicados quedan a ±3 de ese rango."""
    for d in (2.5, 3.0, 4.0, 5.0):
        rho = float(pore_density(SURPASS, d, [d])[0])
        assert 18 <= rho <= 35, (d, rho)
    assert SURPASS.wires_for(2.5) == 48 and SURPASS.wires_for(3.0) == 72
    assert SURPASS.wires_for(4.0) == 72 and SURPASS.wires_for(5.0) == 96
    # Sin publicar: la medida publicada más cercana (a igual distancia, la mayor).
    assert SURPASS.wires_for(4.31) == 72 and SURPASS.wires_for(3.5) == 72 and SURPASS.wires_for(4.5) == 96


def test_sobredimensionar_abre_los_poros_y_alarga_la_trenza():
    """Pipeline a 67°: en un vaso más estrecho los hilos se tumban hacia 45°,
    los rombos se acercan al cuadrado y los poros se abren (menos densidad y
    menos cobertura), como en la medida publicada de 25,5 % con 1 mm de más."""
    rho_nom, rho_estrecho = (float(pore_density(PIPELINE, 4.0, [d])[0]) for d in (4.0, 3.5))
    assert rho_estrecho < rho_nom
    assert float(coverage_at(PIPELINE, 4.0, [3.0])[0][0]) < PIPELINE.nominal_coverage
    cov, _, e = coverage_at(PIPELINE, 4.0, [3.75])
    assert e[0] > 1.15                       # 0,25 mm de sobredimensionado: ~+30 %
    # Por encima de su nominal no se abre más: igual que al nominal.
    assert float(pore_density(PIPELINE, 4.0, [5.0])[0]) == rho_nom


def test_el_surpass_se_acorta_menos_que_el_pipeline():
    """Con los hilos menos tumbados (50° frente a 67°), el mismo
    sobredimensionado alarga mucho menos: es lo que se dice del Surpass."""
    e_pipe = float(coverage_at(PIPELINE, 4.0, [3.75])[2][0])
    e_surp = float(coverage_at(SURPASS, 4.0, [3.75])[2][0])
    assert 1.0 < e_surp < e_pipe


def test_longitud_desplegada_en_un_tubo_uniforme():
    arcos = np.arange(0, 100.0, 0.5)
    # Vaso igual al nominal: no se alarga.
    assert abs(longitud_desplegada(PIPELINE, 4.0, 20.0, arcos, np.full_like(arcos, 4.0), 10.0) - 20.0) < 0.3
    # Vaso de 3,75 mm: se alarga lo que dice el ángulo.
    e = float(coverage_at(PIPELINE, 4.0, [3.75])[2][0])
    largo = longitud_desplegada(PIPELINE, 4.0, 20.0, arcos, np.full_like(arcos, 3.75), 10.0)
    assert abs(largo - 20.0 * e) < 0.3


def test_estimacion_centrada_en_el_cuello():
    arcos = np.arange(0, 80.0, 0.5)
    est = estimar_en_vaso(PIPELINE, 4.0, 20.0, 3.8, 40.0, arcos, np.full_like(arcos, 3.8), 80.0)
    a, b = est.deploy_arc_mm
    assert abs((a + b) / 2 - 40.0) < 0.3 and abs((b - a) - est.deployed_length_mm) < 0.2
    assert est.elongation_pct > 10
    assert 25 <= est.neck_coverage_pct < 32.5 and est.wires == 48
    assert est.neck_pore_density < est.nominal_pore_density


def test_el_catalogo_tiene_la_trenza_de_sus_dos_flow_diverters():
    fds = [s.id for s in _STENT_LIBRARY if s.type == "flow_diverter"]
    assert fds and all(braid_for(i) is not None for i in fds)
    assert set(BRAIDS) <= {s.id for s in _STENT_LIBRARY}
    assert braid_for("enterprise2-4.5-22") is None and braid_for(None) is None


# ── En el dimensionado ─────────────────────────────────────────────────── #

def test_el_dimensionado_da_cobertura_poros_y_longitud_de_cada_opcion():
    malla, linea = _vaso(1.9, 1.9, saco=3.0)            # vaso de 3,8 mm
    r = size_flow_diverter(malla, linea, (1.9, 0, 30.0), 4.0, LIB)
    ops = {o.device_id: o for o in r.options if o.fits}
    pipe, surp = ops["pipeline-flex-3.75-25"], ops["surpass-streamline-4.0-25"]
    for o in (pipe, surp):
        assert o.neck_coverage_pct is not None and o.neck_porosity_pct == 100 - o.neck_coverage_pct
        assert o.neck_pore_density and o.wires and o.deployed_length_mm and o.braid_note
        a, b = o.deploy_arc_mm
        assert abs((b - a) - o.deployed_length_mm) < 0.3 and abs((a + b) / 2 - 30.0) < 0.6
        assert o.deployed_length_mm >= o.length_mm - 0.3
    # Pipeline Ø3,75 en 3,8 mm: casi nominal, se alarga poco. Surpass a
    # medida (3,8): nominal, no se alarga.
    assert pipe.diameter_mm == 3.75 and pipe.elongation_pct < 10
    assert surp.elongation_pct <= 2
    assert any("72 en 3 y 4 mm" in s for s in r.sources) and any("Ángulo de los hilos 67°" in s for s in r.sources)


def test_sobredimensionado_alarga_y_lo_dice():
    malla, linea = _vaso(1.6, 1.6, saco=3.0)            # vaso de 3,2 mm
    lib = [dict(LIB[0], available_diameters_mm=[4.0])]  # solo un Pipeline de 4,0 mm
    r = size_flow_diverter(malla, linea, (1.6, 0, 30.0), 4.0, lib)
    o = r.options[0]
    assert o.fits and o.diameter_mm == 4.0
    assert o.elongation_pct > 40                        # 0,8 mm de más: la trenza se tumba
    assert o.neck_pore_density < o.nominal_pore_density      # poros más abiertos
    assert o.neck_coverage_pct < 30
    assert "llegan a unos" in o.braid_note and "poros/mm²" in o.braid_note


def test_sin_trenzado_en_el_catalogo_no_se_inventa():
    malla, linea = _vaso(1.9, 1.9, saco=3.0)
    lib = [dict(LIB[0], id="otro-fd")]
    o = size_flow_diverter(malla, linea, (1.9, 0, 30.0), 4.0, lib).options[0]
    assert o.fits and o.neck_coverage_pct is None and o.deployed_length_mm is None and o.braid_note == ""


# ── El stent desplegado usa la trenza del dispositivo elegido ──────────── #

def test_desplegar_con_device_id_usa_su_trenza():
    from fastapi.testclient import TestClient

    from main import app
    from test_braid_coverage import TestEndpoint

    client = TestClient(app, raise_server_exceptions=True)
    sid, _ = TestEndpoint()._sesion()
    cuerpo = {"session_id": sid, "stent_diameter_mm": 4.0, "start_arc_mm": 5, "end_arc_mm": 25, "braid": True}
    pipe = client.post(f"/api/cl-stent/{sid}", json=cuerpo).json()["coverage"]
    surp = client.post(f"/api/cl-stent/{sid}", json={**cuerpo, "device_id": "surpass-streamline-4.0-25"}).json()["coverage"]
    assert pipe["device"] == "Pipeline" and pipe["wires"] == 48
    assert surp["device"] == "Surpass Streamline" and surp["wires"] == 72 and surp["nominal_coverage_pct"] == 30.0
