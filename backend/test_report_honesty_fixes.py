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


# ── Paso 8 · las filas sueltas del PDF (F1-224 a F1-229) ──────────────────── #

def _celdas(tabla) -> list[str]:
    return [getattr(c, "text", str(c)) for fila in tabla._cellvalues for c in fila]


def _tabla(flowables):
    from reportlab.platypus import Table
    return next(f for f in flowables if isinstance(f, Table))


class TestFechaDelEstudio:
    """F1-224: «F. estudio» era la fecha del día en que se generaba el informe."""

    def test_f_estudio_es_la_fecha_del_dicom(self):
        from services.report_generator import ReportGenerator, build_report_data_from_session
        from services.sessions import create_session, write_state
        sid = create_session()
        write_state(sid, "dicom.acquisition_date", "2026-09-14")
        data = build_report_data_from_session(sid)
        assert data.patient.study_date == "2026-09-14"
        celdas = _celdas(_tabla(ReportGenerator(data)._section_patient()))
        assert celdas[celdas.index("F. estudio") + 1] == "2026-09-14"

    def test_sin_fecha_dicom_no_se_inventa_la_de_hoy(self):
        from services.report_generator import build_report_data_from_session
        from services.sessions import create_session
        data = build_report_data_from_session(create_session())
        assert data.patient.study_date == ""


class TestMorfometriaEnCastellano:
    """F1-225: rótulos en inglés, sin BF ni UI, y «Riesgo ruptura si > 1.3»."""

    def test_la_tabla_tiene_bf_y_ui_y_no_dice_aspect_ratio(self):
        from services.report_generator import ReportData, ReportGenerator
        data = ReportData()
        data.morphometrics = {"aspect_ratio": 1.3, "bottleneck_factor": 1.62,
                              "undulation_index": 0.31, "neck_diameter_mm": 4.0}
        celdas = _celdas(_tabla(ReportGenerator(data)._section_morphometrics()))
        texto = " ".join(celdas)
        assert "Factor de abultamiento (BF)" in celdas and "1.62" in celdas
        assert "Índice de ondulación (UI)" in celdas and "0.310" in celdas
        assert "Relación de aspecto (AR)" in celdas
        assert "Aspect Ratio" not in texto and "Dome/Neck" not in texto
        assert "Riesgo ruptura" not in texto


class TestFactoresEnCastellano:
    """F1-226: columna «Estrategia» y «Clipping»."""

    def _tabla(self, factors):
        from services.report_generator import ReportData, ReportGenerator
        data = ReportData()
        data.treatment = {"recommendation": "CLIPAJE", "recommendation_key": "clip",
                          "confidence": "Moderada", "factors": factors, "notes": []}
        return _tabla(ReportGenerator(data)._section_treatment_decision())

    def test_no_aparece_clipping(self):
        largo = "Localización de ACM " + "con una procedencia muy larga " * 12
        tabla = self._tabla([{"name": largo, "source": largo, "direction": "clip", "votes": True},
                             {"name": "Edad", "source": "", "direction": "endo", "votes": True}])
        celdas = _celdas(tabla)
        assert "Clipping" not in " ".join(celdas)
        assert celdas[:2] == ["Factor y procedencia", "Favorece"]
        # La dirección en la MISMA fila que su factor, arriba, aunque el factor
        # ocupe varias líneas.
        assert celdas[3] == "Clipaje" and celdas[5] == "Endovascular"
        assert all(e.valign == "TOP" for e in tabla._cellStyles[1])


class TestUnaSolaCita:
    """F1-228: ISAT 2002, Spetzler-BRAT 2013 y AHA/ASA 2015."""

    def test_no_aparece_aha_asa_2015(self):
        from services.report_generator import ReportData, ReportGenerator
        data = ReportData()
        data.treatment = {"recommendation": "CLIPAJE", "recommendation_key": "clip",
                          "confidence": "Moderada", "factors": [], "notes": []}
        texto = " ".join(getattr(f, "text", "") for f in
                         ReportGenerator(data)._section_treatment_decision())
        assert "AHA/ASA 2015" not in texto and "ISAT" not in texto and "BRAT" not in texto
        assert "AHA/ASA 2023 (Hoh BL et al., Stroke 2023;54:e314–e370)" in texto


class TestClipsDelPlan:
    """F1-229: «Tipo Catálogo» para un NAVARRO y «Orientación (0.0, 0.0, 0.0)»."""

    def _sesion(self):
        from services.device_state import save_clips, save_placed_clips
        from services.sessions import create_session
        sid = create_session()
        save_clips(sid, [{"index": 0, "clip_id": "navarro:t1:0:13.0",
                          "name": "NAVARRO™ T1 Recto 13.0 mm", "position": [60.0, 64.0, 67.6],
                          "orientation": [0.0, 0.0, 20.0], "normal": [0.0, 0.0, 1.0],
                          "is_custom": False}])
        save_placed_clips(sid, {"clips": [{"key": 1, "clip_id": "navarro:t1:0:13.0",
                                           "position": [60.0, 64.0, 67.6], "rotation_deg": 20.0,
                                           "azimuthDeg": 35.0, "elevationDeg": -10.0}]})
        return sid

    def _elems(self, sid):
        from services.report_generator import ReportGenerator, build_report_data_from_session
        return ReportGenerator(build_report_data_from_session(sid))._section_clips()

    def test_el_clip_bajo_pedido_no_dice_catalogo(self):
        celdas = _celdas(_tabla(self._elems(self._sesion())))
        assert "Pieza a medida" in celdas and "Catálogo" not in celdas

    def test_los_tipos_de_clip(self):
        from services.report_generator import clip_type_label
        assert clip_type_label("navarro:t3:90:8.5", False) == "Pieza a medida"
        assert clip_type_label("custom:abc", True) == "Personalizado"
        assert clip_type_label("yasargil-fe720k", False) == "Catálogo"

    def test_la_orientacion_es_la_clinica_no_la_terna_cruda(self):
        celdas = _celdas(_tabla(self._elems(self._sesion())))
        assert "Giro · acimut · elevación (°)" in celdas
        assert "20 · 35 · -10" in celdas
        assert "(0.0, 0.0, 0.0)" not in celdas and "(0.0, 0.0, 20.0)" not in celdas

    def test_sin_evaluar_lo_dice(self):
        textos = " ".join(getattr(f, "text", "") for f in self._elems(self._sesion()))
        assert "<b>Oclusión:</b> no evaluada" in textos
        assert "<b>Mapa de calor:</b> no calculado con estos clips" in textos

    def test_la_evaluacion_sale_y_caduca_si_el_clip_se_mueve(self):
        from services.device_state import save_clip_evaluation, save_clips
        sid = self._sesion()
        save_clip_evaluation(sid, "occlusion", {"outcome": "complete",
                                                "summary": "Oclusión completa del saco."})
        save_clip_evaluation(sid, "field", {"verdict": "ok", "covered_pct": 92.0,
                                            "residual_pct": 3.0, "pressure_verdict": "ok"},
                             clips=[("navarro:t1:0:13.0", [60.0, 64.0, 67.6], 20.0, [0.0, 0.0, 1.0])])
        textos = " ".join(getattr(f, "text", "") for f in self._elems(sid))
        assert "Oclusión completa del saco." in textos
        assert "cubre 92 % del cuello, residuo 3 % (correcto)" in textos
        # Se mueve el clip: lo evaluado ya no describe esta colocación.
        save_clips(sid, [{"index": 0, "clip_id": "navarro:t1:0:13.0",
                          "name": "NAVARRO™ T1 Recto 13.0 mm", "position": [61.0, 64.0, 67.6],
                          "orientation": [0.0, 0.0, 20.0], "is_custom": False}])
        textos = " ".join(getattr(f, "text", "") for f in self._elems(sid))
        assert "no evaluada" in textos and "no calculado con estos clips" in textos


class TestLaHuellaDelMapaDeCalorIncluyeLaOrientacion:
    """Revisión de la Tarea 21: la huella era id + posición. Girar el clip sin
    moverlo y pulsar «Colocar» dejaba en el PDF la cobertura de otra pose."""

    _ID, _POS = "navarro:t1:0:13.0", [60.0, 64.0, 67.6]

    def _colocar(self, sid, rot, normal):
        from services.device_state import save_clips
        save_clips(sid, [{"index": 0, "clip_id": self._ID, "name": "NAVARRO™ T1 Recto 13.0 mm",
                          "position": self._POS, "orientation": [0.0, 0.0, rot],
                          "normal": normal, "is_custom": False}])

    def _textos(self, sid) -> str:
        from services.report_generator import ReportGenerator, build_report_data_from_session
        return " ".join(getattr(f, "text", "") for f in
                        ReportGenerator(build_report_data_from_session(sid))._section_clips())

    def _evaluar(self, sid):
        from services.device_state import save_clip_evaluation
        save_clip_evaluation(sid, "occlusion", {"outcome": "complete",
                                                "summary": "Oclusión completa del saco."})
        save_clip_evaluation(sid, "field", {"verdict": "ok", "covered_pct": 92.0,
                                            "residual_pct": 3.0, "pressure_verdict": "ok"},
                             clips=[(self._ID, self._POS, 0.0, [0.0, 0.0, 1.0])])

    def test_mismo_sitio_otro_giro_el_mapa_de_calor_no_vale(self):
        from services.sessions import create_session
        sid = create_session()
        self._colocar(sid, 0.0, [0.0, 0.0, 1.0])
        self._evaluar(sid)
        assert "cubre 92 % del cuello" in self._textos(sid)
        self._colocar(sid, 35.0, [0.0, 0.0, 1.0])        # girado sin moverlo
        textos = self._textos(sid)
        assert "<b>Mapa de calor:</b> no calculado con estos clips" in textos
        # La oclusión corta por la posición: sigue valiendo.
        assert "Oclusión completa del saco." in textos

    def test_mismo_sitio_otra_inclinacion_el_mapa_de_calor_no_vale(self):
        from services.sessions import create_session
        sid = create_session()
        self._colocar(sid, 0.0, [0.0, 0.0, 1.0])
        self._evaluar(sid)
        self._colocar(sid, 0.0, [0.0, 0.6, 0.8])
        assert "no calculado con estos clips" in self._textos(sid)

    def test_quitar_los_clips_olvida_lo_evaluado(self):
        from services.device_state import clear_device, read_state
        from services.sessions import create_session
        sid = create_session()
        self._colocar(sid, 0.0, [0.0, 0.0, 1.0])
        self._evaluar(sid)
        clear_device(sid, "clips")
        assert read_state(sid, "devices.clip_field.json", "") == ""
        assert read_state(sid, "devices.clip_occlusion.json", "") == ""
        # Volver a poner el mismo clip en el mismo sitio no resucita nada.
        self._colocar(sid, 0.0, [0.0, 0.0, 1.0])
        textos = self._textos(sid)
        assert "no evaluada" in textos and "no calculado con estos clips" in textos


# ── Decisiones guardadas antes de F1-225 / F1-227 ─────────────────────────── #

#: Textos exactos guardados por sesiones decididas en 8d4c7e8 o antes.
_VIEJO_AR = ("Ya no vota: índice de RIESGO DE ROTURA, sin validación para elegir "
             "modalidad. Un AR ≥ 1.6 se asocia a RECANALIZACIÓN tras coiling (OR "
             "4.15) — va al perfil endovascular.")
_VIEJO_DNR = ("Ya no es un factor propio: el DNR es domo ÷ cuello, así que puntuaba "
              "la misma medida que el factor del cuello y entre los dos se llevaban "
              "40 puntos. Ahora se evalúan como un solo criterio de cuello ancho.")


class TestLasDecisionesAntiguasSeLeenConLosTextosNuevos:
    def test_el_pdf_de_una_sesion_antigua_no_dice_ya_no(self):
        import json
        from services.report_generator import ReportGenerator, build_report_data_from_session
        from services.sessions import create_session, write_states
        from services.treatment import _SOURCE
        sid = create_session()
        write_states(sid, {
            "treatment.recommendation_key": "endo", "treatment.recommendation": "ENDOVASCULAR",
            "treatment.confidence": "Moderada",
            "treatment.factors_json": json.dumps([
                {"name": "Aspect Ratio bajo (AR = 0.91 < 1.3)", "direction": "clip",
                 "source": _VIEJO_AR, "votes": False},
                {"name": "DNR 1.65", "direction": "neutral", "source": _VIEJO_DNR, "votes": False},
                {"name": "Otro", "direction": "endo", "source": "Texto que no conoce el mapa",
                 "votes": True},
            ]),
        })
        data = build_report_data_from_session(sid)
        celdas = " ".join(_celdas(_tabla(ReportGenerator(data)._section_treatment_decision())))
        assert "Ya no" not in celdas and "Aspect Ratio" not in celdas
        assert "Relación de aspecto (AR) baja (AR = 0.91 < 1.3)" in celdas
        assert _SOURCE["ar"] in celdas and _SOURCE["dnr"] in celdas
        assert "Texto que no conoce el mapa" in celdas         # lo desconocido pasa igual
