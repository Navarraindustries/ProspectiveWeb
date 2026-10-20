# -*- coding: utf-8 -*-
"""Fase `eval` de `exp_p3_detector.py`: puertas, orden y consenso como reglas puras.

Reproduce sobre lo volcado lo que hacen `AneurysmDetector.detect` (puertas,
puntuación, fusión, tope) y `aneurysm_consensus.consensus` (canales
geométricos y orden), y mide cada variante con el emparejamiento del banco
(`scripts.bench_detector.match_rank`). La variante `v1` tiene que dar los
mismos puestos que la pasada `zenodo_eval_p12e_v1`: es la comprobación de que
el banco reproduce al detector.
"""
from __future__ import annotations

import json
import math
import statistics as st
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from scripts.exp_p3_detector import OUT, REF, SRC, STUDIES


# ── Variantes ──────────────────────────────────────────────────────────────── #

@dataclass(frozen=True)
class Variant:
    #: percentil (85, 75) o suelo absoluto de K («k0.028» = radio ≤ 6 mm)
    gauss: int | str = 85
    #: None → puerta de percentil 75 de la malla (preset de TC); número → H·r ≥ valor.
    hr_min: float | None = 0.7
    pgf_min: float = 0.5
    comp_min: float = 0.2
    sph_min: float = 0.35
    min_points: int = 8
    r_min: float = 1.0
    r_max: float = 20.0
    merge_mm: float = 10.0
    #: Orden del canal de curvatura: score | score_nosize | area | n | hr | pgf_comp
    order: str = "score"
    #: Consenso: actual | sin_calibre_solo
    consensus: str = "actual"
    #: Anillo del cociente: fijo | radio
    ring: str = "fijo"
    #: Suelo de calibre: p90 | p75 | mm:<valor>
    floor: str = "p90"
    #: Segundo canal de curvatura «gruesa» (otro umbral de Gauss, mismas
    #: puertas y orden), fusionado en el consenso como familia «forma».
    gauss2: str | None = None


VARIANTS: dict[str, Variant] = {
    "v1": Variant(),
    "comp10": Variant(comp_min=0.10),
    "comp15": Variant(comp_min=0.15),
    "pgf40": Variant(pgf_min=0.40),
    "pts4": Variant(min_points=4),
    "merge5": Variant(merge_mm=5.0),
    "o_nosize": Variant(order="score_nosize"),
    "o_area": Variant(order="area"),
    "o_n": Variant(order="n"),
    "o_hr": Variant(order="hr"),
    "o_pgfcomp": Variant(order="pgf_comp"),
    "k_sincal": Variant(consensus="sin_calibre_solo"),
    "ring_r": Variant(ring="radio"),
    "p75": Variant(gauss=75),
    "p75_comp10": Variant(gauss=75, comp_min=0.10),
    # combinaciones
    "area_c15": Variant(order="area", comp_min=0.15),
    "area_c10": Variant(order="area", comp_min=0.10),
    "area_ring": Variant(order="area", ring="radio"),
    "p75_area": Variant(gauss=75, order="area"),
    "p75_area_c15": Variant(gauss=75, order="area", comp_min=0.15),
    "p75_area_c10": Variant(gauss=75, order="area", comp_min=0.10),
    "p75_area_c10_m5": Variant(gauss=75, order="area", comp_min=0.10, merge_mm=5.0),
    "p75_c10_m5": Variant(gauss=75, comp_min=0.10, merge_mm=5.0),
    "p75_area_c10_ring": Variant(gauss=75, order="area", comp_min=0.10, ring="radio"),
    # suelo absoluto de Gauss (K ≥ 1/r²): r ≤ 3, 4, 6 mm; con el orden por área
    "k3_area": Variant(gauss="k0.111", order="area"),
    "k4_area": Variant(gauss="k0.0625", order="area"),
    "k6_area": Variant(gauss="k0.028", order="area"),
    "k4_area_c15": Variant(gauss="k0.0625", order="area", comp_min=0.15),
    "k4": Variant(gauss="k0.0625"),
    # dos escalas: percentil 85 (sacos de 3–8 mm) + suelo absoluto (10–20 mm)
    "dos_k6": Variant(order="area", gauss2="k0.028"),
    "dos_k4": Variant(order="area", gauss2="k0.0625"),
    "dos_k6_c15": Variant(order="area", gauss2="k0.028", comp_min=0.15),
}


# ── Carga ──────────────────────────────────────────────────────────────────── #

@dataclass
class Study:
    sid: str
    has_ia: bool
    lesions: list[dict]
    tree: bool
    bounds: list[float]
    regions: dict[int, dict]            # percentil → volcado
    calibre: tuple[np.ndarray, np.ndarray] | None
    spacing: tuple[float, float, float]
    volume_path: Path
    _volume: np.ndarray | None = field(default=None, repr=False)

    def volume(self) -> np.ndarray:
        if self._volume is None:
            self._volume = np.load(self.volume_path).astype(np.float32)
        return self._volume


def load_study(sid: str, gauss_list: list) -> Study | None:
    meta_p = OUT / "meshes" / f"{sid}.json"
    ref_p = REF / f"{sid}.json"
    if not meta_p.exists() or not ref_p.exists():
        return None
    meta = json.loads(meta_p.read_text(encoding="utf-8"))
    ref = json.loads(ref_p.read_text(encoding="utf-8"))
    regions = {}
    for g in gauss_list:
        p = OUT / "regions" / f"{sid}_p{g}.json"
        if p.exists():
            regions[g] = json.loads(p.read_text(encoding="utf-8"))
    if not regions:
        return None
    cal = None
    cal_p = OUT / "calibre" / f"{sid}.npz"
    if meta["tree"] and cal_p.exists():
        z = np.load(cal_p)
        cal = (z["pts"].astype(np.float64), z["rad"].astype(np.float64))
    return Study(sid=sid, has_ia=bool(ref["has_ia"]), lesions=ref["lesions"], tree=bool(meta["tree"]),
                 bounds=meta["bounds"], regions=regions, calibre=cal,
                 spacing=tuple(float(v) for v in ref["segment"]["seg_spacing_mm"]),
                 volume_path=SRC / "volumes" / f"{sid}.npy")


# ── Canal de curvatura ─────────────────────────────────────────────────────── #

def _size_factor(r: float) -> float:
    if r < 1.0:
        return 0.0
    if r < 2.0:
        return (r - 1.0) * 0.5
    return max(0.0, 1.0 - abs(r - 4.0) / 6.0)


def _score(reg: dict, gauss_thr: float, mean_gate: float, *, size: bool = True) -> float:
    """La puntuación compuesta de `AneurysmDetector.detect`, tal cual (o sin el término de tamaño)."""
    norm_mean = float(np.clip((reg["H"] - mean_gate) / (abs(mean_gate) + 1e-6) / 5.0, 0.0, 1.0))
    norm_gauss = float(np.clip((reg["K"] - gauss_thr) / (abs(gauss_thr) + 1e-6) / 5.0, 0.0, 1.0))
    cv_penalty = float(np.clip((reg["cv"] - 0.8) / 2.2, 0.0, 1.0))
    base = (0.05 * norm_mean + 0.10 * norm_gauss + 0.25 * reg["pgf"] + 0.08 * reg["comp"]
            + 0.07 * reg["sph"] + 0.15 * reg["iso"])
    if size:
        base += 0.30 * _size_factor(reg["r"])
    else:
        base /= 0.70
    return float(np.clip(base * (1.0 - 0.20 * cv_penalty), 0.0, 1.0))


def _order_key(reg: dict, v: Variant, gauss_thr: float, mean_gate: float) -> float:
    """Mayor = antes."""
    if v.order == "score":
        return _score(reg, gauss_thr, mean_gate)
    if v.order == "score_nosize":
        return _score(reg, gauss_thr, mean_gate, size=False)
    if v.order == "area":
        return reg["area"]
    if v.order == "n":
        return reg["n"]
    if v.order == "hr":
        return -abs(reg["H"] * reg["r"] - 1.0)
    if v.order == "pgf_comp":
        return reg["pgf"] * reg["comp"]
    raise ValueError(v.order)


def curvature_channel(study: Study, v: Variant, long: int) -> tuple[list[dict], dict]:
    """Las regiones que pasan las puertas, ordenadas, fusionadas y con tope.

    Devuelve (candidatos con `rank` de canal, puerta de cada región) en el
    mismo orden que `detect` + la renumeración de borde de `consensus`.
    """
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
    for r in merged[long:]:
        gates[r["idx"]] = "cap"
    cands = merged[:long]
    # consensus: las de borde se numeran detrás (orden estable).
    cands = sorted(cands, key=lambda r: r["border"])
    for k, r in enumerate(cands, start=1):
        r["rank"] = k
    return cands, {i: g for i, g in enumerate(gates)}


# ── Canales geométricos y consenso ─────────────────────────────────────────── #

def _ratio_radio(pts: np.ndarray, rad: np.ndarray, floor: float) -> np.ndarray:
    """Cociente con anillo proporcional al radio local: fuera del propio saco."""
    from scipy import spatial
    from services.aneurysm_consensus import RING_INNER_MM, RING_OUTER_MM
    tree = spatial.cKDTree(pts)
    out = np.ones(len(pts))
    idx = np.where(rad >= floor)[0]
    if idx.size == 0:
        return out
    inner = np.maximum(RING_INNER_MM, 2.0 * rad[idx])
    outer = np.maximum(RING_OUTER_MM, 4.5 * rad[idx])
    o_list = tree.query_ball_point(pts[idx], outer)
    i_list = tree.query_ball_point(pts[idx], inner)
    for k, i in enumerate(idx):
        ring = np.setdiff1d(np.asarray(o_list[k]), np.asarray(i_list[k]))
        if ring.size < 20:
            continue
        base = float(np.median(rad[ring]))
        if base > 0.05:
            out[i] = rad[i] / base
    return out


_RATIO_CACHE: dict[tuple[str, str, str], np.ndarray] = {}


CH_GRUESA = "curvatura_gruesa"


def consensus_list(study: Study, v: Variant, long: int) -> tuple[list, dict]:
    import services.aneurysm_consensus as ac
    from services.aneurysm_consensus import (CH_CALIBRE, CH_CURVATURE, CH_RATIO,
                                             ConsensusHit, _merge, _peaks,
                                             calibre_ratio, order_hits)
    cands, gates = curvature_channel(study, v, long)
    hits: list[ConsensusHit] = []
    for r in cands:
        fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
        hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={CH_CURVATURE: r["rank"]},
                                 candidate=fake, on_border=r["border"]))
    if v.gauss2 is not None:
        from dataclasses import replace as _replace
        from services.aneurysm_consensus import AGREE_MM
        ac._FAMILY.setdefault(CH_GRUESA, "forma")
        ac._CHANNEL_ORDER.setdefault(CH_GRUESA, 0)
        gruesa, _ = curvature_channel(study, _replace(v, gauss=v.gauss2, gauss2=None), long)
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
    return order_hits(hits)[:long], gates


# ── Medida ─────────────────────────────────────────────────────────────────── #

def _tissue(study: Study, pos) -> str | None:
    from scripts.eval_zenodo import HU_BALL_MM, hu_stats, tissue_label
    r = hu_stats(study.volume(), study.spacing, pos, max(HU_BALL_MM, 1.5 * max(study.spacing)))
    return None if r is None else tissue_label(*r)


def evaluate(studies: list[Study], v: Variant, long: int, *, tissue: bool = True) -> dict:
    from scripts.bench_detector import match_rank
    rows = []
    bone_ctl = bone_ia = n_ctl = n_ia = 0
    cands_ctl: list[int] = []
    for s in studies:
        hits, gates = consensus_list(s, v, long)
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
                k = min(range(len(dump["regions"])),
                        key=lambda i: math.dist(pos, dump["regions"][i]["centroid"]))
                reg = dump["regions"][k]
                near = (gates.get(k), round(math.dist(pos, reg["centroid"]), 1), reg)
            rows.append({"study": s.sid, "file": l["file"], "size": l.get("size_class"),
                         "rank": rank, "channels": dict(hit.ranks) if hit else {},
                         "near_gate": near[0] if near else None, "near_mm": near[1] if near else None,
                         "near": near[2] if near else None})
    ranks = [r["rank"] for r in rows]
    return {"variant": v, "rows": rows,
            "top5": sum(1 for k in ranks if k and k <= 5), "top10": sum(1 for k in ranks if k and k <= 10),
            "in_list": sum(1 for k in ranks if k), "lesions": len(rows),
            "bone_ctl": f"{bone_ctl}/{n_ctl}", "bone_ia": f"{bone_ia}/{n_ia}",
            "cands_ctl_med": st.median(cands_ctl) if cands_ctl else None}


def _fmt_row(r: dict) -> str:
    near = r["near"] or {}
    hr = near.get("H", 0.0) * near.get("r", 0.0) if near else 0.0
    return (f"    {r['study']} {r['file']:<14} {r['size'] or '':<6} puesto={r['rank']!s:<5} "
            f"{r['channels']} | región más cercana: {r['near_gate']} a {r['near_mm']} mm "
            f"(n={near.get('n')} r={near.get('r')} H·r={hr:.2f} pgf={near.get('pgf')} comp={near.get('comp')} "
            f"sph={near.get('sph')} score={near.get('score')})")


def run(args) -> None:
    names = args.variants or list(VARIANTS)
    gauss_needed = sorted({VARIANTS[n].gauss for n in names} | {VARIANTS[n].gauss2 for n in names if VARIANTS[n].gauss2}, key=str)
    studies = [s for s in (load_study(sid, gauss_needed) for sid in (args.studies or STUDIES)) if s]
    print(f"{len(studies)} estudios cargados: {[s.sid for s in studies]}")
    base = None
    for name in names:
        v = VARIANTS[name]
        missing = [s.sid for s in studies if v.gauss not in s.regions or (v.gauss2 and v.gauss2 not in s.regions)]
        if missing:
            print(f"{name}: faltan volcados p{v.gauss} de {missing}")
            continue
        res = evaluate(studies, v, args.long)
        line = (f"{name:<12} top5={res['top5']:<2} top10={res['top10']:<2} lista={res['in_list']:<2}/{res['lesions']} "
                f"hueso ctl {res['bone_ctl']} IA {res['bone_ia']} cands_ctl_med={res['cands_ctl_med']}")
        if base is not None:
            diffs = [f"{a['study']}/{a['file'].split('_', 1)[1][:-4]} {a['rank']}→{b['rank']}"
                     for a, b in zip(base["rows"], res["rows"]) if a["rank"] != b["rank"]]
            line += "  cambios: " + (", ".join(diffs) if diffs else "ninguno")
        print(line)
        if args.table:
            for r in res["rows"]:
                print(_fmt_row(r))
        if base is None:
            base = res
