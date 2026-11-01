"""Utilidades de render VTK fuera de pantalla para los assets de la landing.

- `render_rgb`: fondo opaco (p. ej. #050608), supermuestreo ×ss y reduccion LANCZOS.
- `render_rgba`: fondo transparente exacto: se pinta dos veces, sobre negro y
  sobre blanco, alpha = 1 - (blanco - negro); color = negro / alpha. Asi los
  bordes suavizados no arrastran halo del fondo.
"""
import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy
from PIL import Image

BG_DARK = (5 / 255, 6 / 255, 8 / 255)   # #050608


def read_poly(path):
    p = str(path)
    r = vtk.vtkSTLReader() if p.lower().endswith(".stl") else vtk.vtkXMLPolyDataReader()
    r.SetFileName(p)
    r.Update()
    n = vtk.vtkPolyDataNormals()
    n.SetInputData(r.GetOutput())
    n.SplittingOff()
    n.ConsistencyOn()
    n.AutoOrientNormalsOff()
    n.Update()
    return n.GetOutput()


def actor(pd, color, *, ambient=0.12, diffuse=0.85, specular=0.25, power=30.0,
          metallic=None, roughness=None, offset=False, opacity=1.0):
    m = vtk.vtkPolyDataMapper()
    m.SetInputData(pd)
    m.ScalarVisibilityOff()
    if offset:
        m.SetResolveCoincidentTopologyToPolygonOffset()
        m.SetRelativeCoincidentTopologyPolygonOffsetParameters(-2.0, -6.0)
    a = vtk.vtkActor()
    a.SetMapper(m)
    p = a.GetProperty()
    p.SetColor(*color)
    p.SetOpacity(opacity)
    if metallic is not None:
        p.SetInterpolationToPBR()
        p.SetMetallic(metallic)
        p.SetRoughness(roughness if roughness is not None else 0.35)
    else:
        p.SetInterpolationToPhong()
        p.SetAmbient(ambient)
        p.SetDiffuse(diffuse)
        p.SetSpecular(specular)
        p.SetSpecularPower(power)
    return a


def _grab(win):
    f = vtk.vtkWindowToImageFilter()
    f.SetInput(win)
    f.SetInputBufferTypeToRGB()
    f.ReadFrontBufferOff()
    f.Update()
    o = f.GetOutput()
    d = o.GetDimensions()
    return vtk_to_numpy(o.GetPointData().GetScalars()).reshape(d[1], d[0], -1)[::-1].astype(np.float32)


def _window(ren, w, h):
    win = vtk.vtkRenderWindow()
    win.SetOffScreenRendering(1)
    win.SetMultiSamples(0)
    win.SetSize(w, h)
    win.AddRenderer(ren)
    return win


def render_rgb(ren, size, ss=2, bg=BG_DARK):
    w, h = size
    ren.SetBackground(*bg)
    win = _window(ren, w * ss, h * ss)
    win.Render()
    a = _grab(win)
    win.Finalize()
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return im.resize((w, h), Image.LANCZOS) if ss != 1 else im


def render_rgba(ren, size, ss=2):
    w, h = size
    win = _window(ren, w * ss, h * ss)
    ren.SetBackground(0, 0, 0)
    win.Render()
    blk = _grab(win)
    ren.SetBackground(1, 1, 1)
    win.Render()
    wht = _grab(win)
    win.Finalize()
    alpha = 1.0 - (wht - blk).mean(axis=2) / 255.0
    alpha = np.clip(alpha, 0, 1)
    # premultiplicado = blk; reducir en premultiplicado y dividir al final
    if ss != 1:
        # reduccion en premultiplicado: canales RGB = color*alpha ya
        r = np.asarray(Image.fromarray(np.clip(blk, 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS), np.float32)
        al = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS), np.float32) / 255.0
    else:
        r, al = blk, alpha
    safe = np.where(al > 1e-3, al, 1.0)[..., None]
    rgb = np.clip(r / safe, 0, 255)
    out = np.dstack([rgb, al * 255.0])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def lights(ren, key=(1, 1, 1), fill=(-1, 0.3, 0.6), rim=(0, -1, -1), focal=(0, 0, 0)):
    """Tres luces de camara: clave, relleno y contraluz."""
    ren.RemoveAllLights()
    for pos, inten, col in ((key, 0.95, (1.0, 0.98, 0.95)), (fill, 0.35, (0.85, 0.92, 1.0)),
                            (rim, 0.55, (0.75, 0.9, 1.0))):
        L = vtk.vtkLight()
        L.SetLightTypeToCameraLight()
        L.SetPosition(*pos)
        L.SetFocalPoint(0, 0, 0)
        L.SetIntensity(inten)
        L.SetColor(*col)
        ren.AddLight(L)


def save_webp(im, path, budget_kb=250, q0=86, qmin=55, **kw):
    """Guarda en webp bajando la calidad hasta caber en el presupuesto."""
    import os
    q = q0
    while True:
        im.save(path, "WEBP", quality=q, method=6, **kw)
        kb = os.path.getsize(path) / 1024
        if kb <= budget_kb or q <= qmin:
            return q, kb
        q -= 4
