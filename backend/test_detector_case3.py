# -*- coding: utf-8 -*-
"""El único caso con diagnóstico médico, convertido en regresión.

**Ground truth, y cómo se corrigió.** Los médicos sitúan el aneurisma de
`case 3` en el **tronco basilar**. La primera versión de este fichero fijó la
coordenada (54, 18, 49) — que era una SUPOSICIÓN: se dio por hecho que la
región más votada por curvatura era la lesión, y el usuario nunca lo confirmó.
Resultó falsa: esa región está en la chapa de la parte inferior de la malla.

La coordenada de abajo sí está confirmada por el usuario, y con su matiz: es
«lo que más probablemente se considere un aneurisma **de lo que está en la
malla 3D**, por su forma y tamaño». No es un diagnóstico cerrado sobre la
angiografía original, es el mejor candidato dentro de lo que la segmentación
reconstruye.

Qué estaba mal
--------------
El detector busca **curvatura**, y la lesión no destaca por curvatura. Con los
cinco candidatos que llegó a dar, los cinco caían en la chapa de la parte
inferior —bordes dentados, que dan curvatura alta— y ninguno en el tronco.

Medido: la lesión es **el punto de mayor calibre de todo el árbol**, radio
2,33 mm contra una mediana de 0,57. Destaca por grosor. De ahí los dos canales
geométricos de `services/aneurysm_consensus.py`.

Antes de eso se arreglaron dos sesgos del canal de curvatura, que siguen
valiendo:

1. **El radio se medía sobre el parche, no sobre la cúpula.** Era
   ``sqrt(area / 4π)``, que trata el casquete convexo como una esfera entera.
   La esfera ajustada a los puntos da un radio **1,75×** mayor (p10 1,53 ·
   p90 2,35), así que ``min_radius_mm = 1.5`` pedía en realidad unos 5 mm de
   diámetro y descartaba **124 de 144 regiones**.
2. **La fracción gauss+ penaliza a quien recorta bien.** Una región grande
   llega al cuello, y el cuello es una silla de montar: curvatura negativa.
   Correlación entre tamaño y fracción gauss+: **−0,29**, y la fracción más
   alta (0,75) era una mota de veinte puntos.

Lo que este fichero fija, y lo que NO
-------------------------------------
Fija que la lesión **está entre los candidatos**. No fija que salga la primera,
y no puede: el orden es inestable. Medido sobre dos mallas del MISMO estudio
que difieren en 17 vértices de 12 776 —el 0,13 %— el candidato de curvatura
mejor puntuado pasaba del puesto 1 al 4, con el pipeline siendo determinista
(tres corridas idénticas). Por eso la pantalla dejó de etiquetar al primero
como «Principal» y por eso aquí solo se exige presencia.

Con el consenso de tres canales la lesión sale en el puesto 2 de 5, encontrada
por dos de ellos (calibre y cociente). Antes no salía en ninguno.

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

from routers.detect import _MAX_CANDIDATES, _detector_for_modality
from services.aneurysm_consensus import (CH_CALIBRE, CH_RATIO,
                                         consensus)
from services.mesh_components import keep_main_tree

CASE3 = (Path(__file__).resolve().parent.parent
         / "Archivos DICOM" / "DICOM" / "Case 3" / "Case 3" / "Unknown Study" / "XA")

#: Dónde está la lesión, en coordenadas de mundo de la malla segmentada con los
#: parámetros de la interfaz (suavizado 3, limpieza 7, «solo el árbol»).
#: Confirmado por el usuario sobre un render: el punto de mayor calibre del
#: árbol, en el tronco. NO es la coordenada de la primera versión de este
#: fichero, que era una suposición mía y resultó estar en la chapa de abajo.
GT_BASILAR = np.array([62.0, 64.0, 63.0])

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


def _lista(poly, modality):
    """Lo mismo que devuelve el endpoint: el consenso de los tres canales."""
    return consensus(poly, _detector_for_modality(modality), top=_MAX_CANDIDATES)


def _dist(h) -> float:
    return float(np.linalg.norm(np.asarray(h.position) - GT_BASILAR))


class TestTheOneCaseWeHaveADiagnosisFor:
    def test_the_lesion_is_offered_at_all(self, malla):
        """Lo que de verdad cambió: antes no salía en ninguno de los cinco."""
        poly, modality = malla
        hits = _lista(poly, modality)
        assert hits, "no puede devolver cero aquí"
        assert any(_dist(h) <= TOL_MM for h in hits), (
            "la lesión no está entre los candidatos: "
            + ", ".join(f"{_dist(h):.0f} mm" for h in hits)
        )

    def test_it_is_near_the_top_but_the_order_is_not_promised(self, malla):
        """No se exige el primer puesto, y no es una concesión: es lo medido.

        Entre dos mallas del mismo estudio con 17 vértices de diferencia, el
        mejor candidato de curvatura pasaba del puesto 1 al 4. Exigir el primer
        puesto seria fijar una casualidad de una malla concreta.
        """
        poly, modality = malla
        hits = _lista(poly, modality)
        puestos = [i for i, h in enumerate(hits) if _dist(h) <= TOL_MM]
        assert puestos, "la lesión no está en la lista"
        assert puestos[0] < 3, f"aparece en el puesto {puestos[0] + 1}"

    def test_the_geometric_channels_are_what_find_it(self, malla):
        """La curvatura sola no la encontraba. Si algún día la encuentra,
        este test falla y habrá que revisar si los canales siguen haciendo
        falta — no es un fallo, es un aviso."""
        poly, modality = malla
        hits = _lista(poly, modality)
        lesion = next(h for h in hits if _dist(h) <= TOL_MM)
        assert CH_CALIBRE in lesion.channels or CH_RATIO in lesion.channels
        assert lesion.radius_mm > 1.5, "es el punto más grueso del árbol"

    def test_the_list_is_a_shortlist_and_not_a_single_answer(self, malla):
        # Uno solo no es una lista corta: es un veredicto sin validar.
        poly, modality = malla
        assert len(_lista(poly, modality)) >= 3

    def test_the_curvature_size_gate_no_longer_eats_the_mesh(self, malla):
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
        assert cands and cands[0].radius_method == "sphere_fit"
