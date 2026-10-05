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
