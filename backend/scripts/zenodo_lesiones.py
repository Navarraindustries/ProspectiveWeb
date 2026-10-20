"""Tabla por lesión y recuentos de una pasada de `eval_zenodo.py`, solo desde los JSON.

No carga VTK ni volúmenes: se puede pasar mientras la pasada sigue corriendo.

Uso:
    .venv/Scripts/python.exe scripts/zenodo_lesiones.py [--out data/zenodo_eval_full_p3] [--sin-tabla]
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter
from pathlib import Path

BONE_HU = 700.0


def load(out: Path) -> list[dict]:
    recs = []
    for p in sorted(out.glob("*.json")):
        if p.name == "summary.json":
            continue
        recs.append(json.loads(p.read_text(encoding="utf-8")))
    return recs


def lesion_rows(recs: list[dict]) -> list[dict]:
    rows = []
    for r in recs:
        if r.get("status") != "ok":
            continue
        for les in r.get("lesions", []):
            reg = les.get("region") or {}
            rows.append({
                "study": r["study"], "lesion": les["file"].replace("an_", "").replace(".stl", ""),
                "size": les.get("size_class"), "kind": les.get("kind"), "d_mm": les.get("diameter_mm"),
                "calc": bool(les.get("calcification")), "thr": bool(les.get("thrombus")),
                "artery": les.get("artery"), "recall": les.get("surface_recall"), "rank": les.get("rank"),
                "reason": les.get("reason") or "", "gate": reg.get("gate") or "", "npts": reg.get("n_points"),
                "r": reg.get("radius_mm"), "hr": reg.get("mean_curv_x_radius"), "pgf": reg.get("positive_gauss_frac"),
                "comp": reg.get("compactness"), "area": reg.get("area_mm2"), "dist": les.get("region_dist_mm"),
                "hn": r.get("meta", {}).get("head_neck"), "tree": r["segment"]["components_info"]["looks_like_tree"],
            })
    return rows


def _f(v, w, d=1):
    if v is None:
        return " " * w
    return f"{v:{w}.{d}f}" if isinstance(v, float) else f"{v!s:>{w}}"


def print_table(rows: list[dict]) -> None:
    print("est lesion  tam     tipo         d_mm C T art     recall rank motivo       gate       npts    r   H·r  pgf  comp   area  dist hn árbol")
    for t in rows:
        print(f"{t['study']:>3} {t['lesion']:<7} {t['size']!s:<7} {t['kind']!s:<12}{_f(t['d_mm'],5)} "
              f"{'C' if t['calc'] else ' '} {'T' if t['thr'] else ' '} {t['artery']!s:<7} {_f(t['recall'],6,2)} "
              f"{_f(t['rank'],4)} {t['reason']:<12} {t['gate']:<10} {_f(t['npts'],4)} {_f(t['r'],5,2)} {_f(t['hr'],5,2)} "
              f"{_f(t['pgf'],4,2)} {_f(t['comp'],5,3)} {_f(t['area'],6)} {_f(t['dist'],5)} {str(t['hn'])[:1]} {str(t['tree'])[:1]}")


def _bucket(rows: list[dict], key: str) -> dict:
    d: dict = {}
    for t in rows:
        b = d.setdefault(str(t[key]), [0, 0, 0, 0])
        b[0] += 1
        if t["rank"]:
            b[1] += 1
            b[2] += t["rank"] <= 5
            b[3] += t["rank"] <= 10
    return {k: f"{v[0]} · lista {v[1]} · top5 {v[2]} · top10 {v[3]}" for k, v in sorted(d.items())}


def print_counts(recs: list[dict], rows: list[dict]) -> None:
    ok = [r for r in recs if r.get("status") == "ok"]
    print(f"estudios {len(recs)} (ok {len(ok)}, aneurisma {sum(r['has_ia'] for r in ok)}, control {sum(not r['has_ia'] for r in ok)})")
    secs = [r["seconds"] for r in ok]
    if secs:
        print(f"segundos/estudio: mediana {statistics.median(secs):.0f}, máx {max(secs):.0f} (reloj de pared; incluye suspensiones)")
    print("factor de reducción:", dict(sorted(Counter(r["segment"]["downsample_factor"] for r in ok).items())))
    print("árbol (calibre/cociente encendidos):", Counter(r["segment"]["components_info"]["looks_like_tree"] for r in ok))
    ranks = [t["rank"] for t in rows]
    print(f"\nlesiones {len(rows)}: en lista {sum(1 for x in ranks if x)}, top5 {sum(1 for x in ranks if x and x <= 5)}, "
          f"top10 {sum(1 for x in ranks if x and x <= 10)}")
    print("motivos del fallo:", dict(Counter(t["reason"] for t in rows if not t["rank"]).most_common()))
    lost = [t for t in rows if t["recall"] is not None and t["recall"] < 0.5]
    print(f"fuera de la malla (recall < 0,5): {len(lost)} → {[t['lesion'] for t in lost]}")
    neg = [t for t in rows if t["hr"] is not None and t["hr"] < 0]
    print(f"H·r negativo en la región más cercana: {len(neg)} → {[t['lesion'] for t in neg]}")
    cap = [t for t in rows if t["reason"] == "cap"]
    print(f"tope de lista (región válida fuera de los 40): {len(cap)} → {[(t['lesion'], t['area']) for t in cap]}")
    for key in ("size", "kind", "calc", "thr", "hn", "tree"):
        print(f"por {key}:", _bucket(rows, key))
    tis: Counter = Counter()
    bone = {"ctl": [0, 0], "ia": [0, 0]}
    for r in ok:
        for c in r.get("candidates", []):
            tis[c.get("tissue")] += 1
            if c.get("hu") is not None:
                b = bone["ia" if r["has_ia"] else "ctl"]
                b[1] += 1
                b[0] += (c.get("hu_max") or 0) >= BONE_HU
    print(f"\ncandidatos por tejido: {dict(tis)}; en hueso: control {bone['ctl'][0]}/{bone['ctl'][1]}, aneurisma {bone['ia'][0]}/{bone['ia'][1]}")
    print("candidatos por estudio:", dict(Counter(r["n_candidates"] for r in ok)))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "zenodo_eval_full_p3")
    ap.add_argument("--sin-tabla", action="store_true")
    args = ap.parse_args()
    recs = load(args.out)
    rows = lesion_rows(recs)
    if not args.sin_tabla:
        print_table(rows)
        print()
    print_counts(recs, rows)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
