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

import json
from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from routers.detect import clinical_site
from services.clinical_site import site_category
from services.report_generator import ReportGenerator, build_report_data_from_session
from services.sessions import create_session, read_state, write_state, write_states
from services.treatment import LOCATIONS
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

    def test_repetir_la_misma_no_toca_nada(self):
        sid = create_session()
        _put(sid, ACM)
        write_state(sid, "phases.json", '{"total_score": 5}')
        j = _put(sid, ACM).json()
        assert (j["cleared"], j["recalculated"], j["pending"]) == ([], [], [])
        assert read_state(sid, "phases.json", "") != ""


ACOP = "ACoP — Arteria Comunicante Posterior"
CLINICO = {"clinical.patient_age": "67", "clinical.has_comorbidities": "1",
           "clinical.wfns_grade": "2", "clinical.fisher_grade": "3", "clinical.prior_stroke": "1"}


class TestCambiarlaNoBorraLoEscritoAMano:
    """Revisión de la Tarea 2: el cambio borraba el contexto clínico, lo marcado
    en UIATS y puntuaciones cuya categoría no cambiaba."""

    def _con_puntuaciones(self, site: str) -> str:
        sid = create_session()
        _put(sid, site)
        assert client.post("/api/phases", json={
            "session_id": sid, "population": "other", "hypertension": True, "age_years": 72,
            "size_mm": 7.0, "earlier_sah": False, "site": "aca_pcom_posterior" if site == ACOP else "mca",
        }).status_code == 200
        assert client.post("/api/elapss", json={
            "session_id": sid, "population": "other", "age_years": 72, "size_mm": 7.0,
            "earlier_sah": False, "irregular": True,
            "location": "pcom_posterior" if site == ACOP else "mca",
        }).status_code == 200
        assert client.post("/api/uiats", json={
            "session_id": sid, "age_years": 72, "diameter_mm": 7.0, "risk_factors": ["smoking"],
            "location": "acom_pcom" if site == ACOP else "other",
        }).status_code == 200
        write_states(sid, CLINICO | {"treatment.recommendation_key": "clip",
                                     "treatment.location": site})
        return sid

    def _json(self, sid: str, key: str) -> dict:
        return json.loads(read_state(sid, key, "") or "{}")

    def test_la_misma_categoria_deja_phases_y_elapss_intactos(self):
        sid = self._con_puntuaciones(ACOP)
        antes = read_state(sid, "phases.json", ""), read_state(sid, "elapss.json", "")
        j = _put(sid, BASILAR).json()
        assert (read_state(sid, "phases.json", ""), read_state(sid, "elapss.json", "")) == antes
        # UIATS sí cambia (AComA/AComP +2 → vertebrobasilar +4) y conserva lo marcado.
        assert j["recalculated"] == ["UIATS"]
        u = self._json(sid, "uiats.json")
        assert u["inputs"]["location"] == "vertebrobasilar"
        assert u["inputs"]["risk_factors"] == ["smoking"]

    def test_otra_categoria_recalcula_solo_esa(self):
        sid = self._con_puntuaciones(ACM)
        j = _put(sid, BASILAR).json()
        assert j["recalculated"] == ["PHASES", "ELAPSS", "UIATS"]
        p = self._json(sid, "phases.json")
        assert p["inputs"]["site"] == "aca_pcom_posterior" and p["points"]["site"] == 4
        assert p["inputs"]["hypertension"] is True and p["inputs"]["age_years"] == 72
        assert self._json(sid, "elapss.json")["inputs"]["irregular"] is True

    def test_el_contexto_clinico_sobrevive_siempre(self):
        for desde, hasta in ((ACOP, BASILAR), (ACM, BASILAR), (ACM, "Desconocida / No especificada")):
            sid = self._con_puntuaciones(desde)
            _put(sid, hasta)
            for k, v in CLINICO.items():
                assert read_state(sid, k, "") == v, (desde, hasta, k)

    def test_la_decision_de_otra_localizacion_se_borra_y_se_dice(self):
        sid = self._con_puntuaciones(ACM)
        j = _put(sid, BASILAR).json()
        assert j["cleared"] == ["Decisión"]
        assert read_state(sid, "treatment.recommendation_key", "") == ""

    def test_sin_categoria_aparta_las_entradas_y_las_recupera(self):
        sid = self._con_puntuaciones(ACM)
        j = _put(sid, "Otra localización").json()
        # «Otra» no tiene categoría en PHASES ni ELAPSS; en UIATS sí («other», igual que ACM).
        assert j["pending"] == ["PHASES", "ELAPSS"] and j["recalculated"] == []
        assert read_state(sid, "phases.json", "") == ""
        j = _put(sid, ACM).json()
        assert j["recalculated"] == ["PHASES", "ELAPSS"]
        assert self._json(sid, "phases.json")["inputs"]["hypertension"] is True

    def test_la_decision_guarda_su_localizacion(self):
        sid = create_session()
        write_states(sid, {"morpho.max_diameter_mm": "7.0", "morpho.neck_mm": "4.0"})
        r = client.post("/api/treatment-decision", json={"session_id": sid, "location": ACM})
        assert r.status_code == 200, r.text
        assert read_state(sid, "treatment.location", "") == ACM


class TestLaTablaDeTraduccion:
    """La tabla de thresholds.ts y la del backend dicen lo mismo."""

    def test_backend_y_frontend_traducen_igual(self):
        ts = (Path(__file__).resolve().parent.parent / "frontend" / "src" / "components"
              / "morphometry" / "thresholds.ts").read_text(encoding="utf-8")
        filas = 0
        for linea in ts.splitlines():
            celdas = [c.strip() for c in linea.strip().strip("|").split("|")]
            if len(celdas) != 4 or celdas[0] not in LOCATIONS:
                continue
            filas += 1
            for escala, celda in zip(("phases", "elapss", "uiats"), celdas[1:]):
                esperado = None if celda.startswith("—") or celda == "blocks" else celda
                assert site_category(escala, celdas[0]) == esperado, (celdas[0], escala)
        assert filas == len(LOCATIONS)


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
