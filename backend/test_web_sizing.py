"""Dimensionado del WEB (services/web_sizing.py) sobre sacos sintéticos.

Lo que se defiende:
- anchura y altura salen del saco respecto al plano del cuello, también con la
  normal al revés;
- solo se proponen medidas que existen y que cumplen +1/−1 (anchura + 1–2 mm,
  altura reducida en lo mismo, sin pasarse);
- lo que cae fuera de la indicación aprobada se dice;
- sin saco aislado las medidas se marcan orientativas.
"""
from __future__ import annotations

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient
from vtkmodules.util.numpy_support import vtk_to_numpy

from main import app
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_states
from services.web_sizing import CATALOGUE_SL, SacDims, measure_sac, size_web

client = TestClient(app, raise_server_exceptions=True)


def _saco(radio: float = 3.0, alto: float | None = None) -> vtk.vtkPolyData:
    """Un elipsoide apoyado en el plano z=0: anchura 2·radio, altura `alto`."""
    alto = alto or 2 * radio
    s = vtk.vtkSphereSource(); s.SetRadius(1.0)
    s.SetThetaResolution(64); s.SetPhiResolution(64); s.Update()
    t = vtk.vtkTransform(); t.Translate(0, 0, alto / 2); t.Scale(radio, radio, alto / 2)
    f = vtk.vtkTransformPolyDataFilter(); f.SetTransform(t); f.SetInputData(s.GetOutput()); f.Update()
    return f.GetOutput()


def _pts(poly):
    return vtk_to_numpy(poly.GetPoints().GetData())


def test_mide_anchura_y_altura_respecto_al_plano():
    d = measure_sac(_pts(_saco(3.0, 5.0)), (0, 0, 0), (0, 0, 1))
    assert d.width_mm == pytest.approx(6.0, abs=0.1)
    assert d.height_mm == pytest.approx(5.0, abs=0.05)
    d2 = measure_sac(_pts(_saco(3.0, 5.0)), (0, 0, 0), (0, 0, -1))   # normal al revés
    assert d2.height_mm == pytest.approx(5.0, abs=0.05)


def test_saco_ovalado_da_la_anchura_media():
    poly = _saco(3.0, 6.0)
    pts = _pts(poly) * np.array([4 / 3, 1.0, 1.0])               # 8 × 6 en el plano
    d = measure_sac(pts, (0, 0, 0), (0, 0, 1))
    assert d.width_max_mm == pytest.approx(8.0, abs=0.1)
    assert d.width_min_mm == pytest.approx(6.0, abs=0.1)
    assert d.width_mm == pytest.approx(7.0, abs=0.1)


def test_la_regla_mas_uno_menos_uno_con_el_catalogo():
    dims = SacDims(6.0, 6.0, 6.0, 6.0, "sac")
    r = size_web(dims, neck_mm=4.5, volume_mm3=113.0)
    sl = [o for o in r.options if o.shape == "SL"]
    assert sl[0].label == "WEB SL 7×5"                        # +1 y −1
    assert {o.label for o in sl[:2]} == {"WEB SL 7×5", "WEB SL 8×4"}   # +2 y −2
    for o in r.options:
        assert (o.width_mm, o.height_mm) in CATALOGUE_SL or o.shape == "SLS"
        assert 1.0 <= o.added_mm <= 2.0
        assert o.height_mm <= o.target_height_mm + 0.5      # nunca más alto: protruye
    assert sl[0].dav == pytest.approx(np.pi * 3.5 ** 2 * 5 / 113.0, abs=0.01)
    assert r.within_indication


def test_el_esferico_que_no_cabe_no_se_propone():
    # SLS 7 mide 5,6 de alto: con 6 mm de saco y 1 sumado, la altura buscada es 5.
    r = size_web(SacDims(6.0, 6.0, 6.0, 6.0, "sac"), neck_mm=4.5)
    assert not [o for o in r.options if o.shape == "SLS" and o.width_mm == 7]


def test_fuera_de_la_indicacion_se_dice():
    r = size_web(SacDims(12.0, 12.0, 12.0, 10.0, "sac"), neck_mm=5.0)
    assert not r.within_indication
    assert any("3–10 mm" in w for w in r.warnings)
    r = size_web(SacDims(6.0, 6.0, 6.0, 6.0, "sac"), neck_mm=2.0, dnr=3.0)
    assert not r.within_indication and any("cuello ancho" in w for w in r.warnings)


def test_un_dispositivo_no_mas_ancho_que_el_cuello_se_avisa():
    r = size_web(SacDims(6.0, 6.0, 6.0, 6.0, "sac"), neck_mm=7.5)
    assert any("no es más ancho que el cuello" in w for w in r.warnings)


class TestEndpoint:
    def _sesion(self, con_saco=True):
        sid = create_session()
        vals = {"morpho.max_diameter_mm": "6.0", "morpho.dome_height_mm": "5.0",
                "morpho.neck_mm": "4.5", "morpho.volume_mm3": "94.2", "morpho.dnr": "1.33"}
        if con_saco:
            write_vtp(_saco(3.0, 6.0), session_subdir(sid, "meshes") / "aneurysm_sac.vtp")
            vals |= {"morpho.sac_vtp_name": "aneurysm_sac.vtp",
                     "morpho.plane_origin_x": "0", "morpho.plane_origin_y": "0", "morpho.plane_origin_z": "0",
                     "morpho.plane_normal_x": "0", "morpho.plane_normal_y": "0", "morpho.plane_normal_z": "1"}
        write_states(sid, vals)
        return sid

    def test_con_el_saco_aislado(self):
        j = client.post(f"/api/web-sizing/{self._sesion()}").json()
        assert j["dims"]["source"] == "sac" and j["dims"]["height_mm"] == pytest.approx(6.0, abs=0.05)
        assert j["options"][0]["label"] == "WEB SL 7×5" and j["dnr"] == 1.33

    def test_sin_saco_es_orientativo(self):
        j = client.post(f"/api/web-sizing/{self._sesion(con_saco=False)}").json()
        assert j["dims"]["source"] == "morpho"
        assert any("orientativas" in w for w in j["warnings"])

    def test_sin_morfometria(self):
        r = client.post(f"/api/web-sizing/{create_session()}")
        assert r.status_code == 422


def test_un_saco_que_no_es_un_domo_lleno_se_avisa_y_no_da_dav():
    # Las cifras de la sesión de Hernández: 9,5 × 6,2 × 4,8 mm y 56 mm³.
    r = size_web(SacDims(7.88, 9.52, 6.24, 4.84, "sac"), neck_mm=3.95, volume_mm3=56.4)
    assert r.fill_ratio == pytest.approx(0.37, abs=0.02)
    assert any("no es un domo lleno" in w for w in r.warnings)
    assert all(o.dav is None for o in r.options)


def test_un_domo_lleno_si_da_dav():
    # El elipsoide sintético de 6 × 6 × 6 apoyado en el plano: ~113 mm³.
    r = size_web(SacDims(6.0, 6.0, 6.0, 6.0, "sac"), neck_mm=4.5, volume_mm3=113.0)
    assert r.fill_ratio == pytest.approx(1.0, abs=0.01)
    assert r.options and all(o.dav is not None for o in r.options)


def test_el_catalogo_va_de_milimetro_en_milimetro():
    # Case 3 en el navegador: 7,2 × 4,7 mm y ninguna opción con la regla estricta.
    r = size_web(SacDims(7.2, 8.4, 5.9, 4.7, "sac"), neck_mm=4.2, dnr=2.05)
    assert r.options, r.warnings
    o = r.options[0]
    assert o.label == "WEB SL 8×4" and o.added_mm == pytest.approx(0.8)
    assert "por debajo" in o.note
    # Las que cumplen la regla entera van delante de las que no.
    r2 = size_web(SacDims(6.0, 6.0, 6.0, 6.0, "sac"), neck_mm=4.5)
    assert r2.options[0].note == ""
