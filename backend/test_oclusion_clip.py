# -*- coding: utf-8 -*-
"""Cómo queda el aneurisma después de clipar, y qué NO se promete de eso.

Dirección preguntó si se puede simular cómo se deforma el saco al quedar
constreñido en la mordaza. Se puede programar; no se puede sostener. Una
deformación de la pared necesita su GROSOR, sus propiedades mecánicas y la
presión intraluminal: la pared de un aneurisma mide 0,05–0,5 mm, el vóxel de
este proyecto 0,32, y no hay con qué validar el resultado. Es el mismo callejón
del score tipo Alvarado que ya se descartó — sale un vídeo convincente y nadie
puede afirmar que sea cierto.

Lo que sí se puede afirmar, y es la pregunta clínica de verdad, es CUÁNTO
ANEURISMA QUEDA: al cerrarse las hojas, lo que está del lado del domo sale de la
circulación y lo que está del lado de la arteria sigue dentro. Eso es geometría
sobre dos objetos que ya existen, el saco aislado y el clip en su pose, y se
mide en las tres categorías con las que se habla de un clipaje: oclusión
completa, resto de cuello, aneurisma residual.

La única deformación que este proyecto afirma vive en otro sitio y sale de
conservar el perímetro: el cuello redondo queda aplastado y su línea de cierre
mide el perímetro partido por dos (`services.clips.jaw_requirement`).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_oclusion_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import math

import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.clip_outcome import (NEGLIGIBLE_MM3, RESIDUAL_FRACTION,
                                   occlusion_after_clip)
from services.device_state import save_clips
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_state

client = TestClient(app, raise_server_exceptions=True)

RADIO = 5.0
#: 4/3·π·r³ con r = 5 mm. La malla discretiza y queda algo por debajo.
VOLUMEN_TEORICO = 4.0 / 3.0 * math.pi * RADIO ** 3


def _saco() -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(RADIO)
    s.SetThetaResolution(40)
    s.SetPhiResolution(40)
    s.Update()
    return s.GetOutput()


class TestLoQueQuedaDelSaco:

    def test_el_saco_entero_fuera_es_oclusion_completa(self):
        # La línea de cierre por debajo del saco: no queda nada comunicado.
        r = occlusion_after_clip(_saco(), (0, 0, -RADIO - 0.5), (0, 0, 1))
        assert r.outcome == "completa"
        assert r.remnant_mm3 <= NEGLIGIBLE_MM3
        assert r.excluded_mm3 == pytest.approx(VOLUMEN_TEORICO, rel=0.05)

    def test_un_corte_bajo_deja_un_resto_de_cuello(self):
        r = occlusion_after_clip(_saco(), (0, 0, -4.0), (0, 0, 1))
        assert r.outcome == "resto_de_cuello"
        assert 0.0 < r.remnant_fraction <= RESIDUAL_FRACTION

    def test_clipar_por_el_ecuador_deja_medio_aneurisma(self):
        r = occlusion_after_clip(_saco(), (0, 0, 0), (0, 0, 1))
        assert r.outcome == "residual"
        assert r.remnant_fraction == pytest.approx(0.5, abs=0.05)
        assert "no cruza el cuello por donde debería" in r.summary

    def test_las_dos_mitades_suman_el_saco(self):
        # Si no suman, una de las dos está midiendo una malla abierta y su
        # volumen no significa nada.
        r = occlusion_after_clip(_saco(), (0, 0, 1.5), (0, 0, 1))
        assert r.excluded_mm3 + r.remnant_mm3 == pytest.approx(r.sac_volume_mm3, rel=0.02)

    def test_la_anchura_del_munon_se_mide_en_el_plano_del_cuello(self):
        r = occlusion_after_clip(_saco(), (0, 0, 0), (0, 0, 1),
                                 neck_origin=(0, 0, -2.0), neck_axis=(0, 0, 1))
        # El corte del muñón a z = −2 tiene radio √(25−4) ≈ 4,58: ancho ≈ 9,2.
        assert r.remnant_width_mm == pytest.approx(9.2, abs=0.4)

    def test_sin_saco_lo_dice_en_vez_de_medir_el_vacio(self):
        r = occlusion_after_clip(None, (0, 0, 0), (0, 0, 1))
        assert r.outcome == "sin_saco"
        assert "plano del cuello" in r.summary

    def test_una_normal_invalida_no_revienta(self):
        r = occlusion_after_clip(_saco(), (0, 0, 0), (0, 0, 0))
        assert r.outcome == "sin_saco"


class TestLoQueNoSePromete:
    """Lo que el resultado dice de sí mismo. Sin esto, «oclusión completa» se
    lee como una simulación mecánica que nadie ha hecho."""

    def test_declara_que_es_geometria_y_no_mecanica(self):
        r = occlusion_after_clip(_saco(), (0, 0, -4.0), (0, 0, 1))
        texto = " ".join(r.cautions).lower()
        assert "geometría, no mecánica" in texto
        assert "no modela" in texto or "no model" in texto

    def test_explica_por_que_no_se_deforma_la_pared(self):
        r = occlusion_after_clip(_saco(), (0, 0, -4.0), (0, 0, 1))
        texto = " ".join(r.cautions)
        assert "0,05–0,5 mm" in texto and "0,32" in texto
        assert "validar" in texto

    def test_dice_que_el_corte_entre_resto_y_residual_es_una_convencion(self):
        r = occlusion_after_clip(_saco(), (0, 0, -4.0), (0, 0, 1))
        assert any("convención" in c and "no un umbral clínico" in c for c in r.cautions)


class TestPorLaApi:

    def _sesion(self, altura_clip: float, n_clips: int = 1) -> str:
        sid = create_session()
        write_vtp(_saco(), session_subdir(sid, "meshes") / "aneurysm_sac.vtp")
        write_state(sid, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
        write_state(sid, "morpho.axis_x", "0.0")
        write_state(sid, "morpho.axis_y", "0.0")
        write_state(sid, "morpho.axis_z", "1.0")
        write_state(sid, "morpho.neck_origin_z", str(-RADIO))
        save_clips(sid, [
            {"index": i, "clip_id": "x", "name": f"Clip {i}",
             "position": [0.0, 0.0, altura_clip + i * 2.0],
             "orientation": [0.0, 0.0, 0.0], "is_custom": False}
            for i in range(n_clips)
        ])
        return sid

    def test_devuelve_el_desenlace_y_los_dos_volumenes(self):
        body = client.get(f"/api/clips/occlusion/{self._sesion(-4.0)}").json()
        assert body["outcome"] == "resto_de_cuello"
        assert body["excluded_mm3"] > body["remnant_mm3"] > 0
        assert body["summary"]
        assert body["clip_name"] == "Clip 0"

    def test_el_munon_se_puede_pintar(self):
        body = client.get(f"/api/clips/occlusion/{self._sesion(0.0)}").json()
        assert body["remnant_mesh_url"], "el muñón es lo único que se ve de esto"
        assert "aneurysm_remnant.vtp" in body["remnant_mesh_url"]

    def test_con_varios_clips_manda_el_mas_proximal_y_lo_dice(self):
        # Es su línea de cierre la que separa el saco de la arteria; lo que
        # quede por encima ya está excluido por él.
        body = client.get(f"/api/clips/occlusion/{self._sesion(-4.0, n_clips=3)}").json()
        assert body["clip_name"] == "Clip 0"
        assert any("más proximal" in c for c in body["cautions"])

    def test_sin_clip_colocado_se_niega_y_explica(self):
        sid = create_session()
        write_vtp(_saco(), session_subdir(sid, "meshes") / "aneurysm_sac.vtp")
        r = client.get(f"/api/clips/occlusion/{sid}")
        assert r.status_code == 409
        assert "clip" in r.json()["detail"].lower()

    def test_sin_saco_aislado_lo_dice_en_vez_de_fallar(self):
        sid = create_session()
        save_clips(sid, [{"index": 0, "clip_id": "x", "name": "Clip",
                          "position": [0.0, 0.0, 0.0], "orientation": [0, 0, 0],
                          "is_custom": False}])
        body = client.get(f"/api/clips/occlusion/{sid}").json()
        assert body["outcome"] == "sin_saco"
        assert "Morfometría" in body["summary"]

    def test_sesion_inexistente(self):
        assert client.get("/api/clips/occlusion/no-existe").status_code == 404


class TestElSacoEstrechandose:
    """La ilustración que se pidió: solo geometría, sin física ni material.

    Un campo de desplazamiento. Los puntos del saco que caen dentro de la presa
    se llevan hacia el plano medio de las hojas y la influencia se apaga con la
    distancia a la línea de cierre. No hay pared que ceda, no se conserva el
    volumen —el tejido real se desplaza a algún sitio y aquí no va a ninguno— y
    no interviene ninguna propiedad del clip. Es un dibujo que se mueve.

    Lo único cierto del dibujo es DÓNDE aplasta y en qué dirección: las dos
    salen de la geometría del clip colocado, no de un parámetro.
    """

    def _anchura(self, poly, z0: float, tol: float = 1.0, eje: int = 0) -> float:
        import numpy as np
        P = np.asarray([poly.GetPoint(i) for i in range(poly.GetNumberOfPoints())])
        banda = P[np.abs(P[:, 2] - z0) < tol]
        return float(np.ptp(banda[:, eje])) if len(banda) else 0.0

    def test_la_presa_se_cierra_y_el_domo_no_se_entera(self):
        from services.clip_outcome import constrict_sac

        saco = _saco()
        abierto = constrict_sac(saco, (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 9.0, 0.0)
        cerrado = constrict_sac(saco, (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 9.0, 1.0)
        assert self._anchura(cerrado, -3.0) < 1.0, "en la presa tiene que quedar plano"
        # Y el domo, intacto: si se estrecha, el dibujo dice que el clip aprieta
        # lo que no toca. Con una campana se contagiaba un 12 %.
        assert self._anchura(cerrado, 4.0) == pytest.approx(
            self._anchura(abierto, 4.0), rel=0.02)

    def test_se_cierra_progresivamente(self):
        from services.clip_outcome import constrict_sac

        anchos = [self._anchura(
            constrict_sac(_saco(), (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 9.0, t), -3.0)
            for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
        assert anchos == sorted(anchos, reverse=True), anchos

    def test_aplasta_contra_la_direccion_de_las_hojas(self):
        # La dirección no es un parámetro del dibujo: es por donde se juntan las
        # hojas. Girando esa dirección, se aplasta el otro eje.
        from services.clip_outcome import constrict_sac

        en_x = constrict_sac(_saco(), (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 9.0, 1.0)
        en_y = constrict_sac(_saco(), (0, 0, -3.0), (0, 1, 0), (1, 0, 0), 9.0, 1.0)
        assert self._anchura(en_x, -3.0, eje=0) < 1.0
        assert self._anchura(en_x, -3.0, eje=1) > 5.0
        assert self._anchura(en_y, -3.0, eje=1) < 1.0

    def test_fuera_de_la_mordaza_no_se_toca(self):
        # Un saco más ancho que la hoja no se aplasta entero: si lo hiciera, el
        # dibujo diría que el clip agarra lo que no agarra.
        import numpy as np
        from services.clip_outcome import constrict_sac

        d = constrict_sac(_saco(), (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 4.0, 1.0)
        P = np.asarray([d.GetPoint(i) for i in range(d.GetNumberOfPoints())])
        lejos = P[(np.abs(P[:, 2] + 3.0) < 1.0) & (np.abs(P[:, 1]) > 4.0)]
        if len(lejos):
            assert np.abs(lejos[:, 0]).max() > 0.5, "más allá de la hoja no aprieta"

    def test_con_t_cero_devuelve_el_saco_tal_cual(self):
        from services.clip_outcome import constrict_sac

        saco = _saco()
        igual = constrict_sac(saco, (0, 0, -3.0), (1, 0, 0), (0, 1, 0), 9.0, 0.0)
        assert igual.GetNumberOfPoints() == saco.GetNumberOfPoints()
        assert igual.GetPoint(10) == pytest.approx(saco.GetPoint(10))
