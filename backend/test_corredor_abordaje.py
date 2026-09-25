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
