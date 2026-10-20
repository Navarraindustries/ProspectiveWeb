"""Oráculo: ¿qué vería el detector con una caja a resolución nativa alrededor de la lesión?

El servidor segmenta la cabeza entera y, por encima de 90 M vóxeles, la
reduce por 2–6 en cada eje (`routers.segment._half_factor`): una lesión de
3 mm queda en uno o dos vóxeles. Esto mide el techo de la corrección obvia
—segmentar una región de interés a la resolución del DICOM— sin decidir
todavía de dónde sale la región (clic del clínico, atlas, detector 2D): la
caja se centra en la lesión anotada, y por eso es un ORÁCULO, no un
resultado alcanzable tal cual.

Dos configuraciones por lesión, con la misma máscara tubular y el mismo
detector que el servidor:
  · nativo        caja de ±R mm, sin techo de HU (como el servidor);
  · nativo+techo  igual, con techo de 700 HU: el hueso cortical queda fuera
                  de la máscara después del relleno (`MaskParams.upper`).

Uso (desde backend/), tras `eval_zenodo.py`, de cuyos registros toma las lesiones:
    .venv/Scripts/python.exe -u scripts/zenodo_roi_oracle.py --radius 30
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.bench_detector import (
    failure_reason,
    match_rank,
    nearest_region,
)
from scripts.eval_zenodo import (
    DEFAULT_DATASET,
    DEFAULT_OUT,
    _components_info,
    _hit_dict,
    _stl_points_mesh,
    detect_long,
    load_results,
    load_study,
    surface_recall,
)

logger = logging.getLogger("roi_oracle")
Point = tuple[float, float, float]

CONFIGS = {"nativo": 0.0, "nativo+techo": 700.0}


def crop_box(position: Point, radius_mm: float, spacing, shape) -> tuple[tuple, Point]:
    """Rebanadas (z, y, x) de la caja ±radius alrededor de un punto de malla (x, y, z).

    Devuelve también el origen de la caja en mm (x, y, z), para pasar puntos
    de la malla entera a la del recorte (`to_crop`).
    """
    sz, sy, sx = (float(v) for v in spacing)
    x, y, z = position
    nz, ny, nx = shape
    z0 = max(0, int(math.floor((z - radius_mm) / sz)))
    y0 = max(0, int(math.floor((y - radius_mm) / sy)))
    x0 = max(0, int(math.floor((x - radius_mm) / sx)))
    z1 = min(nz, int(math.ceil((z + radius_mm) / sz)) + 1)
    y1 = min(ny, int(math.ceil((y + radius_mm) / sy)) + 1)
    x1 = min(nx, int(math.ceil((x + radius_mm) / sx)) + 1)
    return (slice(z0, z1), slice(y0, y1), slice(x0, x1)), (x0 * sx, y0 * sy, z0 * sz)


def to_crop(point: Point, offset: Point) -> Point:
    return tuple(float(p - o) for p, o in zip(point, offset))


def segment_box(volume: np.ndarray, spacing, lower: float, upper: float):
    from services.segmentation import mask_to_surface, surface_quality
    from services.vascular_mask import MaskParams, build_vascular_mask
    t0 = time.perf_counter()
    mr = build_vascular_mask(volume, spacing, MaskParams(lower=lower, upper=upper, reclaim_mm=3.0))
    poly = mask_to_surface(mr.mask, spacing, smooth_iters=40, pass_band=0.05)
    q = surface_quality(poly)
    stats = {"vertices": q["n_vertices"], "components": q["components"],
             "seeds": int(mr.stats.get("seeds", 0)), "fallback_mask": bool(mr.fallback),
             "mask_mm3": round(float(mr.stats.get("final_vox", 0)) * float(np.prod(spacing)), 1),
             "seconds": round(time.perf_counter() - t0, 1)}
    return poly, stats


def oracle_lesion(volume, spacing, lower: float, lesion: dict, stl_pts: np.ndarray,
                  radius_mm: float, modality: str = "CT") -> dict:
    pos = tuple(lesion["position"])
    r = max(radius_mm, float(lesion["diameter_mm"]))
    sl, offset = crop_box(pos, r, spacing, volume.shape)
    sub = np.ascontiguousarray(volume[sl], dtype=np.float32)
    pos_c = to_crop(pos, offset)
    pts_c = stl_pts - np.asarray(offset)[None, :]
    out = {"file": lesion["file"], "radius_mm": r, "box_shape": [int(v) for v in sub.shape],
           "box_voxels": int(sub.size), "configs": {}}
    for name, upper in CONFIGS.items():
        res: dict = {}
        try:
            poly, seg = segment_box(sub, spacing, lower, upper)
            res["segment"] = seg
            res["components_info"] = _components_info(poly)
            res["surface_recall"] = surface_recall(pts_c, poly, 1.5 * max(spacing))
            hits, det = detect_long(poly, modality)
            rank, hit = match_rank(pos_c, hits)
            near = nearest_region(pos_c, det.regions)
            res.update({
                "rank": rank, "channel_ranks": dict(hit.ranks) if hit else {},
                "n_hits": len(hits), "n_official": min(5, len(hits)),
                "channels_on": sorted({c for h in hits for c in h.channels}),
                "reason": None if rank else failure_reason(pos_c, lesion["diameter_mm"], det.regions),
                "regions_total": det.n_regions_total, "regions_ok": len(det.candidates),
                "region_dist_mm": round(math.dist(pos_c, near.centroid), 1) if near else None,
                "candidates": [_hit_dict(i, h, [pos_c], sub, spacing) for i, h in enumerate(hits[:5], start=1)],
            })
        except Exception as exc:
            logger.exception("fallo en %s %s", lesion["file"], name)
            res["error"] = f"{type(exc).__name__}: {exc}"
        out["configs"][name] = res
    return out


def run(records: dict[str, dict], dataset: Path, out: Path, *, radius_mm: float,
        primary_only: bool = True, redo: bool = False, limit: int = 0, log=print) -> int:
    """Devuelve cuántos estudios ha hecho; `limit` corta antes (memoria, ver eval_zenodo.run)."""
    out.mkdir(parents=True, exist_ok=True)
    sids = [s for s, r in sorted(records.items()) if r.get("status") == "ok" and r.get("lesions")]
    done = 0
    for i, sid in enumerate(sids, start=1):
        p = out / f"{sid}.json"
        if p.exists() and not redo:
            log(f"[{sid}] ya hecho ({i}/{len(sids)})")
            continue
        if limit and done >= limit:
            log(f"tope de {limit} estudios alcanzado")
            break
        rec = records[sid]
        t0 = time.perf_counter()
        log(f"── {sid} ({i}/{len(sids)}) ──")
        try:
            dcm, _ = load_study(dataset, sid)
            origin = tuple(rec["frame"]["origin_mm"]); direction = tuple(rec["frame"]["direction"])
            lower = float(rec["segment"]["thresholds"]["lower"])
            lesions = rec["lesions"][:1] if primary_only else rec["lesions"]
            res = {"study": sid, "status": "ok", "lower": lower, "spacing_mm": list(dcm.spacing),
                   "shape": list(dcm.volume.shape), "full_factor": rec["segment"].get("downsample_factor"),
                   "lesions": []}
            for les in lesions:
                pts = _stl_points_mesh(dataset / "Annotations" / les["file"], origin, direction)
                row = oracle_lesion(dcm.volume, dcm.spacing, lower, les, pts, radius_mm, dcm.modality)
                row["full_rank"] = les.get("rank"); row["full_reason"] = les.get("reason")
                row["full_recall"] = les.get("surface_recall")
                row["size_class"] = les.get("size_class"); row["kind"] = les.get("kind")
                row["diameter_mm"] = les.get("diameter_mm"); row["length_mm"] = les.get("length_mm")
                res["lesions"].append(row)
                log(f"[{sid}] {les['file']}: entera={les.get('rank')} "
                    + " ".join(f"{k}={v.get('rank')}/{v.get('n_hits')}" for k, v in row["configs"].items()))
            del dcm
        except Exception as exc:
            logger.exception("fallo en %s", sid)
            res = {"study": sid, "status": "error", "error": f"{type(exc).__name__}: {exc}"}
        res["seconds"] = round(time.perf_counter() - t0, 1)
        p.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
        done += 1
    return done


def summarize(results: dict[str, dict]) -> dict:
    s = {"studies": len(results), "errors": sum(1 for r in results.values() if r.get("status") != "ok"),
         "lesions": 0, "full": {"top5": 0, "in_list": 0}}
    for name in CONFIGS:
        s[name] = {"top5": 0, "in_list": 0, "first": 0, "n_hits_lt5": 0, "geometric_on": 0,
                   "recall_median": None, "errors": 0, "_recalls": []}
    for r in results.values():
        if r.get("status") != "ok":
            continue
        for l in r["lesions"]:
            s["lesions"] += 1
            if l.get("full_rank"):
                s["full"]["in_list"] += 1
                s["full"]["top5"] += l["full_rank"] <= 5
            for name, c in l["configs"].items():
                b = s[name]
                if "error" in c:
                    b["errors"] += 1
                    continue
                if c.get("rank"):
                    b["in_list"] += 1
                    b["top5"] += c["rank"] <= 5
                    b["first"] += c["rank"] == 1
                b["n_hits_lt5"] += c.get("n_hits", 5) < 5
                b["geometric_on"] += any(ch in ("calibre", "cociente") for ch in c.get("channels_on", []))
                if c.get("surface_recall") is not None:
                    b["_recalls"].append(c["surface_recall"])
    for name in CONFIGS:
        rc = s[name].pop("_recalls")
        s[name]["recall_median"] = round(float(np.median(rc)), 3) if rc else None
    return s


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--eval", type=Path, default=DEFAULT_OUT, help="salida de eval_zenodo.py")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT.parent / "zenodo_roi")
    ap.add_argument("--radius", type=float, default=30.0, help="semilado de la caja (mm)")
    ap.add_argument("--all-lesions", action="store_true", help="también las secundarias")
    ap.add_argument("--studies", nargs="*")
    ap.add_argument("--shard", default="")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    if args.summary:
        s = summarize(load_results(args.out))
        (args.out / "summary.json").write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
        print(json.dumps(s, ensure_ascii=False, indent=1))
        return 0
    records = load_results(args.eval)
    if args.studies:
        records = {k: v for k, v in records.items() if k in set(args.studies)}
    if args.shard:
        k, n = (int(v) for v in args.shard.split("/"))
        keys = sorted(records)
        records = {s: records[s] for i, s in enumerate(keys) if i % n == k}
    run(records, args.dataset, args.out, radius_mm=args.radius, primary_only=not args.all_lesions,
        redo=args.redo, limit=args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
