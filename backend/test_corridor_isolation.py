"""Los cálculos nativos corren en un proceso aparte (familia T: F1-19, F1-24).

La auditoría vio morir el worker de uvicorn cuatro veces sin traza de Python
(«Sugerir corredor» dos veces, al restaurar una sesión, y poco después de
reanudar): VTK aborta el proceso entero. Con `--reload` el supervisor se queda
con el puerto y el cliente solo ve un 500 vacío y luego tiempos de espera.

Lo que se defiende aquí: si el hijo muere (`os._exit(1)` simula el aborto
nativo), la petición responde 500 con una explicación y el servidor sigue
contestando; si el hijo se cuelga, el límite de tiempo lo corta.

Las funciones que corren en el hijo están a nivel de módulo: con `spawn` el
hijo las importa por nombre (`test_corridor_isolation._morir`).
"""
from __future__ import annotations

import os
import time

import pytest

from services.isolated import CalculoCaido, run_isolated

DETALLE_CORREDOR = (
    "El cálculo del corredor falló en el servidor; la sesión no se ha perdido. "
    "Coloca la entrada y la diana a mano."
)


# ── Lo que corre en el hijo ─────────────────────────────────────────────────── #

def _doble(x: int) -> int:
    return 2 * x


def _morir(*_args, **_kwargs):
    os._exit(1)


def _dormir(segundos: float) -> str:
    time.sleep(segundos)
    return "tarde"


def _fallar(_x):
    raise ValueError("un error de Python normal")


# ── run_isolated ────────────────────────────────────────────────────────────── #

def test_el_hijo_devuelve_el_resultado():
    assert run_isolated(_doble, 21, timeout_s=120) == 42


def test_si_el_hijo_muere_lanza_calculo_caido():
    with pytest.raises(CalculoCaido):
        run_isolated(_morir, 1, timeout_s=120)


def test_un_error_de_python_en_el_hijo_llega_tal_cual():
    with pytest.raises(ValueError, match="normal"):
        run_isolated(_fallar, 1, timeout_s=120)


def test_si_el_hijo_se_cuelga_el_limite_lo_corta():
    t0 = time.monotonic()
    with pytest.raises(CalculoCaido):
        run_isolated(_dormir, 60, timeout_s=3)
    # Sin matar al hijo, salir del `with` esperaría los 60 s enteros.
    assert time.monotonic() - t0 < 30


# ── Las rutas ───────────────────────────────────────────────────────────────── #

@pytest.fixture(scope="module")
def client():
    # La app se importa aquí y no arriba: el hijo importa este módulo para
    # encontrar `_morir`, y no necesita levantar la app entera para eso.
    from fastapi.testclient import TestClient

    from main import app
    from services.database import Base, engine
    Base.metadata.create_all(bind=engine)
    return TestClient(app, raise_server_exceptions=False)   # admin (conftest)


def test_sugerir_corredor_con_el_hijo_muerto_da_500_y_el_servidor_sigue(client, monkeypatch):
    import routers.report as report
    from services.sessions import create_session, session_subdir

    sid = create_session()
    (session_subdir(sid, "meshes") / "vessel_tree.vtp").write_text("x")
    monkeypatch.setattr(report, "_suggest_for_session", _morir)

    r = client.post(f"/api/trajectory/{sid}/suggest",
                    json={"target": {"x": 1.0, "y": 2.0, "z": 3.0}})
    assert r.status_code == 500, r.text
    assert r.json()["detail"] == DETALLE_CORREDOR
    assert client.get("/docs").status_code == 200


def test_restaurar_con_el_hijo_muerto_da_500_y_el_servidor_sigue(client, monkeypatch):
    import routers.session_state as session_state
    from services.sessions import create_session, write_state

    sid = create_session()
    write_state(sid, "dicom.modality", "CT")
    r = client.post("/api/sessions/save", json={"session_id": sid, "current_step": 2, "label": "t"})
    assert r.status_code == 200, r.text
    monkeypatch.setattr(session_state, "rehydrate_session", _morir)

    r = client.post(f"/api/sessions/{sid}/restore")
    assert r.status_code == 500, r.text
    assert "sigue" in r.json()["detail"]          # la guardada no se ha perdido
    assert client.get("/docs").status_code == 200


def test_restaurar_de_verdad_pasa_por_el_hijo_y_responde_200(client):
    from services.sessions import create_session, session_exists, write_state

    sid = create_session()
    write_state(sid, "dicom.modality", "CT")
    r = client.post("/api/sessions/save", json={"session_id": sid, "current_step": 2, "label": "t"})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/sessions/{sid}/restore")
    assert r.status_code == 200, r.text
    nuevo = r.json()["session_id"]
    assert nuevo != sid and session_exists(nuevo)


def test_sugerir_corredor_de_verdad_pasa_por_el_hijo_y_responde_200(client):
    import vtk

    from services.segmentation import write_vtp
    from services.sessions import create_session, session_subdir

    sid = create_session()
    esfera = vtk.vtkSphereSource()
    esfera.SetCenter(0.0, 0.0, 0.0)
    esfera.SetRadius(3.0)
    esfera.Update()
    write_vtp(esfera.GetOutput(), session_subdir(sid, "meshes") / "vessel_tree.vtp")

    r = client.post(f"/api/trajectory/{sid}/suggest",
                    json={"target": {"x": 0.0, "y": 0.0, "z": 0.0}})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["target"] == {"x": 0.0, "y": 0.0, "z": 0.0}
    assert cuerpo["rules"]                       # el resultado cruzó entero
