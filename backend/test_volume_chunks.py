"""Volumen para el visor en el cliente: meta con orientación, bloques int16."""
from __future__ import annotations

import json
import numpy as np
from fastapi.testclient import TestClient

from main import app
from services.sessions import create_session, session_subdir
from services.mpr import ensure_volume_cached, _downsampled_volume, volume_chunk_int16

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


def _write_classic_ct_series(
    sid: str, nz=3, ny=8, nx=8, with_orientation=True,
    size: int | None = None, bright_cube: int | None = None,
    iop: list[float] | None = None,
) -> None:
    """Write a tiny classic single-frame CT series into the session's dicom/ dir.

    Exercises the real cold-fill path (load_series -> _image_to_result ->
    ensure_volume_cached) instead of pre-seeding _volume.npy, so direction
    extraction and _orientation_known actually run against SimpleITK/pydicom.

    ``size`` sets rows = columns. With ``bright_cube`` the background is 0 and a
    centred cube of half the extent on each axis takes that value: marching
    cubes then has one clean surface, where random noise gives none or many.
    """
    if size is not None:
        ny = nx = size
    import pydicom
    from pydicom.dataset import Dataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    dicom_dir = session_subdir(sid, "dicom")
    series_uid = generate_uid()
    study_uid = generate_uid()
    rng = np.random.default_rng(0)

    for i in range(nz):
        ds = Dataset()
        ds.file_meta = FileMetaDataset()
        ds.file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"   # CT Image
        ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()
        ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.Modality = "CT"
        ds.SeriesDescription = "CT sintetica"
        ds.PatientName = "TEST^VOL"
        ds.PatientID = "HC-VOL"
        ds.Rows, ds.Columns = ny, nx
        ds.PixelSpacing = [0.5, 0.5]
        ds.SliceThickness = 1.0
        ds.SpacingBetweenSlices = 1.0
        if iop is None:
            ds.ImagePositionPatient = [0.0, 0.0, float(i)]
        else:
            # Los cortes avanzan por la normal de la IOP dada.
            n = np.cross(iop[:3], iop[3:6])
            ds.ImagePositionPatient = [float(v) for v in n * i]
        if with_orientation:
            ds.ImageOrientationPatient = iop if iop is not None else [1, 0, 0, 0, 1, 0]
        ds.InstanceNumber = i + 1
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleIntercept = 0
        ds.RescaleSlope = 1
        ds.WindowCenter = 40
        ds.WindowWidth = 400
        if bright_cube is None:
            pixels = rng.integers(0, 800, size=(ny, nx), dtype=np.int16)
        else:
            pixels = np.zeros((ny, nx), dtype=np.int16)
            if nz // 4 <= i < nz // 4 + nz // 2:
                pixels[ny // 4: ny // 4 + ny // 2, nx // 4: nx // 4 + nx // 2] = bright_cube
        ds.PixelData = pixels.tobytes()
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        pydicom.dcmwrite(dicom_dir / f"slice_{i:03d}.dcm", ds, write_like_original=False)


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


class TestCacheKeyIdentifiesTheVolume:
    """La clave de caché del navegador identifica el VOLUMEN, no la sesión:
    reanudar copia los ficheros bajo un id de sesión nuevo y el visor no debe
    volver a descargar 100 MB por eso."""

    def test_fresh_volume_key_is_a_uuid_that_survives_calls_and_copies(self):
        import re
        import shutil
        sid = create_session()
        _write_classic_ct_series(sid)
        key = ensure_volume_cached(sid)["cache_key"]
        assert re.fullmatch(r"[0-9a-f]{32}", key)
        assert ensure_volume_cached(sid)["cache_key"] == key

        # Lo que hace la restauración: copiar _volume.npy + meta a otra sesión.
        other = create_session()
        src, dst = session_subdir(sid, "meshes"), session_subdir(other, "meshes")
        for name in ("_volume.npy", "_volume_meta.json"):
            shutil.copy(src / name, dst / name)   # copy, no copy2: mtime nuevo
        assert ensure_volume_cached(other)["cache_key"] == key

    def test_old_cache_without_volume_id_falls_back_to_mtime(self):
        sid = _session_with_volume()
        key = ensure_volume_cached(sid)["cache_key"]
        assert key.isdigit()
        meta_path = session_subdir(sid, "meshes") / "_volume_meta.json"
        assert "volume_id" not in json.loads(meta_path.read_text())


class TestOrientationFromRealDicom:
    """Cold-fill path (load_series -> _image_to_result -> ensure_volume_cached)
    against a real (synthetic) classic CT series, so direction extraction and
    _orientation_known run for real instead of being bypassed by a pre-seeded
    _volume.npy."""

    def test_series_with_image_orientation_patient_is_known(self):
        sid = create_session()
        _write_classic_ct_series(sid, with_orientation=True)
        meta = ensure_volume_cached(sid)

        assert meta["orientation_known"] is True
        assert meta["shape"] == [3, 8, 8]
        assert len(meta["direction"]) == 9
        identity = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        for got, want in zip(meta["direction"], identity):
            assert abs(got - want) < 1e-6
        # ImagePositionPatient of the first slice was [0, 0, 0].
        assert meta["origin_mm"] == [0.0, 0.0, 0.0]

    def test_series_without_image_orientation_patient_is_unknown(self):
        sid = create_session()
        _write_classic_ct_series(sid, with_orientation=False)
        meta = ensure_volume_cached(sid)

        assert meta["orientation_known"] is False
        assert meta["direction"] is None


class TestChunks:
    def test_full_chunk_bytes_match_volume(self):
        sid = _session_with_volume(nz=40, ny=60, nx=50)
        data, dims, spacing, stride = volume_chunk_int16(sid, 8, 16)
        assert dims == [8, 60, 50] and stride == 1
        assert spacing == [1.0, 0.8, 0.8]
        arr = np.frombuffer(data, dtype="<i2").reshape(dims)
        vol = np.load(session_subdir(sid, "meshes") / "_volume.npy", mmap_mode="r")
        np.testing.assert_array_equal(arr, np.rint(vol[8:16]).astype(np.int16))

    def test_full_chunk_clamps_to_int16(self):
        vol = np.full((4, 4, 4), 70000.0, dtype=np.float32)
        vol[0, 0, 0] = -70000.0
        sid = _session_with_volume(4, 4, 4, values=vol)
        data, dims, _spacing, _stride = volume_chunk_int16(sid, 0, 4)
        arr = np.frombuffer(data, dtype="<i2").reshape(dims)
        assert arr.max() == 32767 and arr.min() == -32768

    def test_full_chunk_uses_stride_for_large_volume(self, monkeypatch):
        from services import mpr
        monkeypatch.setattr(mpr, "_FULL_STRIDE_VOXELS", 1000)
        sid = _session_with_volume(nz=8, ny=40, nx=40)
        # 12 800 vóxeles > 1000 → stride 2 en el plano, nunca en z.
        data, dims, spacing, stride = volume_chunk_int16(sid, 0, 8)
        assert stride == 2 and dims == [8, 20, 20]
        assert spacing == [1.0, 1.6, 1.6]   # sy, sx escalados por el stride; z intacto
        assert len(data) == 8 * 20 * 20 * 2

    def test_chunk_endpoint_headers_and_gzip(self):
        sid = _session_with_volume(nz=40, ny=60, nx=50)
        r = client.get(f"/api/volume/{sid}/chunk/full/0-32", headers={"Accept-Encoding": "gzip"})
        assert r.status_code == 200
        assert r.headers["x-dtype"] == "int16"
        assert r.headers["x-dims"] == "32,60,50"
        assert r.headers["x-level-stride"] == "1"
        assert len(r.content) == 32 * 60 * 50 * 2   # TestClient descomprime
        assert r.headers.get("content-encoding") == "gzip"

    def test_chunk_endpoint_without_gzip_is_raw(self):
        # Sin Accept-Encoding: gzip el cuerpo va tal cual y sin la cabecera.
        sid = _session_with_volume(nz=40, ny=60, nx=50)
        r = client.get(f"/api/volume/{sid}/chunk/full/0-32", headers={"Accept-Encoding": "identity"})
        assert r.status_code == 200
        assert "content-encoding" not in r.headers
        assert "Accept-Encoding" in r.headers.get("vary", "")
        assert len(r.content) == 32 * 60 * 50 * 2
        vol = np.load(session_subdir(sid, "meshes") / "_volume.npy", mmap_mode="r")
        arr = np.frombuffer(r.content, dtype="<i2").reshape(32, 60, 50)
        np.testing.assert_array_equal(arr, np.rint(vol[0:32]).astype(np.int16))

    def test_full_chunk_rejects_ranges_larger_than_a_chunk(self):
        import pytest
        from services.mpr import CHUNK_SLICES
        sid = _session_with_volume(nz=CHUNK_SLICES + 8, ny=8, nx=8)
        # Justo un bloque vale; uno más ya no.
        volume_chunk_int16(sid, 0, CHUNK_SLICES)
        with pytest.raises(ValueError, match="como mucho"):
            volume_chunk_int16(sid, 0, CHUNK_SLICES + 1)
        r = client.get(f"/api/volume/{sid}/chunk/full/0-{CHUNK_SLICES + 1}")
        assert r.status_code == 422
        assert "como mucho" in r.json()["detail"]

    def test_chunk_endpoint_rejects_bad_range(self):
        sid = _session_with_volume(nz=40)
        assert client.get(f"/api/volume/{sid}/chunk/full/30-20").status_code == 422
        assert client.get(f"/api/volume/{sid}/chunk/full/0-999").status_code == 422
        assert client.get(f"/api/volume/{sid}/chunk/nivel/0-8").status_code == 422

    def test_coarse_chunk_is_the_strided_int16_volume(self):
        # 400 en y → stride ceil(400/192) = 3 en los tres ejes.
        sid = _session_with_volume(nz=10, ny=400, nx=20)
        r = client.get(f"/api/volume/{sid}/chunk/coarse/0-0")
        assert r.status_code == 200
        assert r.headers["x-dtype"] == "int16"
        dims = [int(d) for d in r.headers["x-dims"].split(",")]
        s = int(r.headers["x-level-stride"])
        assert s == 3 and all(d <= 192 for d in dims)
        assert len(r.content) == int(np.prod(dims)) * 2
        assert [float(v) for v in r.headers["x-spacing"].split(",")] == [3.0, 2.4, 2.4]
        arr = np.frombuffer(r.content, dtype="<i2").reshape(dims)
        vol = np.load(session_subdir(sid, "meshes") / "_volume.npy", mmap_mode="r")
        np.testing.assert_array_equal(arr, np.rint(vol[::s, ::s, ::s]).astype(np.int16))


class TestSegmentThreshold:
    def test_segment_result_reports_threshold_lower(self):
        # El MIP «Vasos» del cliente arranca en el umbral con el que se hizo la
        # malla: el endpoint tiene que devolverlo, no solo usarlo.
        sid = create_session()
        _write_classic_ct_series(sid, nz=12, size=16, bright_cube=800)
        r = client.post("/api/segment", json={
            "session_id": sid, "series_id": "", "lower": 300, "upper": 0,
            "smoothing": 0, "cleanup": 0, "full_resolution": True, "main_tree_only": False,
        })
        assert r.status_code == 200, r.text
        assert r.json()["threshold_lower"] == 300.0


class TestManualOrientation:
    def test_put_orientation_persists_and_meta_returns_it(self):
        sid = _session_with_volume()
        r = client.put(f"/api/volume/{sid}/orientation",
                       json={"anterior_edge": "right", "first_slice_superior": True})
        assert r.status_code == 200
        assert r.json()["orientation_manual"] == {"anterior_edge": "right", "first_slice_superior": True}
        assert client.get(f"/api/volume/{sid}/meta").json()["orientation_manual"]["anterior_edge"] == "right"

    def test_put_orientation_rejects_bad_edge(self):
        sid = _session_with_volume()
        r = client.put(f"/api/volume/{sid}/orientation",
                       json={"anterior_edge": "diagonal", "first_slice_superior": False})
        assert r.status_code == 422

    def test_manual_orientation_is_never_written_to_the_cached_meta(self):
        # Vive en el estado de sesión (lo que se guarda y restaura), no en la
        # caché del volumen: si se persistiera en _volume_meta.json, borrarla
        # del estado no la borraría de la meta.
        sid = _session_with_volume()
        client.put(f"/api/volume/{sid}/orientation",
                   json={"anterior_edge": "top", "first_slice_superior": False})
        cached = json.loads((session_subdir(sid, "meshes") / "_volume_meta.json").read_text())
        assert "orientation_manual" not in cached

    def test_meta_without_manual_orientation_reports_null(self):
        sid = _session_with_volume()
        assert client.get(f"/api/volume/{sid}/meta").json()["orientation_manual"] is None


class TestLegacyCacheOrientation:
    """Cachés anteriores a la orientación: la meta la rederiva de las cabeceras
    DICOM de la sesión (sin píxeles) y la guarda, en vez de dejarla en null."""

    @staticmethod
    def _make_legacy(sid: str, persisted_null: bool) -> None:
        # Lo que dejaba una caché de antes: el .npy y una meta sin orientación,
        # o con el null que la versión anterior de _complete_meta ya guardó.
        meshes = session_subdir(sid, "meshes")
        np.save(meshes / "_volume.npy", np.zeros((3, 8, 8), dtype=np.float32))
        meta = {"shape": [3, 8, 8], "spacing": [1.0, 0.5, 0.5], "wc": 40.0, "ww": 400.0, "modality": "CT"}
        if persisted_null:
            meta.update({"direction": None, "orientation_known": False})
        (meshes / "_volume_meta.json").write_text(json.dumps(meta))
        _downsampled_volume.cache_clear()

    def test_legacy_meta_recovers_direction_from_classic_series(self):
        identity = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        for persisted_null in (False, True):
            sid = create_session()
            _write_classic_ct_series(sid, with_orientation=True)
            self._make_legacy(sid, persisted_null)
            meta = ensure_volume_cached(sid)
            assert meta["orientation_known"] is True
            assert len(meta["direction"]) == 9
            for got, want in zip(meta["direction"], identity):
                assert abs(got - want) < 1e-6
            # Se guarda: la próxima llamada no vuelve a leer las cabeceras.
            on_disk = json.loads((session_subdir(sid, "meshes") / "_volume_meta.json").read_text())
            assert on_disk["orientation_known"] is True and on_disk["orientation_checked"] is True
            assert on_disk["direction"] == meta["direction"]

    def test_legacy_direction_matches_what_load_series_reads(self):
        # IOP coronal (fila → +x, columna → −z): la dirección de solo cabeceras
        # debe ser la misma matriz que SimpleITK arma al cargar los píxeles.
        from services.dicom_loader import direction_from_headers, load_series
        sid = create_session()
        _write_classic_ct_series(sid, iop=[1, 0, 0, 0, 0, -1])
        dicom_dir = session_subdir(sid, "dicom")
        direction, known = direction_from_headers(dicom_dir, "")
        assert known is True
        real = load_series("", dicom_dir)
        assert real.orientation_known is True
        np.testing.assert_allclose(direction, real.direction, atol=1e-6)

    def test_legacy_meta_without_iop_stays_unknown(self):
        sid = create_session()
        _write_classic_ct_series(sid, with_orientation=False)
        self._make_legacy(sid, persisted_null=True)
        meta = ensure_volume_cached(sid)
        assert meta["direction"] is None
        assert meta["orientation_known"] is False

    def test_legacy_meta_without_dicom_stays_unknown(self):
        sid = _session_with_volume()
        meta = ensure_volume_cached(sid)
        assert meta["direction"] is None
        assert meta["orientation_known"] is False
        on_disk = json.loads((session_subdir(sid, "meshes") / "_volume_meta.json").read_text())
        assert "orientation_checked" not in on_disk
