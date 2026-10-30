"""Banco de puertas sobre las mallas limpias (29-10): variantes de FUSIÓN, ACUERDO y
PUERTAS CONDICIONADAS medidas sobre el volcado `data/exp_gates_head`.

Extiende scripts/gate_bench.py sin tocarlo (monkeypatch), para poder medir mientras un
volcado lo importa. Lo adoptado el 29-10 (informe §4.19) es la variante `real_mix2`:
compacidad 0,10 si pgf ≥ 0,75 y H·r ≤ 1,5, y |H·r| si pgf ≥ 0,75.

  .venv/Scripts/python.exe scripts/bench_domes.py --variants real real_mix2 [--studies auto|001 002] [--check] [--table] [--no-tissue]
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

BACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACK))
import scripts.gate_bench as gb  # noqa: E402

SRC = BACK / "data" / "zenodo_eval_full_p6_head"
OUT = BACK / "data" / "exp_gates_head"


@dataclass(frozen=True)
class V2(gb.Variant):
    sph_k: float = 1.0
    sph_ratio: float = 0.6
    merge_sum: bool = False
    #: Acuerdo entre canales del consenso: "fijo" = AGREE_MM (8 mm); "radio" =
    #: max(AGREE_MM, agree_k · radio mayor de los dos sitios): una cúpula de 25 mm
    #: tiene su pico de calibre y su región de curvatura a 10–14 mm.
    agree: str = "fijo"
    agree_k: float = 1.0
    #: Compacidad condicionada: si la región es muy convexa (pgf ≥ comp_lax_pgf) basta
    #: comp ≥ comp_lax. Las cúpulas que tira la compacidad (038: comp 0,18, pgf 0,81;
    #: 051: 0,19 / 0,86) son más convexas que las regiones de vaso que entrarían con
    #: 0,15 a secas (pgf 0,58–0,69, áreas de 100–230 mm²).
    comp_lax: float | None = None
    comp_lax_pgf: float = 0.75
    #: Puerta de curvatura media sobre |H·r| (sacos trombosados: la luz interior es
    #: cóncava, 037: 170 puntos, 109 mm², H·r = −1,34).
    hr_abs: bool = False
    #: Con hr_abs, el signo negativo solo se perdona si pgf ≥ hr_abs_pgf (en 109 entran
    #: tres regiones cóncavas con pgf 0,58–0,72 y echan de la lista una lesión de 3 mm).
    hr_abs_pgf: float = 0.0
    #: La compacidad relajada solo si además H·r ≤ comp_lax_hr_max: una cúpula tiene
    #: H·r ≈ 1 (038: 1,0; 051: 0,96); las regiones de vaso grandes que entran en 085
    #: con pgf 0,81–0,86 tienen H·r 2,0–2,2 (r ajustado 7,7 mm, esfericidad 0,45).
    comp_lax_hr_max: float = 1e9
    #: Canal de «saco pequeño» (29-10 tarde): regiones de las dos escalas con la curvatura
    #: de una esfera (saco_hr_lo ≤ H·r ≤ saco_hr_hi), esféricas y compactas, de radio
    #: ajustado ≤ saco_r_max, ordenadas por esfericidad × pgf; entran en el consenso como
    #: canal propio (familia saco_family) con tope saco_top. Cuatro sacos pequeños del
    #: banco (029_1, 098, 101, 154_2) forman región propia a 4 mm y el orden por área
    #: los deja detrás del tope de 40 del canal de curvatura.
    saco: bool = False
    saco_top: int = 10
    saco_hr_lo: float = 0.7
    saco_hr_hi: float = 1.3
    saco_sph: float = 0.6
    saco_comp: float = 0.3
    saco_pgf: float = 0.7
    saco_r_max: float = 3.5
    saco_family: str = "forma"
    #: Medido 29-10 tarde: el canal con sus puestos tal cual gana 8 entre 10 y 3 entre 5
    #: pero quita el 1.º a 108, 126 y 105 y baja un puesto a una docena de grandes: sus
    #: sitios entran en los puestos 1–2. Dos formas de acotarlo: saco_offset suma un
    #: desplazamiento al puesto del canal (1 → 1 + offset); saco_quota = k garantiza al
    #: mejor sitio del canal el puesto k si no está ya entre los k (desplaza al k-ésimo).
    saco_offset: int = 0
    saco_quota: int = 0


import services.aneurysm_consensus as ac  # noqa: E402

_CURRENT: list = [None]
_orig_consensus_merge = ac._merge


def _hit_radius(h) -> float:
    r = float(h.radius_mm or 0.0)
    if h.candidate is not None and getattr(h.candidate, "diameter_mm", None):
        r = max(r, float(h.candidate.diameter_mm) / 2.0)
    return r


def _merge_agree(hits, position, channel, rank, radius_mm, ratio):
    v = _CURRENT[0]
    mode = getattr(v, "agree", "fijo") if v is not None else "fijo"
    if mode == "fijo":
        return _orig_consensus_merge(hits, position, channel, rank, radius_mm, ratio)
    p = np.asarray(position)
    if mode == "nearest":
        # El consenso real funde con el PRIMER sitio a ≤ 8 mm en el orden de la lista;
        # aquí con el MÁS CERCANO (115_1 repartía sus votos entre dos sitios vecinos).
        best, best_d = None, None
        for h in hits:
            d = float(np.linalg.norm(p - np.asarray(h.position)))
            if d <= ac.AGREE_MM and (best is None or d < best_d):
                best, best_d = h, d
        if best is not None:
            best.ranks[channel] = min(rank, best.ranks.get(channel, rank))
            best.radius_mm = max(best.radius_mm, radius_mm)
            best.ratio = max(best.ratio, ratio)
            return
        hits.append(ac.ConsensusHit(position=position, ranks={channel: rank}, radius_mm=radius_mm, ratio=ratio))
        return
    for h in hits:
        thr = max(ac.AGREE_MM, v.agree_k * max(_hit_radius(h), float(radius_mm)))
        if float(np.linalg.norm(p - np.asarray(h.position))) <= thr:
            h.ranks[channel] = min(rank, h.ranks.get(channel, rank))
            h.radius_mm = max(h.radius_mm, radius_mm)
            h.ratio = max(h.ratio, ratio)
            return
    hits.append(ac.ConsensusHit(position=position, ranks={channel: rank}, radius_mm=radius_mm, ratio=ratio))


ac._merge = _merge_agree
CH_SACO = "saco"
_orig_family_ranks = ac._family_ranks


def _family_ranks(hit):
    """Con saco_family == "ninguna" el canal de saco no cuenta como familia: medido el
    29-10, al fundirse con un sitio de solo calibre le daba una segunda familia y ese
    sitio adelantaba a la lesión (126, 154 pierden el 1.º aunque el canal vaya al final)."""
    v = _CURRENT[0]
    if v is not None and getattr(v, "saco_family", "forma") == "ninguna" and CH_SACO in hit.ranks:
        ranks = {k: r for k, r in hit.ranks.items() if k != CH_SACO}
        if not ranks:
            return {"saco": hit.ranks[CH_SACO]}
        from types import SimpleNamespace
        return _orig_family_ranks(SimpleNamespace(ranks=ranks))
    return _orig_family_ranks(hit)


ac._family_ranks = _family_ranks


def small_sac_regions(study, v) -> list[dict]:
    """Regiones de las dos escalas con forma de saco pequeño, ordenadas (mejor primero)."""
    pool = list(study.regions[v.gauss]["regions"])
    if v.gauss_union is not None:
        pool += study.regions[v.gauss_union]["regions"]
    out = []
    for reg in pool:
        hr = reg["H"] * reg["r"]
        if reg["n"] < v.min_points or reg["r"] < v.r_min or reg["r"] > v.saco_r_max:
            continue
        if not (v.saco_hr_lo <= hr <= v.saco_hr_hi):
            continue
        if reg["sph"] < v.saco_sph or reg["comp"] < v.saco_comp or reg["pgf"] < v.saco_pgf:
            continue
        out.append(dict(reg, key=reg["sph"] * reg["pgf"]))
    out.sort(key=lambda r: -r["key"])
    # duplicados entre escalas: misma regla de cajas que el canal de curvatura
    kept: list[dict] = []
    for r in out:
        p = np.asarray(r["centroid"])
        if any(float(np.linalg.norm(p - np.asarray(m["centroid"]))) < gb.merge_radius_mm(m, r, v) for m in kept):
            continue
        kept.append(r)
    return kept


def consensus_list(study, v, top):
    """Como gb.consensus_list, con el canal de saco pequeño detrás de los de curvatura."""
    from types import SimpleNamespace
    from scripts.exp_p3_eval import _RATIO_CACHE, _ratio_radio
    from services.aneurysm_consensus import (AGREE_MM, CH_CALIBRE, CH_CURVATURE, CH_RATIO,
                                             ConsensusHit, _peaks, calibre_ratio, order_hits)
    _CURRENT[0] = v
    cands, gates = gb.curvature_channel(study, v)
    hits: list[ConsensusHit] = []
    for r in cands:
        fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
        hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={CH_CURVATURE: r["rank"]},
                                 candidate=fake, on_border=r["border"]))
    if v.gauss2 is not None:
        ac._FAMILY.setdefault(gb.CH_GRUESA, "forma")
        ac._CHANNEL_ORDER.setdefault(gb.CH_GRUESA, 0)
        gruesa, _ = gb.curvature_channel(study, replace(v, gauss=v.gauss2, gauss2=None))
        for r in gruesa:
            p = np.asarray(r["centroid"])
            for h in hits:
                if float(np.linalg.norm(p - np.asarray(h.position))) <= AGREE_MM:
                    h.ranks[gb.CH_GRUESA] = min(r["rank"], h.ranks.get(gb.CH_GRUESA, r["rank"]))
                    break
            else:
                fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
                hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={gb.CH_GRUESA: r["rank"]},
                                         candidate=fake, on_border=r["border"]))
    if getattr(v, "saco", False):
        ac._FAMILY[CH_SACO] = v.saco_family
        ac._CHANNEL_ORDER.setdefault(CH_SACO, 3)
        for rank, r in enumerate(small_sac_regions(study, v)[:v.saco_top], start=1 + v.saco_offset):
            p = np.asarray(r["centroid"])
            best, best_d = None, None
            for h in hits:
                d = float(np.linalg.norm(p - np.asarray(h.position)))
                if d <= AGREE_MM and (best is None or d < best_d):
                    best, best_d = h, d
            if best is not None:
                best.ranks[CH_SACO] = min(rank, best.ranks.get(CH_SACO, rank))
            else:
                fake = SimpleNamespace(diameter_mm=2.0 * r["r"], region=r)
                hits.append(ConsensusHit(position=tuple(r["centroid"]), ranks={CH_SACO: rank},
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
                ac._merge(hits, tuple(float(x) for x in pts[i]), channel, rank, float(rad[i]), float(ratio[i]))
    if v.consensus == "sin_calibre_solo":
        hits = [h for h in hits if set(h.ranks) != {CH_CALIBRE}]
    elif v.consensus != "actual":
        raise ValueError(v.consensus)
    ordered = order_hits(hits)
    q = getattr(v, "saco_quota", 0)
    if q and getattr(v, "saco", False):
        k = next((i for i, h in enumerate(ordered) if CH_SACO in h.ranks), None)
        if k is not None and k >= q:
            h = ordered.pop(k)
            ordered.insert(q - 1, h)
    return ordered[:top], gates


gb.consensus_list = consensus_list


def merge_radius_mm(a: dict, b: dict, v) -> float:
    if getattr(v, "merge", None) == "esfera":
        ra, rb = a["r"], b["r"]
        if min(ra, rb) / max(ra, rb, 1e-6) >= v.sph_ratio and \
                v.sph_k * max(ra, rb) > max(v.merge_min, (a["dims"][2] + b["dims"][2]) / 2.0):
            return v.sph_k * max(ra, rb)
        return max(v.merge_min, (a["dims"][2] + b["dims"][2]) / 2.0)
    return _orig_merge(a, b, v)


_orig_merge = gb.merge_radius_mm
gb.merge_radius_mm = merge_radius_mm


def curvature_channel(study, v):
    from scripts.exp_p3_eval import _order_key
    dump = study.regions[v.gauss]
    gauss_thr, mean_gate = dump["gauss_threshold"], dump["mean_curv_p75"]
    passed, gates = [], []
    pool = list(dump["regions"])
    if v.gauss_union is not None:
        pool += study.regions[v.gauss_union]["regions"]
    for reg in pool:
        hr = reg["H"] * reg["r"]
        if reg["n"] < v.min_points:
            gates.append("points"); continue
        if reg["r"] < v.r_min or reg["r"] > v.r_max:
            gates.append("size"); continue
        hr_signed = hr
        if getattr(v, "hr_abs", False) and reg["pgf"] >= getattr(v, "hr_abs_pgf", 0.0):
            hr = abs(hr)
        convexa = (hr >= v.hr_min) if v.hr_min is not None else (reg["H"] >= mean_gate)
        if not convexa:
            gates.append("mean_curv"); continue
        if reg["pgf"] < v.pgf_min:
            gates.append("pgf"); continue
        comp_min = v.comp_min
        if getattr(v, "comp_lax", None) is not None and reg["pgf"] >= v.comp_lax_pgf \
                and hr_signed <= getattr(v, "comp_lax_hr_max", 1e9):
            comp_min = v.comp_lax
        if reg["comp"] < comp_min:
            gates.append("compactness"); continue
        if reg["sph"] < v.sph_min:
            gates.append("sphericity"); continue
        gates.append("ok")
        passed.append(dict(reg, key=_order_key(reg, v, gauss_thr, mean_gate), idx=len(gates) - 1))
    passed.sort(key=lambda r: -r["key"])
    merged: list[dict] = []
    for r in passed:
        p = np.asarray(r["centroid"])
        host = next((m for m in merged
                     if float(np.linalg.norm(p - np.asarray(m["centroid"]))) < gb.merge_radius_mm(m, r, v)), None)
        if host is not None:
            gates[r["idx"]] = "merged"
            if getattr(v, "merge_sum", False):
                host["key"] += r["key"]
            continue
        merged.append(dict(r))
    if getattr(v, "merge_sum", False):
        merged.sort(key=lambda r: -r["key"])
    for r in merged[v.cap:]:
        gates[r["idx"]] = "cap"
    cands = sorted(merged[:v.cap], key=lambda r: r["border"])
    for k, r in enumerate(cands, start=1):
        r["rank"] = k
    return cands, {i: g for i, g in enumerate(gates)}


gb.curvature_channel = curvature_channel

REAL = V2(gauss="k0.028", order="area_pgf", merge="suma_ext", gauss_union="k0.06")
VARIANTS = {
    "real": REAL,
    "real_sum": replace(REAL, merge_sum=True),
    "real_esf10": replace(REAL, merge="esfera", sph_k=1.0, sph_ratio=0.6),
    "real_esf15": replace(REAL, merge="esfera", sph_k=1.5, sph_ratio=0.6),
    "real_esf20": replace(REAL, merge="esfera", sph_k=2.0, sph_ratio=0.6),
    "real_esf15_r8": replace(REAL, merge="esfera", sph_k=1.5, sph_ratio=0.8),
    "real_esf15_r4": replace(REAL, merge="esfera", sph_k=1.5, sph_ratio=0.4),
    "real_esf10_sum": replace(REAL, merge="esfera", sph_k=1.0, sph_ratio=0.6, merge_sum=True),
    "real_esf15_sum": replace(REAL, merge="esfera", sph_k=1.5, sph_ratio=0.6, merge_sum=True),
    "real_esf20_sum": replace(REAL, merge="esfera", sph_k=2.0, sph_ratio=0.6, merge_sum=True),
    "real_agr075": replace(REAL, agree="radio", agree_k=0.75),
    "real_agr10": replace(REAL, agree="radio", agree_k=1.0),
    "real_agr125": replace(REAL, agree="radio", agree_k=1.25),
    "real_agr15": replace(REAL, agree="radio", agree_k=1.5),
    "real_agr10_sum": replace(REAL, agree="radio", agree_k=1.0, merge_sum=True),
    "real_agr10_esf15": replace(REAL, agree="radio", agree_k=1.0, merge="esfera", sph_k=1.5, sph_ratio=0.6),
    "real_cap60": replace(REAL, cap=60),
    "real_cap60_sum": replace(REAL, cap=60, merge_sum=True),
    "real_mfijo": replace(REAL, merge="fijo"),
    "real_msr": replace(REAL, merge="suma_r"),
    "real_mme": replace(REAL, merge="max_ext"),
    "real_comp15": replace(REAL, comp_min=0.15),
    "real_c15p75": replace(REAL, comp_lax=0.15, comp_lax_pgf=0.75),
    "real_c15p70": replace(REAL, comp_lax=0.15, comp_lax_pgf=0.70),
    "real_c15p80": replace(REAL, comp_lax=0.15, comp_lax_pgf=0.80),
    "real_c10p80": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80),
    "real_c10p75": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75),
    "real_c05p80": replace(REAL, comp_lax=0.05, comp_lax_pgf=0.80),
    "real_hrabs": replace(REAL, hr_abs=True),
    "real_hrabs_p75": replace(REAL, hr_abs=True, hr_abs_pgf=0.75),
    "real_hrabs_p70": replace(REAL, hr_abs=True, hr_abs_pgf=0.70),
    "real_c10p80h15": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80, comp_lax_hr_max=1.5),
    "real_c05p80h15": replace(REAL, comp_lax=0.05, comp_lax_pgf=0.80, comp_lax_hr_max=1.5),
    "real_c15p80h15": replace(REAL, comp_lax=0.15, comp_lax_pgf=0.80, comp_lax_hr_max=1.5),
    "real_c10p75h15": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5),
    "real_c10p80h13": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80, comp_lax_hr_max=1.3),
    "real_mix": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75),
    "real_c10p70h15": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.70, comp_lax_hr_max=1.5),
    "real_c10p75h13": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.3),
    "real_c10p75h20": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=2.0),
    "real_mix2": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75),
    "real_mix3": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.70, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75),
    # 29-10 tarde, sobre lo adoptado (mix2): fusión del consenso con el sitio más cercano y canal de saco pequeño.
    "mix2_near": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, agree="nearest"),
    "mix2_saco": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True),
    "mix2_saco5": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_top=5),
    "mix2_saco20": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_top=20),
    "mix2_sacoF": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_family="saco"),
    "mix2_saco_sph7": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_sph=0.7),
    "mix2_saco_near": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, agree="nearest"),
    "mix2_saco_o2": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=2),
    "mix2_saco_o3": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=3),
    "mix2_saco_o4": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=4),
    "mix2_saco_q5": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=5),
    "mix2_saco_q4": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=4),
    "mix2_saco_q5s7": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=5, saco_sph=0.7),
    "mix2_saco_q5n": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=5, saco_family="ninguna"),
    "mix2_saco_q4n": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=4, saco_family="ninguna"),
    "mix2_saco_o2n": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=2, saco_family="ninguna"),
    "mix2_saco_o3n": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=3, saco_family="ninguna"),
    "mix2_saco_q5n_s7": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=5, saco_family="ninguna", saco_sph=0.7),
    "mix2_saco_q5c4": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.75, saco=True, saco_offset=40, saco_quota=5, saco_comp=0.4),
    "real_mix2_p70": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.70),
    "real_mix2_p80": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.75, comp_lax_hr_max=1.5, hr_abs=True, hr_abs_pgf=0.80),
    "real_c10p80_hrabs": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80, hr_abs=True),
    "real_c10p80_cap60": replace(REAL, comp_lax=0.10, comp_lax_pgf=0.80, cap=60),
    "real_comp10": replace(REAL, comp_min=0.10),
    "real_hr06": replace(REAL, hr_min=0.6),
    "real_pts4": replace(REAL, min_points=4),
    "real_sph30": replace(REAL, sph_min=0.30),
}
gb.VARIANTS.update(VARIANTS)


def ready_studies() -> list[str]:
    reg = OUT / "regions"
    return [sid for sid in gb.study_ids(SRC)
            if (reg / f"{sid}_pk0.028.json").exists() and (reg / f"{sid}_pk0.06.json").exists()
            and (OUT / "meshes" / f"{sid}.json").exists()]


def _band(mm) -> str:
    if mm is None:
        return "?"
    return "<5" if mm < 5 else ("5-10" if mm < 10 else ">=10")


def bands_line(res: dict) -> str:
    out = []
    for b in ("<5", "5-10", ">=10"):
        rows = [r for r in res["rows"] if _band(r["mm"]) == b]
        ks = [r["rank"] for r in rows]
        out.append(f"{b}: n={len(rows)} 1.º={sum(1 for k in ks if k == 1)} top5={sum(1 for k in ks if k and k <= 5)} "
                   f"top10={sum(1 for k in ks if k and k <= 10)} lista={sum(1 for k in ks if k)}")
    return " | ".join(out)


_orig_evaluate = gb.evaluate


def evaluate(studies, v, long, *, tissue=True):
    """Como gb.evaluate, pero la «región más cercana» se busca en las DOS escalas
    (gauss y gauss_union) y se guarda la de cada una con su puerta: una lesión de
    3–4 mm puede estar fundida en una región de vaso a 6 mm y ser región propia a 4,1."""
    import math
    from scripts.bench_detector import match_rank
    rows = []
    bone_ctl = bone_ia = n_ctl = n_ia = 0
    cands_ctl = []
    for s in studies:
        hits, gates = gb.long_list(s, v, long)
        if tissue:
            labs = [gb._tissue(s, h.position) for h in hits[:5]]
            if s.has_ia:
                bone_ia += labs.count("bone"); n_ia += len(labs)
            else:
                bone_ctl += labs.count("bone"); n_ctl += len(labs)
        if not s.has_ia:
            cands_ctl.append(len(hits[:5]))
        pool_a = s.regions[v.gauss]["regions"]
        pool_b = s.regions[v.gauss_union]["regions"] if v.gauss_union else []
        for l in s.lesions:
            pos = tuple(l["position"])
            rank, hit = match_rank(pos, hits)
            near = near2 = None
            if pool_a:
                k = min(range(len(pool_a)), key=lambda i: math.dist(pos, pool_a[i]["centroid"]))
                near = (gates.get(k), round(math.dist(pos, pool_a[k]["centroid"]), 1), pool_a[k])
            if pool_b:
                k = min(range(len(pool_b)), key=lambda i: math.dist(pos, pool_b[i]["centroid"]))
                near2 = (gates.get(len(pool_a) + k), round(math.dist(pos, pool_b[k]["centroid"]), 1), pool_b[k])
            rows.append({"study": s.sid, "file": l["file"], "mm": l.get("diameter_mm"), "thrombus": l.get("thrombus"),
                         "ref_rank": l.get("rank"), "rank": rank, "channels": dict(hit.ranks) if hit else {},
                         "near_gate": near[0] if near else None, "near_mm": near[1] if near else None,
                         "near": near[2] if near else None,
                         "near2_gate": near2[0] if near2 else None, "near2_mm": near2[1] if near2 else None,
                         "near2": near2[2] if near2 else None})
    ranks = [r["rank"] for r in rows]
    import statistics as st
    res = {"variant": v, "rows": rows,
           "top5": sum(1 for k in ranks if k and k <= 5), "top10": sum(1 for k in ranks if k and k <= 10),
           "first": sum(1 for k in ranks if k == 1), "in_list": sum(1 for k in ranks if k), "lesions": len(rows),
           "studies_top5": len({r["study"] for r in rows if r["rank"] and r["rank"] <= 5}),
           "bone_ctl": f"{bone_ctl}/{n_ctl}", "bone_ia": f"{bone_ia}/{n_ia}",
           "cands_ctl_med": st.median(cands_ctl) if cands_ctl else None,
           "ctl_lt5": sum(1 for c in cands_ctl if c < 5)}
    print("    bandas  " + bands_line(res))
    return res


def _fmt_row(r: dict) -> str:
    def reg(n, g, d):
        n = n or {}
        hr = n.get("H", 0.0) * n.get("r", 0.0) if n else 0.0
        return (f"{g} a {d} mm (n={n.get('n')} r={n.get('r')} H·r={hr:.2f} área={n.get('area')} "
                f"pgf={n.get('pgf')} comp={n.get('comp')} sph={n.get('sph')})")
    return (f"    {r['study']} {r['file']:<14} {r['mm'] or 0:5.1f} mm puesto={r['rank']!s:<5} (ref {r['ref_rank']!s:<4}) "
            f"{r['channels']} | k6: {reg(r['near'], r['near_gate'], r['near_mm'])} | k4: {reg(r['near2'], r['near2_gate'], r['near2_mm'])}")


gb._fmt_row = _fmt_row


gb.evaluate = evaluate


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", nargs="*", default=["real"])
    ap.add_argument("--studies", nargs="*", default=["auto"])
    ap.add_argument("--long", type=int, default=40)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--table", action="store_true")
    ap.add_argument("--no-tissue", action="store_true")
    a = ap.parse_args()
    studies = ready_studies() if a.studies == ["auto"] else a.studies
    ns = argparse.Namespace(src=SRC, out=OUT, variants=a.variants, studies=studies, long=a.long,
                            check=a.check, table=a.table, no_tissue=a.no_tissue)
    gb.cmd_eval(ns)


if __name__ == "__main__":
    main()
