# -*- coding: utf-8 -*-
"""Red de seguridad del plan Zenodo: los dos casos 3DRA con verdad de terreno.

Case 3 (tronco basilar) e IM_0055 son los únicos estudios XA con una lesión
confirmada, y sobre ellos se calibró todo el pipeline. Cada corrección para
angio-TC (techo de hueso, resolución nativa en banda, puertas del detector) se
enruta por modalidad o por malla; estos tests son lo que comprueba que la
3DRA sigue dando lo mismo por el camino tubular del servidor
(`routers.segment.segment_tubular` + `routers.detect._detect_hits`).

Línea base medida el 2026-10-13 (`backend/data/regresion_xa/base.json`):
  · Case 3   107 186 vértices · lesión 1.ª de 14 (curvatura) · árbol: 1.ª de 16
  · IM_0055  104 841 vértices · lesión 1.ª de 17 (curvatura + cociente) · árbol: 1.ª de 13

Lo que se exige es menos que eso, a propósito: la lesión entre los 5 oficiales
y en los 3 primeros, en la malla entera y en el árbol. El orden exacto es
inestable (17 vértices de 12 776 lo mueven del 1.º al 4.º, ver
`test_detector_case3`), así que fijar el 1.º sería fijar una casualidad.

Lentos (Frangi a resolución nativa, 384³: 3–4 min por caso) y se saltan si
los DICOM no están (`Archivos DICOM/` está en .gitignore).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_rxa_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pytest

from scripts.regresion_xa import CASES, run_case

pytestmark = pytest.mark.slow

_PRESENTES = [name for name, spec in CASES.items() if spec["dir"].exists()]


@pytest.fixture(scope="module", params=_PRESENTES or ["ninguno"])
def caso(request):
    if request.param == "ninguno":
        pytest.skip("Case 3 e IM_0055 no están en disco")
    return run_case(request.param, log=lambda *_: None)


class TestLa3DRASigueIgual:
    def test_se_segmenta_a_resolucion_nativa_y_sin_techo(self, caso):
        # Lo que distingue a la 3DRA: cabe entera y no lleva techo.
        assert caso["segment"]["downsample_factor"] == 1
        assert caso["segment"]["thresholds"]["upper"] == 0.0
        assert caso["segment"]["band"] is None
        assert caso["segment"]["vertices"] > 50_000

    def test_la_lesion_esta_entre_los_cinco_y_en_los_tres_primeros(self, caso):
        for parte in ("full", "tree"):
            r = caso[parte]
            assert r.get("lesion_rank") is not None, f"{caso['case']}/{parte}: la lesión no está en la lista"
            assert r["lesion_in_top5"], f"{caso['case']}/{parte}: puesto {r['lesion_rank']}"
            assert r["lesion_rank"] <= 3, f"{caso['case']}/{parte}: puesto {r['lesion_rank']}"

    def test_los_canales_que_la_encuentran_siguen_encendidos(self, caso):
        # Case 3: la curvatura; IM_0055: curvatura y cociente. Si el árbol
        # dejara de reconocerse (tree_poly), calibre y cociente se apagarían.
        assert "curvatura" in caso["full"]["channels_on"]
        assert {"calibre", "cociente"} & set(caso["full"]["channels_on"])
