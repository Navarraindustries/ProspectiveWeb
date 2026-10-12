"""Lo que el informe decía mal, visto al generarlo sobre un caso real."""
from __future__ import annotations

from datetime import datetime

from services.morphometrics import MorphometricResult
from services.report_generator import _TIPO_COIL, _fecha_larga, _hora_local, _minuscula


def _m(**kw) -> MorphometricResult:
    # Solo los cinco índices que mira la etiqueta; el resto del resultado no pinta nada aquí.
    m = object.__new__(MorphometricResult)
    kw = {"aspect_ratio": 0.0, "dome_to_neck_ratio": 0.0, "undulation_index": 0.0,
          "ellipticity_index": 0.0, "size_ratio": 0.0} | kw
    for k, v in kw.items():
        setattr(m, k, v)
    return m


class TestElRiesgoDicePorQue:
    def test_moderado_por_el_cociente_de_tamano_no_se_atribuye_a_ar_ni_dnr(self):
        # El caso real: AR 0,85 y DNR 1,17, «Moderado» por SR 2,03. El informe
        # decía «DNR ≥ 1.6 o AR ≥ 1.3».
        etiqueta, motivos = _m(aspect_ratio=0.85, dome_to_neck_ratio=1.17, undulation_index=0.08,
                               size_ratio=2.03).rupture_risk()
        assert etiqueta == "Moderado"
        assert motivos == ["cociente de tamaño (SR) 2.03 ≥ 2.0"]

    def test_alto_lista_solo_los_criterios_de_alto_que_se_cumplen(self):
        etiqueta, motivos = _m(aspect_ratio=1.7, dome_to_neck_ratio=1.2, undulation_index=0.3).rupture_risk()
        assert etiqueta == "Alto"
        assert motivos == ["AR 1.70 ≥ 1.6", "ondulación (UI) 0.30 ≥ 0.25"]

    def test_bajo_no_tiene_motivos_y_la_etiqueta_de_siempre_no_cambia(self):
        m = _m(aspect_ratio=0.9, dome_to_neck_ratio=1.1)
        assert m.rupture_risk() == ("Bajo", [])
        assert m.rupture_risk_label == "Bajo"


class TestFechasYTextos:
    def test_el_mes_va_en_espanol(self):
        assert _fecha_larga(datetime(2026, 10, 5, 9, 7)) == "05 de octubre de 2026 a las 09:07"

    def test_la_hora_de_una_captura_es_la_local_no_utc(self):
        utc = datetime(2026, 10, 5, 6, 4)
        from datetime import timezone
        esperado = utc.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None)
        assert _hora_local(utc) == esperado

    def test_los_tipos_de_coil_no_salen_en_ingles(self):
        assert _TIPO_COIL == {"framing": "Enmarcado", "filling": "Relleno", "finishing": "Acabado"}

    def test_tras_dos_puntos_va_minuscula(self):
        assert _minuscula("Brazo posterior") == "brazo posterior" and _minuscula("") == ""


class TestElRiesgoMorfometricoNoSeConfundeConElPhases:
    """F1-234: «RIESGO: ALTO» bajo «Evaluación de riesgo de ruptura» se leía como
    el riesgo de rotura del PHASES, y es una etiqueta de forma."""

    def _textos(self, **kw) -> list[str]:
        from services.report_generator import ReportData, ReportGenerator
        data = ReportData()
        for k, v in kw.items():
            setattr(data, k, v)
        return [f.text for f in ReportGenerator(data)._section_risk() if hasattr(f, "text")]

    def test_el_pdf_dice_morfometrico(self):
        textos = self._textos(risk_label="Alto", risk_reasons=["AR 1.70 ≥ 1.6"])
        assert any("Riesgo morfométrico" in t for t in textos), textos
        assert not any(t.startswith("RIESGO:") for t in textos), textos

    def test_una_linea_lo_distingue_del_phases(self):
        textos = self._textos(risk_label="Bajo")
        assert any("PHASES" in t and "forma" in t for t in textos), textos


class TestElPlanElegido:
    """F1-176 y F1-236: el PDF imprimía la recomendación del algoritmo como si
    fuera el plan, y todos los dispositivos como «planificados». Ahora va
    primero lo que el equipo decidió y la estrategia marcada; el resto se
    imprime como alternativas evaluadas."""

    def _gen(self, **kw):
        from services.report_generator import (ClipEntry, CoilEntry, ReportData,
                                               ReportGenerator)
        data = ReportData()
        data.treatment = {"recommendation": "TRATAMIENTO ENDOVASCULAR",
                          "recommendation_key": "endo", "confidence": "Moderada",
                          "factors": [], "notes": []}
        data.clips = [ClipEntry(0, "Yaşargil FE720K", (1.0, 2.0, 3.0), (0.0, 0.0, 0.0))]
        data.coils = [CoilEntry(1, "Target 360 6x20", (1.0, 2.0, 3.0))]
        for k, v in kw.items():
            setattr(data, k, v)
        return ReportGenerator(data)

    @staticmethod
    def _textos(flowables) -> list[str]:
        return [f.text for f in flowables if hasattr(f, "text")]

    def test_la_decision_del_equipo_sale_en_el_pdf(self):
        gen = self._gen(team={"team_decision": "clipaje", "decided_by": "Comité neurovascular",
                              "other_text": ""}, device_strategy="clips")
        textos = " ".join(self._textos(gen._section_chosen_plan()))
        assert "Clipaje" in textos and "Comité neurovascular" in textos

    def test_el_pdf_tiene_plan_elegido_antes_que_la_recomendacion(self):
        gen = self._gen(team={"team_decision": "clipaje", "decided_by": "Comité",
                              "other_text": ""}, device_strategy="clips")
        textos = self._textos(gen._build_story())
        plan = textos.index("Plan elegido")
        rec = textos.index("Recomendación Terapéutica")
        assert plan < rec
        assert any("Clipaje" in t for t in textos[plan:rec])

    def test_la_familia_elegida_es_el_plan_y_el_resto_alternativa(self):
        gen = self._gen(team={"team_decision": "clipaje", "decided_by": "", "other_text": ""},
                        device_strategy="clips")
        textos = self._textos(gen._build_story())
        assert "Clips quirúrgicos planificados" in textos
        assert "Coils de embolización evaluados (alternativa)" in textos
        assert "Coils de embolización planificados" not in textos
        plan = " ".join(self._textos(gen._section_chosen_plan()))
        assert "Yaşargil FE720K" in plan and "Target 360" not in plan

    def test_otra_imprime_su_texto(self):
        gen = self._gen(team={"team_decision": "otra", "decided_by": "Dra. Ruiz",
                              "other_text": "Bypass y trapping"})
        textos = " ".join(self._textos(gen._section_chosen_plan()))
        assert "Bypass y trapping" in textos and "Dra. Ruiz" in textos

    def test_sin_decision_lo_dice(self):
        textos = self._textos(self._gen()._section_chosen_plan())
        assert "Plan elegido" in textos
        assert any("El equipo no ha registrado su decisión; lo que sigue es la "
                   "recomendación del algoritmo y los dispositivos evaluados" in t for t in textos)
        story = self._textos(self._gen()._build_story())
        assert "Clips quirúrgicos planificados" not in story

    def test_la_sesion_lleva_las_claves_al_informe(self):
        from services.report_generator import build_report_data_from_session
        from services.sessions import create_session, write_states
        sid = create_session()
        write_states(sid, {"treatment.team_decision": "endovascular",
                           "treatment.decided_by": "Comité", "treatment.team_other": "",
                           "devices.strategy": "coils"})
        data = build_report_data_from_session(sid)
        assert data.team == {"team_decision": "endovascular", "decided_by": "Comité",
                             "other_text": ""}
        assert data.device_strategy == "coils"
