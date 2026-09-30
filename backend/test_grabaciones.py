"""Grabaciones del visor: una captura más, con vídeo en vez de PNG.

Lo que se defiende:

1. Que el vídeo va al archivo durable junto a las capturas, y se sirve solo por
   su endpoint autenticado.
2. Que no se archiva cualquier cosa que digan que es un vídeo: solo MP4 o WebM,
   comprobados por sus bytes, y con tope de tamaño.
3. Que el informe PDF no mete un vídeo como si fuera una imagen.
4. Que las capturas de antes siguen leyéndose igual: son PNG.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_grabaciones_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

from fastapi.testclient import TestClient

from main import app
from routers import captures as rcap
from services.database import Base, SessionLocal, engine
from services.db_models import CaseCapture
from services.storage import get_storage, study_files_root
from test_captures import _estudio, _guardar

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

#: Cabeceras mínimas: lo que el endpoint mira son los primeros bytes.
MP4 = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41" + b"\x00" * 2000
WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01" + b"\x00" * 2000


def _subir(img_id: int, datos: bytes = MP4, nombre: str = "grabacion.mp4", **campos):
    form = {
        "imaging_study_id": str(img_id),
        "session_id": "sesion-viva",
        "step": "morpho",
        "label": "Giro del domo",
        "width": "1280", "height": "720",
        "duration_s": "12.4",
        "state": json.dumps({"layout": {"main": "scene"}, "candidate_id": "cand-001"}),
    }
    form.update({k: str(v) for k, v in campos.items()})
    return client.post("/api/captures/video", data=form,
                       files={"file": (nombre, datos, "application/octet-stream")})


class TestGuardar:
    def test_un_mp4_se_archiva_junto_a_las_capturas(self):
        _, _, img = _estudio("VideoMp4")
        r = _subir(img)
        assert r.status_code == 201, r.text
        v = r.json()
        assert v["media_type"] == "video/mp4"
        assert v["duration_s"] == 12.4
        assert v["video_url"] == f"/api/captures/{v['id']}/video"
        assert v["image_url"] == ""
        assert v["state"]["candidate_id"] == "cand-001"

        db = SessionLocal()
        try:
            clave = db.query(CaseCapture).filter(CaseCapture.id == v["id"]).one().storage_key
        finally:
            db.close()
        assert clave.endswith(".mp4") and "/captures/" in clave
        assert (study_files_root() / clave).exists()
        assert "sessions" not in clave

    def test_un_webm_tambien(self):
        _, _, img = _estudio("VideoWebm")
        r = _subir(img, WEBM, "grabacion.webm")
        assert r.status_code == 201, r.text
        assert r.json()["media_type"] == "video/webm"

    def test_el_tipo_sale_de_los_bytes_no_del_nombre(self):
        _, _, img = _estudio("VideoNombre")
        r = _subir(img, WEBM, "engañoso.mp4")
        assert r.status_code == 201 and r.json()["media_type"] == "video/webm"

    def test_rechaza_lo_que_no_es_video(self):
        _, _, img = _estudio("VideoFalso")
        r = _subir(img, b"%PDF-1.7 esto no es un video" + b"\x00" * 100, "x.mp4")
        assert r.status_code == 422
        assert "MP4" in r.json()["detail"]

    def test_rechaza_uno_vacio(self):
        _, _, img = _estudio("VideoVacio")
        assert _subir(img, b"").status_code == 422

    def test_rechaza_lo_que_pasa_del_tope(self, monkeypatch):
        _, _, img = _estudio("VideoGrande")
        monkeypatch.setattr(rcap, "MAX_VIDEO_BYTES", 1024)
        r = _subir(img)
        assert r.status_code == 413

    def test_estudio_inexistente(self):
        assert _subir(999_999).status_code == 404

    def test_estado_que_no_es_json(self):
        _, _, img = _estudio("VideoEstado")
        assert _subir(img, state="{roto").status_code == 422


class TestServir:
    def test_el_video_se_sirve_con_su_tipo(self):
        _, _, img = _estudio("VideoServir")
        v = _subir(img).json()
        r = client.get(v["video_url"])
        assert r.status_code == 200
        assert r.headers["content-type"] == "video/mp4"
        assert r.content == MP4

    def test_una_grabacion_no_se_sirve_como_imagen_ni_al_reves(self):
        _, _, img = _estudio("VideoCruce")
        v = _subir(img).json()
        c = _guardar(img)
        assert client.get(f"/api/captures/{v['id']}/image").status_code == 404
        assert client.get(f"/api/captures/{c['id']}/video").status_code == 404

    def test_el_listado_trae_las_dos_cosas_y_las_distingue(self):
        _, _, img = _estudio("VideoLista")
        _guardar(img)
        _subir(img)
        filas = client.get(f"/api/captures?imaging_study_id={img}").json()
        assert sorted(f["media_type"] for f in filas) == ["image/png", "video/mp4"]

    def test_las_capturas_de_antes_siguen_siendo_png(self):
        _, _, img = _estudio("VideoAntes")
        c = _guardar(img)
        assert c["media_type"] == "image/png" and c["video_url"] == "" and c["duration_s"] == 0

    def test_borrar_una_grabacion_borra_el_fichero(self):
        _, _, img = _estudio("VideoBorrar")
        v = _subir(img).json()
        db = SessionLocal()
        try:
            clave = db.query(CaseCapture).filter(CaseCapture.id == v["id"]).one().storage_key
        finally:
            db.close()
        assert client.delete(f"/api/captures/{v['id']}").status_code == 204
        assert not get_storage().exists(clave)


class TestInforme:
    def test_el_pdf_no_mete_un_video_como_imagen(self):
        from services.report_generator import build_report_data_from_session
        from services.sessions import create_session

        _, _, img = _estudio("VideoInforme")
        c = _guardar(img)
        v = _subir(img).json()
        db = SessionLocal()
        try:
            capturas = build_report_data_from_session(create_session(), capture_ids=[v["id"], c["id"]], db=db).captures
        finally:
            db.close()
        assert len(capturas) == 1 and capturas[0].png.startswith(b"\x89PNG")
