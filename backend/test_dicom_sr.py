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
