"""Ola final de F1a: detalles del informe que la revisión final encontró.

- El nombre de un clip es texto libre en el contrato: un «<» o un «&» abortaba
  el PDF entero (Hallazgo 7).
- La hoja interna del clip a medida titulaba sus motivos «Por qué no sirve el
  inventario» aunque dijeran que no hay catálogo cargado (Hallazgo 8, F1-214).
- Una componente -0.0 en la normal partía la huella del mapa de calor y el
  informe decía «no calculado» de un mapa válido (Hallazgo 13).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_ola_final_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from main import app  # noqa: E402,F401  (carga la configuración como en las demás pruebas)
from services.device_state import clips_fingerprint, save_clips  # noqa: E402
from services.sessions import create_session  # noqa: E402


class TestElNombreDelClipEnElPdf:
    def test_un_nombre_con_marcas_no_rompe_el_pdf(self, tmp_path):
        from services.report_generator import ReportGenerator, build_report_data_from_session

        sid = create_session()
        save_clips(sid, [{"index": 0, "clip_id": "x", "name": "Clip <b>recto & corto",
                          "position": [1.0, 2.0, 3.0], "orientation": [0.0, 0.0, 0.0],
                          "is_custom": False}])
        gen = ReportGenerator(build_report_data_from_session(sid))
        assert gen.generate(tmp_path / "informe.pdf").stat().st_size > 0


class TestLaHojaDelClipAMedida:
    def test_los_motivos_se_titulan_por_que_se_fabrica(self, tmp_path, monkeypatch):
        from reportlab.platypus import Paragraph, SimpleDocTemplate

        from services.clip_dossier import render_dossier

        capturado: list = []
        monkeypatch.setattr(SimpleDocTemplate, "build",
                            lambda self, story, *a, **k: capturado.extend(story))
        render_dossier({
            "kind": "internal", "title": "Clip a medida", "part_no": "P-1", "label": "T1",
            "dimensions": [["Mordaza", "5 mm", "±0,1"]],
            "why_not_stock": ["No hay catálogo de clips cargado."],
            "verification": ["Medir la mordaza."],
        }, tmp_path / "hoja.pdf")
        titulos = [f.getPlainText() for f in capturado if isinstance(f, Paragraph)]
        assert "Por qué se fabrica" in titulos
        assert "Por qué no sirve el inventario" not in titulos


class TestLaHuellaConMenosCero:
    def test_menos_cero_y_cero_dan_la_misma_huella(self):
        a = clips_fingerprint([("c", [0.0, 1.0, 2.0], 0.0, [0.0, 0.0, 1.0])])
        b = clips_fingerprint([("c", [-0.0, 1.0, 2.0], 0.0, [-0.0, -0.001, 1.0])])
        assert a == b
        assert "-0.0" not in b
