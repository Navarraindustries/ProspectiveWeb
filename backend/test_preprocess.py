"""Tests for optional DICOM volume preprocessing (Feature 10)."""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_preproc_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.sessions import create_session, session_subdir
from services.preprocess import preprocess_volume, subtract_bone
from services import mpr as mprmod
from services.mpr import _cache_paths

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _session_with_volume(nz=40, ny=64, nx=64, spacing=(2.0, 0.5, 0.5)) -> str:
    sid = create_session()
    vol = (np.random.rand(nz, ny, nx) * 200 + 50).astype(np.float32)
    vol[0, 0, 0] = 9000.0
    vol[1, 1, 1] = -5000.0
    npy, meta = mprmod._cache_paths(sid)
    np.save(npy, vol)
    meta.write_text(json.dumps({"shape": [nz, ny, nx], "spacing": list(spacing), "wc": 150, "ww": 700, "modality": "CT"}))
    mprmod._downsampled_volume.cache_clear()
    return sid


class TestService:
    def test_clip(self):
        vol = np.array([[[9000, -5000], [100, 200]]], dtype=np.float32)
        out, sp = preprocess_volume(vol, (1, 1, 1), clip_hu=True)
        assert out.max() <= 3000 and out.min() >= -1000

    def test_isotropic_resample_dims(self):
        vol = np.zeros((40, 64, 64), dtype=np.float32)
        out, sp = preprocess_volume(vol, (2.0, 0.5, 0.5), clip_hu=False, resample_isotropic=True, target_spacing_mm=1.0)
        assert sp == (1.0, 1.0, 1.0)
        assert out.shape == (80, 32, 32)

    def test_subtract_bone(self):
        vol = np.array([[[400.0, 100.0], [-1000.0, 350.0]]], dtype=np.float32)
        out = subtract_bone(vol, 300.0)
        assert out[0, 0, 0] == -1000.0  # 400 > 300 → removed
        assert out[0, 1, 1] == -1000.0  # 350 > 300 → removed
        assert out[0, 0, 1] == 100.0    # kept


class TestEndpoint:
    def test_resample_rewrites_cache(self):
        sid = _session_with_volume()
        r = client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": True, "resample_isotropic": True, "target_spacing_mm": 1.0,
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["spacing_after"] == [1.0, 1.0, 1.0]
        assert b["shape_after"] == [80, 32, 32]
        # MPR meta on disk reflects the new geometry
        meta = mprmod.ensure_volume_cached(sid)
        assert meta["shape"] == [80, 32, 32]
        vol = np.load(mprmod._cache_paths(sid)[0])
        assert vol.max() <= 3001 and vol.min() >= -1001

    def test_rewriting_the_volume_changes_its_cache_key(self):
        import re
        sid = _session_with_volume()
        npy, meta_path = mprmod._cache_paths(sid)
        meta = json.loads(meta_path.read_text())
        meta["volume_id"] = "a" * 32
        meta_path.write_text(json.dumps(meta))
        assert mprmod.ensure_volume_cached(sid)["cache_key"] == "a" * 32

        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True})
        assert r.status_code == 200, r.text
        key = mprmod.ensure_volume_cached(sid)["cache_key"]
        assert re.fullmatch(r"[0-9a-f]{32}", key) and key != "a" * 32

    def test_noop_selection_422(self):
        sid = _session_with_volume()
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": False, "resample_isotropic": False, "smooth": False})
        assert r.status_code == 422

    def test_unknown_session_404(self):
        r = client.post("/api/preprocess/nope", json={"clip_hu": True})
        assert r.status_code == 404


# ── Regression: the HU clamp is a Hounsfield-only operation ─────────────────── #

def _session_with_xa_volume(nz=24, ny=48, nx=48) -> str:
    """A 3DRA/XA-like volume: contrast runs far past the CT HU ceiling."""
    sid = create_session()
    vol = np.full((nz, ny, nx), -1000.0, dtype=np.float32)
    vol[10:14, 20:28, 20:28] = 9000.0          # contrast column, way over 3000
    npy, meta = mprmod._cache_paths(sid)
    np.save(npy, vol)
    meta.write_text(json.dumps({
        "shape": [nz, ny, nx], "spacing": [1.0, 1.0, 1.0],
        "wc": 150, "ww": 700, "modality": "XA",
    }))
    mprmod._downsampled_volume.cache_clear()
    return sid


class TestHuClipIsHounsfieldOnly:
    """Regression: «Recorte de HU (−1000…3000)» shipped ticked by default and
    was applied to any modality. On a 3DRA/XA study — where intensities are not
    Hounsfield units and routinely exceed 3000 — it flattened the whole contrast
    column to a single value.
    """

    def test_modality_predicate(self):
        from services.preprocess import is_hounsfield
        assert is_hounsfield("CT") and is_hounsfield("cta")
        assert not is_hounsfield("XA")
        assert not is_hounsfield("MR")
        assert not is_hounsfield(None)

    def test_clip_alone_is_rejected_on_xa(self):
        sid = _session_with_xa_volume()
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True})
        assert r.status_code == 422
        assert "Hounsfield" in r.json()["detail"]

    def test_xa_contrast_survives_when_other_ops_run(self):
        sid = _session_with_xa_volume()
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True, "smooth": True})
        assert r.status_code == 200, r.text
        assert "omitido" in r.json()["note"]

        npy, _meta = mprmod._cache_paths(sid)
        mprmod._downsampled_volume.cache_clear()
        out = np.load(npy)
        assert out.max() > 3000.0, "el recorte aplanó el contraste de un volumen XA"

    def test_ct_volume_is_still_clipped(self):
        sid = _session_with_volume()
        r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True})
        assert r.status_code == 200, r.text
        assert "omitido" not in r.json()["note"]

        npy, _meta = mprmod._cache_paths(sid)
        mprmod._downsampled_volume.cache_clear()
        out = np.load(npy)
        assert out.max() <= 3000.0 and out.min() >= -1000.0


# ── Regression: preprocessing must not persist per-call meta keys ───────────── #

@pytest.fixture
def session_with_ct_volume() -> str:
    """A synthetic CT volume with intensities reaching 5000, well past the
    HU_MAX=3000 clip, and sized so the bright region is not lost by the
    percentile-based `intensity_range` (robust p0.5-p99.9)."""
    sid = create_session()
    nz, ny, nx = 32, 48, 48
    vol = (np.random.rand(nz, ny, nx) * 100 + 50).astype(np.float32)
    vol[0:4, 0:8, 0:8] = 5000.0  # >0.1% of voxels, so it survives the p99.9 cut
    npy, meta = mprmod._cache_paths(sid)
    np.save(npy, vol)
    meta.write_text(json.dumps({
        "shape": [nz, ny, nx], "spacing": [1.0, 1.0, 1.0],
        "wc": 150, "ww": 700, "modality": "CT",
    }))
    mprmod._downsampled_volume.cache_clear()
    return sid


def test_preprocesar_recalcula_el_rango_y_no_persiste_claves_por_llamada(session_with_ct_volume):
    sid = session_with_ct_volume
    r = client.post(f"/api/preprocess/{sid}", json={"clip_hu": True, "resample_isotropic": False, "smooth": False})
    assert r.status_code == 200, r.text
    meta = json.loads(_cache_paths(sid)[1].read_text())
    assert "cache_key" not in meta and "orientation_manual" not in meta
    assert meta["intensity_range"][1] <= 3000.0          # recortado a HU_MAX
    assert meta["full_stride"] == 1


def test_remuestrear_isotropo_reescribe_forma_espaciado_y_recalcula_la_meta(session_with_ct_volume):
    """Con `resample_isotropic` la meta en disco describe el volumen remuestreado:
    forma y espaciado nuevos, y `intensity_range`/`full_stride` recalculados en
    vez de heredar los valores viejos."""
    sid = session_with_ct_volume
    npy, meta_path = _cache_paths(sid)
    stale = json.loads(meta_path.read_text())
    stale["spacing"] = [2.0, 1.0, 1.0]
    stale["intensity_range"] = [-123456.0, 123456.0]   # valores viejos imposibles
    stale["full_stride"] = 2
    meta_path.write_text(json.dumps(stale))
    mprmod._downsampled_volume.cache_clear()

    r = client.post(f"/api/preprocess/{sid}", json={
        "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 1.0, "smooth": False,
    })
    assert r.status_code == 200, r.text

    meta = json.loads(meta_path.read_text())
    vol = np.load(npy)
    assert meta["shape"] == [64, 48, 48] == list(vol.shape)
    assert meta["spacing"] == [1.0, 1.0, 1.0]
    assert meta["intensity_range"] == mprmod._intensity_range(vol)
    assert meta["intensity_range"] != [-123456.0, 123456.0]
    assert meta["full_stride"] == 1


# ── Regression: segmentar usa el volumen preprocesado ──────────────────────── #

class TestSegmentarUsaElVolumenPreprocesado:
    """«Aplicar preprocesamiento» dice «Vuelve a segmentar para usar el volumen
    preprocesado», pero la segmentación releía el DICOM original: en Case 3 un
    suavizado σ 0,5 daba exactamente la misma malla (103 978 vértices) que sin
    él. La segmentación toma el volumen de la caché cuando la sesión está
    preprocesada, y el DICOM cuando no. El recorrido completo por /api/segment
    está en test_segment_tubular.py::TestSegmentarTrasPreprocesar."""

    def test_sin_preprocesar_no_hay_fuente_preprocesada(self):
        from routers.segment import _preprocessed_source
        sid = _session_with_volume()
        assert _preprocessed_source(sid, "") is None

    def test_preprocesado_se_usa_la_cache_con_su_geometria(self):
        from routers.segment import _preprocessed_source
        sid = _session_with_volume()
        r = client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 1.0, "smooth": False,
        })
        assert r.status_code == 200, r.text
        src = _preprocessed_source(sid, "")
        assert src.volume.shape == (80, 32, 32)
        assert src.spacing == (1.0, 1.0, 1.0)
        assert src.modality == "CT"
        np.testing.assert_array_equal(src.volume, np.load(_cache_paths(sid)[0]))
