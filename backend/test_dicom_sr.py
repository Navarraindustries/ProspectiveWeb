"""Tests for the DICOM Structured Report endpoint (Feature 4)."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_sr_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pydicom
from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.sessions import create_session, write_state, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

_SR_SOP = "1.2.840.10008.5.1.4.1.1.88.33"


def _session_with_morpho() -> str:
    sid = create_session()
    write_state(sid, "morpho.volume_mm3", "120.4")
    write_state(sid, "morpho.surface_area_mm2", "210.5")
    write_state(sid, "morpho.max_diameter_mm", "7.5")
    write_state(sid, "morpho.neck_mm", "3.2")
    write_state(sid, "morpho.dome_height_mm", "5.8")
    write_state(sid, "morpho.dnr", "2.34")
    write_state(sid, "morpho.ar", "1.81")
    write_state(sid, "morpho.rupture_risk", "Moderado")
    return sid


class TestDicomSR:
    def test_missing_session(self):
        r = client.post("/api/report/dicom-sr", json={"session_id": "nope"})
        assert r.status_code == 404

    def test_no_morphometry(self):
        sid = create_session()
        r = client.post("/api/report/dicom-sr", json={"session_id": sid})
        assert r.status_code == 422

    def test_generates_valid_sr(self):
        sid = _session_with_morpho()
        r = client.post("/api/report/dicom-sr", json={"session_id": sid, "patient_name": "TEST^A"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["dicom_sr_url"]
        assert d["dicom_sr_url"].split("?", 1)[0].endswith(".dcm")

        # The written file must be a valid, re-readable Comprehensive SR.
        path = session_subdir(sid, "reports") / f"{sid}_sr.dcm"
        assert path.exists()
        ds = pydicom.dcmread(str(path))
        assert ds.Modality == "SR"
        # UTF-8 declarado: sin ello «™», «≥» o «—» se escribían como «?».
        assert ds.SpecificCharacterSet == "ISO_IR 192"
        assert str(ds.SOPClassUID) == _SR_SOP
        assert ds.CompletionFlag == "COMPLETE"
        # Root → morphometry container with NUM items.
        morph = ds.ContentSequence[0]
        assert morph.ValueType == "CONTAINER"
        num_items = [it for it in morph.ContentSequence if it.ValueType == "NUM"]
        assert len(num_items) >= 5
        # Risk encoded as a CODE item.
        code_items = [it for it in morph.ContentSequence if it.ValueType == "CODE"]
        assert len(code_items) == 1


# ── F1-206: la geometría del stent con una sola expresión ─────────────────── #

def _textos_sr(sid: str) -> list[str]:
    path = session_subdir(sid, "reports") / f"{sid}_sr.dcm"
    ds = pydicom.dcmread(str(path))
    out: list[str] = []

    def walk(seq):
        for it in seq:
            if getattr(it, "ValueType", "") == "TEXT":
                out.append(str(it.TextValue))
            if "ContentSequence" in it:
                walk(it.ContentSequence)

    walk(ds.ContentSequence)
    return out


class TestStentGeometryWording:
    """Pantalla, PDF y SR decían la geometría de tres maneras («Sigue el vaso»,
    «Guiado por línea central», «Recto / catálogo»), y el SR llamaba «Recto» a
    un stent de la pestaña recta que en realidad seguía la línea central."""

    def _sr(self, stent: dict) -> list[str]:
        from services.device_state import save_stent
        sid = _session_with_morpho()
        save_stent(sid, {"name": "Pipeline", "diameter_mm": 4.0, "length_mm": 20.0,
                         "coverage_pct": 100.0, **stent})
        r = client.post("/api/report/dicom-sr", json={"session_id": sid})
        assert r.status_code == 200, r.text
        return _textos_sr(sid)

    def test_un_stent_curvado_no_dice_recto(self):
        textos = self._sr({"kind": "straight", "follows_centerline": True})
        assert "Sigue la línea central" in textos
        assert not any("Recto" in t or "recto" in t for t in textos)

    def test_el_de_la_linea_central_dice_lo_mismo(self):
        textos = self._sr({"kind": "centerline"})
        assert "Sigue la línea central" in textos

    def test_el_tubo_recto_se_llama_tubo_recto(self):
        textos = self._sr({"kind": "straight", "follows_centerline": False})
        assert "Tubo recto" in textos


# ── F1-237 y F1-238: la trayectoria, el tipo de clip y lo que faltaba ─────── #

def _sr(sid: str):
    r = client.post("/api/report/dicom-sr", json={"session_id": sid})
    assert r.status_code == 200, r.text
    return pydicom.dcmread(str(session_subdir(sid, "reports") / f"{sid}_sr.dcm"))


def _contenedor(ds, meaning: str):
    for it in ds.ContentSequence:
        if it.ConceptNameCodeSequence[0].CodeMeaning == meaning:
            return it
    raise AssertionError(f"no hay contenedor «{meaning}»")


def _conceptos(item) -> list[str]:
    return [c.ConceptNameCodeSequence[0].CodeMeaning for c in item.ContentSequence]


class TestLaTrayectoriaTieneSusConceptos:
    def test_la_trayectoria_no_usa_el_concepto_de_clip(self):
        sid = _session_with_morpho()
        for k, v in {"entry_x": 67.0, "entry_y": 77.2, "entry_z": 67.4,
                     "target_x": 58.8, "target_y": 64.9, "target_z": 67.6}.items():
            write_state(sid, f"trajectory.{k}", str(v))
        tray = _contenedor(_sr(sid), "Approach Trajectory")
        conceptos = _conceptos(tray)
        assert "Clip Model" not in conceptos
        assert conceptos[:4] == ["Approach Entry Point", "Approach Target",
                                 "Entry–target distance", "Incidence angle"]
        nums = {c.ConceptNameCodeSequence[0].CodeMeaning: c for c in tray.ContentSequence
                if c.ValueType == "NUM"}
        distancia = nums["Entry–target distance"].MeasuredValueSequence[0]
        assert float(distancia.NumericValue) > 0
        assert distancia.MeasurementUnitsCodeSequence[0].CodeValue == "mm"
        angulo = nums["Incidence angle"].MeasuredValueSequence[0]
        assert angulo.MeasurementUnitsCodeSequence[0].CodeValue == "deg"
        # Todos los conceptos nuevos son del esquema privado.
        assert {c.ConceptNameCodeSequence[0].CodingSchemeDesignator
                for c in tray.ContentSequence} == {"99PRP"}


class TestElTipoRealDelClip:
    def test_clip_bajo_pedido_no_dice_catalogo(self):
        from services.device_state import save_clips
        sid = _session_with_morpho()
        save_clips(sid, [{"index": 0, "clip_id": "navarro:t1:0:13.0",
                          "name": "NAVARRO™ T1 Recto 13.0 mm", "position": [60.0, 64.0, 67.6],
                          "orientation": [0.0, 0.0, 0.0], "is_custom": False}])
        _sr(sid)
        textos = _textos_sr(sid)
        assert "Pieza a medida" in textos
        assert "Catálogo" not in textos


class TestLoQueElPdfDiceYElSrNoLlevaba:
    def test_recomendacion_anotaciones_elapss_y_uiats(self):
        import json
        sid = _session_with_morpho()
        write_state(sid, "treatment.recommendation_key", "clip")
        write_state(sid, "treatment.recommendation", "CLIPAJE MICROQUIRÚRGICO")
        write_state(sid, "treatment.confidence", "Moderada")
        write_state(sid, "elapss.json", json.dumps({
            "total_score": 14, "score_band": "13-15", "growth_3yr_pct": 9.1,
            "growth_5yr_pct": 15.6}))
        write_state(sid, "uiats.json", json.dumps({
            "repair": 9, "conservative": 6, "difference": 3, "recommendation": "repair"}))
        ds = _sr(sid)

        rec = _contenedor(ds, "Treatment Recommendation")
        assert _conceptos(rec) == ["Recommendation Key", "Recommendation Text",
                                   "Recommendation Confidence"]
        assert [str(c.TextValue) for c in rec.ContentSequence] == [
            "clip", "CLIPAJE MICROQUIRÚRGICO", "Moderada"]

        el = _contenedor(ds, "ELAPSS Score Assessment")
        assert "ELAPSS Total Score" in _conceptos(el)
        ui = _contenedor(ds, "UIATS Assessment")
        assert "A favor de tratar" in [str(getattr(c, "TextValue", "")) for c in ui.ContentSequence]

        anot = _contenedor(ds, "Annotations")
        cuenta = anot.ContentSequence[0]
        assert cuenta.ConceptNameCodeSequence[0].CodeMeaning == "Annotation Count"
        assert float(cuenta.MeasuredValueSequence[0].NumericValue) == 0

    def test_sin_calcular_no_hay_contenedor(self):
        ds = _sr(_session_with_morpho())
        nombres = [it.ConceptNameCodeSequence[0].CodeMeaning for it in ds.ContentSequence]
        assert "ELAPSS Score Assessment" not in nombres
        assert "UIATS Assessment" not in nombres
        assert "Treatment Recommendation" not in nombres


class TestLasAnotacionesVanUnaAUna:
    def test_cada_anotacion_con_su_nombre_tipo_y_valor(self):
        from services.dicom_sr import DicomSRGenerator
        gen = DicomSRGenerator(
            series_meta={}, morphometrics={"volume_mm3": 1.0},
            annotations=[{"label": "Cuello", "kind": "regla",
                          "points": [{"x": 0, "y": 0, "z": 0}, {"x": 3, "y": 4, "z": 0}]}])
        anot = _contenedor(gen._build_dataset(), "Annotations")
        una = anot.ContentSequence[1]
        assert _conceptos(una) == ["Annotation Label", "Annotation Kind", "Annotation Value"]
        textos = [str(c.TextValue) for c in una.ContentSequence]
        assert textos[:2] == ["Cuello", "Regla"]
        assert "5" in textos[2]
