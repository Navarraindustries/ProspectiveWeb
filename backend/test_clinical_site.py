"""La localización del aneurisma se elige una vez y se guarda con la sesión (F1-165, F1-173, F1-210).

Por qué: se pedía cuatro veces —PHASES, ELAPSS, UIATS y Decisión— con cuatro
listas y cuatro valores por defecto; dejar una sin tocar cambiaba la cifra. Y
el informe no la imprimía en ningún sitio. Ahora Morfometría la elige, se guarda
en `clinical.site` y la leen el PDF, la morfometría reanudada y el WEB.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_clinical_site_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from routers.detect import clinical_site
from services.report_generator import ReportGenerator, build_report_data_from_session
from services.sessions import create_session, read_state, write_state, write_states
from services.web_sizing import SacDims, size_web

client = TestClient(app, raise_server_exceptions=True)

ACM = "ACM — Arteria Cerebral Media"
BASILAR = "Basilar (punta, tronco o AICA)"
PICA = "PICA / Vertebral"


def _put(sid: str, site: str):
    return client.put(f"/api/morphometry/{sid}/site", json={"site": site})


class TestLaRuta:
    def test_put_guarda_clinical_site(self):
        sid = create_session()
        r = _put(sid, BASILAR)
        assert r.status_code == 200, r.text
        assert r.json()["site"] == BASILAR
        assert read_state(sid, "clinical.site", "") == BASILAR

    def test_la_morfometria_la_devuelve_al_reanudar(self):
        sid = create_session()
        assert clinical_site(sid) is None
        _put(sid, ACM)
        assert clinical_site(sid) == ACM

    def test_desconocida_no_cuenta_como_elegida(self):
        sid = create_session()
        _put(sid, "Desconocida / No especificada")
        assert clinical_site(sid) is None

    def test_una_localizacion_que_no_esta_en_la_lista_se_rechaza(self):
        assert _put(create_session(), "basilar").status_code == 422

    def test_sesion_inexistente(self):
        assert _put("no-existe-xyz", ACM).status_code == 404

    def test_cambiarla_borra_lo_calculado_con_la_anterior(self):
        # PHASES, ELAPSS, UIATS y la decisión se calcularon con la localización
        # anterior: si se quedaran, el PDF imprimiría cifras de otro sitio.
        sid = create_session()
        _put(sid, ACM)
        write_states(sid, {"phases.json": '{"total_score": 5}', "elapss.json": "{}",
                           "uiats.json": "{}", "treatment.recommendation_key": "clip"})
        r = _put(sid, BASILAR)
        assert r.json()["cleared"] is True
        for k in ("phases.json", "elapss.json", "uiats.json", "treatment.recommendation_key"):
            assert read_state(sid, k, "") == "", k

    def test_repetir_la_misma_no_borra_nada(self):
        sid = create_session()
        _put(sid, ACM)
        write_state(sid, "phases.json", '{"total_score": 5}')
        r = _put(sid, ACM)
        assert r.json()["cleared"] is False
        assert read_state(sid, "phases.json", "") != ""


class TestElInforme:
    def _sid(self, site: str | None) -> str:
        sid = create_session()
        write_states(sid, {"morpho.max_diameter_mm": "7.0", "morpho.neck_mm": "4.0"})
        if site:
            _put(sid, site)
        return sid

    def _filas(self, sid: str) -> list[list[str]]:
        gen = ReportGenerator(build_report_data_from_session(sid))
        tablas = [e for e in gen._section_morphometrics() if hasattr(e, "_cellvalues")]
        return [[str(c) for c in fila] for fila in tablas[0]._cellvalues]

    def test_el_pdf_lee_clinical_site(self):
        sid = self._sid(BASILAR)
        assert build_report_data_from_session(sid).clinical["site"] == BASILAR
        assert ["Localización", BASILAR] == self._filas(sid)[1][:2]

    def test_sin_localizacion_el_pdf_lo_dice(self):
        filas = self._filas(self._sid(None))
        assert filas[1][:2] == ["Localización", "Sin especificar"]


class TestElWeb:
    """F1-210: «eso no lo sabe la aplicación» cuando la localización ya está registrada."""

    def test_con_tronco_basilar_el_aviso_lo_nombra(self):
        r = size_web(SacDims(6.0, 6.0, 6.0, 5.0, "sac"), neck_mm=4.5, site="Tronco basilar")
        assert "Tronco basilar: fuera de la indicación de bifurcación" in r.warnings
        assert r.within_indication is False
        assert not any("no lo sabe la aplicación" in n for n in r.notes)

    def test_en_bifurcacion_no_avisa(self):
        r = size_web(SacDims(6.0, 6.0, 6.0, 5.0, "sac"), neck_mm=4.5, site=ACM)
        assert not any("fuera de la indicación de bifurcación" in w for w in r.warnings)
        assert r.within_indication is True

    def test_sin_localizacion_pide_elegirla(self):
        r = size_web(SacDims(6.0, 6.0, 6.0, 5.0, "sac"), neck_mm=4.5)
        assert any("Elige la localización en Morfometría" in n for n in r.notes)

    def test_la_ruta_lee_la_localizacion_registrada(self):
        sid = create_session()
        write_states(sid, {"morpho.max_diameter_mm": "6.0", "morpho.dome_height_mm": "5.0",
                           "morpho.neck_mm": "4.5", "morpho.dnr": "1.33"})
        _put(sid, PICA)
        j = client.post(f"/api/web-sizing/{sid}").json()
        assert "PICA / Vertebral: fuera de la indicación de bifurcación" in j["warnings"]
