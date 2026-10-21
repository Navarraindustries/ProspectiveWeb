from reportlab.platypus import Paragraph, Table

from services.report_generator import ReportData, ReportGenerator


def _texts(story):
    """Texto plano de los Paragraph y de las celdas de Table del story."""
    out = []

    def cell(c):
        out.append(c.getPlainText() if isinstance(c, Paragraph) else str(c))

    for f in story:
        if isinstance(f, Paragraph):
            cell(f)
        elif isinstance(f, Table):
            for row in f._cellvalues:
                for c in row:
                    cell(c)
    return "\n".join(out)


def _pt(x, y, z):
    return {"x": x, "y": y, "z": z}


def test_la_seccion_entra_en_el_pdf_con_valores_del_servidor():
    data = ReportData()
    data.annotations = [
        {"id": "1", "kind": "regla", "label": "R1", "points": [_pt(0, 0, 0), _pt(3, 4, 0)], "plane": {"plane": "axial", "index": 3}, "note": "", "visible": True},
        {"id": "2", "kind": "angulo", "label": "A1", "points": [_pt(1, 0, 0), _pt(0, 0, 0), _pt(0, 1, 0)], "plane": None, "note": "", "visible": True},
        {"id": "3", "kind": "marcador", "label": "M1", "points": [_pt(1, 1, 1)], "plane": None, "note": "trombo mural", "visible": False},
    ]
    t = _texts(ReportGenerator(data)._build_story())
    for esperado in ("Anotaciones", "R1", "5,0 mm", "90°", "AX 4", "3D", "trombo mural"):
        assert esperado in t


def test_sin_anotaciones_lo_dice():
    assert "Sin anotaciones" in _texts(ReportGenerator(ReportData())._build_story())


def test_texto_con_caracteres_de_marcado_no_rompe_el_informe():
    data = ReportData()
    data.annotations = [{"id": "1", "kind": "marcador", "label": "a & b <c", "points": [_pt(1, 1, 1)], "plane": None, "note": "x <y & z", "visible": True}]
    t = _texts(ReportGenerator(data)._build_story())
    assert "a & b <c" in t and "x <y & z" in t


def test_plano_mal_formado_sale_como_interrogante():
    data = ReportData()
    data.annotations = [
        {"id": "1", "kind": "marcador", "label": "M1", "points": [_pt(1, 1, 1)], "plane": {"index": "x"}, "note": "", "visible": True},
        {"id": "2", "kind": "marcador", "label": "M2", "points": [_pt(1, 1, 1)], "plane": "axial", "note": "", "visible": True},
    ]
    t = _texts(ReportGenerator(data)._build_story())
    assert t.count("?") >= 2
