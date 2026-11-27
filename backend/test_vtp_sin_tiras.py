"""Las mallas que llegan al visor no llevan tiras de triángulos.

vtk.js (36.x) lanza al seleccionar un punto sobre una malla con polígonos y
tiras a la vez, y un tubo con tapas es exactamente eso. Con un stent desplegado,
los tres clics del flow diverter no marcaban nada (ensayo del 27-11).
"""
import vtk

from services.segmentation import read_vtp, write_vtp


def _tubo_con_tapas() -> vtk.vtkPolyData:
    """Un tubo (tiras) unido a una superficie de triángulos: polígonos y tiras
    en la misma malla, como el stent trenzado con sus extremos."""
    linea = vtk.vtkLineSource()
    linea.SetPoint1(0.0, 0.0, 0.0)
    linea.SetPoint2(0.0, 0.0, 10.0)
    linea.SetResolution(10)
    tubo = vtk.vtkTubeFilter()
    tubo.SetInputConnection(linea.GetOutputPort())
    tubo.SetRadius(2.0)
    tubo.SetNumberOfSides(12)
    tubo.Update()
    tapa = vtk.vtkDiskSource()
    tapa.SetOuterRadius(2.0)
    tapa.SetInnerRadius(0.0)
    tapa.Update()
    unir = vtk.vtkAppendPolyData()
    unir.AddInputData(tubo.GetOutput())
    unir.AddInputData(tapa.GetOutput())
    unir.Update()
    return unir.GetOutput()


def test_un_tubo_con_tapas_se_escribe_en_triangulos(tmp_path):
    tubo = _tubo_con_tapas()
    assert tubo.GetNumberOfStrips() > 0 and tubo.GetNumberOfPolys() > 0  # el caso que rompía

    write_vtp(tubo, tmp_path / "stent.vtp")
    leido = read_vtp(tmp_path / "stent.vtp")

    assert leido.GetNumberOfStrips() == 0
    assert leido.GetNumberOfPolys() > 0
    assert leido.GetBounds() == tubo.GetBounds()


def test_una_malla_sin_tiras_sale_igual(tmp_path):
    esfera = vtk.vtkSphereSource()
    esfera.Update()
    original = esfera.GetOutput()

    write_vtp(original, tmp_path / "saco.vtp")
    leido = read_vtp(tmp_path / "saco.vtp")

    assert leido.GetNumberOfPoints() == original.GetNumberOfPoints()
    assert leido.GetNumberOfPolys() == original.GetNumberOfPolys()
