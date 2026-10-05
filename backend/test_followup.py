"""Superposición de un estudio de seguimiento (services/followup.py).

La validación con la malla real del case 3 (giro de 6° y bultos de 1,5, 0,8 y
0,3 mm) está en el docstring del servicio y en el commit. Aquí, con estudios
sintéticos que tienen su propia serie DICOM y su propio origen de mesa:
- el ajuste deshace un giro conocido;
- el crecimiento sale donde está y con su tamaño (algo por debajo en un pico);
- nada se llama crecimiento por debajo del ruido;
- el endpoint encuentra los estudios del paciente y monta la superposición.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_followup_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STUDY_FILES_ROOT"] = f"{_tmp}/study_files"

import numpy as np
import pydicom
import pytest
import vtk
from fastapi.testclient import TestClient
from vtkmodules.util.numpy_support import vtk_to_numpy

from main import app
from services.database import Base, SessionLocal, engine
from services.db_models import ImagingStudy, Patient, PlanningSession, Study
from services.followup import SCALAR, compare
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir, snapshot_session, write_states
from test_volume_chunks import _write_classic_ct_series

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

LESION = np.array([12.0, 12.0, 12.0])


def _superficie(funcion, lado=40.0, n=161):
    m = vtk.vtkSampleFunction(); m.SetImplicitFunction(funcion)
    c0 = 12.0
    m.SetModelBounds(c0 - lado / 2, c0 + lado / 2, c0 - lado / 2, c0 + lado / 2, c0 - lado / 2, c0 + lado / 2)
    m.SetSampleDimensions(n, n, n); m.ComputeNormalsOff(); m.Update()
    c = vtk.vtkContourFilter(); c.SetInputConnection(m.GetOutputPort()); c.SetValue(0, 0.0); c.Update()
    return c.GetOutput()


def _rama(eje, radio=1.2):
    """Un cilindro infinito por el centro, en la dirección `eje`."""
    cyl = vtk.vtkCylinder(); cyl.SetRadius(radio); cyl.SetCenter(*LESION)
    eje = np.asarray(eje, float) / np.linalg.norm(eje)
    # vtkCylinder va a lo largo de y: se gira y hacia `eje`.
    t = vtk.vtkTransform()
    y = np.array([0.0, 1.0, 0.0]); ax = np.cross(y, eje); ang = np.degrees(np.arccos(np.clip(y @ eje, -1, 1)))
    if np.linalg.norm(ax) > 1e-9:
        t.Translate(*LESION); t.RotateWXYZ(-ang, *ax); t.Translate(*(-LESION))
    cyl.SetTransform(t)
    return cyl


def _arbol(radio_saco: float):
    u = vtk.vtkImplicitBoolean(); u.SetOperationTypeToUnion()
    for e in ([1, 0.2, 0], [0, 1, 0.3], [0.4, 0, 1]):
        u.AddFunction(_rama(e))
    s = vtk.vtkSphere(); s.SetCenter(*(LESION + np.array([2.0, 2.0, -1.5]))); s.SetRadius(radio_saco)
    u.AddFunction(s)
    # Los vasos acaban en una caja: un árbol, no cilindros infinitos.
    caja = vtk.vtkBox(); caja.SetBounds(-6, 30, -6, 30, -6, 30)
    i = vtk.vtkImplicitBoolean(); i.SetOperationTypeToIntersection(); i.AddFunction(u); i.AddFunction(caja)
    return _superficie(i)


def _saco(radio):
    s = vtk.vtkSphereSource(); s.SetCenter(*(LESION + np.array([2.0, 2.0, -1.5]))); s.SetRadius(radio)
    s.SetThetaResolution(48); s.SetPhiResolution(48); s.Update()
    return s.GetOutput()


def _A(offset):
    A = np.eye(4); A[:3, 3] = offset; return A


class TestServicio:
    def test_deshace_un_giro_y_encuentra_el_crecimiento(self, tmp_path):
        curr, prev = _arbol(2.5), _arbol(2.0)
        # El anterior, en otra posición de mesa y con la cabeza girada 5° en z.
        th = np.radians(5); R = np.eye(4)
        R[:2, :2] = [[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]
        A_prev = _A([30.0, -20.0, 5.0]) @ R
        r = compare(curr, prev, np.eye(4), A_prev, LESION, LESION + [0.8, -0.5, 0.6], tmp_path,
                    curr_sac=_saco(2.5), prev_sac=_saco(2.0), voxel_mm=0.25)
        assert r.rotation_deg == pytest.approx(5.0, abs=0.5)
        assert r.residual_median_mm < 0.15
        assert r.max_growth_mm == pytest.approx(0.5, abs=0.15)
        assert r.volume_curr_mm3 > r.volume_prev_mm3
        m = read_vtp(r.map_path)
        d = vtk_to_numpy(m.GetPointData().GetArray(SCALAR))
        lejos = np.linalg.norm(vtk_to_numpy(m.GetPoints().GetData()) - (LESION + [2, 2, -1.5]), axis=1) > 5
        assert np.percentile(np.abs(d[lejos]), 95) < 0.2      # los vasos no han cambiado

    def test_sin_cambios_no_hay_crecimiento(self, tmp_path):
        a = _arbol(2.5)
        r = compare(a, a, np.eye(4), _A([5, 5, 5]), LESION, LESION, tmp_path, voxel_mm=0.25)
        assert r.max_growth_mm <= r.noise_mm and r.grew_area_pct == 0.0


def _estudio(paciente_id: int, caso_id: int, offset, radio_saco: float, acquired: str) -> str:
    sid = create_session()
    _write_classic_ct_series(sid, nz=8, size=16)
    for f in session_subdir(sid, "dicom").iterdir():
        ds = pydicom.dcmread(str(f))
        ds.ImagePositionPatient = [float(v) for v in np.array(ds.ImagePositionPatient, float) + offset]
        ds.save_as(str(f)); serie = ds.SeriesInstanceUID
    write_states(sid, {"dicom.series_id": serie, "dicom.spacing_z": "1.0", "dicom.spacing_x": "0.5",
                       "dicom.modality": "CT"})
    m = session_subdir(sid, "meshes")
    write_vtp(_arbol(radio_saco), m / "vessel_tree.vtp")
    write_vtp(_saco(radio_saco), m / "aneurysm_sac.vtp")
    db = SessionLocal()
    img = ImagingStudy(case_id=caso_id, patient_id=paciente_id, modality="CT", acquired_at=acquired)
    db.add(img); db.commit()
    db.add(PlanningSession(session_id=sid, patient_id=paciente_id, study_id=caso_id, imaging_study_id=img.id))
    db.commit(); db.close()
    snapshot_session(sid)
    return sid


class TestEndpoint:
    def test_lista_los_estudios_y_superpone(self):
        db = SessionLocal()
        p = Patient(surname="Seguimiento"); db.add(p); db.commit()
        c = Study(patient_id=p.id, dx_principal="Control"); db.add(c); db.commit()
        pid, cid = p.id, c.id; db.close()
        antes = _estudio(pid, cid, np.array([0.0, 0.0, 0.0]), 2.0, "2025-01-10")
        ahora = _estudio(pid, cid, np.array([40.0, -15.0, 8.0]), 2.5, "2026-01-10")

        estudios = client.get(f"/api/followup/{ahora}/studies").json()
        assert [e["session_id"] for e in estudios] == [antes]
        assert estudios[0]["has_sac"] and estudios[0]["has_lesion"]

        r = client.post(f"/api/followup/{ahora}", json={"previous_session_id": antes})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["max_growth_mm"] == pytest.approx(0.5, abs=0.15)
        assert j["lesion_source_curr"] == "saco aislado" and j["ghost_url"]
        assert j["map_url"].startswith(f"/data/sessions/{ahora}/meshes/seguimiento_mapa.vtp")

    def test_una_sesion_reanudada_sigue_siendo_de_su_paciente(self):
        # «Reanudar» da a la sesión un id nuevo, sin fila en la base. Visto en
        # el navegador: el seguimiento decía «no hay otro estudio» teniendo dos.
        db = SessionLocal()
        p = Patient(surname="Reanudado"); db.add(p); db.commit()
        c = Study(patient_id=p.id, dx_principal="Control"); db.add(c); db.commit()
        pid, cid = p.id, c.id; db.close()
        antes = _estudio(pid, cid, np.array([0.0, 0.0, 0.0]), 2.0, "2025-01-10")
        ahora = _estudio(pid, cid, np.array([40.0, -15.0, 8.0]), 2.5, "2026-01-10")

        r = client.post(f"/api/sessions/{ahora}/restore")
        assert r.status_code == 200, r.text
        viva = r.json()["session_id"]
        assert viva != ahora

        estudios = client.get(f"/api/followup/{viva}/studies").json()
        assert [e["session_id"] for e in estudios] == [antes]
        r = client.post(f"/api/followup/{viva}", json={"previous_session_id": antes})
        assert r.status_code == 200, r.text
        assert r.json()["max_growth_mm"] == pytest.approx(0.5, abs=0.15)
        # Y la gráfica longitudinal ve los dos estudios, no una sesión suelta.
        lon = client.get(f"/api/longitudinal/{viva}").json()
        assert lon["patient_id"] == pid and len(lon["entries"]) == 2

        from services.access import session_patient_id
        db = SessionLocal()
        try:
            assert session_patient_id(db, viva) == pid       # la regla de acceso la alcanza
        finally:
            db.close()

    def test_sin_paciente_no_hay_estudios(self):
        assert client.get(f"/api/followup/{create_session()}/studies").json() == []

    def test_el_mismo_estudio_se_rechaza(self):
        sid = create_session()
        assert client.post(f"/api/followup/{sid}", json={"previous_session_id": sid}).status_code == 422
