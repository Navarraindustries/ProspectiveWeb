# -*- coding: utf-8 -*-
"""El techo del umbral se puede quitar, y el panel enseña la banda del volumen.

Dos fallos reales, encontrados al seguir mi propia indicación en el navegador:

1. `SegmentPanel` sólo pedía la banda adaptada cuando NO había malla
   (`if (!sessionId || segmentation) return;`). Al volver al paso con la malla
   hecha, los sliders mostraban los valores de reserva —inferior 150, rango
   −500…3000, que son de TC— sobre una 3DRA cuyo p99 es 1499. Segmentar así
   mete el tejido blando y el cráneo entero.

2. El tope del slider sale de `vmax` = percentil 99.9, así que «subir el
   umbral superior al máximo» dejaba el techo donde ya estaba. No había forma
   de pedir «sin límite», aunque el pipeline lleva desde siempre la regla
   `upper <= lower` → sin techo.

Aquí se fija el lado del backend: que esa regla valga de punta a punta.
"""
from __future__ import annotations

import numpy as np
import pytest

from services.segmentation import SegmentationPipeline, voxel_fraction


def _volumen():
    """Cubo con un núcleo MUY brillante dentro de un vaso brillante."""
    v = np.zeros((40, 40, 40), dtype=np.float32)
    v[10:30, 18:22, 18:22] = 1000.0      # el vaso
    v[18:22, 19:21, 19:21] = 5000.0      # el núcleo de contraste denso
    return v


class TestSinTecho:

    def test_la_fraccion_no_se_va_a_cero(self):
        """Con techo desactivado contaba 0 % del volumen y lo pintaba así."""
        v = _volumen()
        assert voxel_fraction(v, 500.0, 0.0) > 0.0
        # Sin techo cuenta TODO lo que pasa el inferior, núcleo incluido.
        assert voxel_fraction(v, 500.0, 0.0) == pytest.approx(
            float(np.mean(v >= 500.0))
        )

    def test_el_techo_sigue_contando_cuando_es_valido(self):
        v = _volumen()
        con = voxel_fraction(v, 500.0, 2000.0)
        sin = voxel_fraction(v, 500.0, 0.0)
        assert con < sin          # el techo deja fuera el núcleo

    @pytest.mark.parametrize("upper", [0.0, -1.0, 500.0])
    def test_upper_no_mayor_que_lower_es_sin_techo(self, upper):
        v = _volumen()
        assert voxel_fraction(v, 500.0, upper) == pytest.approx(
            float(np.mean(v >= 500.0))
        )

    def test_el_techo_parte_el_vaso_y_quitarlo_lo_une(self):
        """La razón de todo esto: el techo corta donde el contraste es denso."""
        v = _volumen()
        sp = (1.0, 1.0, 1.0)
        comun = dict(smooth_iterations=0, target_reduction=0.0,
                     gaussian_sigma=0.0, min_component_verts=0)

        con = SegmentationPipeline(threshold_hu=500.0, threshold_max_hu=2000.0,
                                   **comun).run(v, sp)
        sin = SegmentationPipeline(threshold_hu=500.0, threshold_max_hu=0.0,
                                   **comun).run(v, sp)

        def piezas(poly):
            import vtk
            c = vtk.vtkPolyDataConnectivityFilter()
            c.SetInputData(poly)
            c.SetExtractionModeToAllRegions()
            c.Update()
            return c.GetNumberOfExtractedRegions()

        # Con techo el núcleo se vacía y el vaso queda en más piezas.
        assert piezas(con.poly_data) > piezas(sin.poly_data)
        assert piezas(sin.poly_data) == 1
