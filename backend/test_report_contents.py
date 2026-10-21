"""Lo que el PDF del informe pone en cada tabla, visto sobre lo que se guarda.

F1-232: la tabla de coils «salía desalineada: el diámetro, la longitud y el
fabricante caen en la fila siguiente, y la primera queda vacía». Los datos
estaban bien; la tabla se partía con el título y la cabecera solos al pie de la
página y los coils en la siguiente, sin cabecera. Aquí se maqueta de verdad y se
mira en qué página cae cada cosa.

F1-233: el stent tenía una tercera columna de «—» y la referencia del
dimensionado se leía junto a otra fila. F1-230: la distancia de las ramas no
decía desde dónde. F1-221: «Administrador» como cirujano cuando nadie lo
escribió.
"""
from __future__ import annotations

import json

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table

from services.report_generator import (CoilEntry, ReportData, ReportGenerator, StentEntry,
                                       build_report_data_from_session)
from services.sessions import create_session, write_state

#: Exactamente lo que guarda POST /api/coils/plan (routers/coils.py, save_coils)
#: en un plan real de Case 3.
_COILS_GUARDADOS = [
    {"index": 1, "name": "Target 360° 12mm×30cm", "position": [59.83, 64.13, 67.39],
     "coil_type": "framing", "diameter_mm": 12, "length_cm": 30, "manufacturer": "Stryker"},
    {"index": 2, "name": "Target Ultra 7mm×18cm", "position": [59.83, 64.13, 67.39],
     "coil_type": "filling", "diameter_mm": 7, "length_cm": 18, "manufacturer": "Stryker"},
    {"index": 3, "name": "Target Nano 4mm×8cm", "position": [59.83, 64.13, 67.39],
     "coil_type": "finishing", "diameter_mm": 4, "length_cm": 8, "manufacturer": "Stryker"},
]


def _texto(celda) -> str:
    return celda.text if isinstance(celda, Paragraph) else str(celda)


def _tabla(flowables) -> Table:
    return next(f for f in flowables if isinstance(f, Table))


class _Registro(SimpleDocTemplate):
    """Apunta en qué página cae cada flowable dibujado."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.paginas: list[tuple[int, object]] = []

    def afterFlowable(self, flowable):  # noqa: N802 — nombre de ReportLab
        self.paginas.append((self.page, flowable))


def _maquetar(tmp_path, alto_previo: float, seccion: list) -> list[tuple[int, object]]:
    doc = _Registro(str(tmp_path / "t.pdf"), pagesize=A4, topMargin=2.5 * cm,
                    bottomMargin=2 * cm)
    doc.build([Spacer(1, alto_previo), *seccion])
    return doc.paginas


class TestLaTablaDeCoils:
    def _data(self) -> ReportData:
        sid = create_session()
        write_state(sid, "devices.coils", json.dumps(_COILS_GUARDADOS))
        return build_report_data_from_session(sid)

    def test_las_celdas_de_la_primera_fila_de_coils_no_estan_vacias(self):
        # Lo guardado llega entero: nombre, tipo, Ø, longitud y fabricante.
        tabla = _tabla(ReportGenerator(self._data())._section_coils())
        primera = [_texto(c) for c in tabla._cellvalues[1]]
        assert primera[:6] == ["1", "Target 360° 12mm×30cm", "Enmarcado", "12", "30", "Stryker"]
        assert all(c.strip() and c != "—" for c in primera)

    @pytest.mark.parametrize("alto_cm", [x * 0.5 for x in range(30, 50)])
    def test_el_titulo_y_la_cabecera_nunca_se_quedan_sin_coils(self, tmp_path, alto_cm):
        # Se empuja la sección por todo el pie de la primera página: en ningún
        # punto puede quedar el título (o la cabecera) en una página y los
        # coils en la siguiente.
        seccion = ReportGenerator(self._data())._section_coils()
        paginas = _maquetar(tmp_path, alto_cm * cm, seccion)
        titulo = next(p for p, f in paginas
                      if isinstance(f, Paragraph) and "Coils de embolización" in f.text)
        partes = [(p, f) for p, f in paginas if isinstance(f, Table)]
        assert partes[0][0] == titulo
        # Cada trozo de tabla lleva su cabecera y al menos un coil.
        for _p, parte in partes:
            assert _texto(parte._cellvalues[0][0]) == "#"
            assert len(parte._cellvalues) >= 2


class TestLaTablaDelStent:
    def _tabla(self) -> Table:
        data = ReportData()
        data.stent = StentEntry(name="Pipeline Flex", manufacturer="Medtronic",
                                diameter_mm=4.0, length_mm=20.0, coverage_pct=100.0,
                                sizing="undersized", parent_artery_mm=4.83)
        return _tabla(ReportGenerator(data)._section_stent()[1]._content)

    def test_la_fila_de_dimensionado_tiene_su_texto_al_lado(self):
        filas = {_texto(f[0]): _texto(f[1]) for f in self._tabla()._cellvalues}
        assert "Infradimensionado" in filas["Dimensionado"]
        assert "sobredimensionar baja la cobertura metálica" in filas["Dimensionado"]
        assert "referencia de dimensionado" in filas["Arteria portadora"]
        assert "sobredimensionar" not in filas["Longitud nominal"]

    def test_ninguna_referencia_queda_colgando(self):
        tabla = self._tabla()
        assert all(len(f) == 2 for f in tabla._cellvalues)
        assert not any(_texto(c).strip() == "—" for f in tabla._cellvalues for c in f)


class TestLasRamasDicenDesdeDonde:
    def test_la_tabla_nombra_la_referencia(self):
        data = ReportData()
        data.branch_floor_mm = 1.0
        data.branches = [{"distance_mm": 3.7, "calibre_mm": 1.4, "parent_calibre_mm": 4.1}]
        elems = ReportGenerator(data)._section_branches()
        assert _texto(_tabla(elems)._cellvalues[0][0]) == "Distancia al cuello (mm)"
        textos = " ".join(f.text for f in elems if isinstance(f, Paragraph))
        assert "desde el centro del plano del cuello hasta el origen visible de la rama" in textos


class TestElCirujano:
    def test_sin_escribirlo_no_sale_administrador(self):
        # F1-221: el cirujano es lo que se escribió en el formulario; nunca el
        # nombre de la cuenta que genera el informe.
        sid = create_session()
        data = build_report_data_from_session(sid, surgeon_name="")
        assert data.patient.surgeon == ""
        tabla = _tabla(ReportGenerator(data)._section_patient())
        celdas = [_texto(c) for f in tabla._cellvalues for c in f]
        assert "Administrador" not in celdas
        assert celdas[celdas.index("Cirujano") + 1] == "—"

    def test_el_pdf_lleva_los_rotulos_del_anexo(self):
        data = ReportData()
        data.morphometrics = {"neck_diameter_mm": 4.0, "bottleneck_factor": 1.6,
                              "undulation_index": 0.12}
        celdas = [_texto(c) for f in _tabla(ReportGenerator(data)._section_morphometrics())._cellvalues
                  for c in f]
        for rotulo in ("Relación de aspecto (AR)", "Factor de abultamiento (BF)",
                       "Índice de ondulación (UI)", "Relación domo/cuello (DNR)"):
            assert rotulo in celdas
