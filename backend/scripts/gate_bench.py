# -*- coding: utf-8 -*-
"""Banco de puertas del detector sobre las mallas de una pasada completa (2026-10-24).

Sucesor de `exp_p3_detector.py` (paso 3, 16 estudios de octubre) puesto al día
con la cadena de detección de hoy: recorte intracraneal (§4.4), copia de
calibre encadenada (`_CHAIN_DECIMATION_FROM`), tope de árbol de §4.1 y suelo
de HU (§4.5). Dos fases:

`dump`  — por estudio, UNA vez: recorta la malla como `routers.detect._detect_hits`,
          decima a las copias de curvatura (80 000) y de calibre (38 000), guarda
          el calibre por vértice y, por cada umbral de Gauss, TODAS las regiones
          de curvatura con sus métricas, sin puertas ni fusión. Minutos por
          estudio; reanudable (salta lo que ya está).
`eval`  — aplica puertas, orden, fusión, tope, consenso y suelo de HU como reglas
          puras sobre lo volcado y mide cada variante contra las lesiones con el
          MISMO emparejamiento que el banco. Segundos por variante. La variante
          `actual` tiene que reproducir los puestos de la pasada de origen: es
          la comprobación de que el banco dice lo mismo que el detector.

Uso:
    .venv/Scripts/python.exe scripts/gate_bench.py dump --src data/zenodo_eval_full_p5_sacos --out data/exp_gates [--studies ...] [--limit 12]
    .venv/Scripts/python.exe scripts/gate_bench.py eval --src data/zenodo_eval_full_p5_sacos --out data/exp_gates [--variants actual merge5] [--table] [--check]
"""
from __future__ import annotations

import argparse
import json
import math
import statistics as st
import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

GAUSS_DEFAULT = ["85", "k0.028"]


def say(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def study_ids(src: Path) -> list[str]:
    return sorted(p.stem for p in src.glob("*.json") if p.name != "summary.json")


# ── dump ───────────────────────────────────────────────────────────────────── #

def _area(poly) -> float:
    import vtk
    m = vtk.vtkMassProperties(); m.SetInputData(poly); m.Update()
    return float(m.GetSurfaceArea())


def dump_study(sid: str, src: Path, out: Path, gauss_list: list[str]) -> bool:
    """True si ha hecho algo (decimar o volcar); False si ya estaba todo."""
    import routers.detect as rd
    from services.aneurysm_consensus import (_geometric_channels_apply,
                                             local_calibre, region_on_border)
    from services.head_crop import crop_to_head
    from services.segmentation import decimate_to, read_vtp, write_vtp

    meshes = out / "meshes"; meshes.mkdir(parents=True, exist_ok=True)
    regions = out / "regions"; regions.mkdir(parents=True, exist_ok=True)
    calib = out / "calibre"; calib.mkdir(parents=True, exist_ok=True)
    curv_p, geo_p, meta_p = meshes / f"{sid}_curv.vtp", meshes / f"{sid}_geo.vtp", meshes / f"{sid}.json"
    cal_p = calib / f"{sid}.npz"
    pending = [g for g in gauss_list if not (regions / f"{sid}_p{g}.json").exists()]
    done = curv_p.exists() and geo_p.exists() and meta_p.exists()
    if done and not pending and (cal_p.exists() or not json.loads(meta_p.read_text(encoding="utf-8"))["tree"]):
        return False

    if done:
        curv, small = read_vtp(curv_p), read_vtp(geo_p)
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        say(f"[{sid}] copias de disco ({meta['n_curv']} / {meta['n_geo']})")
    else:
        t0 = time.perf_counter()
        poly = read_vtp(src / "meshes" / f"{sid}.vtp")
        n_full = poly.GetNumberOfPoints()
        # Exactamente lo que hace routers.detect._detect_hits.
        poly, crop = crop_to_head(poly)
        n = poly.GetNumberOfPoints()
        say(f"[{sid}] malla {n_full} vértices, {n} tras el recorte: decimando")
        curv = decimate_to(poly, rd._CURVATURE_MAX_VERTS)
        if n <= rd._DETECT_MAX_VERTS:
            small = poly
        else:
            src_poly = curv if n > rd._CHAIN_DECIMATION_FROM else poly
            small = decimate_to(src_poly, rd._DETECT_TARGET_VERTS)
            if small.GetNumberOfPoints() > rd._DETECT_MAX_VERTS:
                small = decimate_to(small, int(rd._DETECT_TARGET_VERTS * 0.9))
        tree = bool(_geometric_channels_apply(small, poly))
        del poly
        write_vtp(curv, curv_p); write_vtp(small, geo_p)
        meta = {"study": sid, "n_full": n_full, "n_crop": n, "crop": crop.as_dict(),
                "n_curv": curv.GetNumberOfPoints(), "n_geo": small.GetNumberOfPoints(), "tree": tree,
                "bounds": list(curv.GetBounds()), "seconds_decimate": round(time.perf_counter() - t0, 1)}
        meta_p.write_text(json.dumps(meta, indent=1), encoding="utf-8")
        say(f"[{sid}] curv {meta['n_curv']} geo {meta['n_geo']} árbol={tree} ({meta['seconds_decimate']} s)")

    if meta["tree"] and not cal_p.exists():
        t0 = time.perf_counter()
        pts, rad = local_calibre(small)
        np.savez_compressed(cal_p, pts=pts.astype(np.float64), rad=rad.astype(np.float64))
        say(f"[{sid}] calibre de {len(pts)} vértices ({time.perf_counter() - t0:.0f} s)")

    bounds = curv.GetBounds()
    for g in pending:
        t0 = time.perf_counter()
        det = rd._detector_for_modality("CT")
        if g.startswith("k"):
            det.min_gauss_curvature = float(g[1:])
        else:
            det.gauss_percentile = float(g)
        # Puertas abiertas: se guarda TODO y las puertas se aplican en `eval`.
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
        (regions / f"{sid}_p{g}.json").write_text(json.dumps({
            "study": sid, "gauss": g, "gauss_threshold": res.gauss_threshold,
            "mean_curv_p75": res.mean_curv_gate, "n_regions_total": res.n_regions_total,
            "n_failed_points": res.n_failed_points, "n_removed_components": res.n_removed_components,
            "seconds": round(time.perf_counter() - t0, 1), "regions": rows,
        }, indent=0), encoding="utf-8")
        say(f"[{sid}] p{g}: {len(rows)} regiones de {res.n_regions_total} ({time.perf_counter() - t0:.0f} s)")
    return True


def cmd_dump(args) -> None:
    n_done = 0
    for sid in args.studies or study_ids(args.src):
        try:
            if dump_study(sid, args.src, args.out, list(args.gauss)):
                n_done += 1
        except Exception as exc:  # noqa: BLE001 — un estudio roto no para el banco
            say(f"[{sid}] ERROR {exc!r}")
            n_done += 1
        if args.limit and n_done >= args.limit:
            say(f"tope de {args.limit} estudios en este proceso")
            break
    say("dump: nada pendiente" if n_done == 0 else f"dump: {n_done} estudios en este proceso")


# ── eval: variantes ────────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class Variant:
    #: percentil («85») o suelo absoluto de K («k0.028» = radio ≤ 6 mm)
    gauss: str = "85"
    #: None → puerta de percentil 75 de la malla; número → H·r ≥ valor.
    hr_min: float | None = 0.7
    pgf_min: float = 0.5
    comp_min: float = 0.2
    sph_min: float = 0.35
    min_points: int = 8
    r_min: float = 1.0
    r_max: float = 20.0
    merge_mm: float = 10.0
    #: Tope del canal de curvatura (el banco pide 40; la API, 8).
    cap: int = 40
    #: Orden del canal de curvatura: score | score_nosize | area | n | hr | pgf_comp
    order: str = "area"
    #: Consenso: actual | sin_calibre_solo
    consensus: str = "actual"
    #: Anillo del cociente: fijo | radio
    ring: str = "fijo"
    #: Suelo de calibre: p90 | p75 | mm:<valor>
    floor: str = "p90"
    #: Segundo canal de curvatura «gruesa» (otro umbral de Gauss), familia «forma».
    gauss2: str | None = None
    #: Suelo de HU (§4.5) encendido.
    hu_floor: bool = True


VARIANTS: dict[str, Variant] = {
    "actual": Variant(),
    "sin_suelo": Variant(hu_floor=False),
    "hr06": Variant(hr_min=0.6),
    "merge5": Variant(merge_mm=5.0),
    "merge7": Variant(merge_mm=7.0),
    "cap60": Variant(cap=60),
    "cap80": Variant(cap=80),
    "o_score": Variant(order="score"),
    "o_nosize": Variant(order="score_nosize"),
    "o_n": Variant(order="n"),
    "o_hr": Variant(order="hr"),
    "o_pgfcomp": Variant(order="pgf_comp"),
    "comp15": Variant(comp_min=0.15),
    "comp10": Variant(comp_min=0.10),
    "pgf40": Variant(pgf_min=0.40),
    "pts4": Variant(min_points=4),
    "dos_k6": Variant(gauss2="k0.028"),
    "k6": Variant(gauss="k0.028"),
    "ring_r": Variant(ring="radio"),
    "merge5_cap60": Variant(merge_mm=5.0, cap=60),
    # Combinaciones sobre el suelo absoluto de Gauss (25-10): k6 gana 9 entre 5 solo.
    "k6_merge5": Variant(gauss="k0.028", merge_mm=5.0),
    "k6_merge7": Variant(gauss="k0.028", merge_mm=7.0),
    "k6_cap60": Variant(gauss="k0.028", cap=60),
    "k6_hr06": Variant(gauss="k0.028", hr_min=0.6),
    "k6_comp15": Variant(gauss="k0.028", comp_min=0.15),
    "k6_pts4": Variant(gauss="k0.028", min_points=4),
    "k6_ring": Variant(gauss="k0.028", ring="radio"),
    "k6_p85": Variant(gauss="k0.028", gauss2="85"),
    "k6_m5_p85": Variant(gauss="k0.028", merge_mm=5.0, gauss2="85"),
    "k6_o_score": Variant(gauss="k0.028", order="score"),
    # Barrido del suelo de K (necesita volcados --gauss k0.02 k0.04): esfera de 7 y 5 mm.
    "k7": Variant(gauss="k0.02"),
    "k5": Variant(gauss="k0.04"),
}


# ── eval: carga ────────────────────────────────────────────────────────────── #

@dataclass
class Study:
    sid: str
    has_ia: bool
    lesions: list[dict]
    ref: dict
    tree: bool
    bounds: list[float]
    regions: dict[str, dict]
    calibre: tuple[np.ndarray, np.ndarray] | None
    hu_spacing: tuple[float, float, float]
    hu_origin: tuple[float, float, float]
    volume_path: Path
    _volume: np.ndarray | None = field(default=None, repr=False)

    def volume(self) -> np.ndarray:
        if self._volume is None:
            self._volume = np.load(self.volume_path, mmap_mode="r")  # 4,2 GB en disco: mapeado, no en memoria
        return self._volume


def load_study(sid: str, src: Path, out: Path, gauss_list: list[str]) -> Study | None:
    meta_p = out / "meshes" / f"{sid}.json"
    ref_p = src / f"{sid}.json"
    if not meta_p.exists() or not ref_p.exists():
        return None
    meta = json.loads(meta_p.read_text(encoding="utf-8"))
    ref = json.loads(ref_p.read_text(encoding="utf-8"))
    regions = {}
    for g in gauss_list:
        p = out / "regions" / f"{sid}_p{g}.json"
        if p.exists():
            regions[g] = json.loads(p.read_text(encoding="utf-8"))
    if not regions:
        return None
    cal = None
    cal_p = out / "calibre" / f"{sid}.npz"
    if meta["tree"] and cal_p.exists():
        z = np.load(cal_p)
        cal = (z["pts"].astype(np.float64), z["rad"].astype(np.float64))
    hv = ref["segment"].get("hu_volume") or {}
    return Study(sid=sid, has_ia=bool(ref["has_ia"]), lesions=ref.get("lesions") or [], ref=ref,
                 tree=bool(meta["tree"]), bounds=meta["bounds"], regions=regions, calibre=cal,
                 hu_spacing=tuple(float(v) for v in hv.get("spacing_mm") or ref["segment"]["seg_spacing_mm"]),
                 hu_origin=tuple(float(v) for v in hv.get("origin_mm") or (0.0, 0.0, 0.0)),
                 volume_path=src / "volumes" / f"{sid}.npy")


# ── eval: canal de curvatura y consenso ────────────────────────────────────── #

def curvature_channel(study: Study, v: Variant) -> tuple[list[dict], dict]:
    """Las regiones que pasan las puertas, ordenadas, fusionadas y con tope,
    numeradas como en `consensus` (las de borde detrás)."""
    from scripts.exp_p3_eval import _order_key
    dump = study.regions[v.gauss]
    gauss_thr, mean_gate = dump["gauss_threshold"], dump["mean_curv_p75"]
    passed = []
    gates: list[str] = []
    for reg in dump["regions"]:
        hr = reg["H"] * reg["r"]
        if reg["n"] < v.min_points:
            gates.append("points"); continue
        if reg["r"] < v.r_min or reg["r"] > v.r_max:
            gates.append("size"); continue
        convexa = (hr >= v.hr_min) if v.hr_min is not None else (reg["H"] >= mean_gate)
        if not convexa:
            gates.append("mean_curv"); continue
        if reg["pgf"] < v.pgf_min:
            gates.append("pgf"); continue
        if reg["comp"] < v.comp_min:
            gates.append("compactness"); continue
        if reg["sph"] < v.sph_min:
            gates.append("sphericity"); continue
        gates.append("ok")
        passed.append(dict(reg, key=_order_key(reg, v, gauss_thr, mean_gate), idx=len(gates) - 1))
    passed.sort(key=lambda r: -r["key"])
    merged: list[dict] = []
    for r in passed:
        p = np.asarray(r["centroid"])
        if any(float(np.linalg.norm(p - np.asarray(m["centroid"]))) < v.merge_mm for m in merged):
            gates[r["idx"]] = "merged"
            continue
        merged.append(r)
    for r in merged[v.cap:]:
        gates[r["idx"]] = "cap"
    cands = sorted(merged[:v.cap], key=lambda r: r["border"])
    for k, r in enumerate(cands, start=1):
        r["rank"] = k
    return cands, {i: g for i, g in enumerate(gates)}


CH_GRUESA = "curvatura_gruesa"


def consensus_list(study: Study, v: Variant, top: int) -> tuple[list, dict]:
    """La lista del consenso (sin suelo), de `top` sitios, como `aneurysm_consensus.consensus`."""
    import services.aneurysm_consensus as ac
    from scripts.exp_p3_eval import _RATIO_CACHE, _ratio_radio
    from services.aneurysm_consensus import (AGREE_MM, CH_CALIBRE, CH_CURVATURE, CH_RATIO,
                                             ConsensusHit, _merge, _peaks, calibre_ratio, order_hits)
    cands, gates = curvature_channel(study, v)
    hits: list[ConsensusHit] = []
    for r in cands:
        fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
        hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={CH_CURVATURE: r["rank"]},
                                 candidate=fake, on_border=r["border"]))
    if v.gauss2 is not None:
        ac._FAMILY.setdefault(CH_GRUESA, "forma")
        ac._CHANNEL_ORDER.setdefault(CH_GRUESA, 0)
        gruesa, _ = curvature_channel(study, replace(v, gauss=v.gauss2, gauss2=None))
        for r in gruesa:
            p = np.asarray(r["centroid"])
            for h in hits:
                if float(np.linalg.norm(p - np.asarray(h.position))) <= AGREE_MM:
                    h.ranks[CH_GRUESA] = min(r["rank"], h.ranks.get(CH_GRUESA, r["rank"]))
                    break
            else:
                fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
                hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={CH_GRUESA: r["rank"]},
                                         candidate=fake, on_border=r["border"]))
    if study.tree and study.calibre is not None:
        pts, rad = study.calibre
        if v.floor.startswith("mm:"):
            floor = float(v.floor[3:])
        else:
            floor = max(0.8, float(np.percentile(rad, int(v.floor[1:]))))
        key = (study.sid, v.ring, v.floor)
        if key not in _RATIO_CACHE:
            _RATIO_CACHE[key] = (_ratio_radio(pts, rad, floor) if v.ring == "radio"
                                 else calibre_ratio(pts, rad, floor))
        ratio = _RATIO_CACHE[key]
        for channel, value in ((CH_CALIBRE, rad), (CH_RATIO, ratio)):
            for rank, i in enumerate(_peaks(pts, value, rad, floor), start=1):
                _merge(hits, tuple(float(x) for x in pts[i]), channel, rank, float(rad[i]), float(ratio[i]))
    if v.consensus == "sin_calibre_solo":
        hits = [h for h in hits if set(h.ranks) != {CH_CALIBRE}]
    elif v.consensus != "actual":
        raise ValueError(v.consensus)
    return order_hits(hits)[:top], gates


def long_list(study: Study, v: Variant, long: int) -> tuple[list, dict]:
    """Lo que devuelve `eval_zenodo.detect_long`: consenso de 2·long, suelo de HU, corte a long."""
    from services.hu_floor import drop_air
    hits, gates = consensus_list(study, v, 2 * long)
    if v.hu_floor:
        hits, _ = drop_air(hits, study.volume(), study.hu_spacing, study.hu_origin)
    return hits[:long], gates


# ── eval: medida ───────────────────────────────────────────────────────────── #

def _tissue(study: Study, pos) -> str | None:
    from scripts.eval_zenodo import HU_BALL_MM, tissue_label
    from services.hu_floor import hu_stats
    r = hu_stats(study.volume(), study.hu_spacing, pos, max(HU_BALL_MM, 1.5 * max(study.hu_spacing)), study.hu_origin)
    return None if r is None else tissue_label(*r)


def evaluate(studies: list[Study], v: Variant, long: int, *, tissue: bool = True) -> dict:
    from scripts.bench_detector import match_rank
    rows = []
    bone_ctl = bone_ia = n_ctl = n_ia = 0
    cands_ctl: list[int] = []
    for s in studies:
        hits, gates = long_list(s, v, long)
        if tissue:
            labs = [_tissue(s, h.position) for h in hits[:5]]
            if s.has_ia:
                bone_ia += labs.count("bone"); n_ia += len(labs)
            else:
                bone_ctl += labs.count("bone"); n_ctl += len(labs)
        if not s.has_ia:
            cands_ctl.append(len(hits[:5]))
        for l in s.lesions:
            pos = tuple(l["position"])
            rank, hit = match_rank(pos, hits)
            near = None
            dump = s.regions[v.gauss]
            if dump["regions"]:
                k = min(range(len(dump["regions"])), key=lambda i: math.dist(pos, dump["regions"][i]["centroid"]))
                reg = dump["regions"][k]
                near = (gates.get(k), round(math.dist(pos, reg["centroid"]), 1), reg)
            rows.append({"study": s.sid, "file": l["file"], "mm": l.get("diameter_mm"), "thrombus": l.get("thrombus"),
                         "ref_rank": l.get("rank"), "rank": rank, "channels": dict(hit.ranks) if hit else {},
                         "near_gate": near[0] if near else None, "near_mm": near[1] if near else None,
                         "near": near[2] if near else None})
    ranks = [r["rank"] for r in rows]
    studies_top5 = len({r["study"] for r in rows if r["rank"] and r["rank"] <= 5})
    return {"variant": v, "rows": rows,
            "top5": sum(1 for k in ranks if k and k <= 5), "top10": sum(1 for k in ranks if k and k <= 10),
            "first": sum(1 for k in ranks if k == 1), "in_list": sum(1 for k in ranks if k), "lesions": len(rows),
            "studies_top5": studies_top5,
            "bone_ctl": f"{bone_ctl}/{n_ctl}", "bone_ia": f"{bone_ia}/{n_ia}",
            "cands_ctl_med": st.median(cands_ctl) if cands_ctl else None,
            "ctl_lt5": sum(1 for c in cands_ctl if c < 5)}


def _fmt_row(r: dict) -> str:
    near = r["near"] or {}
    hr = near.get("H", 0.0) * near.get("r", 0.0) if near else 0.0
    return (f"    {r['study']} {r['file']:<14} {r['mm'] or 0:5.1f} mm puesto={r['rank']!s:<5} (ref {r['ref_rank']!s:<4}) "
            f"{r['channels']} | región más cercana: {r['near_gate']} a {r['near_mm']} mm "
            f"(n={near.get('n')} r={near.get('r')} H·r={hr:.2f} área={near.get('area')} pgf={near.get('pgf')} comp={near.get('comp')})")


def cmd_eval(args) -> None:
    names = args.variants or list(VARIANTS)
    gauss_needed = sorted({VARIANTS[n].gauss for n in names} | {VARIANTS[n].gauss2 for n in names if VARIANTS[n].gauss2})
    studies = [s for s in (load_study(sid, args.src, args.out, gauss_needed) for sid in (args.studies or study_ids(args.src))) if s]
    print(f"{len(studies)} estudios cargados ({sum(s.has_ia for s in studies)} con lesión, "
          f"{sum(len(s.lesions) for s in studies)} lesiones)")
    base = None
    for name in names:
        v = VARIANTS[name]
        missing = [s.sid for s in studies if v.gauss not in s.regions or (v.gauss2 and v.gauss2 not in s.regions)]
        if missing:
            print(f"{name}: faltan volcados p{v.gauss} de {missing}")
            continue
        res = evaluate(studies, v, args.long, tissue=not args.no_tissue)
        line = (f"{name:<13} top5={res['top5']:<3} top10={res['top10']:<3} 1.º={res['first']:<3} lista={res['in_list']:<3}/{res['lesions']} "
                f"estudios={res['studies_top5']:<3} hueso ctl {res['bone_ctl']} IA {res['bone_ia']} "
                f"ctl<5={res['ctl_lt5']}")
        if base is not None:
            diffs = [f"{a['study']}/{a['file'].split('_', 1)[1][:-4]} {a['rank']}→{b['rank']}"
                     for a, b in zip(base["rows"], res["rows"]) if a["rank"] != b["rank"]]
            line += "  cambios: " + (", ".join(diffs) if diffs else "ninguno")
        print(line)
        if args.check:
            bad = [r for r in res["rows"] if r["rank"] != r["ref_rank"]]
            print(f"    comprobación contra la pasada: {len(res['rows']) - len(bad)} de {len(res['rows'])} puestos iguales"
                  + (": " + ", ".join(f"{r['study']}/{r['file'][3:-4]} ref {r['ref_rank']} → banco {r['rank']}" for r in bad) if bad else ""))
        if args.table:
            for r in res["rows"]:
                print(_fmt_row(r))
        if base is None:
            base = res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="carpeta de la pasada (registros, meshes/, volumes/)")
    ap.add_argument("--out", type=Path, required=True, help="carpeta del volcado")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump"); d.add_argument("--studies", nargs="*"); d.add_argument("--gauss", nargs="*", default=GAUSS_DEFAULT)
    d.add_argument("--limit", type=int, default=0, help="parar tras N estudios con trabajo (un proceso por ronda)")
    d.set_defaults(fn=cmd_dump)
    e = sub.add_parser("eval"); e.add_argument("--variants", nargs="*"); e.add_argument("--studies", nargs="*")
    e.add_argument("--long", type=int, default=40); e.add_argument("--table", action="store_true")
    e.add_argument("--check", action="store_true", help="comparar cada puesto con el de la pasada de origen")
    e.add_argument("--no-tissue", action="store_true", help="no medir el tejido de los 5 (más rápido)")
    e.set_defaults(fn=cmd_eval)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
