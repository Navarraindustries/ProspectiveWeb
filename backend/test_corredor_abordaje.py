# -*- coding: utf-8 -*-
"""El corredor de abordaje deja de ser dos puntos y una línea.

Pedido por dirección: que el software valore la trayectoria, que de ella dependa
la viabilidad del procedimiento, y que diga qué se atraviesa y qué se podría
comprometer — o que no se compromete nada.

Lo que había era una recta: se guardaban entrada y diana, se devolvía la
profundidad y el ángulo, se pintaba un cilindro y eso llegaba al informe. Nada
miraba qué hay dentro del corredor.

Lo que se mide ahora, y con qué honestidad:

  · los VASOS que cruza, con su calibre — de la malla del paciente;
  · lo que roza sin cruzar: la rama más próxima y su calibre;
  · el material denso que NO es vasculatura. No se llama hueso: el hueso no se
    separa del contraste por intensidad (el 99 % cae dentro del rango del
    propio árbol), así que lo único afirmable es que hay algo denso donde la
    malla no llega. En un estudio sustraído ni eso: no hay tejido en la imagen.

El veredicto tiene tres estados y sale de reglas explícitas, no de una suma de
pesos — la misma razón por la que el motor de tratamiento dejó de puntuar.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="prospective_corridor_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.approach import (BLOCKING_VESSEL_MM, DEFAULT_CORRIDOR_RADIUS_MM,
                               assess_corridor)
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

client = TestClient(app, raise_server_exceptions=True)


def _tubo(p0, p1, r: float) -> vtk.vtkPolyData:
    ln = vtk.vtkLineSource(); ln.SetPoint1(*p0); ln.SetPoint2(*p1); ln.Update()
    tf = vtk.vtkTubeFilter()
    tf.SetInputData(ln.GetOutput()); tf.SetRadius(r)
    tf.SetNumberOfSides(24); tf.CappingOn(); tf.Update()
    return tf.GetOutput()


def _unir(*polys) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(ap.GetOutput()); tri.Update()
    return tri.GetOutput()


#: La diana: un vaso corto en el origen, que hace de aneurisma y de cuello.
DIANA = _tubo((-8, 0, 0), (8, 0, 0), 3.0)

#: Un vaso grueso cruzando el corredor a 20 mm de la entrada.
ATRAVESADO = _tubo((-20, -15, 30), (20, 15, 30), 1.5)

#: Uno fino, del calibre de una rama que se puede movilizar.
FINO = _tubo((-20, -15, 30), (20, 15, 30), 0.35)

ENTRADA = (0.0, 0.0, 50.0)
OBJETIVO = (0.0, 0.0, 0.0)


class _Rama:
    """Lo justo que el corredor le pide a un origen de rama congelado."""

    def __init__(self, position, calibre_mm):
        self.position = position
        self.calibre_mm = calibre_mm


class TestLoQueElCorredorAtraviesa:

    def test_un_corredor_limpio_no_inventa_obstaculos(self):
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA, neck_axis=(0, 0, 1))
        assert r.vessels_crossed == []
        assert r.verdict == "viable"
        assert "no atraviesa" in r.verdict_reason

    def test_el_aneurisma_no_cuenta_como_obstaculo(self):
        # La diana ES un vaso. Sin la bola de exclusión, el propio aneurisma
        # salía como «vaso atravesado» y ningún abordaje era viable nunca.
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA, neck_axis=(0, 0, 1))
        assert not any(v.distance_from_entry_mm > 40 for v in r.vessels_crossed)

    def test_encuentra_el_vaso_que_se_cruza_y_dice_donde(self):
        malla = _unir(DIANA, ATRAVESADO)
        r = assess_corridor(ENTRADA, OBJETIVO, malla, neck_axis=(0, 0, 1))
        assert len(r.vessels_crossed) == 1
        v = r.vessels_crossed[0]
        assert v.distance_from_entry_mm == pytest.approx(20.0, abs=2.0)
        assert v.calibre_mm == pytest.approx(3.0, abs=0.4), "⌀ del tubo, no el radio"

    def test_un_vaso_cruzado_por_muchos_rayos_se_cuenta_una_vez(self):
        # El haz lanza diecisiete rayos. Sin agrupar, un solo vaso salía
        # diecisiete veces y el veredicto hablaba de diecisiete obstáculos.
        malla = _unir(DIANA, ATRAVESADO)
        r = assess_corridor(ENTRADA, OBJETIVO, malla, neck_axis=(0, 0, 1))
        assert len(r.vessels_crossed) == 1

    def test_el_calibre_medido_manda_sobre_el_estimado(self):
        malla = _unir(DIANA, ATRAVESADO)
        # El cruce cae a 20 mm de la entrada, o sea en z = 50 − 20 = 30: la
        # distancia por el corredor y la coordenada del mundo no son lo mismo.
        rama = _Rama(position=(0.0, 0.0, 30.0), calibre_mm=2.4)
        r = assess_corridor(ENTRADA, OBJETIVO, malla, neck_axis=(0, 0, 1),
                            branches=[rama])
        v = r.vessels_crossed[0]
        assert v.calibre_source == "barrido" and v.calibre_mm == 2.4

    def test_una_malla_vacia_no_revienta(self):
        r = assess_corridor(ENTRADA, OBJETIVO, vtk.vtkPolyData())
        assert r.vessels_crossed == [] and r.depth_mm == 50.0

    def test_entrada_y_diana_en_el_mismo_punto(self):
        r = assess_corridor(OBJETIVO, OBJETIVO, DIANA)
        assert r.verdict == "revisar" and r.depth_mm == 0.0


class TestElVeredicto:
    """Tres estados, por reglas sobre lo medido. Sin puntuación."""

    def test_un_vaso_grueso_lo_hace_inviable(self):
        malla = _unir(DIANA, ATRAVESADO)
        r = assess_corridor(ENTRADA, OBJETIVO, malla, neck_axis=(0, 0, 1))
        assert r.verdict == "no_viable"
        assert "no se aparta" in r.verdict_reason
        assert f"{r.vessels_crossed[0].calibre_mm:.1f}" in r.verdict_reason

    def test_un_vaso_fino_es_para_revisar_no_para_descartar(self):
        # Puede ser una vena o una rama movilizable: decidirlo es del cirujano.
        malla = _unir(DIANA, FINO)
        r = assess_corridor(ENTRADA, OBJETIVO, malla, neck_axis=(0, 0, 1))
        assert r.vessels_crossed, "el vaso fino tiene que verse igualmente"
        assert all(v.calibre_mm < BLOCKING_VESSEL_MM for v in r.vessels_crossed)
        assert r.verdict == "revisar"

    def test_rozar_el_origen_de_una_rama_es_para_revisar(self):
        rama = _Rama(position=(1.5, 0.0, 25.0), calibre_mm=0.9)
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA, neck_axis=(0, 0, 1),
                            branches=[rama])
        assert r.nearest_branch_mm == pytest.approx(1.5, abs=0.1)
        assert r.verdict == "revisar"

    def test_una_rama_lejana_no_estropea_un_corredor_limpio(self):
        rama = _Rama(position=(12.0, 0.0, 25.0), calibre_mm=0.9)
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA, neck_axis=(0, 0, 1),
                            branches=[rama])
        assert r.verdict == "viable"
        assert r.nearest_branch_mm == pytest.approx(12.0, abs=0.1)
        assert "12" in r.verdict_reason


class TestLoQueNoSePuedeMedir:

    def test_en_un_estudio_sustraido_no_se_habla_de_tejido(self):
        # Una DSA sustraída no contiene hueso ni parénquima: solo el contraste.
        # Decir «0 mm de hueso» ahí sería afirmar que el camino está despejado.
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA, is_subtracted=True)
        assert r.dense_tissue_measurable is False
        assert any("sustraído" in f for f in r.findings)

    def test_avisa_de_que_las_perforantes_no_estan_en_la_malla(self):
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA)
        assert any("perforantes" in a for a in r.assumptions)

    def test_el_radio_del_corredor_es_un_supuesto_y_lo_dice(self):
        r = assess_corridor(ENTRADA, OBJETIVO, DIANA)
        assert r.radius_mm == DEFAULT_CORRIDOR_RADIUS_MM
        assert any("supone este software" in a for a in r.assumptions)

    def test_un_corredor_mas_ancho_ve_mas(self):
        # El vaso pasa de lado: un corredor estrecho lo libra y uno ancho no.
        lejos = _tubo((-20, -15, 30), (20, 15, 30), 0.4)
        malla = _unir(DIANA, lejos)
        estrecho = assess_corridor(ENTRADA, OBJETIVO, malla, radius_mm=0.5)
        ancho = assess_corridor(ENTRADA, OBJETIVO, malla, radius_mm=8.0)
        assert len(ancho.vessels_crossed) >= len(estrecho.vessels_crossed)


class TestPorLaApi:

    def _sesion(self, malla) -> str:
        sid = create_session()
        write_vtp(malla, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        write_state(sid, "morpho.axis_z", "1.0")
        write_state(sid, "morpho.max_diameter_mm", "6.0")
        return sid

    def _post(self, sid):
        return client.post(f"/api/trajectory/{sid}", json={
            "entry":  {"x": ENTRADA[0],  "y": ENTRADA[1],  "z": ENTRADA[2]},
            "target": {"x": OBJETIVO[0], "y": OBJETIVO[1], "z": OBJETIVO[2]},
        })

    def test_devuelve_la_valoracion_del_corredor(self):
        r = self._post(self._sesion(_unir(DIANA, ATRAVESADO)))
        assert r.status_code == 200, r.text
        c = r.json()["corridor"]
        assert c["verdict"] == "no_viable"
        assert len(c["vessels_crossed"]) == 1
        assert c["vessels_crossed"][0]["calibre_mm"] > 2.0

    def test_un_corredor_limpio_sale_viable(self):
        c = self._post(self._sesion(DIANA)).json()["corridor"]
        assert c["verdict"] == "viable" and c["vessels_crossed"] == []

    def test_sin_malla_no_se_inventa_un_veredicto(self):
        # Sin malla no hay contra qué cruzar la trayectoria, y un «viable» sin
        # haber mirado nada es peor que no dar ninguno.
        sid = create_session()
        r = self._post(sid)
        assert r.status_code == 200
        assert r.json()["corridor"] is None
        assert r.json()["depth_mm"] == 50.0, "la profundidad sí se puede dar"

    def test_el_veredicto_queda_guardado_para_el_informe(self):
        from services.sessions import read_state
        sid = self._sesion(_unir(DIANA, ATRAVESADO))
        self._post(sid)
        assert read_state(sid, "trajectory.verdict") == "no_viable"
        assert read_state(sid, "trajectory.verdict_reason") != ""

    def test_sesion_inexistente(self):
        r = client.post("/api/trajectory/no-existe", json={
            "entry": {"x": 0, "y": 0, "z": 1}, "target": {"x": 0, "y": 0, "z": 0},
        })
        assert r.status_code == 404


class TestBorrarLaTrayectoria:

    def test_al_limpiarla_se_va_tambien_el_veredicto(self):
        """Dejar el veredicto sería peor que no tenerlo.

        El informe lee estas claves directamente: un «corredor bloqueado» de
        una trayectoria borrada describiría un camino que ya nadie ha marcado.
        """
        from services.sessions import read_state

        sid = create_session()
        write_vtp(_unir(DIANA, ATRAVESADO),
                  session_subdir(sid, "meshes") / "vessel_tree.vtp")
        client.post(f"/api/trajectory/{sid}", json={
            "entry":  {"x": ENTRADA[0],  "y": ENTRADA[1],  "z": ENTRADA[2]},
            "target": {"x": OBJETIVO[0], "y": OBJETIVO[1], "z": OBJETIVO[2]},
        })
        assert read_state(sid, "trajectory.verdict") == "no_viable"

        assert client.delete(f"/api/trajectory/{sid}").status_code in (200, 204)
        assert read_state(sid, "trajectory.verdict") == ""
        assert read_state(sid, "trajectory.verdict_reason") == ""
        assert read_state(sid, "trajectory.findings") == ""


# ── Etapa 2: que el software proponga el corredor ─────────────────────────── #

class TestProponerCorredores:
    """Sugerir por dónde entrar, con dos condiciones que no son negociables.

    La primera la puso dirección: solo bloquea el tejido VASCULAR. La segunda
    también, y es la que separa una propuesta útil de una absurda — «no se puede
    hacer un procedimiento donde tiene la cara el paciente». Para respetarla hay
    que saber qué dirección es anterior, y eso sale de la orientación del DICOM.
    """

    from services.head_axes import HeadAxes as _Ejes

    #: Como los de case 3, leídos de su DICOM: anterior +z, superior +y.
    EJES = _Ejes(anterior=(0, 0, 1), superior=(0, 1, 0), left=(1, 0, 0),
                 source="dicom")

    def _propone(self, malla=None, **kw):
        from services.approach import propose_corridors
        return propose_corridors((0.0, 0.0, 0.0), malla or DIANA, self.EJES, **kw)

    def test_propone_direcciones_despejadas(self):
        props = self._propone(n_directions=200, top=3)
        assert props, "con un corredor libre tiene que proponer algo"
        assert all(p.assessment.verdict != "no_viable" for p in props)

    def test_nunca_entra_por_la_cara(self):
        # Anterior y por debajo de la horizontal es la órbita, la nariz o el
        # macizo facial. Una craneotomía frontal también es anterior, pero
        # entra por encima del reborde orbitario.
        from services.approach import FACE_ANTERIOR_DOT, FACE_MAX_ELEVATION_DEG
        ant = np.asarray(self.EJES.anterior)
        sup = np.asarray(self.EJES.superior)
        techo = np.sin(np.radians(FACE_MAX_ELEVATION_DEG))
        for p in self._propone(n_directions=600, top=60):
            d = np.asarray(p.direction)
            assert not (float(d @ ant) > FACE_ANTERIOR_DOT and float(d @ sup) < techo), \
                f"propuesta por la cara: {p.description}"

    def test_nunca_entra_desde_abajo(self):
        from services.approach import MAX_INFERIOR_DEG
        sup = np.asarray(self.EJES.superior)
        suelo = -np.sin(np.radians(MAX_INFERIOR_DEG))
        for p in self._propone(n_directions=600, top=60):
            assert float(np.asarray(p.direction) @ sup) >= suelo - 1e-6, p.description

    def test_sin_orientacion_no_propone_nada(self):
        # Sin saber dónde está la cara no se puede descartar un corredor por la
        # órbita, y proponer a ciegas es peor que no proponer.
        from services.approach import propose_corridors
        from services.head_axes import UNKNOWN
        assert propose_corridors((0, 0, 0), DIANA, UNKNOWN) == []
        assert propose_corridors((0, 0, 0), DIANA, None) == []

    def test_esquiva_lo_que_esta_bloqueado(self):
        # Una pared vascular tapando el lado izquierdo: ninguna propuesta puede
        # salir por ahí.
        pared = _tubo((30, -40, -40), (30, 40, 40), 12.0)
        props = self._propone(malla=_unir(DIANA, pared), n_directions=300, top=5)
        assert props
        assert all(p.direction[0] < 0.6 for p in props), \
            [(p.description, p.direction) for p in props]

    def test_las_propuestas_no_son_la_misma_tres_veces(self):
        props = self._propone(n_directions=400, top=3)
        for i, a in enumerate(props):
            for b in props[i + 1:]:
                assert float(np.asarray(a.direction) @ np.asarray(b.direction)) < 0.95

    def test_cada_propuesta_se_explica_en_anatomia(self):
        # «anterior izquierda, 30° por encima del plano axial» se puede discutir;
        # un vector no.
        for p in self._propone(n_directions=200, top=3):
            assert p.description
            assert "plano axial" in p.description or "desde" in p.description

    def test_dice_cuando_la_entrada_no_es_piel(self):
        # Sin volumen no se puede encontrar el cuero cabelludo, y en una 3DRA el
        # campo reconstruido ni siquiera llega a él: lo que se propone es la
        # dirección, y el punto es el borde de lo que la imagen contiene.
        for p in self._propone(n_directions=120, top=2):
            assert p.entry_on_skin is False


class TestProponerPorLaApi:

    def _sesion(self):
        sid = create_session()
        write_vtp(DIANA, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        write_state(sid, "morpho.neck_origin_x", "0.0")
        write_state(sid, "morpho.neck_origin_y", "0.0")
        write_state(sid, "morpho.neck_origin_z", "0.1")
        return sid

    def test_sin_malla_se_niega_y_explica(self):
        r = client.post(f"/api/trajectory/{create_session()}/suggest", json={})
        assert r.status_code == 409
        assert "malla" in r.json()["detail"]

    def test_sin_diana_se_niega_y_explica(self):
        sid = create_session()
        write_vtp(DIANA, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        r = client.post(f"/api/trajectory/{sid}/suggest", json={})
        assert r.status_code == 409
        assert "aneurisma" in r.json()["detail"]

    def test_sin_orientacion_devuelve_la_lista_vacia_y_dice_por_que(self):
        # La sesión de prueba no tiene DICOM, así que no hay ejes. La respuesta
        # no es un error: es «no puedo proponer, y este es el motivo».
        body = client.post(f"/api/trajectory/{self._sesion()}/suggest", json={}).json()
        assert body["proposals"] == []
        assert body["axes_source"] == "desconocida"
        assert "cara" in body["axes_note"]

    def test_publica_las_reglas_que_ha_aplicado(self):
        body = client.post(f"/api/trajectory/{self._sesion()}/suggest", json={}).json()
        reglas = " ".join(body["rules"]).lower()
        assert "cara" in reglas and "vascular" in reglas
        assert "craneotomía" in reglas, "que no promete elegir el abordaje"

    def test_sesion_inexistente(self):
        assert client.post("/api/trajectory/no-existe/suggest", json={}).status_code == 404


class TestDondeTieneLaCaraElPaciente:
    """La orientación estaba en el DICOM y el cargador no la veía.

    `ImageOrientationPatient` vive en la raíz en una serie clásica, pero en una
    3DRA multiframe —que es lo que tiene este proyecto— está dentro de
    `PerFrameFunctionalGroupsSequence`. Preguntar por el atributo de la raíz
    devolvía None, así que el software no sabía dónde estaba la cara.
    """

    def _serie_multiframe(self, iop, ipp=(0.0, 0.0, 0.0)):
        """Un DICOM multiframe mínimo con la geometría donde de verdad va."""
        import pydicom
        from pydicom.dataset import Dataset, FileDataset, FileMetaDataset

        carpeta = Path(tempfile.mkdtemp(prefix="prospective_iop_"))
        meta = FileMetaDataset()
        meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.13.1.1"
        meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
        meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian
        ds = FileDataset(str(carpeta / "IM_0001"), {}, file_meta=meta,
                         preamble=b"\0" * 128)

        po = Dataset(); po.ImageOrientationPatient = list(iop)
        pp = Dataset(); pp.ImagePositionPatient = list(ipp)
        marco = Dataset()
        marco.PlaneOrientationSequence = [po]
        marco.PlanePositionSequence = [pp]
        ds.PerFrameFunctionalGroupsSequence = [marco]
        ds.save_as(str(carpeta / "IM_0001"), enforce_file_format=True)
        return carpeta

    def test_lee_la_orientacion_escondida_en_el_multiframe(self):
        from services.head_axes import axes_from_dicom

        # La de case 3: filas hacia la izquierda del paciente, columnas hacia
        # arriba. El corte avanza entonces hacia delante.
        ejes = axes_from_dicom(self._serie_multiframe([1, 0, 0, 0, 0, 1]))
        assert ejes.usable and ejes.source.startswith("dicom")
        assert ejes.anterior == pytest.approx((0.0, 0.0, 1.0), abs=1e-6)
        assert ejes.superior == pytest.approx((0.0, 1.0, 0.0), abs=1e-6)
        assert ejes.left == pytest.approx((1.0, 0.0, 0.0), abs=1e-6)

    def test_una_orientacion_de_relleno_se_marca_como_tal(self):
        # Identidad exacta y posición en el origen es lo que escribe un
        # exportador que no midió nada. Se usa igual —es lo único que hay— pero
        # deja de presentarse como un dato del estudio.
        from services.head_axes import axes_from_dicom

        ejes = axes_from_dicom(self._serie_multiframe([1, 0, 0, 0, 1, 0]))
        assert ejes.source == "dicom_sin_verificar"
        assert "comprueba" in ejes.note.lower()

    def test_sin_orientacion_lo_dice_en_vez_de_suponer(self):
        from services.head_axes import axes_from_dicom

        vacia = Path(tempfile.mkdtemp(prefix="prospective_sin_iop_"))
        ejes = axes_from_dicom(vacia)
        assert not ejes.usable
        assert "cara" in ejes.note

    def test_la_direccion_se_dice_en_anatomia(self):
        from services.head_axes import HeadAxes, describe_direction

        ejes = HeadAxes(anterior=(0, 0, 1), superior=(0, 1, 0), left=(1, 0, 0),
                        source="dicom")
        assert "anterior" in describe_direction((0, 0, 1), ejes)
        assert "posterior" in describe_direction((0, 0, -1), ejes)
        assert "izquierda" in describe_direction((1, 0, 0), ejes)
        assert "derecha" in describe_direction((-1, 0, 0), ejes)
        assert describe_direction((0, 1, 0), ejes) == "desde arriba"
        assert "por encima" in describe_direction((0.7, 0.7, 0), ejes)


class TestDondeAcabaLaCabeza:
    """El umbral de «dentro de la cabeza» se calibra con el propio volumen.

    Una 3DRA no está en unidades Hounsfield —en case 3 los valores van de
    −15 000 a 33 000— así que un umbral de aire escrito a mano no sirve. La
    primera versión tomaba como referencia de «dentro» el bloque CENTRAL del
    volumen, que cae encima del contraste: el corte se iba a −553, dejaba fuera
    el parénquima (que ahí vive en −400), y el rayo «salía de la cabeza» a 13 mm
    del aneurisma y lo llamaba piel. Una entrada de piel a 13 mm de una lesión
    intracraneal no existe, y el software la daba por buena.
    """

    def _volumen(self) -> np.ndarray:
        # Fuera −1100, parénquima −400, y un núcleo brillante de contraste.
        v = np.full((60, 60, 60), -1100.0, dtype=np.float32)
        v[8:52, 8:52, 8:52] = -400.0
        v[26:34, 26:34, 26:34] = 1000.0
        return v

    def test_el_nucleo_brillante_no_arrastra_el_umbral(self):
        from services.approach import _head_threshold

        u = _head_threshold(self._volumen())
        assert u < -400.0, "el parénquima tiene que quedar DENTRO de la cabeza"
        assert u > -1100.0, "y lo de fuera, fuera"

    def test_la_entrada_es_la_piel_cuando_la_imagen_la_contiene(self):
        from services.approach import _entry_along

        v = self._volumen()
        sp = (1.0, 1.0, 1.0)
        # Desde el centro hacia +x: el borde del tejido está en el índice 52.
        entrada, prof, piel = _entry_along(np.array([30.0, 30.0, 30.0]),
                                           np.array([1.0, 0.0, 0.0]), v, sp, 120.0)
        assert piel is True
        assert prof == pytest.approx(21.0, abs=2.0), prof

    def test_si_el_campo_no_llega_a_la_piel_se_dice(self):
        from services.approach import _entry_along

        # Un volumen que es todo cabeza: es lo que reconstruye una 3DRA, un
        # cilindro alrededor de los vasos. No hay piel que encontrar.
        v = np.full((40, 40, 40), 500.0, dtype=np.float32)
        entrada, prof, piel = _entry_along(np.array([20.0, 20.0, 20.0]),
                                           np.array([1.0, 0.0, 0.0]), v, (1.0, 1.0, 1.0), 120.0)
        assert piel is False
        assert prof == pytest.approx(19.0, abs=1.5), "se para en el borde del volumen"

    def test_el_umbral_se_calcula_una_sola_vez(self, monkeypatch):
        """Medido: rehacerlo por dirección eran 90 de los 100 s que tardaba.

        Es un percentil sobre 56 millones de vóxeles y no cambia entre
        direcciones. Se cuenta la llamada en vez del reloj, que en una máquina
        cargada mide cualquier cosa.
        """
        import services.approach as ap
        from services.head_axes import HeadAxes

        llamadas = {"n": 0}
        real = ap._head_threshold

        def contando(v):
            llamadas["n"] += 1
            return real(v)

        monkeypatch.setattr(ap, "_head_threshold", contando)
        ejes = HeadAxes(anterior=(0, 0, 1), superior=(0, 1, 0), left=(1, 0, 0),
                        source="dicom")
        ap.propose_corridors((30.0, 30.0, 30.0), DIANA, ejes,
                             volume=self._volumen(), spacing=(1.0, 1.0, 1.0),
                             n_directions=120, top=2)
        assert llamadas["n"] == 1, f"se recalculó {llamadas['n']} veces"


# ── Etapa 3: el corredor decide qué pieza entra por él ────────────────────── #

class TestElCorredorEligeLaPieza:
    """La acodadura que pide un abordaje NO es una tabla: es geometría.

    Las hojas tienen que quedar CRUZADAS sobre el cuello —tumbadas en su
    plano— y el mango sale por el corredor. El ángulo entre esas dos
    direcciones es, por definición, la acodadura que la pieza necesita:

        acodadura = 90° − ángulo(corredor, eje cuello→domo)

    Un corredor tumbado en el plano del cuello se sirve con un RECTO, porque
    en un recto el mango y las hojas son la misma línea.
    """

    def _clip(self, bend: float):
        from services.clips import ClipShape, ClipSpec
        return ClipSpec(
            name=f"Prueba {bend:.0f}°",
            shape=ClipShape.STRAIGHT if bend == 0 else ClipShape.ANGLED,
            blade_length_mm=9.0, blade_width_mm=1.0, blade_height_mm=1.2,
            spring_length_mm=8.0, closing_force_g=150.0, manufacturer="prueba",
            bend_angle_deg=bend,
        )

    def _caso(self, angulo=None):
        from services.clip_selection import ClipCase
        return ClipCase(neck_mm=5.0, ar=1.3, dome_height_mm=6.5,
                        max_diameter_mm=9.0, neck_source="rim",
                        approach_angle_deg=angulo)

    def test_la_acodadura_sale_de_la_geometria(self):
        from services.clip_selection import bend_for_approach
        assert bend_for_approach(90.0) == 0.0, "tumbado en el plano del cuello: recto"
        assert bend_for_approach(0.0) == 90.0, "por el eje del domo: 90°"
        assert bend_for_approach(55.0) == 35.0

    def test_sin_trayectoria_el_criterio_no_existe(self):
        # Suponer un corredor —el más cómodo para cada clip— convertiría el
        # criterio en un adorno que aprueba a todos.
        from services.clip_selection import evaluate_clip
        c = evaluate_clip(self._clip(0.0), self._caso(None))
        assert not [k for k in c.criteria if k.key == "approach"]

    def test_un_recto_cumple_con_un_corredor_tumbado(self):
        from services.clip_selection import evaluate_clip
        k = next(x for x in evaluate_clip(self._clip(0.0), self._caso(90.0)).criteria
                 if x.key == "approach")
        assert k.verdict == "ok" and "0°" in k.detail

    def test_un_recto_no_entra_por_un_corredor_inclinado(self):
        from services.clip_selection import evaluate_clip
        k = next(x for x in evaluate_clip(self._clip(0.0), self._caso(55.0)).criteria
                 if x.key == "approach")
        assert k.verdict == "warn"
        assert "35°" in k.detail and "desvío" in k.detail

    def test_la_pieza_con_la_acodadura_que_pide_el_corredor_gana(self):
        # Es lo que dirección pidió: que el abordaje influya en la recomendación.
        from services.clip_selection import evaluate_clip
        caso = self._caso(55.0)                     # pide ~35°
        recto = evaluate_clip(self._clip(0.0), caso)
        acodado = evaluate_clip(self._clip(30.0), caso)
        assert acodado.score > recto.score

    def test_el_criterio_vota_al_contrario_que_la_apertura(self):
        # La apertura y la fuerza se enseñan y no puntúan porque su umbral es
        # un juicio clínico sin firmar. Este sí vota: el ángulo entre el
        # corredor y el plano del cuello está determinado por las dos
        # direcciones, no es una opinión.
        from services.clip_selection import evaluate_clip
        crits = {k.key: k for k in evaluate_clip(self._clip(0.0), self._caso(55.0)).criteria}
        assert crits["approach"].weight > 0
        if "opening" in crits:
            assert crits["opening"].weight == 0.0

    def test_un_corredor_inclinado_hace_preferir_una_forma_acodada(self):
        """Con lo demás igual, el corredor mueve la forma preferida.

        Cuello estrecho a propósito: un cuello ancho pide curvo por la
        geometría del saco y esa preferencia manda sobre el corredor, que es lo
        correcto —son ejes distintos, la curvatura de la hoja y la acodadura
        del mango—. Ahí el corredor sigue influyendo por el criterio, que
        penaliza a las piezas cuya acodadura no es la que pide.
        """
        from services.clip_selection import ClipCase, _preferred_shape
        from services.clips import ClipShape

        def estrecho(angulo):
            return ClipCase(neck_mm=3.0, ar=1.2, dome_height_mm=3.6,
                            max_diameter_mm=5.4, neck_source="rim",
                            approach_angle_deg=angulo)

        assert _preferred_shape(estrecho(88.0)) == ClipShape.STRAIGHT
        assert _preferred_shape(estrecho(40.0)) == ClipShape.ANGLED


class TestLaTrayectoriaLlegaAlEnsayo:
    """El vídeo de la colocación tiene que enseñar el abordaje establecido.

    El ensayo ya usaba la trayectoria marcada, pero una sesión REANUDADA volvía
    sin ella: los puntos estaban en disco y en el PDF, y el store vacío. El
    visor no dibujaba corredor y el ensayo caía a su aproximación por defecto,
    así que el vídeo enseñaba una maniobra que nadie había planeado.
    """

    def _con_trayectoria(self):
        sid = create_session()
        write_vtp(DIANA, session_subdir(sid, "meshes") / "vessel_tree.vtp")
        client.post(f"/api/trajectory/{sid}", json={
            "entry":  {"x": ENTRADA[0],  "y": ENTRADA[1],  "z": ENTRADA[2]},
            "target": {"x": OBJETIVO[0], "y": OBJETIVO[1], "z": OBJETIVO[2]},
        })
        return sid

    def test_se_puede_recuperar_la_trayectoria_guardada(self):
        body = client.get(f"/api/trajectory/{self._con_trayectoria()}").json()
        assert body is not None
        assert body["entry"] == list(ENTRADA) and body["target"] == list(OBJETIVO)
        assert body["depth_mm"] == 50.0
        assert body["corridor"] is not None, "se vuelve a medir contra la malla de ahora"

    def test_una_sesion_sin_trayectoria_devuelve_null_y_no_un_error(self):
        r = client.get(f"/api/trajectory/{create_session()}")
        assert r.status_code == 200 and r.json() is None

    def test_sesion_inexistente(self):
        assert client.get("/api/trajectory/no-existe").status_code == 404

    def test_el_angulo_del_corredor_llega_a_la_seleccion_de_clips(self):
        # El puente entre la etapa 3 y lo que ve el usuario: el mismo ángulo que
        # devuelve la trayectoria es el que decide la acodadura.
        from services.report_generator import read_trajectory_state

        sid = self._con_trayectoria()
        tr = read_trajectory_state(sid)
        assert tr["angle_deg"] >= 0.0
        body = client.get(f"/api/clips/selection/{sid}").json()
        assert body["case"]["approach_angle_deg"] == pytest.approx(tr["angle_deg"])
        assert body["case"]["approach_bend_deg"] == pytest.approx(90.0 - tr["angle_deg"])
