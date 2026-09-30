# -*- coding: utf-8 -*-
"""La orientación sale de la serie con la que se trabaja, no de los cinco
primeros ficheros de la carpeta.

En DICOM-20260714 (55 ficheros, 12 series) solo los cuatro volúmenes 3DRA
traen orientación; subida la carpeta entera se leían IM_0001–0005 —sin ella—
y los ejes salían desconocidos, sin corredores de abordaje.
"""
from __future__ import annotations

from pathlib import Path

import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from services.head_axes import axes_from_dicom


def _dicom(path: Path, series_uid: str, con_orientacion: bool, n: int) -> None:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.12.1"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = "1.2.3"
    ds.SeriesInstanceUID = series_uid
    ds.Modality = "XA"
    ds.InstanceNumber = n
    if con_orientacion:
        # La de los 3DRA del estudio real: filas por x, columnas por z.
        ds.ImageOrientationPatient = [1, 0, 0, 0, 0, 1]
        ds.ImagePositionPatient = [-60.0, -70.0, 60.0]
    ds.save_as(str(path), enforce_file_format=True)


def test_sin_serie_busca_mas_alla_de_los_cinco_primeros(tmp_path):
    for i in range(6):
        _dicom(tmp_path / f"IM_{i + 1:04d}", generate_uid(), False, i)
    _dicom(tmp_path / "IM_0055", generate_uid(), True, 55)
    ejes = axes_from_dicom(tmp_path)
    assert ejes.usable, "la orientación del volumen está en la carpeta"


def test_con_serie_lee_la_de_esa_serie(tmp_path):
    volumen = generate_uid()
    for i in range(6):
        _dicom(tmp_path / f"IM_{i + 1:04d}", generate_uid(), False, i)
    _dicom(tmp_path / "IM_0055", volumen, True, 55)
    ejes = axes_from_dicom(tmp_path, volumen)
    assert ejes.usable
    assert ejes.anterior != (0.0, 0.0, 0.0)


def test_una_serie_sin_orientacion_sigue_siendo_desconocida(tmp_path):
    sin = generate_uid()
    _dicom(tmp_path / "IM_0001", sin, False, 1)
    _dicom(tmp_path / "IM_0002", sin, False, 2)
    assert not axes_from_dicom(tmp_path, sin).usable
