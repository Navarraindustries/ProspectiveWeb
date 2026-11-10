"""Avatar por configuración y estado del onboarding en /api/auth/me."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_meavatar_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine, SessionLocal
from services.db_models import User
from services.auth_service import get_password_hash

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

CONFIG = {
    "v": 1, "piel": 2, "peinado": "largo", "pelo": "#D8B26E", "cabeza": "gorro",
    "ojos": "gafas", "mascarilla": True, "pijama": "#5AA9FF", "fondo": "#10233D",
}


def _make_user(username: str) -> None:
    db = SessionLocal()
    db.add(User(username=username, full_name="Avatar Test", role="medico", is_active=True,
                status="active", hashed_password=get_password_hash("secret12345")))
    db.commit()
    db.close()


def _auth(username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "secret12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _me(h: dict) -> dict:
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_me_trae_avatar_por_defecto_y_onboarding_pendiente():
    _make_user("av_default")
    me = _me(_auth("av_default"))
    assert me["avatar_config"] is None
    assert me["avatar_mode"] == "avatar"
    assert me["has_profile_photo"] is False
    assert me["onboarding"]["estado"] == "pendiente"


def test_put_avatar_guarda_y_devuelve_la_config():
    _make_user("av_put")
    h = _auth("av_put")
    r = client.put("/api/auth/me/avatar", headers=h, json={"config": CONFIG, "modo": "avatar"})
    assert r.status_code == 200, r.text
    assert r.json()["avatar_config"] == CONFIG
    assert _me(h)["avatar_config"] == CONFIG


def test_put_avatar_rechaza_valor_fuera_de_lista():
    _make_user("av_bad")
    h = _auth("av_bad")
    r = client.put("/api/auth/me/avatar", headers=h,
                   json={"config": {**CONFIG, "peinado": "mohicano"}, "modo": "avatar"})
    assert r.status_code == 422


def test_put_avatar_rechaza_clave_desconocida():
    _make_user("av_key")
    h = _auth("av_key")
    r = client.put("/api/auth/me/avatar", headers=h,
                   json={"config": {**CONFIG, "extra": 1}, "modo": "avatar"})
    assert r.status_code == 422


def test_modo_foto_sin_foto_de_perfil_se_guarda_pero_has_profile_photo_false():
    _make_user("av_foto")
    h = _auth("av_foto")
    r = client.put("/api/auth/me/avatar", headers=h, json={"config": None, "modo": "foto"})
    assert r.status_code == 200, r.text
    me = _me(h)
    assert me["avatar_mode"] == "foto"
    assert me["has_profile_photo"] is False


def test_put_onboarding_guarda_estado_pistas_y_tarjeta():
    _make_user("ob_put")
    h = _auth("ob_put")
    body = {"estado": "completado", "fecha": "2026-11-09T10:00:00+00:00",
            "pistas_vistas": [1, 3], "pistas_activas": False, "tarjeta_cerrada": True}
    r = client.put("/api/auth/me/onboarding", headers=h, json=body)
    assert r.status_code == 200, r.text
    assert _me(h)["onboarding"] == body


def test_pistas_fuera_de_rango_422():
    _make_user("ob_rango")
    h = _auth("ob_rango")
    for malas in ([0], [9]):
        r = client.put("/api/auth/me/onboarding", headers=h,
                       json={"estado": "invitado", "pistas_vistas": malas})
        assert r.status_code == 422, malas


def test_json_corrupto_en_la_base_no_rompe_me():
    _make_user("av_corrupto")
    db = SessionLocal()
    u = db.query(User).filter(User.username == "av_corrupto").one()
    u.onboarding_state = "{no json"
    u.avatar_config = "{no json"
    db.commit()
    db.close()
    me = _me(_auth("av_corrupto"))
    assert me["onboarding"]["estado"] == "pendiente"
    assert me["avatar_config"] is None


def test_users_brief_incluye_avatar_y_modo():
    _make_user("av_brief")
    h = _auth("av_brief")
    client.put("/api/auth/me/avatar", headers=h, json={"config": CONFIG, "modo": "avatar"})
    rows = client.get("/api/auth/users/brief", headers=h).json()
    mine = next(r for r in rows if r["username"] == "av_brief")
    assert mine["avatar_config"] == CONFIG
    assert mine["avatar_mode"] == "avatar"
    assert mine["has_profile_photo"] is False


def test_listas_coinciden_con_el_cliente():
    import json
    from pathlib import Path

    import pytest

    from services import avatar_config as ac

    ruta = Path(__file__).resolve().parent.parent / "frontend" / "src" / "avatar" / "listas.json"
    if not ruta.exists():
        pytest.skip("frontend/src/avatar/listas.json no está en este despliegue")
    j = json.loads(ruta.read_text(encoding="utf-8"))
    assert tuple(j["pieles"]) == ac.PIELES
    assert tuple(j["peinados"]) == ac.PEINADOS
    assert tuple(j["coloresPelo"]) == ac.COLORES_PELO
    assert tuple(j["cabezas"]) == ac.CABEZAS
    assert tuple(j["ojos"]) == ac.OJOS
    assert tuple(j["pijamas"]) == ac.PIJAMAS
    assert tuple(j["fondos"]) == ac.FONDOS


def test_onboarding_fecha_larga_422():
    _make_user("ob_fecha")
    h = _auth("ob_fecha")
    r = client.put("/api/auth/me/onboarding", headers=h,
                   json={"estado": "saltado", "fecha": "x" * 41})
    assert r.status_code == 422
    r = client.put("/api/auth/me/onboarding", headers=h,
                   json={"estado": "saltado", "fecha": "x" * 40})
    assert r.status_code == 200, r.text


def test_onboarding_pistas_repetidas_se_quitan_y_mas_de_8_es_422():
    _make_user("ob_pistas")
    h = _auth("ob_pistas")
    r = client.put("/api/auth/me/onboarding", headers=h,
                   json={"estado": "completado", "pistas_vistas": [3, 1, 3, 1]})
    assert r.status_code == 200, r.text
    assert _me(h)["onboarding"]["pistas_vistas"] == [1, 3]
    r = client.put("/api/auth/me/onboarding", headers=h,
                   json={"estado": "completado", "pistas_vistas": [1, 2, 3, 4, 5, 6, 7, 8, 8]})
    assert r.status_code == 422
