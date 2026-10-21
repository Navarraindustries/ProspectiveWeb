# -*- coding: utf-8 -*-
"""El banco de pruebas de la detección, convertido en regresión.

Fija los umbrales del diseño D4: ningún veto quita una lesión
(`rejected_true == 0`), los sintéticos con saco lo sacan 1.º, los que no
tienen saco dejan como mucho un falso positivo, y Case 3 no empeora respecto
a la línea base. Los casos reales son `slow` y se saltan si no hay sesión.
"""
import json
from pathlib import Path

import pytest

from eval.detection_bench import (BenchCase, real_cases, run_bench, run_case,
                                  synthetic_cases, to_json)

SYN = {c.name: c for c in synthetic_cases()}
RESULTS = Path(__file__).resolve().parent / "eval" / "results"
#: Sin sesión de Case 3 el parametrize quedaría vacío; un `param` saltado
#: deja constancia del motivo en vez de un «no tests collected» mudo.
_REALES = real_cases() or [pytest.param(None, marks=pytest.mark.skip(
    reason="sin sesión de Case 3"))]


def test_hay_seis_sinteticos_con_sus_expectativas():
    assert set(SYN) == {"tubo_con_saco", "bifurcacion_sin_saco", "tubo_curvo_sin_saco",
                        "saco_en_borde", "tubo_mas_isla", "bifurcacion_con_saco_apical"}
    assert SYN["tubo_con_saco"].lesion_mm is not None and SYN["bifurcacion_sin_saco"].lesion_mm is None


@pytest.mark.parametrize("name", sorted(SYN))
def test_los_sinteticos_cumplen_sus_umbrales(name):
    c = SYN[name]
    r = run_case(c)
    assert r.rejected_true == 0, "un veto nunca quita la lesión"
    if c.lesion_mm is not None:
        assert r.lesion_rank is not None and r.lesion_rank <= c.expect_rank_max
    assert r.false_positives <= c.expect_fp_max
    if c.expect_rejected_reason is not None:
        assert c.expect_rejected_reason in r.rejected_reasons, r.rejected_reasons


@pytest.mark.slow
@pytest.mark.parametrize("case", _REALES,
                         ids=lambda c: c.name if isinstance(c, BenchCase) else "sin_case3")
def test_case3_cumple_su_umbral(case):
    r = run_case(case)
    assert r.rejected_true == 0
    assert r.lesion_rank is not None and r.lesion_rank <= case.expect_rank_max


def test_sin_sesion_de_case3_no_hay_casos_reales(monkeypatch, tmp_path):
    import eval.detection_bench as b
    monkeypatch.setattr(b, "SESSIONS_DIR", tmp_path)
    assert real_cases() == []


def test_run_bench_devuelve_un_resultado_por_caso():
    rs = run_bench([SYN["tubo_mas_isla"]], vetoes=False)
    assert [r.name for r in rs] == ["tubo_mas_isla"] and rs[0].lesion_rank is None
    fila = to_json(rs)["results"][0]
    assert {"name", "lesion_rank", "false_positives", "rejected_true"} <= set(fila)


def test_los_vetos_no_empeoran_ninguna_fila_del_banco():
    base = {r["name"]: r for r in json.loads((RESULTS / "baseline.json").read_text(encoding="utf-8"))["results"]}
    con = {r["name"]: r for r in json.loads((RESULTS / "with_vetoes.json").read_text(encoding="utf-8"))["results"]}
    assert set(base) == set(con)
    for name, b in base.items():
        c = con[name]
        assert c["rejected_true"] == 0, name
        if b["lesion_rank"] is not None:
            assert c["lesion_rank"] is not None and c["lesion_rank"] <= b["lesion_rank"], name
        assert c["false_positives"] <= b["false_positives"], name
