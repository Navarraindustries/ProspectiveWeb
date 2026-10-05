"""DICOM SEG (services/dicom_seg.py): la segmentación cae sobre las imágenes.

Lo que se defiende es la ALINEACIÓN, que es lo único difícil: un SEG leído por
un visor tiene que pintar cada región sobre su sitio en la serie original. Se
comprueba leyéndolo con pydicom (no con highdicom, que lo escribió) y llevando
la malla a coordenadas del paciente por otra vía: la geometría de los cortes
originales. Con una serie de cortes sueltos, orientación oblicua y origen
desplazado, que es donde un error de ejes se vería.
"""
from __future__ import annotations

import numpy as np
import pydicom
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.dicom_seg import _shared_orientation, build_dicom_seg
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir, write_states
from test_volume_chunks import _write_classic_ct_series

client = TestClient(app, raise_server_exceptions=True)

# Oblicua de verdad: filas y columnas giradas 30° alrededor de z.
_C, _S = np.cos(np.radians(30)), np.sin(np.radians(30))
IOP = [_C, _S, 0.0, -_S, _C, 0.0]
OFFSET = np.array([-40.0, 12.5, 80.0])


def _serie(sid: str, nz=24, size=32, frame_of_reference=True):
    _write_classic_ct_series(sid, nz=nz, size=size, iop=IOP, pixel_spacing=0.5)
    series = None
    for_uid = pydicom.uid.generate_uid() if frame_of_reference else None
    for f in session_subdir(sid, "dicom").iterdir():
        ds = pydicom.dcmread(str(f))
        if for_uid:
            ds.FrameOfReferenceUID = for_uid
        ds.ImagePositionPatient = [float(v) for v in np.array(ds.ImagePositionPatient, float) + OFFSET]
        ds.save_as(str(f))
        series = ds.SeriesInstanceUID
    write_states(sid, {"dicom.series_id": series, "dicom.modality": "CT"})


def _esfera(centro, r, res=32):
    s = vtk.vtkSphereSource(); s.SetCenter(*centro); s.SetRadius(r)
    s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return s.GetOutput()


def _sesion(con_saco=True):
    sid = create_session()
    _serie(sid)
    m = session_subdir(sid, "meshes")
    # En mm desde el vóxel 0 (x = columna, y = fila, z = corte): 0,5 mm en el
    # plano y 1 mm entre cortes.
    write_vtp(_esfera((8.0, 7.0, 11.0), 4.0), m / "vessel_tree.vtp")
    if con_saco:
        write_vtp(_esfera((9.0, 8.0, 12.0), 2.0), m / "aneurysm_sac.vtp")
    return sid


def _vox_paciente(seg, segmento: int) -> np.ndarray:
    px = seg.pixel_array
    if px.ndim == 2:
        px = px[None]
    sh = seg.SharedFunctionalGroupsSequence[0]
    iop = np.array(sh.PlaneOrientationSequence[0].ImageOrientationPatient, float)
    dy, dx = map(float, sh.PixelMeasuresSequence[0].PixelSpacing)
    out = []
    for i, f in enumerate(seg.PerFrameFunctionalGroupsSequence):
        if int(f.SegmentIdentificationSequence[0].ReferencedSegmentNumber) != segmento:
            continue
        ipp = np.array(f.PlanePositionSequence[0].ImagePositionPatient, float)
        r, c = np.nonzero(px[i])
        out.append(ipp + np.outer(c * dx, iop[:3]) + np.outer(r * dy, iop[3:]))
    return np.concatenate(out)


def _malla_a_paciente(p) -> np.ndarray:
    """mm desde el vóxel 0 → paciente, con la geometría de la serie original."""
    rowdir, coldir = np.array(IOP[:3]), np.array(IOP[3:])
    normal = np.cross(rowdir, coldir)
    return OFFSET + p[0] * rowdir + p[1] * coldir + p[2] * normal


def test_cada_region_cae_en_su_sitio_en_una_serie_oblicua(tmp_path):
    sid = _sesion()
    r = build_dicom_seg(sid, tmp_path / "seg.dcm")
    assert r.segments == ["Vaso", "Aneurisma"] and r.warnings == []
    seg = pydicom.dcmread(str(r.path))
    assert seg.SOPClassUID == "1.2.840.10008.5.1.4.1.1.66.4"          # Segmentation Storage
    for n, (centro, rad) in {1: ((8.0, 7.0, 11.0), 4.0), 2: ((9.0, 8.0, 12.0), 2.0)}.items():
        v = _vox_paciente(seg, n)
        esperado = _malla_a_paciente(np.array(centro))
        assert np.linalg.norm(v.mean(0) - esperado) < 0.5, (n, v.mean(0), esperado)
        assert np.linalg.norm(v - esperado, axis=1).max() <= rad + 0.8
    # Volumen en la rejilla frente al de la malla.
    assert r.voxel_volumes_mm3["Vaso"] == pytest.approx(r.mesh_volumes_mm3["Vaso"], rel=0.15)


def test_referencia_las_imagenes_originales(tmp_path):
    sid = _sesion()
    seg = pydicom.dcmread(str(build_dicom_seg(sid, tmp_path / "seg.dcm").path))
    originales = {pydicom.dcmread(str(f), stop_before_pixels=True).SOPInstanceUID
                  for f in session_subdir(sid, "dicom").iterdir()}
    refs = {it.ReferencedSOPInstanceUID
            for s in seg.ReferencedSeriesSequence for it in s.ReferencedInstanceSequence}
    assert refs and refs <= originales
    assert seg.PatientID == pydicom.dcmread(str(next(session_subdir(sid, "dicom").iterdir()))).PatientID


def test_sin_saco_solo_el_vaso_y_lo_dice(tmp_path):
    r = build_dicom_seg(_sesion(con_saco=False), tmp_path / "seg.dcm")
    assert r.segments == ["Vaso"] and any("Sin saco aislado" in w for w in r.warnings)


def test_orientacion_repetida_por_fotograma_pasa_a_compartida():
    # La 3D-RA del case 3 repite la misma orientación en cada fotograma.
    from pydicom.dataset import Dataset
    from pydicom.sequence import Sequence

    def grupo(iop):
        g = Dataset(); po = Dataset(); po.ImageOrientationPatient = iop
        g.PlaneOrientationSequence = Sequence([po]); return g
    ds = Dataset()
    ds.SharedFunctionalGroupsSequence = Sequence([Dataset()])
    ds.PerFrameFunctionalGroupsSequence = Sequence([grupo([1, 0, 0, 0, 0, 1]) for _ in range(3)])
    _shared_orientation(ds)
    assert "PlaneOrientationSequence" in ds.SharedFunctionalGroupsSequence[0]
    assert all("PlaneOrientationSequence" not in f for f in ds.PerFrameFunctionalGroupsSequence)

    distinta = Dataset()
    distinta.SharedFunctionalGroupsSequence = Sequence([Dataset()])
    distinta.PerFrameFunctionalGroupsSequence = Sequence([grupo([1, 0, 0, 0, 0, 1]), grupo([1, 0, 0, 0, 1, 0])])
    _shared_orientation(distinta)
    assert "PlaneOrientationSequence" not in distinta.SharedFunctionalGroupsSequence[0]


class TestEndpoint:
    def test_genera_y_audita(self):
        from services.audit import SkullChain
        sid = _sesion()
        r = client.post(f"/api/export/dicom-seg/{sid}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["segments"] == ["Vaso", "Aneurisma"] and j["seg_url"].startswith(f"/data/sessions/{sid}/exports/")
        assert [b for b in SkullChain.instance().get_all_blocks() if b["action"] == "DICOM_SEG_GENERATED"]

    def test_sin_malla(self):
        sid = create_session(); _serie(sid)
        r = client.post(f"/api/export/dicom-seg/{sid}")
        assert r.status_code == 422 and "segmenta" in r.json()["detail"]


def test_sin_frame_of_reference_no_se_inventa(tmp_path):
    sid = create_session(); _serie(sid, frame_of_reference=False)
    write_vtp(_esfera((8.0, 7.0, 11.0), 4.0), session_subdir(sid, "meshes") / "vessel_tree.vtp")
    with pytest.raises(ValueError, match="Frame of Reference"):
        build_dicom_seg(sid, tmp_path / "seg.dcm")
