# -*- coding: utf-8 -*-
"""Las regiones de curvatura se etiquetan una vez, no una vez por región (05-11).

`vtkPolyDataConnectivityFilter` en modo de regiones especificadas recalcula todas
en cada llamada: 35 de los 38 s de `detect()` en una angio-TC. El reparto debe dar
exactamente lo mismo que el filtro, también cuando hay celdas que no son triángulos.
"""
from __future__ import annotations

from eval.synthetic import bola, une


class TestSplitRegions:
    """Etiquetar una vez da lo mismo que pedir cada región al filtro."""

    @staticmethod
    def _partes(malla):
        import vtk
        from services.aneurysm_detector import _split_regions
        todas = vtk.vtkPolyDataConnectivityFilter()
        todas.SetInputData(malla)
        todas.SetExtractionModeToAllRegions()
        todas.ColorRegionsOn()
        todas.Update()
        n = todas.GetNumberOfExtractedRegions()
        return n, list(_split_regions(malla, todas.GetOutput(), n))

    @staticmethod
    def _iguales(malla, n, partes):
        import numpy as np
        from vtkmodules.util import numpy_support as ns
        from services.aneurysm_detector import _clean_region, _specified_region
        assert len(partes) == n
        for i, parte in enumerate(partes):
            a, b = _clean_region(_specified_region(malla, i)), _clean_region(parte)
            assert np.array_equal(ns.vtk_to_numpy(a.GetPoints().GetData()),
                                  ns.vtk_to_numpy(b.GetPoints().GetData()))
            assert np.array_equal(ns.vtk_to_numpy(a.GetPolys().GetConnectivityArray()),
                                  ns.vtk_to_numpy(b.GetPolys().GetConnectivityArray()))

    def test_cada_region_es_la_del_filtro_de_regiones_especificadas(self):
        malla = une(bola((0.0, 0.0, 0.0), 3.0, res=20), bola((20.0, 0.0, 0.0), 2.0, res=16),
                    bola((0.0, 25.0, 0.0), 4.0, res=24))
        n, partes = self._partes(malla)
        assert n == 3
        self._iguales(malla, n, partes)

    def test_con_lineas_sueltas_no_falla_y_da_lo_mismo(self):
        """Zenodo 011: el diezmado deja líneas y la zona de curvatura no es solo triángulos."""
        import vtk
        malla = vtk.vtkPolyData()
        malla.DeepCopy(une(bola((0.0, 0.0, 0.0), 3.0, res=20), bola((20.0, 0.0, 0.0), 2.0, res=16)))
        lineas = vtk.vtkCellArray()
        lineas.InsertNextCell(2)
        lineas.InsertCellPoint(0)
        lineas.InsertCellPoint(1)
        malla.SetLines(lineas)
        n, partes = self._partes(malla)
        assert n == 2
        self._iguales(malla, n, partes)

    def test_sin_regiones_no_hay_nada_que_repartir(self):
        import vtk
        from services.aneurysm_detector import _split_regions
        vacia = vtk.vtkPolyData()
        assert list(_split_regions(vacia, vacia, 0)) == []
