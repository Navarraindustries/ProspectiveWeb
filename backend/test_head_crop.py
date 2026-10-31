"""`services.head_crop`: lo alto de la malla antes de detectar.

Medido en Zenodo (informe 18-10, §4.4): las 122 lesiones están a 9–121 mm del
techo de la malla; los candidatos de los controles, a 284 mm de mediana.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_hc_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import vtk
from vtkmodules.util.numpy_support import vtk_to_numpy

from services.head_crop import HEAD_DEPTH_MM, crop_to_head, head_window


def _tubo(largo: float, radio: float = 2.0, z0: float = 0.0, sides: int = 24) -> vtk.vtkPolyData:
    line = vtk.vtkLineSource()
    line.SetPoint1(0.0, 0.0, z0); line.SetPoint2(0.0, 0.0, z0 + largo)
    line.SetResolution(max(10, int(largo / 2)))
    tube = vtk.vtkTubeFilter(); tube.SetInputConnection(line.GetOutputPort())
    tube.SetRadius(radio); tube.SetNumberOfSides(sides); tube.CappingOn()
    tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(tube.GetOutputPort()); tri.Update()
    return tri.GetOutput()


def _z(poly) -> np.ndarray:
    return vtk_to_numpy(poly.GetPoints().GetData())[:, 2]


def _junta(*polys) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    return ap.GetOutput()


class TestElCorte:
    def test_una_malla_de_cuello_se_queda_con_los_140_mm_de_arriba(self):
        cuello = _tubo(largo=340.0)
        out, info = crop_to_head(cuello)
        assert info.applied and out is not cuello
        assert abs(info.top_mm - 340.0) < 2.0
        assert abs(info.cut_mm - (340.0 - HEAD_DEPTH_MM)) < 2.0
        z = _z(out)
        assert z.min() >= info.cut_mm - 1e-6 and z.max() > 339.0
        assert info.n_after < info.n_before

    def test_una_malla_de_cabeza_sola_no_se_toca(self):
        cabeza = _tubo(largo=100.0)
        out, info = crop_to_head(cabeza)
        assert out is cabeza and not info.applied
        assert info.n_after == info.n_before == cabeza.GetNumberOfPoints()

    def test_una_mota_por_encima_de_la_cabeza_no_sube_el_corte(self):
        # 11 000 vértices de cuello y una mota de 26: el 0,2 %, como una mota
        # real frente a una malla de 1,5 M (el percentil es el 99,5).
        cuello = _tubo(largo=340.0, sides=64)
        s = vtk.vtkSphereSource(); s.SetRadius(1.0); s.SetCenter(30.0, 0.0, 400.0)
        s.SetThetaResolution(6); s.SetPhiResolution(6); s.Update()
        top, _cut, extent = head_window(_junta(cuello, s.GetOutput()))
        assert abs(top - 340.0) < 2.0, "el techo tiene que ser el de la cabeza, no la mota"
        assert extent > 390.0

    def test_una_malla_vacia_pasa_de_largo(self):
        vacia = vtk.vtkPolyData()
        out, info = crop_to_head(vacia)
        assert out is vacia and not info.applied


class TestLaDeteccionLoUsa:
    def test_detect_hits_detecta_sobre_la_malla_recortada(self, monkeypatch):
        import routers.detect as rd
        import services.aneurysm_consensus as ac
        visto = {}
        real = ac.consensus

        def espia(poly, detector, top=5, **kw):
            visto["zmin"] = float(_z(poly).min())
            visto["tree_zmin"] = float(_z(kw["tree_poly"]).min())
            return real(poly, detector, top, **kw)

        monkeypatch.setattr(ac, "consensus", espia)
        cuello = _tubo(largo=340.0, radio=1.5)
        _hits, det = rd._detect_hits(cuello, "CT")
        assert visto["zmin"] >= 340.0 - HEAD_DEPTH_MM - 2.0
        assert visto["tree_zmin"] >= 340.0 - HEAD_DEPTH_MM - 2.0
        assert det.head_crop["applied"] is True
