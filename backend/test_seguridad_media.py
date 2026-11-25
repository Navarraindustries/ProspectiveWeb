"""Seguridad media: registro público acotado, estado de sesión sin inyección de
claves, clip importado sin salir de su sesión, prefijo de S3 como carpeta,
cookie segura tras HTTPS y cadena de auditoría firmada."""
from __future__ import annotations

import io
import sqlite3

import pytest
from fastapi.testclient import TestClient

from main import app
from services.sessions import create_session, read_state, session_subdir, write_state

client = TestClient(app)


class TestRegistro:
    def _alta(self, c, usuario, **archivos):
        datos = {"username": usuario, "password": "Secreta123", "full_name": "Prueba"}
        return c.post("/api/auth/signup", data=datos, files=archivos or None)

    def test_un_nombre_de_usuario_raro_no_entra(self):
        r = self._alta(client, "con espacio\nsalto")
        assert r.status_code == 400

    def test_una_foto_enorme_se_corta_sin_leerla_entera(self):
        enorme = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * (7 * 1024 * 1024))
        r = self._alta(client, "foto_enorme", photo=("f.png", enorme, "image/png"))
        assert r.status_code == 413

    def test_hay_un_tope_por_hora_y_direccion(self, monkeypatch):
        from routers import auth
        monkeypatch.setenv("PROSPECTIVE_SIGNUP_PER_HOUR", "2")
        monkeypatch.setattr(auth, "_registros", {})
        codigos = [self._alta(client, f"tope_{i}").status_code for i in range(3)]
        assert codigos[:2] == [201, 201] and codigos[2] == 429


class TestEstadoDeSesion:
    def test_un_salto_de_linea_no_escribe_claves_falsas(self):
        sid = create_session()
        write_state(sid, "treatment.notes", "nota\nmorpho.max_diameter_mm=99")
        assert read_state(sid, "morpho.max_diameter_mm", "") == ""
        assert read_state(sid, "treatment.notes", "") == "nota\nmorpho.max_diameter_mm=99"

    def test_lo_de_siempre_se_guarda_igual(self):
        sid = create_session()
        write_state(sid, "morpho.ar", "1.5")
        texto = (session_subdir(sid, "") / "state.txt").read_text(encoding="utf-8")
        assert "morpho.ar=1.5" in texto

    def test_una_clave_con_igual_o_salto_se_rechaza(self):
        sid = create_session()
        with pytest.raises(ValueError):
            write_state(sid, "a=b", "x")
        with pytest.raises(ValueError):
            write_state(sid, "a\nb", "x")


class TestClipImportado:
    def test_el_id_no_sale_de_la_carpeta_de_la_sesion(self, tmp_path):
        from routers.clips import _clip_geometry_for
        import services.segmentation as seg
        leidas = []
        original = seg.read_vtp
        seg.read_vtp = lambda ruta: leidas.append(ruta) or original(ruta)
        try:
            otra = create_session()
            (session_subdir(otra, "meshes") / "custom_clip_1.vtp").write_text("malla de otra sesión")
            mia = session_subdir(create_session(), "meshes")
            malla = _clip_geometry_for(f"custom:1/../../../{otra}/meshes/custom_clip_1", mia)
        finally:
            seg.read_vtp = original
        assert leidas == []                                   # no abrió la de la otra sesión
        assert malla is not None and malla.GetNumberOfPoints() > 0   # cae al clip sintético


class TestPrefijoS3:
    def test_el_prefijo_es_una_carpeta(self):
        from services.storage import S3Backend
        pedidos = []

        class _Pag:
            def paginate(self, **kw):
                pedidos.append(kw["Prefix"])
                return [{"Contents": []}]

        b = S3Backend.__new__(S3Backend)
        b.bucket, b.prefix = "b", ""
        b._s3 = type("C", (), {"get_paginator": lambda self, n: _Pag()})()
        b._objects("studies/4")
        assert pedidos == ["studies/4/"]


class TestCookie:
    def test_tras_https_la_cookie_va_segura(self):
        r = TestClient(app, base_url="https://testserver").post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200
        assert "secure" in r.headers.get("set-cookie", "").lower()


class TestCadenaFirmada:
    def test_reescribir_un_bloque_sin_la_clave_se_detecta(self, tmp_path):
        from services.audit import SkullChain
        c = SkullChain(db_path=tmp_path / "cadena.db")
        c.append("A", {"x": 1}, "u")
        c.append("B", {"x": 2}, "u")
        assert c.verify_integrity()[0] is True
        # Quien puede escribir el fichero pero no tiene la clave: rehace el
        # último bloque con el SHA-256 sin clave de antes.
        from hashlib import sha256
        conn = sqlite3.connect(c._path)
        fila = conn.execute("SELECT id, iso_ts, username, patient_hash, action, payload_hash, prev_hash "
                            "FROM blocks ORDER BY id DESC LIMIT 1").fetchone()
        falso = sha256("|".join([fila[1], fila[2], fila[3], "OTRA", fila[5], fila[6]]).encode()).hexdigest()
        conn.execute("UPDATE blocks SET action='OTRA', block_hash=? WHERE id=?", (falso, fila[0]))
        conn.commit(); conn.close()
        ok, rotos = SkullChain(db_path=c._path).verify_integrity()
        assert ok is False
        assert any("sin firma" in b["reason"] for b in rotos)


class TestRutasDeSesion:
    def test_la_barra_invertida_no_sale_de_la_sesion(self):
        sid = create_session()
        r = client.get(f"/data/sessions/{sid}/meshes%5C..%5C..%5Cotra/x.vtp")
        assert r.status_code == 404


class TestTokensRevocados:
    def _cuenta(self, nombre):
        from services.auth_service import get_password_hash
        from services.database import SessionLocal
        from services.db_models import User
        db = SessionLocal()
        db.query(User).filter(User.username == nombre).delete()
        u = User(username=nombre, hashed_password=get_password_hash("clave-123"),
                 full_name=nombre, role="medico", status="active", is_active=True)
        db.add(u); db.commit(); uid = u.id; db.close()
        return uid

    def _con_token(self, token):
        from conftest import anonymous_client
        c = anonymous_client(app)
        c.headers["Authorization"] = f"Bearer {token}"
        return c

    def test_restablecer_la_contrasena_invalida_los_tokens(self):
        uid = self._cuenta("revoca_reset")
        from conftest import anonymous_client
        token = anonymous_client(app).post("/api/auth/login", json={
            "username": "revoca_reset", "password": "clave-123"}).json()["access_token"]
        assert self._con_token(token).get("/api/auth/me").status_code == 200
        assert client.post(f"/api/auth/users/{uid}/reset-password",
                           json={"new_password": "otra-clave-456"}).status_code == 200
        assert self._con_token(token).get("/api/auth/me").status_code == 401

    def test_cambiar_la_contrasena_deja_dentro_solo_a_quien_la_cambio(self):
        self._cuenta("revoca_cambio")
        from conftest import anonymous_client
        a = anonymous_client(app)
        a.post("/api/auth/login", json={"username": "revoca_cambio", "password": "clave-123"})
        token_viejo = a.cookies.get("prospective_token")
        from services.csrf import CSRF_COOKIE
        a.headers["X-CSRF-Token"] = a.cookies.get(CSRF_COOKIE)
        r = a.post("/api/auth/change-password", json={
            "current_password": "clave-123", "new_password": "nueva-clave-789"})
        assert r.status_code == 200
        assert a.get("/api/auth/me").status_code == 200           # cookie nueva
        assert self._con_token(token_viejo).get("/api/auth/me").status_code == 401


class TestS3ConClienteFalso:
    def test_borrar_un_estudio_no_toca_los_de_numero_parecido(self):
        """Con un cliente falso que guarda en un diccionario (no hay tests
        contra un S3 real): borrar studies/4 deja studies/40 y studies/400."""
        from services.storage import S3Backend
        objetos: dict[str, bytes] = {}

        class _Pag:
            def paginate(self, Bucket, Prefix):
                return [{"Contents": [{"Key": k, "Size": len(v)} for k, v in objetos.items()
                                      if k.startswith(Prefix)]}]

        class _Cliente:
            def get_paginator(self, _n): return _Pag()
            def put_object(self, Bucket, Key, Body, **_k): objetos[Key] = Body
            def delete_objects(self, Bucket, Delete):
                for o in Delete["Objects"]:
                    objetos.pop(o["Key"], None)

        b = S3Backend.__new__(S3Backend)
        b.bucket, b.prefix, b._s3 = "b", "", _Cliente()
        for k in ("studies/4/dicom/a", "studies/40/dicom/a", "studies/400/dicom/a"):
            b.put_bytes(k, b"x")
        b.delete_prefix("studies/4")
        assert sorted(objetos) == ["studies/40/dicom/a", "studies/400/dicom/a"]
