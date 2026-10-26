# -*- coding: utf-8 -*-
"""Paso 3 del plan Zenodo: el orden del canal de curvatura.

Medido sobre las mallas limpias de los pasos 1 y 2 (13 lesiones en 10
angio-TC): la puntuación compuesta del detector prima un radio de 4 mm y
entierra sacos de 5 mm con regiones perfectas. «La región convexa más grande
primero» (`AneurysmDetector.order_by = "area"`) es una regla sin pesos que
sube las lesiones entre los 5 de 2 a 4. Aquí se fija el mecanismo, no la
cifra: con dos cúpulas en un vaso, la grande va primero con «area» y el orden
por puntuación sigue siendo el de siempre.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_p3_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest

from services.aneurysm_detector import AneurysmDetector
from test_consensus_and_plane import _bola, _tubo, _une

GRANDE = np.array([0.0, 12.0, 3.2])
PEQUENA = np.array([0.0, -12.0, 2.0])


@pytest.fixture(scope="module")
def vaso_con_dos_sacos():
    """Un vaso de 1 mm con un saco de 3,5 mm y otro de 1,8 mm de radio."""
    return _une(_tubo(radio=1.0, largo=70.0), _bola(GRANDE, 3.5, res=40), _bola(PEQUENA, 1.8, res=40))


def _detector(order_by: str) -> AneurysmDetector:
    # Puertas abiertas: aquí se prueba el ORDEN, no las puertas. El percentil
    # de Gauss bajo para que entre la esfera grande (K = 0,08) y no solo la
    # pequeña (0,31): es justo lo que le pasa a un saco de 12 mm en TC. El
    # tubo sintético tiene K exactamente 0 y entra entero como UNA región de
    # 23 mm de radio: la quita la puerta de tamaño, como en producción (20 mm).
    return AneurysmDetector(gauss_percentile=20.0, min_points=4, min_radius_mm=0.5,
                            max_radius_mm=10.0, min_positive_gauss_frac=0.0,
                            min_compactness=0.0, min_sphericity=0.0,
                            min_mean_curv_radius=0.3, merge_dist_mm=4.0,
                            max_candidates=8, order_by=order_by)


def _cerca(c, punto, mm=4.0) -> bool:
    return float(np.linalg.norm(np.asarray(c.centroid) - punto)) < mm


class TestOrdenPorArea:
    def test_por_defecto_el_orden_es_la_puntuacion_de_siempre(self, vaso_con_dos_sacos):
        det = _detector("score")
        assert AneurysmDetector().order_by == "score"
        cands = det.detect(vaso_con_dos_sacos).candidates
        assert len(cands) >= 2
        assert [c.score for c in cands] == sorted((c.score for c in cands), reverse=True)

    def test_con_area_la_cupula_mas_grande_va_primero(self, vaso_con_dos_sacos):
        det = _detector("area")
        det.trace_regions = True
        res = det.detect(vaso_con_dos_sacos)
        cands = res.candidates
        assert len(cands) >= 2
        assert all(c.area_mm2 > 0 for c in cands)
        assert [c.area_mm2 for c in cands] == sorted((c.area_mm2 for c in cands), reverse=True)
        assert _cerca(cands[0], GRANDE), cands[0].centroid
        assert any(_cerca(c, PEQUENA) for c in cands)
        # La traza lleva el área, que es lo que el banco mide.
        assert max(t.area_mm2 for t in res.regions) == cands[0].area_mm2

    def test_las_mismas_regiones_con_otro_orden(self, vaso_con_dos_sacos):
        a = _detector("area").detect(vaso_con_dos_sacos).candidates
        s = _detector("score").detect(vaso_con_dos_sacos).candidates
        assert sorted(tuple(round(v, 3) for v in c.centroid) for c in a) == \
               sorted(tuple(round(v, 3) for v in c.centroid) for c in s)

    def test_el_preset_de_tc_ordena_por_area_y_el_de_xa_no_cambia(self):
        from routers.detect import _detector_for_modality
        ct = _detector_for_modality("CT")
        assert ct.order_by == "area"
        assert ct.min_mean_curv_radius == 0.7            # la puerta absoluta de XA, también en TC
        # Suelo absoluto de Gauss (esfera de 6 mm), medido sobre los 172 de
        # Zenodo el 25-10: 52 → 61 entre los 5. XA sigue con el percentil.
        assert ct.min_gauss_curvature == 0.028
        assert _detector_for_modality("XA").min_gauss_curvature is None
        # Medido con `scripts/regresion_xa.py --set order_by=area`: la lesión
        # sigue 1.ª en Case 3 e IM_0055, pero los otros cuatro puestos se
        # mueven; la 3DRA se queda con su orden de siempre.
        assert _detector_for_modality("XA").order_by == "score"

    def test_un_orden_desconocido_se_rechaza(self, vaso_con_dos_sacos):
        with pytest.raises(ValueError):
            _detector("tamaño").detect(vaso_con_dos_sacos)


class TestLaDeteccionNoCallaUnCanalCaido:
    """En el banco Zenodo un «Unable to allocate» en la rasterización del
    calibre dejaba el estudio como válido con un canal menos. Ahora el
    resultado lo dice y el banco lo marca como incompleto."""

    def test_consensus_anota_el_fallo_del_calibre(self, monkeypatch, vaso_con_dos_sacos):
        import services.aneurysm_consensus as ac

        def sin_memoria(*_a, **_k):
            raise MemoryError("Unable to allocate 409. MiB")

        monkeypatch.setattr(ac, "local_calibre", sin_memoria)
        monkeypatch.setattr(ac, "_geometric_channels_apply", lambda *_a, **_k: True)
        det = _detector("area")
        res = det.detect(vaso_con_dos_sacos)
        assert res.geometric_error == ""
        hits = ac.consensus(vaso_con_dos_sacos, det, top=5, curvature_result=res)
        assert hits, "la curvatura sigue proponiendo"
        assert res.geometric_error.startswith("MemoryError")

    def test_el_banco_marca_incompleto(self):
        from services.aneurysm_detector import DetectionResult
        from scripts.eval_zenodo import detection_status
        assert detection_status(DetectionResult(candidates=[])) == "ok"
        assert detection_status(DetectionResult(candidates=[], geometric_error="MemoryError: x")) == "incomplete"


class TestDecimacionEncadenada:
    """Una angio-TC con banda nativa da 1–2 M de vértices; decimar dos veces
    desde la malla completa costaba 200 s por copia. Por encima del doble del
    tope de curvatura, la copia de calibre sale de la copia de curvatura. Las
    mallas de 3DRA (≈ 105 000) quedan debajo y no cambian."""

    def _espia(self, monkeypatch):
        import services.segmentation as sg
        real = sg.decimate_to
        llamadas: list[tuple[int, int]] = []

        def espia(poly, n):
            llamadas.append((poly.GetNumberOfPoints(), n))
            return real(poly, n)

        monkeypatch.setattr(sg, "decimate_to", espia)
        return llamadas

    def test_por_encima_del_umbral_la_copia_de_calibre_sale_de_la_de_curvatura(self, monkeypatch, vaso_con_dos_sacos):
        import routers.detect as rd
        n = vaso_con_dos_sacos.GetNumberOfPoints()
        monkeypatch.setattr(rd, "_CURVATURE_MAX_VERTS", n // 3)
        monkeypatch.setattr(rd, "_CHAIN_DECIMATION_FROM", 2 * (n // 3))
        monkeypatch.setattr(rd, "_DETECT_MAX_VERTS", n // 6)
        monkeypatch.setattr(rd, "_DETECT_TARGET_VERTS", int(n // 6 * 0.95))
        llamadas = self._espia(monkeypatch)
        rd._detect_hits(vaso_con_dos_sacos, "CT", _detector("area"))
        assert llamadas[0] == (n, n // 3)                      # la curvatura, de la malla completa
        assert llamadas[1][0] < n // 2                           # el calibre, de la copia de curvatura (≈ n/3, con el desbordamiento de la decimación)
        assert llamadas[1][1] == int(n // 6 * 0.95)

    def test_por_debajo_del_umbral_todo_sale_de_la_malla_completa(self, monkeypatch, vaso_con_dos_sacos):
        import routers.detect as rd
        n = vaso_con_dos_sacos.GetNumberOfPoints()
        monkeypatch.setattr(rd, "_CURVATURE_MAX_VERTS", int(n * 0.8))
        monkeypatch.setattr(rd, "_CHAIN_DECIMATION_FROM", int(n * 1.6))   # Case 3: 107 000 < 160 000
        monkeypatch.setattr(rd, "_DETECT_MAX_VERTS", n // 2)
        monkeypatch.setattr(rd, "_DETECT_TARGET_VERTS", int(n // 2 * 0.95))
        llamadas = self._espia(monkeypatch)
        rd._detect_hits(vaso_con_dos_sacos, "XA", _detector("score"))
        assert [c[0] for c in llamadas[:2]] == [n, n]

    def test_el_umbral_deja_fuera_la_3dra(self):
        import routers.detect as rd
        assert rd._CHAIN_DECIMATION_FROM == 2 * rd._CURVATURE_MAX_VERTS == 160_000


class TestSueloAbsolutoDeGauss:
    """El percentil de Gauss es relativo a la malla: en un árbol de vasos finos
    sube hasta K ≈ 0,6 mm⁻² (radio ≤ 1,3 mm) y un saco de 12 mm es plano para
    él. `min_gauss_curvature` lo sustituye por un suelo en mm⁻²."""

    def test_el_suelo_sustituye_al_percentil(self, vaso_con_dos_sacos):
        det = _detector("area")
        det.gauss_percentile = 99.0          # con el percentil, solo la esfera pequeña (K = 0,31)
        res_p = det.detect(vaso_con_dos_sacos)
        det.min_gauss_curvature = 1.0 / 6.0 ** 2   # radio ≤ 6 mm: entran las dos
        res_k = det.detect(vaso_con_dos_sacos)
        assert res_k.gauss_threshold == pytest.approx(1.0 / 36.0)
        assert res_p.gauss_threshold > res_k.gauss_threshold
        assert _cerca(res_k.candidates[0], GRANDE)
        assert not any(_cerca(c, GRANDE) for c in res_p.candidates)

    def test_por_defecto_no_hay_suelo(self):
        assert AneurysmDetector().min_gauss_curvature is None
