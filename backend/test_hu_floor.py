"""`services.hu_floor`: un candidato en aire o sin contraste no es un aneurisma.

Medido en Zenodo (informe 18-10, §4.5): ningún acierto por debajo de −74 HU
medio ni de 251 HU máximo; 65 falsos por debajo del suelo (−100 / 200).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_hf_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import vtk

from services.aneurysm_consensus import ConsensusHit
from services.hu_floor import HU_FLOOR_MAX, HU_FLOOR_MEAN, drop_air, hu_stats, in_air

SP = (0.5, 0.5, 0.5)


def _volumen(hu: float = -1000.0, shape=(40, 40, 40)) -> np.ndarray:
    return np.full(shape, hu, dtype=np.float32)


def _bola(vol: np.ndarray, centro_mm, radio_mm: float, hu: float) -> None:
    zz, yy, xx = np.mgrid[:vol.shape[0], :vol.shape[1], :vol.shape[2]]
    x, y, z = centro_mm
    d2 = ((zz * SP[0] - z) ** 2 + (yy * SP[1] - y) ** 2 + (xx * SP[2] - x) ** 2)
    vol[d2 <= radio_mm ** 2] = hu


class TestElSuelo:
    def test_los_umbrales_son_los_medidos(self):
        assert HU_FLOOR_MEAN == -100.0 and HU_FLOOR_MAX == 200.0
        assert in_air(-101.0, 1000.0)            # aire o grasa
        assert in_air(150.0, 199.0)              # partes blandas sin contraste
        assert not in_air(-74.0, 251.0)          # el acierto más bajo medido
        assert not in_air(-100.0, 200.0)         # el borde queda dentro
        assert not in_air(None, None)            # fuera del volumen: pasa

    def test_la_bola_mide_lo_que_hay_alrededor(self):
        vol = _volumen(0.0)
        _bola(vol, (10.0, 10.0, 10.0), 1.0, 1000.0)
        media, maximo = hu_stats(vol, SP, (10.0, 10.0, 10.0), 0.4)
        assert media == 1000.0 and maximo == 1000.0
        media, maximo = hu_stats(vol, SP, (10.0, 10.0, 10.0), 2.0)
        assert 0.0 < media < 1000.0 and maximo == 1000.0
        assert hu_stats(vol, SP, (500.0, 10.0, 10.0), 1.0) is None

    def test_quita_el_candidato_en_aire_y_deja_el_del_vaso(self):
        vol = _volumen(-1000.0)
        _bola(vol, (5.0, 5.0, 5.0), 4.0, 300.0)                 # vaso con contraste
        _bola(vol, (15.0, 15.0, 15.0), 4.0, 60.0)               # partes blandas
        aire = ConsensusHit(position=(10.0, 10.0, 10.0), ranks={"curvatura": 1})
        vaso = ConsensusHit(position=(5.0, 5.0, 5.0), ranks={"curvatura": 2})
        blando = ConsensusHit(position=(15.0, 15.0, 15.0), ranks={"calibre": 1})
        fuera = ConsensusHit(position=(900.0, 900.0, 900.0), ranks={"cociente": 1})
        kept, info = drop_air([aire, vaso, blando, fuera], vol, SP)
        assert kept == [vaso, fuera], "el orden de los que quedan no cambia"
        assert info.applied and info.checked == 4 and info.dropped == 2
        assert info.dropped_hu[0][0] < HU_FLOOR_MEAN and info.dropped_hu[1][1] < HU_FLOOR_MAX
        assert info.as_dict()["dropped"] == 2


def _tubo(largo: float = 60.0) -> vtk.vtkPolyData:
    line = vtk.vtkLineSource()
    line.SetPoint1(10.0, 10.0, 0.0); line.SetPoint2(10.0, 10.0, largo)
    line.SetResolution(30)
    tube = vtk.vtkTubeFilter(); tube.SetInputConnection(line.GetOutputPort())
    tube.SetRadius(2.0); tube.SetNumberOfSides(24); tube.CappingOn()
    tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(tube.GetOutputPort()); tri.Update()
    return tri.GetOutput()


class TestLaDeteccionLoUsa:
    def _finge_consenso(self, monkeypatch):
        import services.aneurysm_consensus as ac
        hits = [ConsensusHit(position=(30.0, 30.0, 30.0), ranks={"curvatura": 1}),   # aire
                ConsensusHit(position=(10.0, 10.0, 30.0), ranks={"curvatura": 2}),   # vaso
                ConsensusHit(position=(10.0, 10.0, 40.0), ranks={"calibre": 1})]     # vaso
        monkeypatch.setattr(ac, "consensus", lambda poly, det, top=5, **kw: hits[:top])
        return hits

    def test_en_tc_con_volumen_quita_el_aire_y_rellena(self, monkeypatch):
        import routers.detect as rd
        hits = self._finge_consenso(monkeypatch)
        monkeypatch.setattr(rd, "_MAX_CANDIDATES", 2)
        vol = _volumen(-1000.0, shape=(120, 60, 60))
        _bola(vol, (10.0, 10.0, 30.0), 5.0, 300.0)
        _bola(vol, (10.0, 10.0, 40.0), 5.0, 300.0)
        out, det = rd._detect_hits(_tubo(), "CT", volume=(vol, SP))
        assert out == [hits[1], hits[2]], "el de aire sale y el tercero sube a la lista"
        assert det.hu_floor["applied"] and det.hu_floor["dropped"] == 1

    def test_en_xa_no_se_mira(self, monkeypatch):
        import routers.detect as rd
        hits = self._finge_consenso(monkeypatch)
        monkeypatch.setattr(rd, "_MAX_CANDIDATES", 2)
        out, det = rd._detect_hits(_tubo(), "XA", volume=(_volumen(-1000.0, (120, 60, 60)), SP))
        assert out == hits[:2]
        assert det.hu_floor["applied"] is False

    def test_sin_volumen_no_cambia_nada(self, monkeypatch):
        import routers.detect as rd
        hits = self._finge_consenso(monkeypatch)
        monkeypatch.setattr(rd, "_MAX_CANDIDATES", 2)
        out, det = rd._detect_hits(_tubo(), "CT")
        assert out == hits[:2]
        assert det.hu_floor["applied"] is False
