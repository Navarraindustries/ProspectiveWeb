"""scripts/froc_zenodo.py: FROC y especificidad por paciente sobre registros sintéticos."""
import json

from scripts.froc_zenodo import cargar, contar, preparar, regla_estricta, regla_oficial, separacion


def _cand(rank, pos, diam):
    return {"rank": rank, "position": pos, "diameter_mm": diam, "confidence": 1.0 / rank, "channels": ["curvatura"]}


def _estudios(tmp_path):
    enfermo = {"meta": {"has_ia": True},
               "lesions": [{"position": [0, 0, 0], "diameter_mm": 3.0}],
               # 1.º: un FP lejos; 2.º: grande (Ø 9) a 7 mm de la lesión pequeña; 3.º: encima de ella.
               "long_list": [_cand(1, [50, 0, 0], 6.0), _cand(2, [7, 0, 0], 9.0), _cand(3, [1, 0, 0], 4.0)]}
    control = {"meta": {"has_ia": False}, "lesions": [],
               "long_list": [_cand(1, [0, 0, 0], 5.0), _cand(2, [20, 0, 0], 5.0)]}
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    (a / "001.json").write_text(json.dumps(enfermo))
    (a / "002.json").write_text(json.dumps(control))
    # La segunda carpeta manda: aquí el control solo tiene un candidato.
    (b / "002.json").write_text(json.dumps({**control, "long_list": control["long_list"][:1]}))
    return cargar([a, b])


def test_la_ultima_carpeta_manda(tmp_path):
    est = _estudios(tmp_path)
    assert len(est["002"]["long_list"]) == 1


def test_regla_oficial_cuenta_el_candidato_grande_y_la_estricta_no(tmp_path):
    est = _estudios(tmp_path)
    of, es = preparar(est, regla_oficial), preparar(est, regla_estricta)
    assert contar(of, 2)["lesiones"] == 1           # el Ø 9 a 7 mm «es» la lesión
    assert contar(es, 2)["lesiones"] == 0           # la lesión de 3 mm queda a > 5 mm
    assert contar(es, 3)["lesiones"] == 1


def test_fp_por_estudio_pacientes_y_especificidad(tmp_path):
    filas = preparar(_estudios(tmp_path), regla_estricta)
    c = contar(filas, 3)
    assert c["fp_por_estudio"] == (2 + 1) / 2       # dos FP en el enfermo, uno en el control
    assert c["pacientes"] == 1 and c["n_ia"] == 1
    assert c["espec_paciente"] == 0.0               # el control siempre tiene lista
    assert contar(filas, 0)["espec_paciente"] == 1.0
    assert c["por_tamano"]["< 5 mm"] == [1, 1]


def test_separacion_da_auc_por_variable(tmp_path):
    sep = separacion(preparar(_estudios(tmp_path), regla_oficial), k=3)
    assert set(sep) == {"diametro", "confianza", "canales"}
    assert 0.0 <= sep["diametro"]["auc_candidato"] <= 1.0
