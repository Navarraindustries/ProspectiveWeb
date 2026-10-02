"""Doble envío contra CSRF para las peticiones que se autentican por cookie.

La sesión va también en una cookie (`prospective_token`) porque un `<img src>`
o las mallas que pide vtk.js no pueden llevar la cabecera Authorization. Esa
cookie la manda el navegador solo, así que una página ajena podría provocar un
POST con ella. SameSite=Lax ya lo frena entre sitios distintos; esto cubre lo
que Lax no: otro origen del MISMO sitio (un subdominio) y navegadores que no
respetan SameSite.

La regla: un método que cambia algo, autenticado por cookie y SIN cabecera
Authorization, tiene que traer `X-CSRF-Token` igual a la cookie
`prospective_csrf`. Esa cookie la puede leer el JavaScript del propio origen y
no el de otro, que es lo que demuestra quién hace la petición. Con Bearer no
se exige: ninguna página ajena puede poner esa cabecera sin pasar por CORS.
"""
from __future__ import annotations

import hmac
import secrets

CSRF_COOKIE = "prospective_csrf"
CSRF_HEADER = "X-CSRF-Token"

_UNSAFE = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Entrar o registrarse no usa la sesión, y una cookie vieja no debe impedirlo.
# Salir tampoco: forzar a alguien a cerrar sesión no le hace nada, y una sesión
# abierta antes de existir la cookie CSRF tiene que poder cerrarse.
_EXEMPT = ("/api/auth/login", "/api/auth/signup", "/api/auth/logout")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def violation(method: str, path: str, headers, cookies) -> str | None:
    """El motivo del rechazo, o None si la petición pasa."""
    if method.upper() not in _UNSAFE or not path.startswith("/api/"):
        return None
    if any(path.startswith(p) for p in _EXEMPT):
        return None
    if headers.get("Authorization", "").lower().startswith("bearer "):
        return None
    if not cookies.get("prospective_token"):
        return None        # sin credenciales: lo rechazará (o no) el endpoint
    esperado = cookies.get(CSRF_COOKIE) or ""
    recibido = headers.get(CSRF_HEADER) or ""
    if not esperado or not recibido or not hmac.compare_digest(esperado, recibido):
        return "Falta el token CSRF o no coincide; vuelve a iniciar sesión."
    return None
