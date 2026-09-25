"""Volumen para el visor en el cliente: meta con orientación, bloques int16."""
from __future__ import annotations

import json
import numpy as np
from fastapi.testclient import TestClient

from main import app
from services.sessions import create_session, session_subdir
from services.mpr import ensure_volume_cached, _downsampled_volume

client = TestClient(app, raise_server_exceptions=True)


def _session_with_volume(nz=40, ny=60, nx=50, values=None) -> str:
    sid = create_session()
    meshes = session_subdir(sid, "meshes")
    if values is None:
        zz, yy, xx = np.mgrid[0:nz, 0:ny, 0:nx]
        values = (zz * 10 + yy + xx).astype(np.float32)
    np.save(meshes / "_volume.npy", values.astype(np.float32))
    (meshes / "_volume_meta.json").write_text(json.dumps({
        "shape": [nz, ny, nx], "spacing": [1.0, 0.8, 0.8],
        "wc": 100.0, "ww": 400.0, "modality": "CT",
    }))
    _downsampled_volume.cache_clear()
    return sid


class TestMeta:
    def test_meta_fills_missing_orientation_fields_from_cache(self):
        # Una sesión cacheada antes de este cambio no tiene las claves nuevas:
        # la meta las completa en vez de romper el visor.
        sid = _session_with_volume()
        meta = ensure_volume_cached(sid)
        assert meta["direction"] is None
        assert meta["orientation_known"] is False
        assert meta["origin_mm"] == [0.0, 0.0, 0.0]
        lo, hi = meta["intensity_range"]
        assert lo < hi
        assert isinstance(meta["cache_key"], str) and meta["cache_key"]
        assert meta["full_stride"] == 1

    def test_meta_endpoint_exposes_new_fields(self):
        sid = _session_with_volume()
        r = client.get(f"/api/volume/{sid}/meta")
        assert r.status_code == 200
        body = r.json()
        for key in ("direction", "orientation_known", "origin_mm", "intensity_range", "cache_key", "full_stride"):
            assert key in body
