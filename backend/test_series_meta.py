# -*- coding: utf-8 -*-
"""F1-127 y F1-128: la serie se reconoce sin su UID y dice cuándo se borra.

Una serie sin SeriesDescription salía como «Serie 1.2.276.» —el principio del
UID, que nadie en quirófano reconoce—; lo que distingue dos adquisiciones
iguales es la fecha y la hora en que se hicieron. Y el panel decía que la
sesión «se borrará automáticamente» sin decir cuándo: el plazo real es
SESSION_TTL_HOURS.
"""
from __future__ import annotations

from pathlib import Path

from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from routers.upload import _build_series_list
from services import sessions
from services.dicom_loader import _extract_metadata


def _dicom(path: Path, **tags) -> Path:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = "1.2.3"
    ds.SeriesInstanceUID = "1.2.276.0.7230010.3.1.3.99"
    ds.Modality = "CT"
    for k, v in tags.items():
        setattr(ds, k, v)
    ds.save_as(str(path), enforce_file_format=True)
    return path


def test_fecha_y_hora_de_adquisicion_en_iso(tmp_path):
    p = _dicom(tmp_path / "a.dcm", AcquisitionDate="20260714", AcquisitionTime="093512.123",
               StudyDate="20260701", SeriesTime="120000")
    meta = _extract_metadata(p, 1)
    assert meta["acquisition_date"] == "2026-07-14"
    # AcquisitionTime gana a SeriesTime; se recorta a horas y minutos.
    assert meta["acquisition_time"] == "09:35"


def test_sin_fecha_de_adquisicion_cae_a_la_de_serie_y_luego_al_estudio(tmp_path):
    p = _dicom(tmp_path / "b.dcm", SeriesDate="20260715", SeriesTime="1405")
    meta = _extract_metadata(p, 1)
    assert meta["acquisition_date"] == "2026-07-15"
    assert meta["acquisition_time"] == "14:05"
    q = _dicom(tmp_path / "c.dcm", StudyDate="20260716")
    meta = _extract_metadata(q, 1)
    assert meta["acquisition_date"] == "2026-07-16"
    assert meta["acquisition_time"] == ""


def test_sin_ninguna_fecha_queda_vacio(tmp_path):
    p = _dicom(tmp_path / "d.dcm")
    meta = _extract_metadata(p, 1)
    assert meta["acquisition_date"] == ""
    assert meta["acquisition_time"] == ""


def test_serie_sin_descripcion_no_muestra_el_uid(tmp_path):
    p = _dicom(tmp_path / "e.dcm", AcquisitionDate="20260714", AcquisitionTime="0935")
    raw = {"series_uid": "1.2.276.0.7230010.3.1.3.99", "n_files": 1, **_extract_metadata(p, 1)}
    [info] = _build_series_list("sid", [raw])
    assert info.description == "Sin descripción"
    assert "1.2.276" not in info.description
    assert info.acquisition_date == "2026-07-14"
    assert info.acquisition_time == "09:35"


def test_la_serie_lleva_el_plazo_real_de_borrado():
    [info] = _build_series_list("sid", [{"series_uid": "1.2.3", "series_description": "CTA"}])
    assert info.session_ttl_hours == sessions.SESSION_TTL_SEC / 3600
    assert sessions.session_ttl_hours() == sessions.SESSION_TTL_SEC / 3600
