"""Medidas que decían más de lo que medían: el seguimiento estirado, el
crecimiento de lo no medido, las coberturas de dispositivos lejos del cuello,
el choque no comprobado dado por bueno, el perímetro de puntos sin ordenar y el
coil desconocido contado como cero."""
from __future__ import annotations

import math

import numpy as np
import pytest
import vtk


def _cilindro(radio: float, alto: float, centro=(0.0, 0.0, 0.0), resolucion: int = 96) -> vtk.vtkPolyData:
    """Un cilindro a lo largo de y, triangulado (como una malla de la app)."""
    c = vtk.vtkCylinderSource()
    c.SetRadius(radio); c.SetHeight(alto); c.SetResolution(resolucion); c.SetCenter(*centro)
    c.CappingOn(); c.Update()
    t = vtk.vtkTriangleFilter(); t.SetInputConnection(c.GetOutputPort())
    s = vtk.vtkLinearSubdivisionFilter(); s.SetInputConnection(t.GetOutputPort()); s.SetNumberOfSubdivisions(2)
    s.Update()
    return s.GetOutput()


class TestSeguimiento:
    def test_la_direccion_de_corte_es_unitaria_aunque_se_remuestree(self):
        """Cortes reales cada 0,625 mm y un volumen remuestreado a 0,5: la malla
        se estiraba un 25 % en z. La dirección no depende del espaciado."""
        from services.followup import direccion_de_corte
        ipps = np.array([[0.0, 0.0, 0.625 * k] for k in range(20)])
        d = direccion_de_corte(ipps, np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))
        assert np.allclose(d, [0, 0, 1])

    def test_con_un_solo_corte_usa_la_normal(self):
        from services.followup import direccion_de_corte
        d = direccion_de_corte(np.array([[0.0, 0, 0]]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))
        assert np.allclose(d, [0, 0, 1])


class TestLongitudinal:
    def _entrada(self, **kw):
        from datetime import date
        from models.longitudinal import LongitudinalEntry
        base = dict(session_date=date(2026, 1, 1), max_diameter_mm=6.0, neck_mm=3.0,
                    volume_mm3=80.0, ar=1.2, dnr=1.5, rupture_risk_label="")
        base.update(kw)
        return LongitudinalEntry(**base)

    def test_lo_no_medido_no_es_crecimiento(self):
        from routers.longitudinal import _compute_deltas
        antes = self._entrada(volume_mm3=0.0, max_diameter_mm=0.0)
        ahora = self._entrada(volume_mm3=90.0, max_diameter_mm=7.0)
        deltas = {d.metric: d for d in _compute_deltas(ahora, antes)}
        assert not deltas["volume_mm3"].is_concerning
        assert not deltas["max_diameter_mm"].is_concerning
        assert "sin medida" in deltas["volume_mm3"].trend

    def test_cuello_marcado_contra_automatico_no_se_compara(self):
        from routers.longitudinal import _compute_deltas
        antes = self._entrada(ar=1.0)
        ahora = self._entrada(ar=1.6)
        deltas = _compute_deltas(ahora, antes, fuentes=("auto", "rim"))
        ar = next(d for d in deltas if d.metric == "ar")
        assert not ar.is_concerning
        assert "otro método" in ar.trend

    def test_un_crecimiento_real_sigue_avisando(self):
        from routers.longitudinal import _compute_deltas
        deltas = {d.metric: d for d in _compute_deltas(self._entrada(max_diameter_mm=8.0),
                                                       self._entrada(max_diameter_mm=6.0),
                                                       fuentes=("rim", "rim"))}
        assert deltas["max_diameter_mm"].is_concerning


class TestCoberturas:
    def test_un_clip_que_corta_el_plano_lejos_del_cuello_no_cubre(self):
        from services.devices import clip_neck_coverage
        lejos = _cilindro(0.3, 6.0, centro=(15.0, 0.0, 0.0))     # cruza el plano y=0 a 15 mm
        assert clip_neck_coverage(lejos, (0.0, 0.0, 0.0), (0.0, 1.0, 0.0), 4.0) == 0.0

    def test_un_clip_sobre_el_cuello_si_cubre(self):
        from services.devices import clip_neck_coverage
        hoja = vtk.vtkCubeSource(); hoja.SetCenter(0, 0, 0); hoja.SetXLength(4.4); hoja.SetYLength(4.0)
        hoja.SetZLength(0.4); hoja.Update()
        assert clip_neck_coverage(hoja.GetOutput(), (0.0, 0.0, 0.0), (0.0, 1.0, 0.0), 4.0) > 95.0

    def test_el_stent_lejos_del_cuello_no_lo_cubre(self):
        from services.devices import pasa_por_el_cuello
        stent = _cilindro(1.5, 10.0, centro=(20.0, 0.0, 0.0))
        assert not pasa_por_el_cuello(stent, (0.0, 0.0, 0.0), 4.0)
        assert pasa_por_el_cuello(_cilindro(1.5, 10.0, centro=(2.5, 0.0, 0.0)), (0.0, 0.0, 0.0), 4.0)


class TestChoqueDelClip:
    def test_sin_poder_comprobarlo_no_dice_sin_choque(self, tmp_path, monkeypatch):
        from routers.clips import comprobar_choque
        from services import devices
        clip = _cilindro(0.3, 6.0)
        r = comprobar_choque(tmp_path / "no_existe.vtp", clip, (0.0, 0.0, 0.0), 4.0)
        assert r.comprobado is False and r.choque is False

        from services.segmentation import write_vtp
        vaso = tmp_path / "vessel_tree.vtp"
        write_vtp(_cilindro(2.0, 20.0), vaso)
        monkeypatch.setattr(devices, "vessel_overlap", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("roto")))
        r = comprobar_choque(vaso, clip, (0.0, 0.0, 0.0), 4.0)
        assert r.comprobado is False and "roto" in r.motivo


class TestPerimetroDelCuello:
    def test_el_perimetro_no_depende_del_orden_de_los_puntos(self):
        from services.morphometrics import MorphometricAnalyzer
        tubo = _cilindro(2.0, 10.0)
        perim, diam = MorphometricAnalyzer._slice_perimeter(tubo, np.array([0.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]))
        assert perim == pytest.approx(2 * math.pi * 2.0, rel=0.02)
        assert diam == pytest.approx(4.0, rel=0.02)


class TestCoils:
    def test_un_coil_desconocido_se_rechaza(self):
        from fastapi.testclient import TestClient
        from main import app
        from services.sessions import create_session, write_state
        c = TestClient(app)
        c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        sid = create_session()
        write_state(sid, "morpho.volume_mm3", "100")
        r = c.post("/api/coils/plan", json={"session_id": sid, "placements": [
            {"coil_id": "no-existe-9mm", "position": {"x": 0, "y": 0, "z": 0}, "packing_density": 0.25}]})
        assert r.status_code == 422
        assert "no-existe-9mm" in r.json()["detail"]


class TestSacoAislado:
    """El saco perdía una capa de vóxeles: fuera de él iba un valor 1000 HU por
    debajo del umbral y el suavizado arrastraba el borde. Esfera de 3 mm con
    borde de volumen parcial y umbral a media altura: antes −20 % de volumen con
    contraste de angio-TC y −31 % con poco contraste."""

    @staticmethod
    def _esfera(radio, vox, dentro, fuera, n=48):
        c = (n - 1) / 2.0
        z, y, x = np.mgrid[0:n, 0:n, 0:n].astype(np.float32)
        o = (np.arange(4) + 0.5) / 4 - 0.5
        frac = np.zeros((n, n, n), np.float32)
        for dz in o:
            for dy in o:
                for dx in o:
                    r = np.sqrt(((x + dx - c) * vox) ** 2 + ((y + dy - c) * vox) ** 2 + ((z + dz - c) * vox) ** 2)
                    frac += (r <= radio)
        return fuera + (dentro - fuera) * frac / 64.0, c

    def _medir(self, dentro, fuera):
        from services.sac_isolation import isolate_sac_volumetric
        radio, vox = 3.0, 0.4
        vol, c = self._esfera(radio, vox, dentro, fuera)
        centro = np.array([c * vox] * 3)
        mesh, _ = isolate_sac_volumetric(
            vol, (vox, vox, vox), neck_origin=tuple(centro - [0, 0, radio * 0.9]), neck_normal=(0, 0, 1),
            apex=tuple(centro + [0, 0, radio * 0.5]), lower=(dentro + fuera) / 2.0, upper=0.0,
            max_radius=radio * 3, half_extent_mm=radio * 3)
        m = vtk.vtkMassProperties(); m.SetInputData(mesh); m.Update()
        h = radio * 0.1
        esperado = 4 / 3 * math.pi * radio ** 3 - math.pi * h * h * (3 * radio - h) / 3
        return m.GetVolume() / esperado

    def test_el_volumen_no_pierde_una_capa(self):
        assert self._medir(450.0, 40.0) == pytest.approx(1.0, abs=0.06)

    def test_y_no_depende_del_contraste(self):
        assert self._medir(220.0, 120.0) == pytest.approx(self._medir(450.0, 40.0), abs=0.03)
