import os, json, glob
import numpy as np
import SimpleITK as sitk
import vtk
from vtk.util.numpy_support import vtk_to_numpy
from PIL import Image

# Fotogramas del hero de la landing (rediseño D): cortes axiales reales del caso
# Zenodo 036 (CC-BY, anonimizado) y render 3D con la lesión. Salida en
# frontend/public/media/landing/. Requiere el DICOM local en «Archivos DICOM».
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DCM = os.path.join(ROOT, "Archivos DICOM", "Studies", "036")
STL = os.path.join(ROOT, "Archivos DICOM", "Annotations", "an_036.stl")
OUT = os.path.join(ROOT, "frontend", "public", "media", "landing")
HERO = os.path.join(OUT, "hero")
os.makedirs(HERO, exist_ok=True)

VESSEL = None
for d in ("zenodo_eval_full_p6_head", "zenodo_eval_shell", "zenodo_eval_saco"):
    p = os.path.join(ROOT, "backend", "data", d, "meshes", "036.vtp")
    if os.path.exists(p):
        VESSEL = p
        break
print("vessel mesh:", VESSEL)

print("[1] reading DICOM")
r = sitk.ImageSeriesReader()
r.SetFileNames(r.GetGDCMSeriesFileNames(DCM))
img = r.Execute()
arr = sitk.GetArrayFromImage(img).astype(np.float32)  # z,y,x
n = arr.shape[0]
print("size", img.GetSize(), "spacing", img.GetSpacing(), "dir", img.GetDirection())
# anterior up: determine whether row index increases toward anterior (LPS: y increases anterior)
D = np.array(img.GetDirection()).reshape(3, 3)
row_axis_y = D[1, 1]  # y-physical change along image row index (y index)
flip_ud = False  # row index increasing toward anterior => anterior at bottom => flip
col_x = D[0, 0]
flip_lr = col_x > 0  # radiological: patient's left (+x in LPS) on image right -> x index up toward L is on right; want L on right => no flip when col_x>0
flip_lr = False if col_x > 0 else True
print("flip_ud", flip_ud, "flip_lr", flip_lr)

print("[2] lesion")
sr = vtk.vtkSTLReader(); sr.SetFileName(STL); sr.Update()
lesion = sr.GetOutput()
b = lesion.GetBounds()
c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]
diam = round(max(b[1] - b[0], b[3] - b[2], b[5] - b[4]), 1)
idx = img.TransformPhysicalPointToIndex(c)
les = int(idx[2])
print("center", c, "index", idx, "diam", diam)

def head_mask(sl):
    m = sitk.GetImageFromArray((sl > -300).astype(np.uint8))
    cc = sitk.RelabelComponent(sitk.ConnectedComponent(m))
    return sitk.GetArrayFromImage(cc) == 1

first = None
for i in range(60, n):
    hm = head_mask(arr[i])
    a = hm.sum()
    if a > 0 and ((arr[i] > 300) & hm).sum() > 0.15 * a:
        first = i
        break
print("first skull slice", first)
cand = [int(round(v)) for v in np.linspace(first, les, 60)]
cand[-1] = les
k = 59
cand_sorted_ok = all(cand[i] < cand[i + 1] for i in range(59))
print("lesionFrame", k, "monotonic", cand_sorted_ok)

print("[3] slices")
def render(i, q):
    s = arr[i]
    u = np.clip((s - (60 - 300)) / 600.0, 0, 1)
    u8 = (u * 255).astype(np.uint8)
    m = head_mask(s)
    ys, xs = np.where(m)
    sp = img.GetSpacing()
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    # square in physical terms: use pixel units (spacing x/y usually equal)
    side = max(y1 - y0, x1 - x0) * 1.12
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    side = int(round(min(side, max(u8.shape))))
    ty = int(round(cy - side / 2)); tx = int(round(cx - side / 2))
    ty = max(0, min(ty, u8.shape[0] - side)); tx = max(0, min(tx, u8.shape[1] - side))
    crop = u8[ty:ty + side, tx:tx + side]
    if flip_ud: crop = crop[::-1]
    if flip_lr: crop = crop[:, ::-1]
    im = Image.fromarray(np.ascontiguousarray(crop)).resize((1024, 1024), Image.LANCZOS)
    return im

def write_all(q):
    for f, i in enumerate(cand):
        render(i, q).save(os.path.join(HERO, "%03d.webp" % f), "WEBP", quality=q)
        if f % 10 == 0: print("  frame", f, "slice", i)

def folder_mb():
    t = 0
    for dp, _, fs in os.walk(OUT):
        for f in fs: t += os.path.getsize(os.path.join(dp, f))
    return t / 1e6

Q = 78
write_all(Q)

print("[4] 3D")
def rd(path):
    if path.lower().endswith(".stl"):
        x = vtk.vtkSTLReader()
    else:
        x = vtk.vtkXMLPolyDataReader()
    x.SetFileName(path); x.Update()
    nrm = vtk.vtkPolyDataNormals(); nrm.SetInputConnection(x.GetOutputPort()); nrm.Update()
    return nrm.GetOutput()

vm = rd(VESSEL); lm = rd(STL)
# vessel mesh lives in image-origin-relative mm (not patient mm): shift lesion into that frame
org = img.GetOrigin()
sh = [-org[0], -org[1], -org[2]]
print("origin", org)
tf = vtk.vtkTransform(); tf.Translate(*sh)
tp = vtk.vtkTransformPolyDataFilter(); tp.SetInputData(lm); tp.SetTransform(tf); tp.Update()
lm = tp.GetOutput()
cb = lm.GetBounds()
c = [(cb[0]+cb[1])/2, (cb[2]+cb[3])/2, (cb[4]+cb[5])/2]
print("lesion center in mesh frame", c)
def actor(pd, col, spec):
    mp = vtk.vtkPolyDataMapper(); mp.SetInputData(pd); mp.ScalarVisibilityOff()
    a = vtk.vtkActor(); a.SetMapper(mp)
    p = a.GetProperty(); p.SetColor(*col); p.SetSpecular(spec); p.SetSpecularPower(30)
    return a

def render3d(name, wide, q):
    ren = vtk.vtkRenderer(); ren.SetBackground(0.043, 0.047, 0.059)
    ren.AddActor(actor(vm, (0.82, 0.84, 0.88), 0.2))
    ren.AddActor(actor(lm, (1.0, 0.30, 0.37), 0.2))
    w = vtk.vtkRenderWindow(); w.SetOffScreenRendering(1); w.SetSize(1400, 1000); w.AddRenderer(ren)
    cam = ren.GetActiveCamera()
    if wide:
        ren.ResetCamera()
        cam.SetViewUp(0, 0, 1)
    else:
        cam.SetFocalPoint(*c)
        cam.SetPosition(c[0], c[1] - 180, c[2] + 45)
        cam.SetViewUp(0, 0, 1)
        ren.ResetCameraClippingRange()
    ren.ResetCameraClippingRange()
    w.Render()
    f = vtk.vtkWindowToImageFilter(); f.SetInput(w); f.ReadFrontBufferOff(); f.Update()
    o = f.GetOutput(); dims = o.GetDimensions()
    a = vtk_to_numpy(o.GetPointData().GetScalars()).reshape(dims[1], dims[0], -1)[::-1]
    Image.fromarray(np.ascontiguousarray(a[:, :, :3])).save(os.path.join(OUT, name), "WEBP", quality=q)
    w.Finalize()
    print("  saved", name)

render3d("hero-3d.webp", False, 82)
render3d("hero-3d-wide.webp", True, 82)

print("[5] json")
meta = {"count": 60, "total": n, "lesionFrame": k, "lesionSlice": les,
        "window": {"w": 600, "l": 60},
        "frames": ["%03d.webp" % i for i in range(60)], "sliceOf": cand,
        "lesion": {"diameterMm": diam, "neckMm": None}}
json.dump(meta, open(os.path.join(OUT, "hero.json"), "w"), indent=1)

mb = folder_mb(); print("total MB %.2f" % mb)
if mb > 6:
    print("over 6 MB, re-saving at q70")
    write_all(70)
    render3d("hero-3d.webp", False, 70); render3d("hero-3d-wide.webp", True, 70)
    print("total MB %.2f" % folder_mb())
