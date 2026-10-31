# -*- coding: utf-8 -*-
"""Paso 3 del plan Zenodo: variantes del detector sobre las mallas de la pasada p12e.

Dos fases, para no pagar la curvatura por cada variante:

`dump`  — por estudio: decima la malla UNA vez a las copias que usa la API
          (80 000 para la curvatura, 40 000 para calibre y cociente), guarda el
          calibre por vértice (pts, radio) y, para cada percentil de Gauss,
          TODAS las regiones de curvatura con sus métricas, sin puertas ni
          fusión. Es lo caro (minutos por estudio); va a `data/exp_p3/`.
`eval`  — aplica puertas, orden del canal de curvatura y consenso como reglas
          puras sobre lo volcado, y mide cada variante contra las lesiones
          anotadas con el MISMO emparejamiento que el banco (`match_rank`).
          Segundos por variante.

Uso:
    .venv/Scripts/python.exe scripts/exp_p3_detector.py dump [--studies ...] [--gauss 85 75]
    .venv/Scripts/python.exe scripts/exp_p3_detector.py eval [--variants ...]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1] / "data"
SRC = ROOT / "zenodo_eval_p12e"          # mallas, volúmenes reducidos y registros
REF = ROOT / "zenodo_eval_p12e_v1"       # la pasada de referencia (lesiones, puestos)
OUT = ROOT / "exp_p3"
STUDIES = ["027", "096", "106", "006", "018", "033", "026", "019", "028", "016",
           "189", "053", "001", "003", "039", "041"]
GAUSS_DEFAULT = [85, 75]


def say(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


# ── dump ───────────────────────────────────────────────────────────────────── #

def _area(poly) -> float:
    import vtk
    m = vtk.vtkMassProperties(); m.SetInputData(poly); m.Update()
    return float(m.GetSurfaceArea())


def dump_study(sid: str, gauss_list: list) -> None:
    """`gauss_list`: percentiles (int) o suelos absolutos «k0.028» (str)."""
    import routers.detect as rd
    from services.aneurysm_consensus import (_geometric_channels_apply,
                                             local_calibre, region_on_border)
    from services.segmentation import decimate_to, read_vtp, write_vtp

    meshes = OUT / "meshes"; meshes.mkdir(parents=True, exist_ok=True)
    regions = OUT / "regions"; regions.mkdir(parents=True, exist_ok=True)
    calib = OUT / "calibre"; calib.mkdir(parents=True, exist_ok=True)
    curv_p, geo_p, meta_p = meshes / f"{sid}_curv.vtp", meshes / f"{sid}_geo.vtp", meshes / f"{sid}.json"

    if curv_p.exists() and geo_p.exists() and meta_p.exists():
        curv, small = read_vtp(curv_p), read_vtp(geo_p)
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        say(f"[{sid}] copias de disco ({meta['n_curv']} / {meta['n_geo']})")
    else:
        t0 = time.perf_counter()
        poly = read_vtp(SRC / "meshes" / f"{sid}.vtp")
        n_full = poly.GetNumberOfPoints()
        say(f"[{sid}] malla {n_full} vértices: decimando")
        # Exactamente lo que hace routers.detect._detect_hits.
        if n_full <= rd._DETECT_MAX_VERTS:
            small = poly
        else:
            small = decimate_to(poly, rd._DETECT_TARGET_VERTS)
            if small.GetNumberOfPoints() > rd._DETECT_MAX_VERTS:
                small = decimate_to(small, int(rd._DETECT_TARGET_VERTS * 0.9))
        curv = decimate_to(poly, rd._CURVATURE_MAX_VERTS)
        tree = bool(_geometric_channels_apply(small, poly))
        del poly
        write_vtp(curv, curv_p); write_vtp(small, geo_p)
        meta = {"study": sid, "n_full": n_full, "n_curv": curv.GetNumberOfPoints(),
                "n_geo": small.GetNumberOfPoints(), "tree": tree,
                "bounds": list(curv.GetBounds()), "seconds_decimate": round(time.perf_counter() - t0, 1)}
        meta_p.write_text(json.dumps(meta, indent=1), encoding="utf-8")
        say(f"[{sid}] curv {meta['n_curv']} geo {meta['n_geo']} árbol={tree} ({meta['seconds_decimate']} s)")

    cal_p = calib / f"{sid}.npz"
    if meta["tree"] and not cal_p.exists():
        t0 = time.perf_counter()
        pts, rad = local_calibre(small)
        # float64: en float32 el orden de los picos del cociente cambia (027:
        # el 3.º del cociente dejaba de fusionarse con el 2.º de calibre).
        np.savez_compressed(cal_p, pts=pts.astype(np.float64), rad=rad.astype(np.float64))
        say(f"[{sid}] calibre de {len(pts)} vértices ({time.perf_counter() - t0:.0f} s)")

    bounds = curv.GetBounds()
    for g in gauss_list:
        out = regions / f"{sid}_p{g}.json"
        if out.exists():
            continue
        t0 = time.perf_counter()
        det = rd._detector_for_modality("CT")
        if isinstance(g, str) and g.startswith("k"):
            det.min_gauss_curvature = float(g[1:])
        else:
            det.gauss_percentile = float(g)
        # Puertas abiertas: se guarda TODO y las puertas se aplican en `eval`.
        # La puerta de curvatura media se deja en percentil 75 pero con un
        # suelo absoluto imposible, para que el resultado traiga el valor del
        # percentil (hace falta para reproducir el preset de TC tal cual).
        det.mean_curv_gate_percentile = 75.0
        det.min_mean_curv_radius = -1e9
        det.min_points = 3
        det.min_radius_mm = 0.0
        det.max_radius_mm = 1e9
        det.min_positive_gauss_frac = 0.0
        det.min_compactness = 0.0
        det.min_sphericity = 0.0
        det.merge_dist_mm = 0.0
        det.max_candidates = 10 ** 6
        res = det.detect(curv)
        rows = []
        for c in res.candidates:
            b = c.poly_data.GetBounds()
            dims = sorted([b[1] - b[0], b[3] - b[2], b[5] - b[4]])
            rows.append({
                "centroid": [round(float(v), 3) for v in c.centroid],
                "n": int(c.n_points), "r": round(float(c.radius_mm), 4), "r_method": c.radius_method,
                "H": round(float(c.mean_curvature), 5), "K": round(float(c.gauss_curvature), 6),
                "pgf": round(float(c.positive_gauss_frac), 4), "comp": round(float(c.compactness), 4),
                "sph": round(float(c.sphericity), 4), "cv": round(float(c.cv_gauss), 4),
                "iso": round(float(c.normal_isotropy), 4), "score": round(float(c.score), 4),
                "area": round(_area(c.poly_data), 3), "dims": [round(float(v), 3) for v in dims],
                "border": bool(region_on_border(c.poly_data, bounds)),
            })
        out.write_text(json.dumps({
            "study": sid, "gauss": g, "gauss_threshold": res.gauss_threshold,
            "mean_curv_p75": res.mean_curv_gate, "n_regions_total": res.n_regions_total,
            "n_failed_points": res.n_failed_points, "n_removed_components": res.n_removed_components,
            "seconds": round(time.perf_counter() - t0, 1), "regions": rows,
        }, indent=0), encoding="utf-8")
        say(f"[{sid}] p{g}: {len(rows)} regiones de {res.n_regions_total} ({time.perf_counter() - t0:.0f} s)")


def cmd_dump(args) -> None:
    for sid in args.studies or STUDIES:
        try:
            dump_study(sid, list(args.gauss) + [f"k{v:g}" for v in args.gauss_abs])
        except Exception as exc:  # noqa: BLE001 — un estudio roto no para el banco
            say(f"[{sid}] ERROR {exc!r}")


# ── eval ───────────────────────────────────────────────────────────────────── #

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump"); d.add_argument("--studies", nargs="*"); d.add_argument("--gauss", nargs="*", type=int, default=GAUSS_DEFAULT)
    d.add_argument("--gauss-abs", nargs="*", type=float, default=[],
                   help="suelos absolutos de K (mm⁻²) además de los percentiles; volcado «kX»")
    d.set_defaults(fn=cmd_dump)
    e = sub.add_parser("eval"); e.add_argument("--variants", nargs="*"); e.add_argument("--studies", nargs="*")
    e.add_argument("--long", type=int, default=40); e.add_argument("--table", action="store_true")
    e.set_defaults(fn=lambda a: _eval_main(a))
    args = ap.parse_args()
    args.fn(args)


def _eval_main(args) -> None:
    from scripts.exp_p3_eval import run
    run(args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
