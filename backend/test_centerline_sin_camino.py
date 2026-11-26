"""Sin camino entre los dos puntos: el mensaje distingue vasos separados de un
paso más fino que la rejilla (en case 3, un puente de ~0,18 mm de la
segmentación partía la máscara aunque la malla era una sola pieza)."""
import numpy as np
import pytest
import vtk
from vtk.util.numpy_support import numpy_to_vtk

from services.centerline import extract_centerline, misma_pieza

PASO = 0.2


def _segmento(pts, a, b):
    ab = b - a
    s = np.clip((pts - a) @ ab / (ab @ ab), 0.0, 1.0)
    return np.linalg.norm(pts - (a + s[:, None] * ab), axis=1)


def _malla(tubos):
    """Superficie de la unión de tubos rectos [(a, b, radio)], por marching cubes
    sobre la distancia firmada mínima."""
    todos = np.array([p for a, b, _ in tubos for p in (a, b)], dtype=float)
    lo = todos.min(axis=0) - 3.0
    hi = todos.max(axis=0) + 3.0
    n = np.ceil((hi - lo) / PASO).astype(int) + 1
    gx, gy, gz = (lo[i] + np.arange(n[i]) * PASO for i in range(3))
    zz, yy, xx = np.meshgrid(gz, gy, gx, indexing="ij")
    pts = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel()])
    campo = np.min([_segmento(pts, np.array(a, float), np.array(b, float)) - r for a, b, r in tubos], axis=0)
    img = vtk.vtkImageData()
    img.SetDimensions(*map(int, n))
    img.SetSpacing(PASO, PASO, PASO)
    img.SetOrigin(*lo)
    img.GetPointData().SetScalars(numpy_to_vtk(campo.astype(np.float32), deep=True))
    mc = vtk.vtkFlyingEdges3D()
    mc.SetInputData(img)
    mc.SetValue(0, 0.0)
    mc.Update()
    nf = vtk.vtkPolyDataNormals()
    nf.SetInputConnection(mc.GetOutputPort())
    nf.SplittingOff(); nf.ConsistencyOn(); nf.AutoOrientNormalsOn()
    nf.Update()
    out = vtk.vtkPolyData()
    out.DeepCopy(nf.GetOutput())
    return out


def test_vasos_separados():
    m = _malla([((0, 0, 0), (20, 0, 0), 1.5), ((0, 8, 0), (20, 8, 0), 1.5)])
    assert not misma_pieza(m, (5, 0, 0), (5, 8, 0))
    with pytest.raises(ValueError, match="piezas separadas"):
        extract_centerline(m, (5, 0, 0), (5, 8, 0))


def test_paso_mas_fino_que_la_rejilla():
    m = _malla([((0, 0, 0), (14, 0, 0), 1.5), ((14, 0, 0), (18, 0, 0), 0.1), ((18, 0, 0), (32, 0, 0), 1.5)])
    assert misma_pieza(m, (4, 0, 0), (28, 0, 0))
    with pytest.raises(ValueError, match="paso de menos de 0.8 mm"):
        extract_centerline(m, (4, 0, 0), (28, 0, 0))


def test_mismo_vaso_si_hay_camino():
    m = _malla([((0, 0, 0), (30, 0, 0), 1.5)])
    res = extract_centerline(m, (4, 0, 0), (26, 0, 0))
    assert res.arc_length_mm == pytest.approx(22.0, rel=0.02)


def _hoja(z, x0, x1, y0, y1):
    p = vtk.vtkPlaneSource()
    p.SetOrigin(x0, y0, z); p.SetPoint1(x1, y0, z); p.SetPoint2(x0, y1, z)
    p.SetResolution(20, 20)
    t = vtk.vtkTriangleFilter(); t.SetInputConnection(p.GetOutputPort()); t.Update()
    return t.GetOutput()


def test_una_hoja_abierta_entre_dos_vasos_no_abre_camino_por_fuera():
    """Con vtkSelectEnclosedPoints, una hoja suelta entre dos tubos separados
    marcaba «dentro» el aire de alrededor y la línea cruzaba de un tubo a otro
    por fuera (hasta 3 mm). Con el relleno por cortes no hay camino."""
    ap = vtk.vtkAppendPolyData()
    ap.AddInputData(_malla([((0, 0, 0), (30, 0, 0), 1.5), ((0, 8, 0), (30, 8, 0), 1.5)]))
    ap.AddInputData(_hoja(0.0, 12, 18, -1, 9))
    ap.Update()
    m = vtk.vtkPolyData(); m.DeepCopy(ap.GetOutput())
    with pytest.raises(ValueError, match="No se encontró un camino"):
        extract_centerline(m, (4, 0, 0), (4, 8, 0))
