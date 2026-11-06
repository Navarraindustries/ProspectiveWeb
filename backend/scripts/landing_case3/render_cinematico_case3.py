"""Render cinemático de Case 3 para la landing: volumen nativo 384³, sin límite de tiempo.

Mismo principio que el visor (dispersión de luz sobre el volumen), pero con todo el
volumen, un paso de muestreo muy fino y el tamaño que haga falta. Solo imagen de
presentación: el color es una elección, no tejido medido.

  python render_cinematico_case3.py --dicom "<carpeta XA de Case 3>" --out salida.png
      [--size 1400x1000] [--ss 1] [--paso 0.12] [--mezcla 0.5] [--alcance 0.3]
      [--dir 0.18,0.22,1] [--dist 150] [--umbral 1300] [--cache vol.npy]

Ejes (explore_case3.py): el array (k, j, i) crece hacia anterior, superior e izquierda;
+x izquierda, +y superior, +z anterior, como la malla. Lesión: GT basilar (62, 64, 63) mm.
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np

BACK = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--dicom", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--cache", default="")
ap.add_argument("--backend", default=str(BACK))
ap.add_argument("--size", default="1400x1000")
ap.add_argument("--ss", type=int, default=1)
ap.add_argument("--baldosas", type=int, default=1, help="multiplica el tamaño dibujando por trozos")
ap.add_argument("--paso", type=float, default=0.12)
ap.add_argument("--mezcla", type=float, default=0.5)
ap.add_argument("--alcance", type=float, default=0.3)
ap.add_argument("--anisotropia", type=float, default=0.0)
ap.add_argument("--dir", default="0.18,0.22,1")
ap.add_argument("--dist", type=float, default=150.0)
ap.add_argument("--angulo", type=float, default=30.0)
ap.add_argument("--umbral", type=float, default=1300.0)
ap.add_argument("--foco", default="62,64,63")
ap.add_argument("--arbol", type=float, default=0.0, help="deja solo la pieza mayor por encima de este valor")
ap.add_argument("--suavizado", type=float, default=0.0, help="sigma en vóxeles")
args = ap.parse_args()
sys.path.insert(0, args.backend)

from services.vtk_output import quiet_vtk_output_window  # noqa: E402
quiet_vtk_output_window()
import vtk  # noqa: E402
from vtk.util import numpy_support as ns  # noqa: E402
from PIL import Image  # noqa: E402

ESPACIADO = 0.3223


def volumen() -> np.ndarray:
    c = Path(args.cache) if args.cache else None
    if c and c.exists():
        return np.load(c)
    from services.dicom_loader import load_series, scan_series
    carpeta = Path(args.dicom)
    ser = scan_series(carpeta)
    v = np.asarray(load_series(ser[0]["series_uid"], carpeta).volume).astype(np.float32)
    if c:
        np.save(c, v)
    return v


v = volumen()
print("volumen", v.shape, v.dtype, float(v.min()), float(v.max()), flush=True)
if args.suavizado > 0 or args.arbol > 0:
    from scipy import ndimage
if args.suavizado > 0:
    v = ndimage.gaussian_filter(v, args.suavizado)
if args.arbol > 0:
    # El ruido de la base del cráneo son piezas sueltas: fuera de la pieza mayor
    # (con un margen, para no recortar la pared del vaso) el volumen se apaga.
    etiquetas, n = ndimage.label(v > args.arbol)
    tam = np.bincount(etiquetas.ravel())
    tam[0] = 0
    mayor = etiquetas == int(tam.argmax())
    print("piezas", n, "mayor", int(tam.max()), "vóxeles", flush=True)
    margen = ndimage.binary_dilation(mayor, iterations=3)
    v = np.where(margen, v, np.float32(args.umbral - 400))
    del etiquetas, mayor, margen
nz, ny, nx = v.shape
img = vtk.vtkImageData()
img.SetDimensions(nx, ny, nz)
img.SetSpacing(ESPACIADO, ESPACIADO, ESPACIADO)
sc = ns.numpy_to_vtk(np.ascontiguousarray(v).ravel(), deep=False, array_type=vtk.VTK_FLOAT)
sc.SetName("v")
img.GetPointData().SetScalars(sc)

u = args.umbral
color = vtk.vtkColorTransferFunction()
for x, r, g, b in [(u - 200, .30, .06, .06), (u + 100, .62, .17, .15), (u + 500, .90, .50, .40),
                   (u + 1300, 1.0, .80, .68), (u + 2300, 1.0, .95, .90)]:
    color.AddRGBPoint(x, r, g, b)
op = vtk.vtkPiecewiseFunction()
for x, a in [(u - 200, 0), (u, .02), (u + 250, .45), (u + 700, .92), (u + 2300, 1.0)]:
    op.AddPoint(x, a)

prop = vtk.vtkVolumeProperty()
prop.SetColor(color)
prop.SetScalarOpacity(op)
prop.SetInterpolationTypeToLinear()
prop.ShadeOn()
prop.SetAmbient(0.22)
prop.SetDiffuse(0.85)
prop.SetSpecular(0.35)
prop.SetSpecularPower(28)
prop.SetScatteringAnisotropy(args.anisotropia)

mapper = vtk.vtkGPUVolumeRayCastMapper()
mapper.SetInputData(img)
mapper.SetBlendModeToComposite()
mapper.SetAutoAdjustSampleDistances(0)
mapper.SetSampleDistance(args.paso)
mapper.SetImageSampleDistance(1.0)
mapper.SetVolumetricScatteringBlending(args.mezcla)
mapper.SetGlobalIlluminationReach(args.alcance)

vol = vtk.vtkVolume()
vol.SetMapper(mapper)
vol.SetProperty(prop)

ren = vtk.vtkRenderer()
ren.SetBackground(0.043, 0.047, 0.059)   # el mismo fondo que tenía hero-3d.webp
ren.AddVolume(vol)
foco = np.array([float(x) for x in args.foco.split(",")])
d = np.array([float(x) for x in args.dir.split(",")])
d /= np.linalg.norm(d)
cam = ren.GetActiveCamera()
cam.SetFocalPoint(*foco)
cam.SetPosition(*(foco + args.dist * d))
cam.SetViewUp(0, 1, 0)
cam.OrthogonalizeViewUp()
cam.SetViewAngle(args.angulo)
ren.ResetCameraClippingRange()

ren.RemoveAllLights()
luz = vtk.vtkLight()
luz.SetLightTypeToCameraLight()
luz.SetPosition(-0.6, 0.9, 1.0)
luz.SetFocalPoint(0, 0, 0)
luz.SetIntensity(1.15)
luz.SetColor(1.0, 0.97, 0.93)
ren.AddLight(luz)

w, h = (int(x) * args.ss for x in args.size.split("x"))
win = vtk.vtkRenderWindow()
win.SetOffScreenRendering(1)
win.SetMultiSamples(0)
win.SetSize(w, h)
win.AddRenderer(ren)
t = time.perf_counter()
win.Render()
print("render", round(time.perf_counter() - t, 1), "s", flush=True)
f = vtk.vtkWindowToImageFilter()
f.SetInput(win)
# Por baldosas: a 2800 × 2000 de una vez la tarjeta devolvía la imagen en negro.
f.SetScale(args.baldosas, args.baldosas)
f.SetInputBufferTypeToRGB()
f.ReadFrontBufferOff()
f.Update()
o = f.GetOutput()
dims = o.GetDimensions()
a = ns.vtk_to_numpy(o.GetPointData().GetScalars()).reshape(dims[1], dims[0], -1)[::-1]
im = Image.fromarray(np.ascontiguousarray(a[:, :, :3]))
if args.ss > 1:
    im = im.resize((im.width // args.ss, im.height // args.ss), Image.LANCZOS)
im.save(args.out)
print("escrito", args.out, im.size, flush=True)
