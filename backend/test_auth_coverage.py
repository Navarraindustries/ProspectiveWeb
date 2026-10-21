"""Every route that touches patient data must reject anonymous callers.

Regression: `get_current_user` is an alias of `get_optional_user` — it returns
None instead of raising — so routers that depended on it answered 200 without
credentials. 60 of 73 endpoints were reachable with no token at all: the patient
registry (names, national IDs, dates of birth), the study gallery, DICOM upload,
every imaging endpoint, the reports and the audit chain.

This walks the real route table instead of sampling, so a router added without a
guard fails here rather than shipping open.
"""
from __future__ import annotations

from fastapi.routing import APIRoute

from conftest import anonymous_client
from main import app

# Routes that are public on purpose. Anything not listed here must answer 401.
_PUBLIC = {
    ("POST", "/api/auth/login"),      # obtaining a token cannot need a token
    ("POST", "/api/auth/signup"),     # public registration → pending approval
    ("POST", "/api/auth/logout"),     # clearing a cookie must work with an expired token
    ("GET",  "/health"),              # liveness probe for the deployment
    ("GET",  "/"),                    # API banner
}

# Bodies good enough to get past request validation; a 422 would hide the 401.
_SAMPLE_BODY = {"session_id": "x"}


def _api_routes(routes, prefix: str = ""):
    """Las APIRoute reales, también las de los routers incluidos.

    Desde FastAPI 0.141 `include_router` deja en `app.routes` un envoltorio
    perezoso (`_IncludedRouter`) en lugar de copiar las rutas: el recorrido
    plano veía solo 5 rutas, la prueba de 401 pasaba sin probar nada y la del
    allowlist daba por desaparecidos login, signup y logout. Se baja a
    `original_router` para que la cobertura sea la misma con 0.136 (lock) y
    con 0.141 (venv local)."""
    for r in routes:
        if isinstance(r, APIRoute):
            yield prefix + r.path, r
        elif hasattr(r, "original_router"):
            ctx_prefix = getattr(getattr(r, "include_context", None), "prefix", "") or ""
            yield from _api_routes(r.original_router.routes, prefix + ctx_prefix)


def _routes() -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    for template, r in _api_routes(app.routes):
        # Fill path params with a value that will never match a real record, so
        # the request dies on auth rather than on a lookup.
        path = template
        for name in r.param_convertors:
            path = path.replace("{" + name + "}", "999999")
        for method in sorted(r.methods - {"HEAD", "OPTIONS"}):
            out.append((method, path, template))
    return out


def test_the_walk_sees_the_whole_route_table():
    """Sin esto, un cambio de FastAPI vuelve a dejar la cobertura en vacío."""
    real = {t for _m, _p, t in _routes()}
    assert {"/api/patients", "/api/auth/login", "/api/clip-orders"} <= real
    assert len(real) > 100


def test_every_route_is_either_public_by_design_or_authenticated():
    client = anonymous_client(app)
    open_routes: list[str] = []

    for method, path, template in _routes():
        if (method, template) in _PUBLIC:
            continue
        r = client.request(method, path, json=_SAMPLE_BODY if method in ("POST", "PUT") else None)
        if r.status_code not in (401, 403):
            open_routes.append(f"{method} {template} -> {r.status_code}")

    assert not open_routes, (
        "rutas alcanzables sin autenticación:\n  " + "\n  ".join(open_routes)
    )


def test_the_public_allowlist_still_matches_real_routes():
    """A typo in _PUBLIC would silently exempt nothing — or hide a real route."""
    real = {(m, t) for m, _p, t in _routes()}
    stale = _PUBLIC - real
    assert not stale, f"entradas de _PUBLIC que ya no existen: {stale}"


class TestSessionFilesAreNotPublic:
    """`/data` is a StaticFiles mount, so router dependencies do not apply."""

    def test_session_dicom_requires_auth(self):
        r = anonymous_client(app).get("/data/sessions/whatever/dicom/IM_0001")
        assert r.status_code == 401, "el DICOM de sesión sigue siendo descargable"

    def test_authenticated_request_is_not_blocked_by_the_guard(self):
        from main import app as real_app
        from starlette.testclient import TestClient

        # Authenticated (conftest adds the header): the guard must let it reach
        # StaticFiles, which then 404s because the file does not exist.
        r = TestClient(real_app).get("/data/sessions/whatever/dicom/IM_0001")
        assert r.status_code == 404


class TestCookieAuth:
    """An <img src> or a vtk.js mesh fetch cannot send an Authorization header."""

    def test_login_sets_the_cookie_and_it_authenticates_on_its_own(self):
        c = anonymous_client(app)
        r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200, r.text
        assert "prospective_token" in c.cookies

        # No Authorization header anywhere — only the cookie the browser holds.
        assert "Authorization" not in c.headers
        assert c.get("/api/patients").status_code == 200

    def test_logout_clears_the_cookie(self):
        c = anonymous_client(app)
        c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert c.post("/api/auth/logout").status_code == 200
        c.cookies.clear()
        assert c.get("/api/patients").status_code == 401
