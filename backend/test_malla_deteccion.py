"""Dos mallas en angio-TC: la de vasos se ve, la de la receta anterior detecta.

Sobre la malla de vasos (services.cta_vessels) el detector, ajustado a la malla
anterior, bajaba en los 172 de Zenodo de 72 a 31 lesiones entre las cinco
primeras (README, 15-11-2026). Hasta reajustarlo, la segmentaciÃ³n de TC deja
tambiÃ©n `detect_tree.vtp` y la detecciÃ³n trabaja sobre ella.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pytest
import vtk


def _esfera(c=(0.0, 0.0, 0.0), r=5.0, res=24):
    s = vtk.vtkSphereSource()
    s.SetCenter(*c); s.SetRadius(r)
    s.SetThetaResolution(res); s.SetPhiResolution(res)
    s.Update()
    out = vtk.vtkPolyData(); out.DeepCopy(s.GetOutput())
    return out


@dataclass
class _Sitio:
    position: tuple


@pytest.fixture
def sesion():
    from services.sessions import create_session, session_subdir
    sid = create_session()
    return sid, session_subdir(sid, "meshes")


def test_sin_malla_de_deteccion_se_detecta_sobre_la_que_se_ve(sesion):
    from routers.detect import _detection_mesh
    from services.segmentation import write_vtp
    sid, meshes = sesion
    write_vtp(_esfera(r=5), meshes / "vessel_tree.vtp")
    poly, visible = _detection_mesh(sid, meshes / "vessel_tree.vtp")
    assert visible is None
    assert poly.GetNumberOfPoints() == _esfera(r=5).GetNumberOfPoints()


def test_con_la_malla_recien_segmentada_se_detecta_sobre_detect_tree(sesion):
    from routers.detect import _detection_mesh
    from routers.segment import DETECT_MESH_NAME, mesh_fingerprint
    from services.segmentation import write_vtp
    from services.sessions import write_states
    sid, meshes = sesion
    vista, det = _esfera(r=5, res=24), _esfera(r=4, res=10)
    write_vtp(vista, meshes / "vessel_tree.vtp")
    write_vtp(det, meshes / DETECT_MESH_NAME)
    write_states(sid, {"seg.detect_tree_for": mesh_fingerprint(vista)})
    poly, visible = _detection_mesh(sid, meshes / "vessel_tree.vtp")
    assert visible is None                                   # sin filtro: idÃ©ntico al banco
    assert poly.GetNumberOfPoints() == det.GetNumberOfPoints()


def test_si_la_malla_que_se_ve_se_edito_se_filtra_por_ella(sesion):
    from routers.detect import _detection_mesh
    from routers.segment import DETECT_MESH_NAME, mesh_fingerprint
    from services.segmentation import write_vtp
    from services.sessions import write_states
    sid, meshes = sesion
    write_states(sid, {"seg.detect_tree_for": mesh_fingerprint(_esfera(r=5, res=24))})
    recortada = _esfera(r=5, res=12)                         # otra malla: recorte o deshacer
    write_vtp(recortada, meshes / "vessel_tree.vtp")
    write_vtp(_esfera(r=4, res=10), meshes / DETECT_MESH_NAME)
    poly, visible = _detection_mesh(sid, meshes / "vessel_tree.vtp")
    assert visible is not None
    assert visible.GetNumberOfPoints() == recortada.GetNumberOfPoints()


def test_quedan_solo_los_sitios_sobre_la_malla_en_su_orden():
    from routers.detect import _hits_on_mesh
    vista = _esfera(c=(0, 0, 0), r=5)
    sitios = [_Sitio((0, 0, 5.5)), _Sitio((40, 0, 0)), _Sitio((0, 6, 0)), _Sitio((0, 0, 12))]
    assert [s.position for s in _hits_on_mesh(sitios, vista)] == [(0, 0, 5.5), (0, 6, 0)]
    assert _hits_on_mesh(sitios, vtk.vtkPolyData()) == []


class TestPorLaApi:
    """La segmentaciÃ³n de TC deja la malla de detecciÃ³n; otra segmentaciÃ³n la quita."""

    @pytest.fixture(scope="class")
    @classmethod
    def serie(cls):
        from services.sessions import create_session
        from test_cta_vessels import _cabeza
        from test_volume_chunks import _write_classic_ct_series
        h = _cabeza((1.0, 1.0, 1.0), (56, 68, 68))
        vals = np.clip(np.round(h["vol"]), -1024, 3000).astype(np.int16)

        def nueva():
            sid = create_session()
            _write_classic_ct_series(sid, nz=vals.shape[0], ny=vals.shape[1], nx=vals.shape[2],
                                     values=vals, pixel_spacing=1.0)
            return sid
        return nueva

    @staticmethod
    def _segment(sid, **over):
        from fastapi.testclient import TestClient
        from main import app
        body = {"session_id": sid, "series_id": "", "lower": 150.0, "upper": 0.0,
                "smoothing": 3, "cleanup": 0, "main_tree_only": False, "method": "tubular"}
        body.update(over)
        return TestClient(app, raise_server_exceptions=True).post("/api/segment", json=body)

    def test_tc_deja_las_dos_mallas_y_la_huella(self, serie, monkeypatch):
        import routers.segment as seg
        from services.segmentation import read_vtp
        from services.sessions import session_subdir
        from services.sessions import read_state
        monkeypatch.setattr(seg, "CT_RECIPE", "vessels")
        sid = serie()
        r = self._segment(sid)
        assert r.status_code == 200, r.text
        meshes = session_subdir(sid, "meshes")
        det = meshes / seg.DETECT_MESH_NAME
        if not det.exists():
            # La receta anterior puede no encontrar semillas en un fantasma tan
            # pequeÃ±o: entonces no hay malla aparte y la huella queda vacÃ­a.
            assert read_state(sid, "seg.detect_tree_for") in ("", None)
            pytest.skip("la receta anterior no dio malla en el fantasma")
        vista = read_vtp(meshes / "vessel_tree.vtp")
        assert read_state(sid, "seg.detect_tree_for") == seg.mesh_fingerprint(vista)
        assert read_vtp(det).GetNumberOfPoints() > 0

        # Umbral clÃ¡sico: la malla de detecciÃ³n de antes ya no acompaÃ±a a nada.
        r = self._segment(sid, method="threshold")
        assert r.status_code == 200, r.text
        assert not det.exists()
        assert read_state(sid, "seg.detect_tree_for") in ("", None)

    def test_si_la_receta_anterior_falla_la_segmentacion_sigue(self, serie, monkeypatch):
        import routers.segment as seg
        from services.sessions import session_subdir
        monkeypatch.setattr(seg, "CT_RECIPE", "vessels")
        real = seg.segment_tubular

        def falla_la_vieja(dcm, **kw):
            if kw.get("ct_recipe") == "tubular":
                raise ValueError("sin semillas")
            return real(dcm, **kw)
        monkeypatch.setattr(seg, "segment_tubular", falla_la_vieja)
        sid = serie()
        r = self._segment(sid)
        assert r.status_code == 200, r.text
        meshes = session_subdir(sid, "meshes")
        assert (meshes / "vessel_tree.vtp").exists()
        assert not (meshes / seg.DETECT_MESH_NAME).exists()
