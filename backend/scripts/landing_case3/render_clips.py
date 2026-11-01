"""Un render por serie NAVARRO (T1 recto, T2 curvo, T3 angulado 45, T4 fenestrado),
del STL del repositorio (`NAVARRO™ - Variantes`, la carpeta que lee
`services/navarro.py::library_root`). Material metalico sobrio (Phong con
especular alto, gris acero), fondo transparente, 1200x1200 (600 CSS a 2x).
Encuadre: ejes principales (PCA) de la pieza; la camara mira por el eje de
menor varianza (perfil) con un giro de tres cuartos, y el eje largo en diagonal.

Uso: python render_clips.py [--preview]
"""
import sys, json, argparse
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import BACKEND, WORK, MEDIA, CASE3, PW
sys.path.insert(0, str(BACKEND))
from services.vtk_output import quiet_vtk_output_window
quiet_vtk_output_window()
import vtk
from vtk.util.numpy_support import vtk_to_numpy
from render_util import read_poly, actor, render_rgba, save_webp

ap = argparse.ArgumentParser(); ap.add_argument("--preview", action="store_true")
args = ap.parse_args()
LIB = PW / "NAVARRO™ - Variantes"
OUT = MEDIA / "clips"; OUT.mkdir(parents=True, exist_ok=True)
CLIPS = [
    ("navarro-t1-recto.webp", LIB / "NAVARRO™ T1 — Straight" / "STL" / "NAVARRO™ T1 — Straight (13mm).stl"),
    ("navarro-t2-curvo.webp", LIB / "NAVARRO™ T2 — Curved" / "NAVARRO™ T2 — Curved(13mm).stl"),
    ("navarro-t3-angulado-45.webp", LIB / "NAVARRO™ T3 — Angled" / "45°" / "STL" / "NAVARRO™ T3 — Angled 45° (13mm).stl"),
    ("navarro-t4-fenestrado.webp", LIB / "NAVARRO™ T4 — Fenestrated" / "NAVARRO™ T4 — Fenestrated (13x5mm).stl"),
]
STEEL = (0.78, 0.80, 0.84)
report = {}
for name, path in CLIPS:
    pd = read_poly(path)
    P = vtk_to_numpy(pd.GetPoints().GetData()).astype(float)
    c = P.mean(axis=0)
    ev, evec = np.linalg.eigh(np.cov((P - c).T))   # ascendente
    a_long, a_mid, a_thin = evec[:, 2], evec[:, 1], evec[:, 0]
    ren = vtk.vtkRenderer()
    ren.AddActor(actor(pd, STEEL, ambient=0.18, diffuse=0.55, specular=0.9, power=70))
    ren.RemoveAllLights()
    for pos, inten, col in (((1, 1, 1.2), 1.0, (1, 0.98, 0.95)), ((-1, 0.2, 0.5), 0.35, (0.8, 0.9, 1.0)),
                            ((0.2, -1, -0.8), 0.6, (0.6, 0.85, 1.0))):
        L = vtk.vtkLight(); L.SetLightTypeToCameraLight(); L.SetPosition(*pos); L.SetFocalPoint(0, 0, 0)
        L.SetIntensity(inten); L.SetColor(*col); ren.AddLight(L)
    cam = ren.GetActiveCamera()
    cam.SetFocalPoint(*c)
    cam.SetPosition(*(c + 100 * a_thin))
    cam.SetViewUp(*a_mid)
    ren.ResetCamera()
    cam.Azimuth(28); cam.Elevation(18); cam.OrthogonalizeViewUp()
    cam.Roll(-35)
    ren.ResetCamera(); cam.Zoom(1.25); ren.ResetCameraClippingRange()
    size = (600, 600) if args.preview else (1200, 1200)
    im = render_rgba(ren, size, ss=2)
    q, kb = save_webp(im, OUT / name, budget_kb=245, q0=88)
    b = pd.GetBounds()
    report[name] = {"stl": str(path.relative_to(LIB.parent)), "size": list(im.size), "q": q, "kb": round(kb, 1),
                    "extent_mm": [round(b[1] - b[0], 1), round(b[3] - b[2], 1), round(b[5] - b[4], 1)]}
    print(name, report[name])
json.dump(report, open(WORK / "render_clips_report.json", "w"), indent=1, ensure_ascii=False)
