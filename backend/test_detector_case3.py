# -*- coding: utf-8 -*-
"""El único caso con diagnóstico médico, convertido en regresión.

**Ground truth.** Los médicos con los que trabaja el usuario sitúan el aneurisma
de `case 3` en el **tronco basilar**. Es la primera —y por ahora la única—
anotación clínica que tiene este proyecto, y hasta el 21/09/2026 case 3 figuraba
como «localización desconocida» en el informe del motor de decisión.

Qué estaba mal
--------------
Sobre la malla ya limpia (12 776 vértices, una pieza) el detector generaba
**144 regiones y devolvía UNA**, y no era la del tronco. La lesión buena salía
como la región **mejor puntuada** —214 puntos, score 0,52— y la tiraba el
umbral de fracción de curvatura gaussiana positiva, por tener 0,42 frente a un
mínimo de 0,55.

Dos causas, las dos medidas:

1. **El radio se medía sobre el parche, no sobre la cúpula.** Era
   ``sqrt(area / 4π)``, que trata el casquete convexo como una esfera entera.
   La esfera ajustada a los puntos da un radio **1,75×** mayor (p10 1,53 ·
   p90 2,35), así que ``min_radius_mm = 1.5`` pedía en realidad unos 5 mm de
   diámetro y descartaba **124 de 144 regiones**.
2. **La fracción gauss+ penaliza a quien recorta bien.** Una región grande
   llega al cuello, y el cuello es una silla de montar: curvatura negativa.
   En las ocho regiones de case 3 la correlación entre tamaño y fracción gauss+
   es **−0,29**, y la fracción más alta (0,75) es una mota de veinte puntos.

Lo que este fichero fija, y lo que NO
-------------------------------------
Fija que la lesión del tronco **está entre los candidatos**. No fija que salga
la primera, y no puede: el orden es inestable frente a cambios mínimos de la
malla. Medido sobre dos mallas del MISMO estudio que difieren en 17 vértices de
12 776 —el 0,13 %—:

    malla A (12 776 verts)   lesión #1 de 5,  score 0,569,  d 8,35 mm
    malla B (12 759 verts)   lesión #4 de 4,  score 0,402,  d 10,06 mm

El pipeline es determinista (tres corridas idénticas), así que no es ruido de
ejecución: es que la puntuación separa mal a los primeros cuatro, que van de
0,40 a 0,57. Por eso la pantalla dejó de etiquetar al primero como «Principal».

Lo que sí se sostiene en las dos mallas es la **presencia**: la lesión aparece
a 0,5 y a 1,7 mm del sitio conocido. De un candidato equivocado a una lista con
el bueno dentro — eso es lo que cambió, y es lo que este fichero protege.

Se salta entero si los DICOM no están: `Archivos DICOM/` está en .gitignore.
"""
from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="prospective_gt_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest

from routers.detect import _detector_for_modality
from services.mesh_components import keep_main_tree

CASE3 = (Path(__file__).resolve().parent.parent
         / "Archivos DICOM" / "DICOM" / "Case 3" / "Case 3" / "Unknown Study" / "XA")

#: Dónde está la lesión, en coordenadas de mundo de la malla segmentada con los
#: parámetros de la interfaz (suavizado 3, limpieza 7, «solo el árbol»). Es el
#: centroide de la región que los médicos identifican en el tronco basilar.
GT_BASILAR = np.array([54.0, 18.0, 49.0])

#: Cuánto puede moverse ese centroide sin dejar de ser la misma lesión. El
#: candidato mide unos 8 mm, así que 10 mm cubre que la región se recorte algo
#: distinta sin admitir la lesión de al lado (la más próxima está a 18 mm).
TOL_MM = 10.0

pytestmark = pytest.mark.skipif(
    not CASE3.exists(),
    reason="Archivos DICOM/ no está en el repositorio (gitignored)",
)


@pytest.fixture(scope="module")
def malla():
    """La malla de case 3 tal y como la produce la interfaz."""
    from services.dicom_loader import load_series, scan_series
    from services.segmentation import (SegmentationPipeline,
                                       level_to_cleanup_mm3,
                                       level_to_smooth_iters)
    from services.thresholds import compute_auto_thresholds

    ser = scan_series(CASE3)
    dcm = load_series(ser[0]["series_uid"], CASE3)
    lo, up, _strat = compute_auto_thresholds(
        volume=dcm.volume, modality=dcm.modality,
        window_center=dcm.window_center, window_width=dcm.window_width)
    min_mm3, top_n, closing = level_to_cleanup_mm3(7)
    pipe = SegmentationPipeline(
        threshold_hu=lo, threshold_max_hu=up if up > lo else 0.0,
        smooth_iterations=level_to_smooth_iters(3), smooth_pass_band=0.06,
        target_reduction=0.70, gaussian_sigma=0.5, morpho_closing_mm=closing,
        min_component_mm3=min_mm3, keep_top_n=top_n, min_component_verts=0)
    f = max(1, math.ceil(max(dcm.volume.shape) / 256))
    vol = np.ascontiguousarray(dcm.volume[::f, ::f, ::f])
    sp = tuple(s * f for s in dcm.spacing)
    seg = pipe.run(vol, sp)
    mt = keep_main_tree(seg.poly_data)
    assert mt.applied, "en case 3 el árbol sí se aísla"
    return mt.poly, dcm.modality


def _dist(c) -> float:
    return float(np.linalg.norm(np.asarray(c.centroid) - GT_BASILAR))


class TestTheOneCaseWeHaveADiagnosisFor:
    def test_the_basilar_lesion_is_offered_at_all(self, malla):
        poly, modality = malla
        cands = _detector_for_modality(modality).detect(poly).candidates
        assert cands, "el detector no puede devolver cero aquí"
        assert any(_dist(c) <= TOL_MM for c in cands), (
            "la lesión del tronco no está entre los candidatos: "
            + ", ".join(f"{_dist(c):.0f} mm" for c in cands)
        )

    def test_it_is_near_the_top_even_if_not_first(self, malla):
        """No se exige que sea la primera, y no es una concesión: es lo medido.

        Entre dos mallas del mismo estudio con 17 vértices de diferencia la
        lesión pasa del puesto 1 al 4. Exigir el primer puesto sería fijar una
        casualidad de una malla concreta y dejar el test rojo la próxima vez
        que alguien toque el suavizado.
        """
        poly, modality = malla
        cands = _detector_for_modality(modality).detect(poly).candidates
        puestos = [i for i, c in enumerate(cands) if _dist(c) <= TOL_MM]
        assert puestos, "la lesión no está en la lista"
        assert puestos[0] < 5, f"aparece en el puesto {puestos[0] + 1}"

    def test_the_scores_do_not_separate_the_top_candidates(self, malla):
        """Por qué no se promete un orden: los primeros puntúan casi igual.

        Si algún día se separan de verdad, este test falla y habrá que volver
        a mirar si ya se puede prometer el primer puesto.
        """
        poly, modality = malla
        cands = _detector_for_modality(modality).detect(poly).candidates
        assert len(cands) >= 3
        margen = cands[0].score - cands[2].score
        assert margen < 0.20, (
            f"el primero le saca {margen:.2f} al tercero: revisa si el orden "
            f"ya es fiable y se puede volver a destacar al principal"
        )

    def test_the_list_is_a_shortlist_and_not_a_single_answer(self, malla):
        # El usuario pidió varios candidatos con el bueno dentro; uno solo no
        # es una lista corta, es un veredicto sin validar.
        poly, modality = malla
        cands = _detector_for_modality(modality).detect(poly).candidates
        assert len(cands) >= 3, f"solo {len(cands)} candidato(s)"

    def test_the_size_gate_no_longer_eats_the_mesh(self, malla):
        # Descartaba 124 de 144 regiones por medir el parche en vez de la cúpula.
        poly, modality = malla
        r = _detector_for_modality(modality).detect(poly)
        assert r.n_failed_size < r.n_regions_total * 0.6, (
            f"el filtro de tamaño descarta {r.n_failed_size}/{r.n_regions_total}"
        )

    def test_the_dome_radius_is_measured_on_a_fitted_sphere(self, malla):
        # Si vuelve a caer al método por área, el diámetro se queda corto.
        poly, modality = malla
        cands = _detector_for_modality(modality).detect(poly).candidates
        assert cands[0].radius_method == "sphere_fit"
        assert cands[0].diameter_mm > 5.0, (
            "con el parche la misma lesión salía como 3.2 mm"
        )
