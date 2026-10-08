import math
from services.annotations import format_measure, measure, polygon_area

def test_regla_distancia():
    assert measure("regla", [[0, 0, 0], [3, 4, 0]]) == ("mm", 5.0)

def test_angulo_en_el_vertice():
    assert measure("angulo", [[1, 0, 0], [0, 0, 0], [0, 1, 0]]) == ("°", 90.0)
    assert math.isclose(measure("angulo", [[1, 0, 0], [0, 0, 0], [-1, 1, 0]])[1], 135.0)

def test_region_area_cordon_no_convexa():
    assert polygon_area([[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]], 2) == 5.0
    assert measure("region", [[0, 0, 5], [2, 0, 5], [2, 2, 5], [0, 2, 5]]) == ("mm²", 4.0)

def test_marcador_sin_medida_y_puntos_insuficientes():
    assert measure("marcador", [[1, 1, 1]]) is None
    assert measure("regla", [[1, 1, 1]]) is None

def test_formato_con_coma_decimal():
    assert format_measure(("mm", 12.449)) == "12,4 mm"
    assert format_measure(("°", 63.4)) == "63°"
    assert format_measure(("mm²", 47.9)) == "48 mm²"
    assert format_measure(None) == ""
