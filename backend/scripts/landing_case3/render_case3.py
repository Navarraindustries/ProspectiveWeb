"""Renders 3D de Case 3: hero-3d.webp (1400x1000, fondo como el actual, lesion
centrada al 50 %/50 % para la baliza de VentanaDeteccion) y vistas extra para
las secciones (RGBA transparente, 2x).

Malla: work/case3_tree.vtp (segment_tubular + keep_main_tree, ver
seg_detect_case3.py). Lesion: parche del candidato marcado `lesion` en
work/case3_detect.json (hit_patch de la app). Ejes de malla: +x izquierda,
+y superior, +z anterior.

Uso: python render_case3.py [--only hero|views|all] [--preview]
"""
import sys, json, argparse
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import BACKEND, WORK, asegurar_work, MEDIA, CASE3, PW
asegurar_work()
sys.path.insert(0, str(BACKEND))
from services.vtk_output import quiet_vtk_output_window
quiet_vtk_output_window()
import vtk
from render_util import read_poly, actor, render_rgb, render_rgba, lights, save_webp

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="all")
ap.add_argument("--preview", action="store_true")
args = ap.parse_args()

W = WORK
OUT = MEDIA
SEC = OUT / "secciones"
SEC.mkdir(parents=True, exist_ok=True)
det = json.load(open(W / "case3_detect.json"))
les = next(c for c in det["accepted"] if c["lesion"])
tree = read_poly(W / "case3_tree.vtp")
patch = read_poly(W / f"cand_{les['puesto']:03d}.vtp")
pb = patch.GetBounds()
C = np.array([(pb[0] + pb[1]) / 2, (pb[2] + pb[3]) / 2, (pb[4] + pb[5]) / 2])
print("lesion centroide parche", C.round(2), "posicion candidato", les["position"])
tb = tree.GetBounds()
TC = np.array([(tb[0] + tb[1]) / 2, (tb[2] + tb[3]) / 2, (tb[4] + tb[5]) / 2])

VESSEL = (0.82, 0.84, 0.88)
RED = (1.0, 0.30, 0.37)


def scene(focal, direction, dist, up=(0, 1, 0), angle=30.0, lesion=True, vessel=VESSEL):
    ren = vtk.vtkRenderer()
    ren.AddActor(actor(tree, vessel, specular=0.3, power=40))
    if lesion:
        ren.AddActor(actor(patch, RED, specular=0.3, power=40, offset=True))
    d = np.asarray(direction, float); d /= np.linalg.norm(d)
    cam = ren.GetActiveCamera()
    cam.SetFocalPoint(*focal)
    cam.SetPosition(*(np.asarray(focal) + dist * d))
    cam.SetViewUp(*up)
    cam.OrthogonalizeViewUp()
    cam.SetViewAngle(angle)
    ren.ResetCameraClippingRange()
    lights(ren)
    return ren


def project(ren, size, p):
    """Posicion en pantalla (fraccion) de un punto de mundo."""
    ren.SetActiveCamera(ren.GetActiveCamera())
    w, h = size
    win = vtk.vtkRenderWindow(); win.SetOffScreenRendering(1); win.SetSize(w, h); win.AddRenderer(ren)
    win.Render()
    ren.SetWorldPoint(*p, 1.0); ren.WorldToDisplay()
    x, y, _ = ren.GetDisplayPoint()
    win.RemoveRenderer(ren); win.Finalize()
    return x / w, 1 - y / h


report = {}
if args.only in ("hero", "all"):
    # Como el actual: de frente y algo desde arriba, la lesion en el centro.
    size = (1400, 1000)
    ren = scene(C, (0.18, 0.22, 1.0), 150.0)
    frac = project(ren, size, C)
    im = render_rgb(ren, size, ss=1 if args.preview else 2, bg=(0.043, 0.047, 0.059))
    q, kb = save_webp(im, OUT / "hero-3d.webp", budget_kb=250, q0=82)
    report["hero-3d.webp"] = {"size": size, "q": q, "kb": round(kb, 1),
                              "lesion_screen_frac": [round(frac[0], 3), round(frac[1], 3)]}
    print("hero-3d", report["hero-3d.webp"])

if args.only in ("views", "all"):
    ss = 1 if args.preview else 2
    VIEWS = [
        # nombre, direccion de camara, zoom tras encuadrar la malla entera (None = foco en la lesion a 55 mm)
        ("case3-frontal.webp", (0.0, 0.08, 1.0), 1.4),
        ("case3-oblicua.webp", (-0.85, 0.22, 0.5), 1.35),
        ("case3-saco.webp", (0.45, 0.35, 1.0), None),
    ]
    css = (800, 600)
    for name, d, zoom in VIEWS:
        size = (css[0] * 2 // (2 if args.preview else 1), css[1] * 2 // (2 if args.preview else 1))
        if zoom is None:
            ren = scene(C, d, 55.0)
        else:
            ren = scene(TC, d, 300.0)
            ren.ResetCamera()
            ren.GetActiveCamera().Zoom(zoom)
            ren.ResetCameraClippingRange()
        frac = project(ren, size, C)
        im = render_rgba(ren, size, ss=ss)
        q, kb = save_webp(im, SEC / name, budget_kb=245, q0=86)
        report[name] = {"size": list(im.size), "q": q, "kb": round(kb, 1), "lesion_screen_frac": [round(frac[0], 3), round(frac[1], 3)]}
        print(name, report[name])

prev = W / "render_case3_report.json"
old = json.load(open(prev)) if prev.exists() else {}
old.update(report)
json.dump(old, open(prev, "w"), indent=1)
