"""Experimento: ¿cómo se saca el hueso de la máscara tubular en una angio-TC?

Medido en la pasada «techo 700» (paso 2, sin banda) sobre 027 y 096: la pieza
mayor de la malla baja (246 → 195 cm³, 533 → 130 cm³) pero sigue siendo un
bloque, no un árbol, y la lesión que antes salía 3.ª cae por la puerta de
curvatura media. El techo se aplica tras rellenar y solo quita lo caliente
que asoma al exterior: el hueso cortical, envuelto por su propia cáscara de
volumen parcial (150–700 HU), queda «dentro de pared en rango», igual que el
centro brillante de un vaso en 3DRA, y no se va.

Variantes (misma receta tubular, mismo detector):
  techo700   lo que hace hoy el paso 2
  hueso1.5   sin techo; antes del núcleo se quitan los componentes > 700 HU de
             ≥ 500 mm³ (cráneo, no calcificaciones) dilatados 1,5 mm
  hueso1.0   igual con 1,0 mm
  hueso+techo hueso1.5 y techo 700

Uso (desde backend/): .venv/Scripts/python.exe -u scripts/exp_hueso_ct.py 027 096
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.bench_detector import failure_reason, match_rank, nearest_region  # noqa: E402
from scripts.eval_zenodo import (DEFAULT_DATASET, DEFAULT_OUT, _components_info,  # noqa: E402
                                 _stl_points_mesh, detect_long, load_study,
                                 server_downsample_factor, surface_recall, tissue_label, hu_stats)

#: Segunda tanda (código de producción: MaskParams.bone_*): la máscara de
#: hueso se llevaba la pared calcificada del saco trombosado de 096 (pegada al
#: cráneo), y con el hueso fuera la recuperación a 3 mm solo alcanza los
#: primeros 3 mm de un saco grande. Se mide erosión y radio de recuperación.
VARIANTS = {
    "prod":          dict(upper=700.0, bone_margin=1.5, erode=0.0, reclaim=3.0),
    "erode1.0":      dict(upper=700.0, bone_margin=1.5, erode=1.0, reclaim=3.0),
    "reclaim8":      dict(upper=700.0, bone_margin=1.5, erode=0.0, reclaim=8.0),
    "erode1.0+rec8": dict(upper=700.0, bone_margin=1.5, erode=1.0, reclaim=8.0),
}
BONE_HU = 700.0
BONE_MIN_MM3 = 500.0


def bone_mask(vol: np.ndarray, spacing, margin_mm: float) -> np.ndarray:
    hot = vol > BONE_HU
    lab, n = ndimage.label(hot)
    if n == 0:
        return np.zeros_like(hot)
    vox_mm3 = float(np.prod(spacing))
    counts = np.bincount(lab.ravel())
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = counts[1:] * vox_mm3 >= BONE_MIN_MM3
    big = keep[lab]
    it = max(1, int(np.ceil(margin_mm / min(spacing))))
    return ndimage.binary_dilation(big, iterations=it)


def run(sid: str, dataset: Path, log=print) -> dict:
    from routers.segment import _downsample_by
    from services.segmentation import mask_to_surface
    from services.thresholds import compute_auto_thresholds
    from services.vascular_mask import MaskParams, build_vascular_mask

    rec = json.loads((DEFAULT_OUT / f"{sid}.json").read_text(encoding="utf-8"))
    dcm, _ = load_study(dataset, sid)
    lower, _, _ = compute_auto_thresholds(volume=dcm.volume, modality=dcm.modality,
                                          window_center=dcm.window_center, window_width=dcm.window_width)
    f = server_downsample_factor(dcm.volume.shape)
    vol, sp, _ = _downsample_by(dcm.volume, dcm.spacing, f) if f > 1 else (dcm.volume, tuple(dcm.spacing), 1)
    vol = np.ascontiguousarray(vol, dtype=np.float32)
    origin = tuple(rec["frame"]["origin_mm"]); direction = tuple(rec["frame"]["direction"])
    lesions = rec["lesions"]
    out = {"study": sid, "factor": f, "lower": lower, "variants": {}}
    log(f"── {sid}: factor {f}, umbral {lower:.0f}, {vol.shape}")
    for name, v in VARIANTS.items():
        t0 = time.perf_counter()
        mr = build_vascular_mask(vol, sp, MaskParams(
            lower=lower, upper=v["upper"], reclaim_mm=v["reclaim"],
            bone_hu=BONE_HU if v["bone_margin"] > 0 else 0.0, bone_min_mm3=BONE_MIN_MM3,
            bone_margin_mm=v["bone_margin"], bone_erode_mm=v["erode"]))
        bone_mm3 = float(mr.stats.get("bone_vox", 0)) * float(np.prod(sp))
        poly = mask_to_surface(mr.mask, sp, smooth_iters=40, pass_band=0.05)
        ci = _components_info(poly)
        hits, det = detect_long(poly, dcm.modality)
        les = []
        for l in lesions:
            pos = tuple(l["position"])
            pts = _stl_points_mesh(dataset / "Annotations" / l["file"], origin, direction)
            rank, hit = match_rank(pos, hits)
            near = nearest_region(pos, det.regions)
            les.append({"file": l["file"], "rank": rank,
                        "reason": None if rank else failure_reason(pos, l["diameter_mm"], det.regions),
                        "recall": round(surface_recall(pts, poly, 1.5 * max(sp)), 3),
                        "region_dist_mm": round(float(np.linalg.norm(np.asarray(near.centroid) - pos)), 1) if near else None})
        tissues = []
        for h in hits[:5]:
            st = hu_stats(vol, sp, h.position, 2.5)
            tissues.append(tissue_label(*st) if st else None)
        res = {"bone_removed_cm3": round(bone_mm3 / 1000, 1), "mask_cm3": round(mr.stats["final_vox"] * float(np.prod(sp)) / 1000, 1),
               "seeds": mr.stats.get("seeds"), "fallback": mr.fallback, "vertices": int(poly.GetNumberOfPoints()),
               "components": ci, "channels_on": sorted({c for h in hits for c in h.channels}),
               "n_hits": len(hits), "regions_ok": len(det.candidates), "top5_tissue": tissues,
               "lesions": les, "seconds": round(time.perf_counter() - t0, 1)}
        out["variants"][name] = res
        log(f"   {name:12s} hueso−{res['bone_removed_cm3']} cm³ máscara {res['mask_cm3']} cm³ · main {ci.get('main_volume_cm3')} cm³ "
            f"grosor {ci.get('main_thickness_mm')} árbol={ci.get('tree')} · {res['vertices']} v · canales {res['channels_on']} · "
            f"top5 {tissues} · lesiones {[(l['rank'], l['reason'], l['recall']) for l in les]} ({res['seconds']} s)")
    return out


def main(argv=None) -> int:
    sids = argv or sys.argv[1:] or ["027", "096"]
    outdir = DEFAULT_OUT.parent / "exp_hueso_ct"
    outdir.mkdir(parents=True, exist_ok=True)
    for sid in sids:
        r = run(sid, DEFAULT_DATASET)
        (outdir / f"{sid}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
