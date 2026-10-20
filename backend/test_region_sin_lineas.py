"""`aneurysm_detector._clean_region`: la región de una componente lleva solo triángulos.

`vtkCleanPolyData` convertía el triángulo que se quedaba sin área en una línea y
`vtkMassProperties` avisaba «Input data type must be VTK_TRIANGLE not 3» una vez
por región: cientos de avisos por detección en una angio-TC.
"""
from __future__ import annotations

import vtk

from services.aneurysm_detector import _clean_region


def _dos_triangulos_uno_degenerado() -> vtk.vtkPolyData:
    """Un triángulo sano y otro con dos de SUS vértices en el mismo sitio."""
    pts = vtk.vtkPoints()
    for p in ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 1, 0.0), (1, 0, 0.0)):
        pts.InsertNextPoint(*p)
    polys = vtk.vtkCellArray()
    for tri in ((0, 1, 2), (1, 3, 4)):   # el 4 coincide con el 1: área cero
        polys.InsertNextCell(3, tri)
    poly = vtk.vtkPolyData(); poly.SetPoints(pts); poly.SetPolys(polys)
    return poly


def _avisos_vtk():
    w = vtk.vtkStringOutputWindow()
    vtk.vtkOutputWindow.SetInstance(w)
    return w


class TestLaRegionLimpia:
    def test_sin_limpiar_el_clean_deja_una_linea_y_mass_properties_avisa(self):
        cl = vtk.vtkCleanPolyData(); cl.SetInputData(_dos_triangulos_uno_degenerado()); cl.Update()
        tipos = {cl.GetOutput().GetCellType(i) for i in range(cl.GetOutput().GetNumberOfCells())}
        assert vtk.VTK_LINE in tipos, "la premisa: el clean convierte el degenerado en línea"
        w = _avisos_vtk()
        m = vtk.vtkMassProperties(); m.SetInputData(cl.GetOutput()); m.Update()
        assert "VTK_TRIANGLE" in w.GetOutput()

    def test_la_region_limpia_solo_tiene_triangulos_y_no_avisa(self):
        region = _clean_region(_dos_triangulos_uno_degenerado())
        tipos = {region.GetCellType(i) for i in range(region.GetNumberOfCells())}
        assert tipos == {vtk.VTK_TRIANGLE}
        assert region.GetNumberOfCells() == 1 and region.GetNumberOfPoints() == 3
        w = _avisos_vtk()
        m = vtk.vtkMassProperties(); m.SetInputData(region); m.Update()
        assert w.GetOutput() == ""
        assert abs(m.GetSurfaceArea() - 0.5) < 1e-9
