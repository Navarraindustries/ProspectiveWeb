"""P16: ningún índice sin validar presentado como predicción.

La retirada de Philips AneurysmFlow (marzo de 2026) es el aviso: una cifra de
riesgo en pantalla se lee como una predicción para el paciente. Aquí se fija
cómo hablan de sí mismos la etiqueta de forma, las franjas de PHASES, el motor
de decisión, el JSDB, las escalas en un aneurisma roto, el seguimiento y el SR.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_p16_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from services.dicom_sr import DicomSRGenerator
from services.report_generator import ReportData, ReportGenerator, _roto, build_report_data_from_session
from services.sessions import create_session, write_state


def _textos(flowables) -> str:
    return " ".join(getattr(f, "text", "") for f in flowables)


# ── Etiqueta de forma en el PDF ───────────────────────────────────────────── #

class TestLaEtiquetaDeFormaNoDaPautas:
    def _riesgo(self, label: str) -> str:
        return _textos(ReportGenerator(ReportData(risk_label=label))._section_risk())

    def test_ninguna_rama_da_una_pauta_y_todas_dicen_que_no_esta_validada(self):
        for label in ("Alto", "Moderado", "Bajo"):
            t = self._riesgo(label)
            assert "sin validar como predicción de rotura" in t, (label, t)
            assert "Valorar tratamiento" not in t and "Seguimiento radiológico" not in t, (label, t)

    def test_bajo_no_habla_de_bajo_riesgo(self):
        assert "rangos de bajo riesgo" not in self._riesgo("Bajo")


# ── PHASES, ELAPSS y UIATS en un aneurisma roto ──────────────────────────── #

class TestEscalasEnUnRoto:
    _PH = {"total_score": 9, "risk_5yr_pct": 4.3, "risk_band": "moderate", "points": {}, "inputs": {}}
    _EL = {"total_score": 14, "score_band": "13-15", "growth_3yr_pct": 9.1, "growth_5yr_pct": 15.6}
    _UI = {"repair": 9, "conservative": 6, "difference": 3, "recommendation": "repair"}

    def _gen(self, roto):
        return ReportGenerator(ReportData(phases=self._PH, elapss=self._EL, uiats=self._UI,
                                          clinical={"ruptured": roto}))

    def test_roto_lleva_el_aviso_delante_en_las_tres(self):
        g = self._gen(True)
        for nombre, seccion in (("PHASES", g._section_phases()), ("ELAPSS", g._section_elapss()),
                                ("UIATS", g._section_uiats())):
            assert seccion[1].text.startswith("<b>No aplica: el aneurisma está marcado como roto.</b>"), nombre
            assert nombre in seccion[1].text

    def test_no_roto_o_sin_decision_no_hay_aviso(self):
        for roto in (False, None):
            assert "No aplica" not in _textos(self._gen(roto)._section_phases())

    def test_la_franja_es_de_la_aplicacion(self):
        t = _textos(self._gen(False)._section_phases())
        assert "franja moderada de la aplicación" in t
        assert "Riesgo moderado" not in t

    def test_el_estado_sale_de_las_entradas_de_decision(self):
        assert _roto(json.dumps({"is_ruptured": True})) is True
        assert _roto(json.dumps({"is_ruptured": False})) is False
        assert _roto("") is None and _roto("{roto") is None and _roto("[]") is None
        sid = create_session()
        write_state(sid, "clinical.decision_inputs_json", json.dumps({"is_ruptured": True}))
        assert build_report_data_from_session(sid).clinical["ruptured"] is True


# ── El motor de decisión y su «confianza» ────────────────────────────────── #

class TestElMotorNoPrometeResultados:
    def test_la_confianza_dice_que_no_es_una_probabilidad(self):
        t = ReportGenerator(ReportData(treatment={
            "recommendation": "CLIPAJE MICROQUIRÚRGICO", "recommendation_key": "clip",
            "confidence": "Alta", "factors": [], "notes": []}))._section_treatment_decision()
        texto = _textos(t)
        assert "Confianza: <b>Alta</b>" in texto
        assert "no es una probabilidad de acierto" in texto
        assert "pesos elegidos a mano, sin validar" in texto

    def test_los_factores_no_afirman_resultados(self):
        from services.treatment import compute_decision
        textos = []
        for diam, ui in ((4.0, 0.0), (30.0, 0.0), (8.0, 0.3)):
            d = compute_decision(neck_mm=3.0, aspect_ratio=1.5, dnr=1.8, max_diameter_mm=diam,
                                 bottleneck_factor=1.2, undulation_index=ui)
            textos += [str(v) for f in d["factors"] for v in f.values()] + [str(n) for n in d["notes"]]
        junto = " ".join(textos)
        assert "más fiable para exclusión completa" not in junto
        assert "tratamiento de elección" not in junto
        assert "riesgo de llenado incompleto" not in junto
        assert "sin cohorte que mida el resultado" in junto

    def test_muy_pequeno_no_compara_riesgos_que_no_estima(self):
        from services.treatment import compute_decision
        d = compute_decision(neck_mm=2.0, aspect_ratio=1.0, dnr=1.2, max_diameter_mm=2.5,
                             bottleneck_factor=1.0, undulation_index=0.0,
                             phases={"total_score": 1, "risk_5yr_pct": 0.4, "risk_band": "low"})
        notas = " ".join(d["notes"])
        assert "generalmente supera" not in notas
        assert "no estima el riesgo del procedimiento" in notas
        assert "franja baja de la aplicación" in notas and "no de este paciente" in notas


def test_el_veredicto_del_jsdb_dice_de_quien_es_el_corte():
    from services.jsdb import jsdb_scores
    r = jsdb_scores(True, age=80, prior_stroke=1, wfns_grade=5, fisher_grade=4,
                    max_diameter_mm=12.0, location="Basilar")
    assert r is not None and r.both_poor
    assert "corte que pone esta aplicación" in r.verdict
    assert "espera mal resultado" not in r.verdict


# ── Seguimiento ──────────────────────────────────────────────────────────── #

def test_seguimiento_sin_medir_no_es_bajo_y_el_cambio_dice_sus_cortes():
    from models.longitudinal import LongitudinalDelta
    from routers.longitudinal import _growth_message
    d = LongitudinalDelta(metric="max_diameter_mm", label="Diametro maximo", value_previous=5.0,
                          value_current=6.5, delta=1.5, delta_pct=30.0, trend="↑ crecimiento",
                          is_concerning=True)
    msg = _growth_message([d])
    assert "Crecimiento significativo" not in msg and "corte de la aplicación" in msg
    assert "no restan el error de la medida" in msg


# ── DICOM SR ─────────────────────────────────────────────────────────────── #

def _hojas(item):
    for it in getattr(item, "ContentSequence", []):
        yield it
        yield from _hojas(it)


def test_el_sr_no_codifica_la_forma_como_riesgo_de_rotura_y_acota_phases():
    ds = DicomSRGenerator(series_meta={}, morphometrics={"volume_mm3": 1.0}, risk_label="Alto",
                          phases={"total_score": 9, "risk_5yr_pct": 4.3, "risk_band": "moderate"},
                          )._build_dataset()
    hojas = list(_hojas(ds))
    nombres = [h.ConceptNameCodeSequence[0].CodeMeaning for h in hojas]
    assert "Rupture Risk Assessment" not in nombres
    assert "Morphometric Shape Label (not a rupture probability)" in nombres
    assert not any(h.ValueType == "CODE" and h.ConceptCodeSequence[0].CodeMeaning == "High risk" for h in hojas)
    alcance = [str(h.TextValue) for h in hojas
               if h.ConceptNameCodeSequence[0].CodeMeaning == "PHASES Scope"]
    assert alcance and "no roto" in alcance[0] and "no es una predicción para este paciente" in alcance[0]
    assert "Application Band of PHASES Risk (not from Greving 2014)" in nombres
