"""Capturas del visor adjuntas al estudio: guardar, listar, servir, borrar.

Lo que estas pruebas defienden, por orden de importancia:

1. Que la imagen va al ARCHIVO DURABLE y no a `data/sessions/…`. Las sesiones
   se purgan a las 24 h; una captura que el cirujano guarda hoy tiene que
   seguir ahí el lunes. Es el error que el diseño tenía que evitar y el que
   nadie notaría hasta el día siguiente.
2. Que borrar borra de verdad el fichero. `delete_prefix` del backend local
   solo mira directorios, así que con la clave de un objeto no borraba nada:
   el usuario veía desaparecer la fila y la imagen del paciente seguía en
   disco.
3. Que no se archiva cualquier cosa que digan que es un PNG.
4. Que la captura guarda el estado que la produjo, que es lo que la hace
   legible seis semanas después.
"""
from __future__ import annotations

import base64
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_capturas_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
# Aislar el archivo: sin esto las pruebas escriben sobre el almacén real y se
# llevan por delante el DICOM de un paciente (ya pasó una vez).
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import zlib
from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from services.database import Base, SessionLocal, engine
from services.db_models import CaseCapture, ImagingStudy, Patient, Study
from services.storage import get_storage, study_files_root

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


# ── Un PNG de verdad, hecho a mano ─────────────────────────────────────────── #

def _png(width: int = 4, height: int = 3) -> bytes:
    """El PNG más pequeño que un decodificador acepta, del tamaño pedido.

    Hecho a mano y no con Pillow: lo que se está probando es que el endpoint
    distingue bytes de PNG de cualquier otra cosa, y para eso hace falta
    controlar los bytes.
    """
    def chunk(tipo: bytes, datos: bytes) -> bytes:
        return (len(datos).to_bytes(4, "big") + tipo + datos
                + zlib.crc32(tipo + datos).to_bytes(4, "big"))

    ihdr = (width.to_bytes(4, "big") + height.to_bytes(4, "big")
            + bytes([8, 2, 0, 0, 0]))            # 8 bits, color RGB
    filas = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(filas)) + chunk(b"IEND", b""))


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _estudio(nombre: str = "Capturas") -> tuple[int, int, int]:
    """Paciente + caso + estudio de imagen. Devuelve sus tres id."""
    db = SessionLocal()
    try:
        p = Patient(surname=nombre, given_name="Test", hospital_id=f"HC-{nombre}")
        db.add(p); db.commit(); db.refresh(p)
        caso = Study(patient_id=p.id, description="3D-RA", dx_principal="Aneurisma ACM")
        db.add(caso); db.commit(); db.refresh(caso)
        img = ImagingStudy(case_id=caso.id, patient_id=p.id, description="3D-RA", modality="XA")
        db.add(img); db.commit(); db.refresh(img)
        return p.id, caso.id, img.id
    finally:
        db.close()


def _guardar(img_id: int, **extra) -> dict:
    cuerpo = {
        "imaging_study_id": img_id,
        "session_id": "sesion-viva-1234",
        "step": "morpho",
        "label": "Morfometría · plano de cuello",
        "png_b64": _b64(_png(64, 48)),
        "width": 64, "height": 48,
        "state": {"camera": {"position": [1, 2, 3]}, "candidate": "cand_002", "neck_mm": 3.95},
    }
    cuerpo.update(extra)
    r = client.post("/api/captures", json=cuerpo)
    assert r.status_code == 201, r.text
    return r.json()


# ── Dónde acaba el fichero ─────────────────────────────────────────────────── #

class TestDondeSeGuarda:
    def test_el_png_va_al_archivo_durable_y_no_a_data(self):
        _, _, img = _estudio("Durable")
        cap = _guardar(img)

        db = SessionLocal()
        try:
            fila = db.query(CaseCapture).filter(CaseCapture.id == cap["id"]).one()
            clave = fila.storage_key
        finally:
            db.close()

        # Está en el almacén, bajo el prefijo de SU estudio de imagen.
        assert get_storage().exists(clave)
        assert clave.startswith(f"studies/{img}/captures/")
        en_disco = study_files_root() / clave
        assert en_disco.is_file() and en_disco.read_bytes().startswith(b"\x89PNG")

        # Y NO cuelga de data/, que es StaticFiles y además se purga.
        assert "data" not in Path(clave).parts
        assert not cap["image_url"].startswith("/data")
        assert cap["image_url"] == f"/api/captures/{cap['id']}/image"

    def test_el_nombre_del_fichero_lo_pone_el_servidor(self):
        # Dos capturas con el mismo rótulo no pueden pisarse, y el cliente no
        # elige la clave: un nombre venido de fuera puede escaparse del prefijo.
        _, _, img = _estudio("Nombres")
        a, b = _guardar(img), _guardar(img)
        db = SessionLocal()
        try:
            claves = {db.query(CaseCapture).filter(CaseCapture.id == c["id"]).one().storage_key
                      for c in (a, b)}
        finally:
            db.close()
        assert len(claves) == 2

    def test_cuelga_del_estudio_de_imagen_y_lleva_caso_y_paciente(self):
        pac, caso, img = _estudio("Cadena")
        cap = _guardar(img)
        assert cap["imaging_study_id"] == img
        assert cap["case_id"] == caso
        assert cap["patient_id"] == pac


# ── Qué se guarda además de los píxeles ────────────────────────────────────── #

class TestLoQueAcompanaALaImagen:
    def test_guarda_el_estado_que_la_produjo(self):
        # Sin esto, dentro de seis semanas la imagen no contesta «¿qué umbral
        # era?» ni «¿qué candidato?»: es el motivo de que exista `state`.
        _, _, img = _estudio("Estado")
        cap = _guardar(img)
        assert cap["state"]["candidate"] == "cand_002"
        assert cap["state"]["neck_mm"] == 3.95
        assert cap["state"]["camera"]["position"] == [1, 2, 3]
        assert cap["step"] == "morpho"
        assert cap["session_id"] == "sesion-viva-1234"

    def test_sin_rotulo_ninguna_fila_queda_sin_nombre(self):
        _, _, img = _estudio("Rotulo")
        cap = _guardar(img, label="")
        assert cap["label"].startswith("Captura ")

    def test_anota_el_peso_real_del_fichero(self):
        _, _, img = _estudio("Peso")
        png = _png(40, 30)
        cap = _guardar(img, png_b64=_b64(png))
        assert cap["size_bytes"] == len(png)


# ── Lo que no se archiva ───────────────────────────────────────────────────── #

class TestLoQueRechaza:
    def test_unos_bytes_que_no_son_png(self):
        _, _, img = _estudio("NoPng")
        r = client.post("/api/captures", json={
            "imaging_study_id": img, "png_b64": _b64(b"GIF89a esto no es un png")})
        assert r.status_code == 422
        assert "PNG" in r.json()["detail"]

    def test_base64_roto(self):
        _, _, img = _estudio("Base64")
        r = client.post("/api/captures", json={"imaging_study_id": img, "png_b64": "no-es-base64!!"})
        assert r.status_code == 422

    def test_una_imagen_vacia(self):
        _, _, img = _estudio("Vacia")
        r = client.post("/api/captures", json={"imaging_study_id": img, "png_b64": ""})
        assert r.status_code == 422

    def test_un_estudio_que_no_existe(self):
        r = client.post("/api/captures", json={"imaging_study_id": 999999, "png_b64": _b64(_png())})
        assert r.status_code == 404

    def test_acepta_el_data_url_entero_por_comodidad(self):
        # El visor tiene un data URL en la mano; obligarle a cortarlo solo
        # invita a que un cliente lo corte mal.
        _, _, img = _estudio("DataUrl")
        r = client.post("/api/captures", json={
            "imaging_study_id": img, "png_b64": "data:image/png;base64," + _b64(_png())})
        assert r.status_code == 201, r.text


# ── Listar ─────────────────────────────────────────────────────────────────── #

class TestListado:
    def test_por_estudio_caso_y_paciente(self):
        pac, caso, img = _estudio("Listar")
        _guardar(img); _guardar(img)
        for filtro in (f"imaging_study_id={img}", f"case_id={caso}", f"patient_id={pac}"):
            r = client.get(f"/api/captures?{filtro}")
            assert r.status_code == 200, r.text
            assert len(r.json()) == 2, filtro

    def test_no_devuelve_las_de_otro_estudio(self):
        _, _, a = _estudio("SoloA")
        _, _, b = _estudio("SoloB")
        _guardar(a)
        assert client.get(f"/api/captures?imaging_study_id={b}").json() == []

    def test_sin_filtro_no_vuelca_la_base_entera(self):
        # Una lista de todas las capturas de todos los pacientes no le sirve a
        # nadie y es exactamente lo que no debe poder pedirse de un tirón.
        assert client.get("/api/captures").status_code == 422

    def test_la_mas_reciente_primero(self):
        _, _, img = _estudio("Orden")
        primera = _guardar(img, label="primera")
        segunda = _guardar(img, label="segunda")
        ids = [c["id"] for c in client.get(f"/api/captures?imaging_study_id={img}").json()]
        assert ids == [segunda["id"], primera["id"]]


# ── Servir la imagen ───────────────────────────────────────────────────────── #

class TestServirLaImagen:
    def test_devuelve_los_mismos_bytes_que_entraron(self):
        _, _, img = _estudio("Bytes")
        png = _png(20, 10)
        cap = _guardar(img, png_b64=_b64(png))
        r = client.get(cap["image_url"])
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.content == png

    def test_una_captura_que_no_existe(self):
        assert client.get("/api/captures/999999/image").status_code == 404

    def test_si_el_fichero_desapareció_lo_dice(self):
        # La fila puede sobrevivir al fichero (archivo movido, borrado a mano).
        # Debe contestar 404, no reventar con un 500.
        _, _, img = _estudio("Huerfana")
        cap = _guardar(img)
        db = SessionLocal()
        try:
            clave = db.query(CaseCapture).filter(CaseCapture.id == cap["id"]).one().storage_key
        finally:
            db.close()
        (study_files_root() / clave).unlink()
        assert client.get(cap["image_url"]).status_code == 404


# ── Renombrar y borrar ─────────────────────────────────────────────────────── #

class TestRenombrarYBorrar:
    def test_renombrar(self):
        _, _, img = _estudio("Renombrar")
        cap = _guardar(img)
        r = client.patch(f"/api/captures/{cap['id']}", json={"label": "Cuello marcado, vista lateral"})
        assert r.status_code == 200
        assert r.json()["label"] == "Cuello marcado, vista lateral"

    def test_no_se_puede_dejar_sin_nombre(self):
        _, _, img = _estudio("SinNombre")
        cap = _guardar(img)
        assert client.patch(f"/api/captures/{cap['id']}", json={"label": "   "}).status_code == 422

    def test_borrar_se_lleva_la_fila_Y_EL_FICHERO(self):
        # El fallo que esto guarda: `delete_prefix` del backend local solo mira
        # directorios, así que con la clave de un objeto no borraba nada. La
        # fila desaparecía y la imagen del paciente seguía en disco.
        _, _, img = _estudio("Borrar")
        cap = _guardar(img)
        db = SessionLocal()
        try:
            clave = db.query(CaseCapture).filter(CaseCapture.id == cap["id"]).one().storage_key
        finally:
            db.close()
        assert (study_files_root() / clave).is_file()

        assert client.delete(f"/api/captures/{cap['id']}").status_code == 204
        assert not (study_files_root() / clave).exists(), "el PNG del paciente sigue en disco"
        assert client.get(f"/api/captures?imaging_study_id={img}").json() == []
        assert client.get(cap["image_url"]).status_code == 404

    def test_borrar_algo_que_no_existe(self):
        assert client.delete("/api/captures/999999").status_code == 404


# ── Las capturas elegidas, dentro del informe ──────────────────────────────── #

class TestEnElInforme:
    """El profesional elige cuáles entran, y en qué orden.

    El informe no mete todas las del caso ni escoge por su cuenta: eso lo pidió
    así el usuario. Lo que se comprueba aquí es que la selección se respeta,
    que el orden es el suyo y que una captura que ya no está no tumba el PDF.
    """

    @staticmethod
    def _elegidas(ids):
        from services.report_generator import build_report_data_from_session
        from services.sessions import create_session
        db = SessionLocal()
        try:
            return build_report_data_from_session(create_session(), capture_ids=ids, db=db).captures
        finally:
            db.close()

    def test_solo_entran_las_elegidas(self):
        _, _, img = _estudio("InformeElegidas")
        a = _guardar(img, label="la que quiero")
        _guardar(img, label="la que no")
        caps = self._elegidas([a["id"]])
        assert [c.label for c in caps] == ["la que quiero"]

    def test_respeta_el_orden_pedido(self):
        # Son el relato del caso que hace el profesional, no un volcado por
        # fecha: si pide 2-1, el informe enseña 2-1.
        _, _, img = _estudio("InformeOrden")
        primera = _guardar(img, label="primera")
        segunda = _guardar(img, label="segunda")
        caps = self._elegidas([segunda["id"], primera["id"]])
        assert [c.label for c in caps] == ["segunda", "primera"]

    def test_lleva_los_bytes_y_el_pie_con_su_procedencia(self):
        _, _, img = _estudio("InformePie")
        png = _png(30, 20)
        cap = _guardar(img, png_b64=_b64(png),
                       state={"heading": "AZ 12° · EL -20°", "orientation_known": False})
        c = self._elegidas([cap["id"]])[0]
        assert c.png == png
        assert "AZ 12° · EL -20°" in c.caption
        # Si la orientación es asumida, el pie lo dice: la imagen se mira, el
        # pie se lee, y una orientación inventada no puede parecer medida.
        assert "asumida" in c.caption
        assert c.step == "morpho" and c.taken_at

    def test_sin_elegir_ninguna_no_hay_seccion(self):
        assert self._elegidas([]) == []
        assert self._elegidas(None) == []

    def test_una_captura_borrada_no_tumba_el_informe(self):
        _, _, img = _estudio("InformeHuerfana")
        viva = _guardar(img, label="viva")
        muerta = _guardar(img, label="muerta")
        client.delete(f"/api/captures/{muerta['id']}")
        caps = self._elegidas([muerta["id"], viva["id"]])
        assert [c.label for c in caps] == ["viva"]

    def test_el_pdf_las_incluye(self):
        # De punta a punta: que la sección exista en el documento generado.
        import tempfile as _tf
        from pathlib import Path as _P
        from services.report_generator import ReportGenerator, ReportData, ReportCapture

        data = ReportData(captures=[ReportCapture(png=_png(40, 30), label="Cuello marcado",
                                                  taken_at="27/09/2026 23:19", caption="AZ 0° · EL -20°")])
        salida = _P(_tf.mkdtemp()) / "informe.pdf"
        ReportGenerator(data).generate(salida)
        assert salida.is_file() and salida.stat().st_size > 1000
        crudo = salida.read_bytes()
        # El texto del PDF va comprimido, así que se comprueba lo que se puede
        # sin descomprimirlo: que hay una imagen incrustada y que el documento
        # creció respecto al mismo informe sin capturas.
        assert b"/Image" in crudo or b"/XObject" in crudo
        vacio = _P(_tf.mkdtemp()) / "vacio.pdf"
        ReportGenerator(ReportData()).generate(vacio)
        assert salida.stat().st_size > vacio.stat().st_size
