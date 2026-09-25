r"""Genera frontend/public/models/maniqui.vtp: figura humana de baja resolución
en LPS (x = izquierda del paciente, y = posterior, z = superior), ~1 unidad de
alto, con la cara marcada por una nariz para que se distinga anterior.

Se ejecuta una vez; el .vtp resultante se versiona (el navegador lo carga
desde /models/maniqui.vtp para el recuadro de orientación).

    cd backend && .venv\Scripts\python scripts\make_manikin.py
"""
from pathlib import Path

import vtk


def part(src, tx=0.0, ty=0.0, tz=0.0, rx=0.0):
    # Transformación en premultiplicación: primero rota, luego traslada.
    t = vtk.vtkTransform()
    t.Translate(tx, ty, tz)
    t.RotateX(rx)
    f = vtk.vtkTransformFilter()
    f.SetInputConnection(src.GetOutputPort())
    f.SetTransform(t)
    f.Update()
    return f.GetPolyDataOutput()


app = vtk.vtkAppendPolyData()
head = vtk.vtkSphereSource()
head.SetRadius(0.11); head.SetThetaResolution(16); head.SetPhiResolution(12)
app.AddInputData(part(head, tz=0.82))
nose = vtk.vtkConeSource()
nose.SetRadius(0.03); nose.SetHeight(0.08); nose.SetResolution(8); nose.SetDirection(0, -1, 0)
app.AddInputData(part(nose, ty=-0.12, tz=0.82))                 # anterior = −y
torso = vtk.vtkCylinderSource()
torso.SetRadius(0.16); torso.SetHeight(0.42); torso.SetResolution(14)
app.AddInputData(part(torso, tz=0.48, rx=90))                   # eje del cilindro (y) a z
for sx in (-1, 1):
    arm = vtk.vtkCylinderSource()
    arm.SetRadius(0.05); arm.SetHeight(0.38); arm.SetResolution(8)
    app.AddInputData(part(arm, tx=sx * 0.24, tz=0.5, rx=90))
    leg = vtk.vtkCylinderSource()
    leg.SetRadius(0.07); leg.SetHeight(0.42); leg.SetResolution(8)
    app.AddInputData(part(leg, tx=sx * 0.08, tz=0.06, rx=90))
app.Update()
# Las tapas de los cilindros son polígonos: se triangulan para que el
# mapper de vtk.js no tenga que hacerlo y el recuento sea de triángulos.
tri = vtk.vtkTriangleFilter(); tri.SetInputConnection(app.GetOutputPort())
normals = vtk.vtkPolyDataNormals(); normals.SetInputConnection(tri.GetOutputPort()); normals.Update()
out = Path(__file__).resolve().parents[2] / "frontend" / "public" / "models" / "maniqui.vtp"
out.parent.mkdir(parents=True, exist_ok=True)
w = vtk.vtkXMLPolyDataWriter()
w.SetFileName(str(out)); w.SetInputData(normals.GetOutput()); w.SetDataModeToBinary()
# Sin compresión: el lector XML de vtk.js descomprime zlib, pero así el
# fichero no depende de ello y sigue siendo pequeño.
w.SetCompressorTypeToNone()
w.Write()
print("wrote", out, normals.GetOutput().GetNumberOfPolys(), "triangles")
