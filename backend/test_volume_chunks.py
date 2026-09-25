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


def _write_classic_ct_series(sid: str, nz=3, ny=8, nx=8, with_orientation=True) -> None:
    """Write a tiny classic single-frame CT series into the session's dicom/ dir.

    Exercises the real cold-fill path (load_series -> _image_to_result ->
    ensure_volume_cached) instead of pre-seeding _volume.npy, so direction
    extraction and _orientation_known actually run against SimpleITK/pydicom.
    """
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
        ds.ImagePositionPatient = [0.0, 0.0, float(i)]
        if with_orientation:
            ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
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
        ds.PixelData = rng.integers(0, 800, size=(ny, nx), dtype=np.int16).tobytes()
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
