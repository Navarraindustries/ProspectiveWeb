"""Valida la segmentación tubular sobre Case 3 y escribe las cifras del diseño.

Uso:
    python scripts/validate_case3.py <dir_meshes_con__volume.npy> <lower> [upper]
        [--out validate_case3.json] [--frangi-cache DIR]
        [--gate-pctl P] [--reclaim-mm R] [--fill-holes-mm F] [--min-island-mm3 M]
        [--plate-ratio K] [--wall-mm W] [--no-detect]

Ejecuta el mismo camino que la API con el método tubular: build_vascular_mask
+ mask_to_surface + _detect_hits (curvatura sobre la malla completa, calibre y
cociente sobre una copia decimada). Escribe el JSON en --out (por defecto al
lado de este script, nunca en la sesión) y lo imprime.

Los dos pases de Frangi (tubularidad y laminaridad) se calculan aparte para
cronometrarlos por separado: `seconds.mask` es la máscara SIN Frangi y
`seconds.frangi` los dos pases. Con --frangi-cache se guardan/reutilizan en un
directorio (para comparar ajustes sin repetir 25 s de Frangi); en ese caso
`seconds.frangi` es el tiempo de la primera vez, leído del propio caché.

Los mandos --plate-ratio y --wall-mm sustituyen las constantes del módulo
vascular_mask solo en este proceso.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scipy import ndimage  # noqa: E402

import services.vascular_mask as vm  # noqa: E402
from services.vascular_mask import FRANGI_SLAB, MaskParams, build_vascular_mask  # noqa: E402
from services.vesselness import objectness_max  # noqa: E402
from services.segmentation import mask_to_surface, surface_quality  # noqa: E402
from services.mesh_components import describe_components, keep_main_tree  # noqa: E402

# cand-002, confirmado por el usuario (aneurisma.png). Coordenadas de malla (x, y, z) mm.
LESION = np.array([62.1, 63.7, 62.9])
LESION_HIT_MM = 8.0      # un candidato a menos de esto es la lesión
LESION_KEEP_MM = 3.0     # radio en el que se mide cuánto de M0 conserva la máscara
BONE_THICKNESS_MM = 3.0  # espesor 2V/A por encima del cual una pieza parece hueso


def _frangi(vol: np.ndarray, sp: tuple, cache: Path | None) -> tuple[np.ndarray, np.ndarray, float]:
    if cache is not None and (cache / "vesselness.npy").exists():
        v = np.load(cache / "vesselness.npy")
        p = np.load(cache / "plateness.npy")
        secs = json.loads((cache / "frangi_seconds.json").read_text())["seconds"]
        return v, p, float(secs)
    t = time.perf_counter()
    v = objectness_max(vol, sp, dimension=1, slab=FRANGI_SLAB)
    p = objectness_max(vol, sp, dimension=2, slab=FRANGI_SLAB)
    secs = time.perf_counter() - t
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        np.save(cache / "vesselness.npy", v)
        np.save(cache / "plateness.npy", p)
        (cache / "frangi_seconds.json").write_text(json.dumps({"seconds": secs}))
    return v, p, secs


def _lesion_kept(vol: np.ndarray, mask: np.ndarray, sp: tuple, lower: float) -> float:
    """Fracción de M0 (umbral relleno) a ≤ LESION_KEEP_MM de la lesión que queda en la máscara."""
    sz, sy, sx = sp
    c = np.round(LESION[::-1] / np.array(sp)).astype(int)            # (z, y, x)
    r = np.ceil(LESION_KEEP_MM / np.array(sp)).astype(int) + 1
    lo = np.maximum(c - r, 0)
    hi = np.minimum(c + r + 1, vol.shape)
    sl = tuple(slice(a, b) for a, b in zip(lo, hi))
    # M0 se rellena sobre el volumen entero: un relleno local cambiaría la respuesta.
    m0 = ndimage.binary_fill_holes(vol >= lower)[sl]
    z, y, x = np.mgrid[sl]
    d = np.sqrt((x * sx - LESION[0]) ** 2 + (y * sy - LESION[1]) ** 2 + (z * sz - LESION[2]) ** 2)
    ball = m0 & (d <= LESION_KEEP_MM)
    return float((ball & mask[sl]).sum() / max(1, ball.sum()))


# La API enseña los 5 primeros (routers.detect._MAX_CANDIDATES); aquí se pide
# la lista fusionada más larga para saber en qué puesto queda la lesión aunque
# caiga fuera. consensus ordena antes de cortar, así que los 5 primeros son los
# mismos que da la API.
DETECT_TOP = 30


def _detect(poly, modality: str) -> dict:
    import routers.detect as rd
    rd._MAX_CANDIDATES = DETECT_TOP
    t = time.perf_counter()
    hits, _ = rd._detect_hits(poly, modality)
    secs = time.perf_counter() - t
    dist = [float(np.linalg.norm(np.array(h.position) - LESION)) for h in hits]
    idx = [i for i, d in enumerate(dist) if d < LESION_HIT_MM]
    lesion = hits[idx[0]] if idx else None
    return {
        "lesion_rank": idx[0] + 1 if idx else None,
        "lesion_in_api_top5": bool(idx and idx[0] < 5),
        "lesion_channel_ranks": dict(lesion.ranks) if lesion else None,
        "lesion_distance_mm": round(dist[idx[0]], 2) if idx else None,
        "n_candidates": len(hits),
        "top5": [{"position": [round(float(c), 2) for c in h.position],
                  "channel_ranks": dict(h.ranks),
                  "distance_to_lesion_mm": round(d, 1)}
                 for h, d in list(zip(hits, dist))[:5]],
        "seconds": round(secs, 1),
    }


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("meshes_dir", type=Path)
    ap.add_argument("lower", type=float)
    ap.add_argument("upper", type=float, nargs="?", default=0.0)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().with_name("validate_case3.json"))
    ap.add_argument("--frangi-cache", type=Path, default=None)
    ap.add_argument("--gate-pctl", type=float, default=None)
    ap.add_argument("--reclaim-mm", type=float, default=None)
    ap.add_argument("--fill-holes-mm", type=float, default=None)
    ap.add_argument("--min-island-mm3", type=float, default=None)
    ap.add_argument("--plate-ratio", type=float, default=None)
    ap.add_argument("--wall-mm", type=float, default=None)
    ap.add_argument("--no-detect", action="store_true")
    a = ap.parse_args(argv)

    d = a.meshes_dir
    meta = json.loads((d / "_volume_meta.json").read_text())
    sp = tuple(float(s) for s in meta["spacing"])
    vol = np.ascontiguousarray(np.load(d / "_volume.npy", mmap_mode="r"), dtype=np.float32)

    if a.plate_ratio is not None:
        vm.PLATE_RATIO = a.plate_ratio
    if a.wall_mm is not None:
        vm.WALL_MM = a.wall_mm
    mp = MaskParams(lower=a.lower, upper=a.upper)
    if a.gate_pctl is not None:
        mp.gate_pctl = a.gate_pctl
    if a.reclaim_mm is not None:
        mp.reclaim_mm = a.reclaim_mm
    surf_kw = {}
    if a.fill_holes_mm is not None:
        surf_kw["fill_holes_mm"] = a.fill_holes_mm
    if a.min_island_mm3 is not None:
        surf_kw["min_island_mm3"] = a.min_island_mm3

    v, p, t_frangi = _frangi(vol, sp, a.frangi_cache)
    t = time.perf_counter()
    mr = build_vascular_mask(vol, sp, mp, vesselness=v, plateness=p)
    t_mask = time.perf_counter() - t
    del v, p
    lesion_kept = _lesion_kept(vol, mr.mask, sp, a.lower)

    t = time.perf_counter()
    poly = mask_to_surface(mr.mask, sp, **surf_kw)
    t_surf = time.perf_counter() - t
    q = surface_quality(poly)
    comps = describe_components(poly)
    bone = [c for c in comps if c.thickness_mm > BONE_THICKNESS_MM]
    mt = keep_main_tree(poly)
    q_mt = surface_quality(mt.poly) if mt.applied else q

    vox_mm3 = float(np.prod(sp))
    out = {
        "params": {"lower": a.lower, "upper": a.upper, "gate_pctl": mp.gate_pctl,
                   "reclaim_mm": mp.reclaim_mm, "plate_ratio": vm.PLATE_RATIO, "wall_mm": vm.WALL_MM,
                   **surf_kw},
        "shape": list(vol.shape), "spacing": list(sp),
        "boundary_edges": q["boundary_edges"], "aspect_ratio_median": round(q["aspect_ratio_median"], 4),
        "components": q["components"], "bone_like_pieces": len(bone),
        "thickest_piece_mm": round(max((c.thickness_mm for c in comps), default=0.0), 2),
        "vertices": q["n_vertices"], "triangles": q["n_triangles"],
        "main_tree": {"applied": mt.applied, "components": q_mt["components"],
                      "boundary_edges": q_mt["boundary_edges"], "vertices": q_mt["n_vertices"]},
        "fallback": mr.fallback, "mask_vox": int(mr.mask.sum()),
        "kept_fraction_of_threshold": round(mr.stats["kept_fraction"], 4), "seeds": mr.stats["seeds"],
        "reclaimed_vox": mr.stats["reclaimed_vox"], "reclaimed_mm3": round(mr.stats["reclaimed_vox"] * vox_mm3, 1),
        "vetoed_vox": mr.stats["vetoed_vox"], "vetoed_mm3": round(mr.stats["vetoed_vox"] * vox_mm3, 1),
        "lesion_kept_fraction": round(lesion_kept, 4),
        "seconds": {"frangi": round(t_frangi, 1), "mask": round(t_mask, 1), "surface": round(t_surf, 1),
                    "mask_surface": round(t_mask + t_surf, 1),
                    "mask_surface_with_frangi": round(t_frangi + t_mask + t_surf, 1)},
    }
    if not a.no_detect:
        modality = meta.get("modality", "XA")
        out["detection_modality"] = modality
        out["detection"] = _detect(poly, modality)
        out["lesion_rank"] = out["detection"]["lesion_rank"]
        if mt.applied:
            out["detection_main_tree"] = _detect(mt.poly, modality)

    a.out.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    main()
