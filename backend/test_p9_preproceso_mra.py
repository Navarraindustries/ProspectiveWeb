"""P9: preprocesado de angio-RM — corrección N4 y localización a 1 mm.

En una angio-RM la intensidad del tejido cambia de un lado a otro de la cabeza
por la sensibilidad de la antena (el campo de sesgo): un umbral global deja
fuera los vasos del lado oscuro y mete tejido del lado brillante. La corrección
N4 (Tustison 2010) estima ese campo y lo quita (Vach 2024, Dalmer 2026).

Decisión del 21-11-2026: la N4 es una operación más del Preprocesado, solo para
RM y a resolución nativa, así que el visor, los umbrales y la segmentación ven
el mismo volumen y se puede revertir. El «1 mm antes del umbral» de los
artículos se aplica a la pasada gruesa que localiza los vasos; la malla sigue
saliendo a resolución nativa (services.band_refine).

Aquí no hay angio-RM reales: todo con volúmenes sintéticos. La prueba con datos
reales la hace la oficina con Royal Brisbane (O6).
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_p9_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from services import mpr as mprmod
from services.database import Base, engine
from services.sessions import create_session, read_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

SP = (0.8, 0.8, 0.8)       # (z, y, x) en mm


def _cabeza_con_sesgo(forma=(48, 64, 64), sesgo=(0.5, 1.5), semilla=0, vaso=300.0):
    """Esfera de tejido (100) con dos vasos (`vaso`) a lo largo de z, uno en cada
    lado, multiplicada por un campo que va de `sesgo[0]` a `sesgo[1]` en x.

    Devuelve (volumen, tejido, vasos): las dos últimas son máscaras."""
    rng = np.random.default_rng(semilla)
    z, y, x = np.indices(forma, dtype=np.float32)
    cz, cy, cx = (n / 2 for n in forma)
    r = np.sqrt(((z - cz) / cz) ** 2 + ((y - cy) / cy) ** 2 + ((x - cx) / cx) ** 2)
    dentro = r < 0.9
    vasos = np.zeros(forma, dtype=bool)
    for xc in (forma[2] * 0.25, forma[2] * 0.75):         # uno en el lado oscuro, otro en el brillante
        vasos |= ((y - cy) ** 2 + (x - xc) ** 2 < 2.5 ** 2) & dentro
    tejido = dentro & ~vasos
    vol = np.zeros(forma, dtype=np.float32)
    vol[tejido] = 100.0
    vol[vasos] = vaso
    campo = sesgo[0] + (sesgo[1] - sesgo[0]) * x / (forma[2] - 1)
    vol = vol * campo + rng.normal(0.0, 2.0, forma).astype(np.float32) * dentro
    return np.clip(vol, 0.0, None).astype(np.float32), tejido, vasos


def _cv(v: np.ndarray) -> float:
    return float(v.std() / v.mean())


# ── La corrección ─────────────────────────────────────────────────────────── #

class TestN4:
    def test_quita_el_campo_del_tejido(self):
        from services.preprocess import n4_correct
        vol, tejido, _ = _cabeza_con_sesgo()
        out = n4_correct(vol, SP)
        assert out.shape == vol.shape and out.dtype == np.float32
        assert _cv(out[tejido]) < _cv(vol[tejido]) / 3, (_cv(vol[tejido]), _cv(out[tejido]))

    def test_despues_un_umbral_global_separa_vasos_y_tejido(self):
        """Vasos poco brillantes (180) y un campo fuerte (0,4 → 1,6): el vaso del
        lado oscuro (≈ 126) queda por debajo del tejido del lado brillante
        (≈ 150) y ningún umbral global los separa; corregido, todo vaso queda
        por encima de todo tejido."""
        from services.preprocess import n4_correct
        vol, tejido, vasos = _cabeza_con_sesgo(sesgo=(0.4, 1.6), vaso=180.0)
        assert np.percentile(vol[vasos], 5) < np.percentile(vol[tejido], 95)
        out = n4_correct(vol, SP)
        assert np.percentile(out[vasos], 5) > np.percentile(out[tejido], 95)

    def test_conserva_la_escala_de_intensidad(self):
        """Los umbrales que el usuario ya conoce siguen valiendo: la mediana de
        la cabeza no se mueve más de un 10 %."""
        from services.preprocess import n4_correct
        vol, tejido, vasos = _cabeza_con_sesgo()
        cabeza = tejido | vasos
        out = n4_correct(vol, SP)
        assert np.median(out[cabeza]) == pytest.approx(np.median(vol[cabeza]), rel=0.10)

    def test_un_volumen_sin_campo_casi_no_cambia(self):
        from services.preprocess import n4_correct
        vol, tejido, _ = _cabeza_con_sesgo(sesgo=(1.0, 1.0))
        out = n4_correct(vol, SP)
        assert np.median(np.abs(out[tejido] - vol[tejido]) / vol[tejido]) < 0.05

    def test_va_antes_del_remuestreo(self):
        from services.preprocess import preprocess_volume
        vol, _, _ = _cabeza_con_sesgo()
        out, sp = preprocess_volume(vol, SP, clip_hu=False, n4=True,
                                    resample_isotropic=True, target_spacing_mm=1.6)
        assert sp == (1.6, 1.6, 1.6) and out.shape == (24, 32, 32)

    def test_el_rotulo_y_los_datos(self):
        from services.preprocess import ops_params, ops_text
        p = ops_params(False, True, 1.0, False, 0.5, n4=True)
        assert p["n4"] is True
        assert ops_text(p, persona=True) == "corrección N4; remuestreo isotrópico 1 mm"
        # Las sesiones de antes no llevan la clave: siguen leyéndose igual.
        assert ops_text({"hu_clip": True, "target_spacing_mm": None, "smooth_sigma": None},
                        persona=True) == "recorte HU"


# ── El endpoint de preprocesado ──────────────────────────────────────────── #

def _sesion(modalidad: str) -> tuple[str, np.ndarray]:
    sid = create_session()
    vol, _, _ = _cabeza_con_sesgo()
    npy, meta = mprmod._cache_paths(sid)
    np.save(npy, vol)
    meta.write_text(json.dumps({"shape": list(vol.shape), "spacing": list(SP),
                                "wc": 150, "ww": 300, "modality": modalidad}))
    mprmod._downsampled_volume.cache_clear()
    return sid, vol


class TestEndpoint:
    def test_en_rm_reescribe_el_volumen_y_lo_anota(self):
        sid, antes = _sesion("MR")
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": False, "n4": True})
        assert r.status_code == 200, r.text
        assert read_state(sid, "preprocess.ops") == "corrección N4"
        assert json.loads(read_state(sid, "preprocess.params"))["n4"] is True
        mprmod._downsampled_volume.cache_clear()
        despues = np.load(mprmod._cache_paths(sid)[0])
        assert despues.shape == antes.shape and not np.allclose(despues, antes)

    def test_en_tc_sola_se_rechaza(self):
        sid, _ = _sesion("CT")
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": False, "n4": True})
        assert r.status_code == 422
        assert "angio-RM" in r.json()["detail"]

    def test_en_tc_con_otra_operacion_se_omite_y_se_dice(self):
        sid, _ = _sesion("CT")
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": False, "n4": True, "smooth": True})
        assert r.status_code == 200, r.text
        assert "N4" in r.json()["note"] and "omitida" in r.json()["note"]
        assert "N4" not in read_state(sid, "preprocess.ops")


# ── La pasada gruesa a 1 mm en RM ────────────────────────────────────────── #

class TestLocalizacionA1mm:
    @pytest.mark.parametrize("espaciado, factor", [
        ((0.8, 0.4, 0.4), 2),     # TOF típico: 0,8 mm en plano
        ((0.6, 0.3, 0.3), 3),     # 0,9 mm
        ((1.0, 0.5, 0.5), 2),     # 1 mm justo
        ((1.2, 0.6, 0.6), 1),     # ya pasa de medio milímetro: se localiza a resolución nativa
        ((1.0, 1.0, 1.0), 1),
    ])
    def test_el_factor_deja_el_voxel_grueso_en_un_milimetro_como_mucho(self, espaciado, factor):
        from routers.segment import mr_coarse_factor
        assert mr_coarse_factor(espaciado) == factor

    def test_en_rm_localiza_reducido_y_la_malla_sale_nativa(self, monkeypatch):
        import functools
        from types import SimpleNamespace

        import routers.segment as seg
        import services.vascular_mask as vm
        from test_vesselness import synthetic_tube

        # La semilla de producción (50 mm³) no siembra un cilindro sintético
        # (ver test_paso1_banda_nativa): aquí se prueba el enrutado.
        monkeypatch.setattr(vm, "MaskParams", functools.partial(vm.MaskParams, seed_min_mm3=5.0))
        sp = (0.4, 0.4, 0.4)
        vol = synthetic_tube(shape=(160, 96, 96), spacing=sp, radius_mm=4.0, value=350.0)
        dcm = SimpleNamespace(volume=vol, spacing=sp, modality="MR", window_center=150.0, window_width=300.0)
        _poly, info = seg.segment_tubular(dcm, lower=150.0, upper=0.0, strategy="mr_percentile",
                                          memory_guard=False)
        assert info["downsample_factor"] == 2
        assert info["seg_spacing_mm"] == [0.8, 0.8, 0.8]
        assert info["mesh_spacing_mm"] == [0.4, 0.4, 0.4]
        assert "1 mm" in info["fallback_note"]

    def test_en_tc_no_cambia_nada(self, monkeypatch):
        import functools
        from types import SimpleNamespace

        import routers.segment as seg
        import services.vascular_mask as vm
        from test_vesselness import synthetic_tube

        monkeypatch.setattr(vm, "MaskParams", functools.partial(vm.MaskParams, seed_min_mm3=5.0))
        sp = (0.4, 0.4, 0.4)
        vol = synthetic_tube(shape=(160, 96, 96), spacing=sp, radius_mm=4.0, value=350.0)
        dcm = SimpleNamespace(volume=vol, spacing=sp, modality="XA", window_center=150.0, window_width=300.0)
        _poly, info = seg.segment_tubular(dcm, lower=150.0, upper=0.0, strategy="xa",
                                          memory_guard=False)
        assert info["downsample_factor"] == 1
