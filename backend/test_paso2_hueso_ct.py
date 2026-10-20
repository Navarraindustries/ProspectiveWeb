# -*- coding: utf-8 -*-
"""Paso 2 del plan Zenodo: el hueso fuera de la máscara tubular en TC, sin tocar XA.

Medido sobre las 172 angio-TC de Zenodo (informe 2026-10-12): el método
tubular quitaba el techo de HU en todas las modalidades, porque en la 3DRA de
Case 3 el techo vaciaba el tubo. En TC eso mete el cráneo en la máscara: la
pieza mayor de la malla era la cabeza entera (mediana 761 cm³), el 66 % de los
candidatos caían en hueso y los canales de calibre y cociente se apagaban en
171 de 172 estudios. Tres cosas cambian aquí, y las tres se enrutan por
modalidad o por malla para que la 3DRA siga igual:

1. `tubular_ceiling`: techo de 700 HU en TC, ninguno en XA.
2. `build_vascular_mask` con ese techo deja fuera un bloque de hueso pegado al
   vaso (ya lo hacía: lo nuevo es que el servidor lo pida en TC).
3. `consensus(..., tree_poly=)`: si hay árbol se decide sobre la malla
   completa, no sobre la copia decimada (Zenodo 026).
"""
from __future__ import annotations

import os
import tempfile
from types import SimpleNamespace

_tmp = tempfile.mkdtemp(prefix="prospective_p2_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from scipy import ndimage

from routers.segment import CT_TUBULAR_CEILING_HU, segment_tubular, tubular_ceiling
from services.aneurysm_consensus import _geometric_channels_apply
from services.vascular_mask import MaskParams, bone_mask, build_vascular_mask
from test_vascular_mask import SEMILLA, _sphere
from test_vesselness import SP, synthetic_tube


class TestTechoPorModalidad:
    def test_xa_nunca_lleva_techo(self):
        # Case 3: el centro de los vasos más llenos supera cualquier techo y no
        # hay hueso que quitar; con techo el tubo se vaciaba y se partía.
        for pedido in (0.0, 1500.0, 4717.0):
            assert tubular_ceiling("XA", pedido, 1470.0) == 0.0

    def test_ct_lleva_700_aunque_el_usuario_pida_mas_o_nada(self):
        assert CT_TUBULAR_CEILING_HU == 700.0
        assert tubular_ceiling("CT", 1500.0, 150.0) == 700.0     # el techo por defecto de ct_stats
        assert tubular_ceiling("CT", 0.0, 150.0) == 700.0        # «sin techo» explícito
        assert tubular_ceiling("ct", 100.0, 150.0) == 700.0      # por debajo del suelo: inválido

    def test_ct_respeta_un_techo_mas_bajo_que_700(self):
        assert tubular_ceiling("CT", 400.0, 150.0) == 400.0

    def test_otras_modalidades_siguen_sin_techo(self):
        for mod in ("MR", "", "RF"):
            assert tubular_ceiling(mod, 1500.0, 150.0) == 0.0


def _tubo_con_hueso(shape=(64, 64, 64)):
    """Un vaso con contraste (350 HU, radio 2 mm) y un bloque de hueso cortical
    (1 200 HU, 12 mm de lado) pegado a su costado."""
    vol = synthetic_tube(shape=shape, radius_mm=2.0, value=350.0)
    hueso = np.zeros(shape, dtype=bool)
    hueso[20:44, 20:44, 36:60] = True          # toca la pared del tubo en x = 36
    vol[hueso] = 1200.0
    return vol, hueso


class TestHuesoFueraEnTC:
    def test_con_techo_700_el_bloque_de_hueso_no_entra_y_el_vaso_queda_macizo(self):
        vol, hueso = _tubo_con_hueso()
        r = build_vascular_mask(vol, SP, MaskParams(lower=150.0, upper=700.0, seed_min_mm3=SEMILLA))
        assert r.mask[hueso].mean() < 0.02
        assert r.mask[32, 32, 32] and r.mask[10, 32, 32] and r.mask[54, 32, 32]

    def test_sin_techo_parte_del_hueso_vuelve_con_la_recuperacion(self):
        # Lo que pasaba en TC: el bloque no es lámina, así que el veto no lo
        # para, y la recuperación a 3 mm se trae su cara pegada al vaso.
        vol, hueso = _tubo_con_hueso()
        con = build_vascular_mask(vol, SP, MaskParams(lower=150.0, upper=700.0, seed_min_mm3=SEMILLA))
        sin = build_vascular_mask(vol, SP, MaskParams(lower=150.0, upper=0.0, seed_min_mm3=SEMILLA))
        assert sin.mask[hueso].sum() > con.mask[hueso].sum()
        assert sin.stats["m0_vox"] > con.stats["m0_vox"]


class TestMascaraDeHueso:
    """Lo que de verdad saca el cráneo en TC: no el techo, sino quitar los
    componentes > 700 HU grandes, dilatados, antes del núcleo."""

    def test_el_bloque_de_hueso_y_su_cascara_se_van_y_el_vaso_queda(self):
        vol, hueso = _tubo_con_hueso()
        # Cáscara de volumen parcial de 1 vóxel (0,5 mm) alrededor del bloque,
        # dentro de la banda del umbral: con el techo se quedaría.
        cascara = ndimage.binary_dilation(hueso) & ~hueso
        vol[cascara & (vol < 150)] = 400.0
        con = build_vascular_mask(vol, SP, MaskParams(lower=150.0, bone_hu=700.0, seed_min_mm3=SEMILLA))
        sin = build_vascular_mask(vol, SP, MaskParams(lower=150.0, upper=700.0, seed_min_mm3=SEMILLA))
        assert con.stats["bone_vox"] > 0
        assert con.mask[hueso].sum() == 0 and con.mask[cascara].sum() == 0
        # El vaso sigue: entero lejos del bloque, y donde lo toca pierde solo
        # el margen de 1,5 mm (x ≥ 33) — el resto de la sección queda.
        assert con.mask[10, 32, 32] and con.mask[32, 32, 29]
        # El techo solo (lo que hacía el paso 2 al principio) deja la cáscara.
        assert sin.mask[cascara].sum() > con.mask[cascara].sum()

    def test_una_calcificacion_pequena_no_cuenta_como_hueso(self):
        vol = synthetic_tube(shape=(64, 64, 64), radius_mm=2.0, value=350.0)
        calcio = _sphere((64, 64, 64), SP, (32, 32 + 4, 32), 1.0, 1200.0) > 0     # ≈ 4 mm³ en la pared
        vol[calcio] = 1200.0
        m = bone_mask(vol, SP, 700.0, 500.0, 1.5)
        assert not m.any()
        r = build_vascular_mask(vol, SP, MaskParams(lower=150.0, bone_hu=700.0, seed_min_mm3=SEMILLA))
        assert r.mask[calcio].mean() > 0.5

    def test_apagada_no_cambia_nada(self):
        vol, _ = _tubo_con_hueso()
        a = build_vascular_mask(vol, SP, MaskParams(lower=150.0, seed_min_mm3=SEMILLA))
        b = build_vascular_mask(vol, SP, MaskParams(lower=150.0, bone_hu=0.0, seed_min_mm3=SEMILLA))
        assert np.array_equal(a.mask, b.mask) and b.stats["bone_vox"] == 0


def _dcm(vol, modality):
    return SimpleNamespace(volume=vol, spacing=SP, modality=modality,
                           window_center=90.0, window_width=750.0)


@pytest.fixture(scope="module")
def fantasma():
    return _tubo_con_hueso(shape=(96, 64, 64))


class TestSegmentTubularPorModalidad:
    """La receta del servidor, de principio a fin, con el techo que toca."""

    def test_en_ct_el_techo_efectivo_es_700_y_el_hueso_queda_fuera(self, fantasma):
        vol, hueso = fantasma
        poly, info = segment_tubular(_dcm(vol, "CT"), lower=150.0, upper=1500.0,
                                     strategy="ct_stats", memory_guard=False)
        assert info["thresholds"]["upper"] == 700.0
        assert info["mask_stats"]["bone_vox"] > 0            # la máscara de hueso, encendida en TC
        hueso_mm3 = hueso.sum() * float(np.prod(SP))
        tubo_mm3 = np.pi * 2.0 ** 2 * 96 * SP[0]
        assert info["mask_mm3"] < tubo_mm3 + 0.1 * hueso_mm3, info
        assert poly.GetNumberOfPoints() > 0

    def test_en_xa_sigue_sin_techo_y_la_malla_no_cambia(self, fantasma):
        vol, _hueso = fantasma
        _, ct = segment_tubular(_dcm(vol, "CT"), lower=150.0, upper=1500.0,
                                strategy="ct_stats", memory_guard=False)
        _, xa = segment_tubular(_dcm(vol, "XA"), lower=150.0, upper=1500.0,
                                strategy="xa_band_pass", memory_guard=False)
        assert xa["thresholds"]["upper"] == 0.0
        assert xa["mask_stats"]["bone_vox"] == 0             # en 3DRA la máscara de hueso está apagada
        assert xa["mask_mm3"] > ct["mask_mm3"]

    def test_si_el_techo_vacia_la_mascara_el_error_no_culpa_al_umbral_inferior(self):
        # Un fantasma cuyo único brillo (800 HU) pasa del techo de 700: antes
        # el servidor decía «ningún vóxel supera el umbral inferior de 300»,
        # que era falso, y aconsejaba bajar un umbral que no tenía la culpa.
        vol = synthetic_tube(shape=(48, 32, 32), spacing=SP, radius_mm=2.0, value=800.0)
        with pytest.raises(ValueError) as exc:
            segment_tubular(_dcm(vol, "CT"), lower=300.0, upper=0.0,
                            strategy="ct_stats", memory_guard=False)
        msg = str(exc.value)
        assert "entre 300 y 700 HU" in msg and "máxima del volumen = 800" in msg
        assert "Baja el umbral inferior" not in msg
        # En XA no hay techo: el mismo fantasma se segmenta.
        _, info = segment_tubular(_dcm(vol, "XA"), lower=300.0, upper=0.0,
                                  strategy="xa_band_pass", memory_guard=False)
        assert info["mask_stats"]["m0_vox"] > 0


def _tubo_malla(length_mm=60.0, radius_mm=1.0) -> vtk.vtkPolyData:
    line = vtk.vtkLineSource()
    line.SetPoint1(0, 0, 0); line.SetPoint2(length_mm, 0, 0); line.SetResolution(60)
    tube = vtk.vtkTubeFilter()
    tube.SetInputConnection(line.GetOutputPort()); tube.SetRadius(radius_mm)
    tube.SetNumberOfSides(24); tube.CappingOn()
    tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(tube.GetOutputPort()); tri.Update()
    return tri.GetOutput()


def _esfera_malla(radius_mm=3.0) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(radius_mm); s.SetThetaResolution(24); s.SetPhiResolution(24); s.Update()
    return s.GetOutput()


class TestArbolSobreLaMallaCompleta:
    def test_el_arbol_se_decide_sobre_tree_poly_y_el_tamano_sobre_la_copia(self):
        tubo, esfera = _tubo_malla(), _esfera_malla()
        # La esfera sola: 10 mm de diagonal, «demasiado pequeña para ser el árbol».
        assert not _geometric_channels_apply(esfera)
        # Con la malla completa a la vista, sí hay árbol.
        assert _geometric_channels_apply(esfera, tree_poly=tubo)
        # Y al revés: la copia parece árbol, pero la malla completa no lo es.
        assert not _geometric_channels_apply(tubo, tree_poly=esfera)

    def test_detect_hits_pasa_la_malla_completa_al_consenso(self, monkeypatch):
        import routers.detect as rd
        import services.aneurysm_consensus as ac
        visto = {}
        real = ac.consensus

        def espia(poly, detector, top=5, **kw):
            visto["tree_poly"] = kw.get("tree_poly")
            return real(poly, detector, top, **kw)

        monkeypatch.setattr(ac, "consensus", espia)
        tubo = _tubo_malla()
        rd._detect_hits(tubo, "CT")
        assert visto["tree_poly"] is tubo


class TestLaInterfazSabeElTecho:
    """`suggested-band` dice qué techo aplicará el método tubular, para que el
    panel no diga «sin techo» en TC ni la vista previa enseñe otra banda."""

    def test_en_ct_la_banda_sugerida_trae_700(self):
        from fastapi.testclient import TestClient

        from main import app
        from services.sessions import create_session
        from test_volume_chunks import _write_classic_ct_series
        client = TestClient(app, raise_server_exceptions=True)
        sid = create_session()
        vol = np.zeros((40, 48, 48), dtype=np.float32)
        vol[:, 16:32, 16:32] = 400.0
        _write_classic_ct_series(sid, nz=40, size=48, values=vol.astype(np.int16), pixel_spacing=1.0)
        r = client.get(f"/api/segment/suggested-band/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["tubular_upper"] == 700.0

    def test_en_xa_la_banda_sugerida_trae_0(self):
        import json

        from fastapi.testclient import TestClient

        import services.mpr as mprmod
        from main import app
        from services.sessions import create_session, write_state
        client = TestClient(app, raise_server_exceptions=True)
        sid = create_session()
        n = 48
        vol = np.full((n, n, n), 50.0, np.float32)
        vol[10:38, 20:28, 20:28] = 3000.0
        npy, meta = mprmod._cache_paths(sid)
        np.save(npy, vol)
        meta.write_text(json.dumps({"shape": [n, n, n], "spacing": [1, 1, 1],
                                    "wc": 150, "ww": 700, "modality": "XA"}))
        mprmod._downsampled_volume.cache_clear()
        write_state(sid, "dicom.modality", "XA")
        r = client.get(f"/api/segment/suggested-band/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["tubular_upper"] == 0.0
