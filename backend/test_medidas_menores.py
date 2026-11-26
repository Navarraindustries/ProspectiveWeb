"""Medidas: geometría de la serie, UIATS sin dobles, coordenadas finitas, ramas
sin cuello y dispositivos que no se guardan sin malla."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import app
from services.sessions import create_session, session_subdir

client = TestClient(app)


class TestGeometriaDeLaSerie:
    def test_una_pila_regular_no_avisa(self):
        from services.dicom_loader import aviso_de_geometria
        assert aviso_de_geometria([0.0, 0.5, 1.0, 1.5, 2.0], 0.0) is None

    def test_un_corte_que_falta(self):
        from services.dicom_loader import aviso_de_geometria
        aviso = aviso_de_geometria([0.0, 0.5, 1.0, 2.0, 2.5, 3.0], 0.0)
        assert aviso and "falta" in aviso and "1.00 mm" in aviso

    def test_posiciones_repetidas(self):
        from services.dicom_loader import aviso_de_geometria
        assert "repetida" in aviso_de_geometria([0.0, 0.5, 0.5, 1.0, 1.5], 0.0)

    def test_gantry_inclinado(self):
        from services.dicom_loader import aviso_de_geometria
        assert "inclinado 15.0°" in aviso_de_geometria([0.0, 0.5, 1.0, 1.5], 15.0)


class TestUiats:
    def test_un_factor_repetido_cuenta_una_vez(self):
        from services.uiats import RISK_FACTORS, compute_uiats
        clave = next(k for k, v in RISK_FACTORS.items() if v)
        comun = dict(age=50, symptoms=[], patient_other=[], diameter_mm=5.0, morphology=[],
                     location=_primera("LOCATION"), aneurysm_other=[], life_expectancy=None,
                     comorbid=[], complexity=_primera("COMPLEXITY"))
        una = compute_uiats(risk_factors=[clave], **comun)
        dos = compute_uiats(risk_factors=[clave, clave], **comun)
        assert una.repair == dos.repair


def _primera(tabla: str) -> str:
    import services.uiats as u
    return next(iter(getattr(u, tabla)))


class TestEntradasValidas:
    def test_coordenadas_no_finitas_se_rechazan(self):
        from models.detection import Position3D
        with pytest.raises(ValidationError):
            Position3D(x=float("nan"), y=0, z=0)
        with pytest.raises(ValidationError):
            Position3D(x=0, y=float("inf"), z=0)

    def test_normal_nula_sin_puntos_del_borde(self):
        from models.detection import NeckPlaneRequest
        with pytest.raises(ValidationError):
            NeckPlaneRequest(origin={"x": 0, "y": 0, "z": 0}, normal=[0, 0, 0])
        NeckPlaneRequest(origin={"x": 0, "y": 0, "z": 0}, normal=[0, 0, 1])


class TestRamasSinCuello:
    def test_sin_cuello_ni_candidato_no_dice_cero_ramas(self):
        from services.devices import make_clip
        from services.segmentation import write_vtp
        sid = create_session()
        write_vtp(make_clip(9.0), session_subdir(sid, "meshes") / "vessel_tree.vtp")
        r = client.get(f"/api/perforators/{sid}")
        assert r.status_code == 422
        assert "detecta el aneurisma" in r.json()["detail"]


def _sesion_con_plan() -> str:
    from services.sessions import write_state
    sid = create_session()
    write_state(sid, "morpho.volume_mm3", "120.0")
    return sid


class TestDispositivoSinMalla:
    def test_si_falla_la_malla_del_stent_no_se_guarda(self, monkeypatch):
        import services.devices as devices
        from services.device_state import read_stent
        sid = _sesion_con_plan()

        def falla(*_a, **_k):
            raise RuntimeError("malla rota")

        monkeypatch.setattr(devices, "apply_transform", falla)
        st = client.get("/api/stents").json()[0]
        r = client.post("/api/plan", json={"session_id": sid, "stent": {
            "stent_id": st["id"], "diameter_mm": st["min_diameter_mm"],
            "length_mm": st["available_lengths_mm"][0], "position": {"x": 0, "y": 0, "z": 0}}})
        assert r.status_code == 500 and "no se ha guardado" in r.json()["detail"], r.text
        assert not read_stent(sid)


class TestInformeDicomEnSuEstudio:
    def test_el_sr_cita_la_serie_medida_y_va_a_su_estudio(self):
        from services.dicom_sr import DicomSRGenerator
        meta = {"patient_name": "P", "patient_id": "1", "study_instance_uid": "1.2.3",
                "series_instance_uid": "1.2.3.4", "accession_number": "ACC9",
                "instances": [("1.2.840.10008.5.1.4.1.1.2", "1.2.3.4.1"),
                              ("1.2.840.10008.5.1.4.1.1.2", "1.2.3.4.2")]}
        ds = DicomSRGenerator(series_meta=meta, morphometrics={"max_diameter_mm": 6.0})._build_dataset()
        assert ds.StudyInstanceUID == "1.2.3" and ds.AccessionNumber == "ACC9"
        serie = ds.CurrentRequestedProcedureEvidenceSequence[0].ReferencedSeriesSequence[0]
        assert serie.SeriesInstanceUID == "1.2.3.4"
        assert [r.ReferencedSOPInstanceUID for r in serie.ReferencedSOPSequence] == ["1.2.3.4.1", "1.2.3.4.2"]


class TestErroresSinExcepcion:
    def test_un_fallo_interno_no_ensena_la_excepcion_y_da_referencia(self, caplog):
        from services.errores import mensaje_error
        texto = mensaje_error("No se pudo medir", KeyError("vtkPolyData interno"))
        assert "vtkPolyData" not in texto and "referencia" in texto
        assert any("vtkPolyData" in r.getMessage() or "vtkPolyData" in str(r.exc_info) for r in caplog.records)

    def test_un_valueerror_nuestro_se_ensena(self):
        from services.errores import mensaje_error
        assert mensaje_error("No se pudo importar el clip", ValueError("la malla no es cerrada")) == \
            "No se pudo importar el clip: la malla no es cerrada"
