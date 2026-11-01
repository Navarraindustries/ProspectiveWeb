"""Case 3: segmentacion tubular + deteccion por el MISMO camino que la app.

Segmentacion: `routers.segment.segment_tubular` con los valores de la interfaz
(umbral automatico, suavizado nivel 3, sin techo en XA) y despues
`keep_main_tree` (casilla «solo el arbol», activada por defecto en el panel).
Deteccion: `routers.detect._detect_hits(top=_DETECT_TOP)` + vetos
(`services.candidate_vetoes.evaluate`) + tope `_MAX_CANDIDATES`, como
`_run_detection_sync`. Escribe la malla y los parches en work/ y un JSON.
"""
import sys, json, math, time
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import BACKEND, WORK, MEDIA, CASE3, PW
sys.path.insert(0, str(BACKEND))
from services.vtk_output import quiet_vtk_output_window
quiet_vtk_output_window()
W = WORK
GT = (62.0, 64.0, 63.0)   # test_detector_case3.GT_BASILAR, mm de la malla (x, y, z)
TOL_MM = 10.0             # test_detector_case3.TOL_MM

from services.dicom_loader import load_series, scan_series
from services.segmentation import level_to_smooth_iters, write_vtp
from services.mesh_components import keep_main_tree
from routers.segment import segment_tubular
import routers.detect as rd
from services.aneurysm_consensus import hit_confidence, hit_diameter_mm, hit_patch
from services.candidate_vetoes import evaluate

t0 = time.perf_counter()
ser = scan_series(CASE3)
dcm = load_series(ser[0]["series_uid"], CASE3)
print("cargado", dcm.modality, dcm.volume.shape, dcm.spacing, flush=True)
poly, info = segment_tubular(dcm, lower=None, upper=0.0,
                             smooth_iters=level_to_smooth_iters(3), memory_guard=False)
for k in ("mask_stats", "seg_spacing", "seg_volume"):
    info.pop(k, None)
print("malla", info["vertices"], "v", info["components"], "piezas",
      round(time.perf_counter() - t0), "s", flush=True)
write_vtp(poly, W / "case3_full.vtp")
mt = keep_main_tree(poly)
print("arbol aplicado", mt.applied, mt.n_before, "->", mt.n_after, mt.warning, flush=True)
tree = mt.poly if mt.applied else poly
write_vtp(tree, W / "case3_tree.vtp")

hits, det = rd._detect_hits(tree, dcm.modality, rd._detector_for_modality(dcm.modality),
                            None, top=rd._DETECT_TOP)
accepted, rejected = [], []
for h in hits:
    patch, kind = hit_patch(tree, h)
    veto = evaluate(tree, h, patch, kind)
    if veto is not None:
        rejected.append((h, patch, kind, veto))
    elif len(accepted) < rd._MAX_CANDIDATES:
        accepted.append((h, patch, kind, None))

def rec(i, h, patch, kind, veto):
    d = math.dist(h.position, GT)
    return {"puesto": i, "position": [round(float(x), 2) for x in h.position],
            "channels": list(h.channels), "ranks": dict(h.ranks),
            "diameter_mm": round(float(hit_diameter_mm(h)), 3),
            "confidence": round(float(hit_confidence(h)), 3),
            "patch_kind": kind, "dist_gt_mm": round(d, 2), "lesion": d <= TOL_MM,
            "veto": None if veto is None else {"reason": veto.reason, "detail": veto.detail}}

out = {"modality": dcm.modality, "spacing": list(dcm.spacing), "shape": list(dcm.volume.shape),
       "segment": info, "tree": {"applied": mt.applied, "n_before": mt.n_before, "n_after": mt.n_after},
       "gt_mm": GT, "accepted": [], "rejected": [], "all_hits": []}
for i, (h, patch, kind, veto) in enumerate(accepted, 1):
    out["accepted"].append(rec(i, h, patch, kind, veto))
    write_vtp(patch, W / f"cand_{i:03d}.vtp")
for i, (h, patch, kind, veto) in enumerate(rejected, 1):
    out["rejected"].append(rec(i, h, patch, kind, veto))
for i, h in enumerate(hits, 1):
    out["all_hits"].append({"rank": i, "position": [round(float(x), 2) for x in h.position],
                            "channels": list(h.channels), "dist_gt_mm": round(math.dist(h.position, GT), 2)})
out["seconds"] = round(time.perf_counter() - t0, 1)
json.dump(out, open(W / "case3_detect.json", "w"), indent=1, default=str)
for c in out["accepted"]:
    print(c["puesto"], c["channels"], c["diameter_mm"], c["dist_gt_mm"], c["lesion"], c["patch_kind"])
print("vetados", [(c["position"], c["veto"]["reason"]) for c in out["rejected"]])
print("total", out["seconds"], "s")
