"""Lo medido sobre una malla o un volumen no sobrevive a que cambien, y lo que la
medida automática no midió no llega al informe ni a Decisión como si valiera."""
from __future__ import annotations

import json

import numpy as np
import pytest

from services.sessions import create_session, read_state, session_subdir, write_states


def _sesion_con_todo() -> str:
    """Una sesión con malla, dispositivos, línea central, IVUS y puntuaciones."""
    sid = create_session()
    m = session_subdir(sid, "meshes")
    for nombre in ("vessel_tree.vtp", "detect_tree.vtp", "vessel_mask.npz",
                   "centerline.vtp", "centerline_points.npz", "cl_stent.vtp",
                   "stent_deployed.vtp", "coils_placed.vtp", "clips_placed.vtp",
                   "clip_field.vtp", "aneurysm_remnant.vtp", "perforators_risk.vtp",
                   "ivus_pullback.json", "ivus_pullback.u8", "anim_clip.vtp",
                   "aneurysm_sac.vtp", "aneurysm_cand_001.vtp"):
        (m / nombre).write_bytes(b"x")
    write_states(sid, {
        "devices.clips": json.dumps([{"name": "Clip 7 mm"}]),
        "devices.stent": json.dumps({"name": "Stent", "coverage_pct": 30}),
        "devices.coils": json.dumps([{"name": "Coil"}]),
        "devices.placed_clips.json": json.dumps({"clips": [{"x": 1}]}),
        "followup.registro_json": json.dumps({"previous_session_id": "x"}),
        "branches.scan_json": json.dumps({"origins": []}),
        "phases.json": "{}", "elapss.json": "{}", "uiats.json": "{}",
        "morpho.max_diameter_mm": "6.5", "seg.mesh_url": "/m/vessel_tree.vtp",
        "trajectory.entry_x": "1.0",
    })
    return sid


class TestCambiaLaMalla:
    def test_borra_dispositivos_linea_ivus_y_seguimiento(self):
        from services.invalidacion import olvidar_lo_medido_en_la_malla
        sid = _sesion_con_todo()
        olvidar_lo_medido_en_la_malla(sid)
        m = session_subdir(sid, "meshes")
        for nombre in ("centerline.vtp", "centerline_points.npz", "cl_stent.vtp", "stent_deployed.vtp",
                       "coils_placed.vtp", "clips_placed.vtp", "clip_field.vtp", "aneurysm_remnant.vtp",
                       "perforators_risk.vtp", "ivus_pullback.json", "ivus_pullback.u8", "anim_clip.vtp",
                       "aneurysm_sac.vtp", "aneurysm_cand_001.vtp"):
            assert not (m / nombre).exists(), nombre
        for clave in ("devices.clips", "devices.stent", "devices.coils", "devices.placed_clips.json",
                      "followup.registro_json", "morpho.max_diameter_mm"):
            assert read_state(sid, clave, "") == "", clave

    def test_elapss_y_uiats_se_van_con_phases(self):
        from services.invalidacion import olvidar_lo_medido_en_la_malla
        sid = _sesion_con_todo()
        olvidar_lo_medido_en_la_malla(sid)
        for clave in ("phases.json", "elapss.json", "uiats.json"):
            assert read_state(sid, clave, "") == "", clave

    def test_la_malla_las_ramas_y_los_puntos_del_cirujano_se_quedan(self):
        from services.invalidacion import olvidar_lo_medido_en_la_malla
        sid = _sesion_con_todo()
        olvidar_lo_medido_en_la_malla(sid)
        m = session_subdir(sid, "meshes")
        assert (m / "vessel_tree.vtp").exists() and (m / "detect_tree.vtp").exists()
        # El barrido de ramas se hizo sobre el árbol entero y sigue valiendo recortado.
        assert read_state(sid, "branches.scan_json", "") != ""
        assert read_state(sid, "trajectory.entry_x", "") == "1.0"

    def test_recortar_usa_la_misma_regla(self):
        from routers.mesh_edit import _invalidate_derived
        sid = _sesion_con_todo()
        _invalidate_derived(sid)
        assert read_state(sid, "devices.clips", "") == ""
        assert not (session_subdir(sid, "meshes") / "centerline.vtp").exists()


class TestCambiaElVolumen:
    def test_se_va_tambien_la_malla(self):
        from services.invalidacion import olvidar_lo_hecho_sobre_el_volumen
        sid = _sesion_con_todo()
        olvidar_lo_hecho_sobre_el_volumen(sid)
        m = session_subdir(sid, "meshes")
        for nombre in ("vessel_tree.vtp", "detect_tree.vtp", "vessel_mask.npz", "centerline.vtp"):
            assert not (m / nombre).exists(), nombre
        assert read_state(sid, "seg.mesh_url", "") == ""
        assert read_state(sid, "branches.scan_json", "") == ""

    def _serie(self, sid, monkeypatch, series):
        from routers import upload
        monkeypatch.setattr(upload, "scan_series", lambda d: series)
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_cambiar_de_serie_descarta_la_malla_y_repetir_la_misma_no(self, monkeypatch):
        from conftest import anonymous_client  # noqa: F401 — asegura el arranque de conftest
        from fastapi.testclient import TestClient
        from main import app
        from routers import upload
        series = [
            {"series_uid": "1.2.3", "n_slices": 200, "modality": "CT"},
            {"series_uid": "4.5.6", "n_slices": 150, "modality": "CT"},
        ]
        monkeypatch.setattr(upload, "scan_series", lambda d: series)
        c = TestClient(app)
        c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        sid = _sesion_con_todo()
        write_states(sid, {"dicom.series_id": "1.2.3"})
        m = session_subdir(sid, "meshes")

        assert c.post(f"/api/upload/{sid}/series/1.2.3").status_code == 200
        assert (m / "vessel_tree.vtp").exists()            # la misma serie: nada cambia

        assert c.post(f"/api/upload/{sid}/series/4.5.6").status_code == 200
        assert not (m / "vessel_tree.vtp").exists()
        assert read_state(sid, "devices.clips", "") == ""

    def test_la_cache_del_volumen_de_otra_serie_se_rehace(self, monkeypatch):
        from services import mpr
        from services.dicom_loader import DicomLoadResult
        sid = create_session()
        write_states(sid, {"dicom.series_id": "4.5.6"})
        npy, meta = mpr._cache_paths(sid)
        np.save(npy, np.zeros((2, 2, 2), dtype=np.float32))
        meta.write_text(json.dumps({"shape": [2, 2, 2], "spacing": [1, 1, 1], "series_id": "1.2.3"}))
        cargadas = []

        def _carga(series_id, dicom_dir):
            cargadas.append(series_id)
            return DicomLoadResult(
                volume=np.ones((3, 3, 3), dtype=np.float32), spacing=(1.0, 1.0, 1.0), origin=(0.0, 0.0, 0.0),
                modality="CT", series_uid=series_id, series_description="", patient_name="", patient_id="",
                study_date="", window_center=40.0, window_width=400.0, n_slices=3, is_projection=False,
                projection_warning=None)
        monkeypatch.setattr(mpr, "load_series", _carga)
        out = mpr.ensure_volume_cached(sid)
        assert cargadas == ["4.5.6"]
        assert out["shape"] == [3, 3, 3]
        assert json.loads(meta.read_text())["series_id"] == "4.5.6"


class TestMorfometriaNoMedida:
    def _sesion(self, **validez) -> str:
        sid = create_session()
        write_states(sid, {
            "morpho.max_diameter_mm": "6.0", "morpho.neck_mm": "0.4", "morpho.volume_mm3": "0",
            "morpho.ar": "0", "morpho.dnr": "0", "morpho.bf": "0", "morpho.ui": "0",
            "morpho.compactness": "0", "morpho.dome_height_mm": "3.0",
            "morpho.rupture_risk": "Bajo", "morpho.neck_source": "auto",
            **{f"morpho.{k}": v for k, v in validez.items()},
        })
        return sid

    def test_el_informe_dice_no_medido_y_no_da_etiqueta(self, tmp_path):
        from services.report_generator import ReportGenerator, build_report_data_from_session
        sid = self._sesion(volume_valid="0", neck_valid="0", reliable="0")
        data = build_report_data_from_session(sid)
        m = data.morphometrics
        assert m["volume_mm3"] is None and m["aspect_ratio"] is None and m["neck_diameter_mm"] is None
        assert m["max_diameter_mm"] == 6.0 and m["max_from_patch"] is True
        assert data.risk_label == ""
        ReportGenerator(data).generate(tmp_path / "informe.pdf")      # y se imprime sin romper

    def test_una_sesion_de_antes_sin_marcas_sigue_como_antes(self):
        from services.report_generator import build_report_data_from_session
        sid = self._sesion()
        m = build_report_data_from_session(sid).morphometrics
        assert m["volume_mm3"] == 0.0 and m["max_from_patch"] is False
        assert build_report_data_from_session(sid).risk_label == "Bajo"

    def test_decision_no_cuenta_el_cuello_no_detectado(self, monkeypatch):
        from fastapi.testclient import TestClient
        from main import app
        from routers import treatment
        recibido = {}
        real = treatment.compute_decision

        def _decide(**kw):
            recibido.update(kw)
            return real(**kw)
        monkeypatch.setattr(treatment, "compute_decision", _decide)
        sid = self._sesion(volume_valid="0", neck_valid="0", reliable="0")
        write_states(sid, {"morpho.neck_mm": "2.5", "morpho.ar": "1.8", "morpho.ui": "0.3"})
        c = TestClient(app)
        c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        r = c.post("/api/treatment-decision", json={"session_id": sid})
        assert recibido["neck_mm"] == 0.0 and recibido["aspect_ratio"] == 0.0
        assert recibido["undulation_index"] == 0.0
        assert recibido["max_diameter_mm"] == 6.0
        assert any("parche" in n for n in json.loads(read_state(sid, "treatment.notes_json", "[]")))
        assert r.status_code == 200, r.text
