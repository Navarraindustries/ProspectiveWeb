"""Doble envío contra CSRF para las peticiones autenticadas por cookie.

La cookie de sesión la manda el navegador solo; sin esto, otra página del mismo
sitio podía borrar un paciente con un formulario. Ver services/csrf.py.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import anonymous_client
from main import app
from services.csrf import CSRF_COOKIE, CSRF_HEADER


def _con_cookie() -> tuple[TestClient, str]:
    """Un cliente que entra por el login y queda autenticado SOLO por cookie."""
    c = anonymous_client(app)
    r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    token = c.cookies.get(CSRF_COOKIE)
    assert token, "el login tiene que dejar la cookie CSRF"
    return c, token


def test_el_login_deja_una_cookie_csrf_legible_por_el_javascript():
    c = anonymous_client(app)
    r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    cabeceras = [v for k, v in r.headers.multi_items() if k.lower() == "set-cookie"]
    csrf = next(v for v in cabeceras if v.startswith(f"{CSRF_COOKIE}="))
    assert "httponly" not in csrf.lower()


def test_por_cookie_y_sin_cabecera_se_rechaza():
    c, _ = _con_cookie()
    r = c.post("/api/patients", json={"name": "X", "hospital_id": "csrf-1"})
    assert r.status_code == 403
    assert "CSRF" in r.json()["detail"]


def test_por_cookie_con_la_cabecera_buena_pasa():
    c, token = _con_cookie()
    r = c.post("/api/patients", json={"name": "X", "hospital_id": "csrf-2"},
               headers={CSRF_HEADER: token})
    assert r.status_code != 403, r.text


def test_una_cabecera_que_no_coincide_se_rechaza():
    c, _ = _con_cookie()
    r = c.post("/api/patients", json={"name": "X", "hospital_id": "csrf-3"},
               headers={CSRF_HEADER: "otro"})
    assert r.status_code == 403


def test_las_lecturas_no_lo_piden():
    c, _ = _con_cookie()
    assert c.get("/api/patients").status_code == 200


def test_con_bearer_no_se_pide():
    # Ninguna página ajena puede poner Authorization sin pasar por CORS.
    c = TestClient(app)          # conftest: Bearer por defecto
    r = c.post("/api/patients", json={"name": "X", "hospital_id": "csrf-4"})
    assert r.status_code != 403, r.text


def test_una_cookie_vieja_no_impide_volver_a_entrar():
    c, _ = _con_cookie()
    c.cookies.delete(CSRF_COOKIE)
    r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
