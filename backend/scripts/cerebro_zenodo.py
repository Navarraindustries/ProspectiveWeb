"""¿Cuántos falsos positivos quita una máscara de cerebro sin perder aciertos? (O3, Kim 2025)

Para el PC de la oficina. No segmenta ni detecta, y no necesita el DICOM:
lee los candidatos de una pasada de `eval_zenodo.py` (los mismos `--runs` que
`froc_zenodo.py`) y una máscara de cerebro por estudio, la de TotalSegmentator:

    TotalSegmentator -i "Archivos DICOM/Studies/002" -o mascaras/002 --fast --roi_subset brain

deja `mascaras/002/brain.nii.gz`. También vale `mascaras/002.nii.gz`.

Para cada estudio con máscara:
  · la distancia (mm) de cada candidato de la lista larga y de cada lesión a
    la máscara (0 = dentro), con `services.brain_mask`;
  · para cada margen (`--margenes`, mm), la lista larga sin los candidatos a
    más de ese margen, renumerada, y la FROC de siempre (lesiones y FP por
    estudio entre los K primeros, reglas del banco y de los artículos);
  · qué lesiones se pierden: estaban entre los K sin filtro y ya no.

Todo se compara sobre el MISMO subconjunto de estudios (los que tienen
máscara): «sin filtro» es la referencia, no las cifras de los 172.

Uso (desde backend/):
    .venv/Scripts/python.exe scripts/cerebro_zenodo.py \\
        --runs data/zenodo_eval_dos_escalas_rapido data/zenodo_eval_craneo_flojo \\
        --mascaras D:/mascaras_cerebro --json data/cerebro_zenodo.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.froc_zenodo import REGLAS, cargar, contar
from services.brain_mask import MascaraCerebro

MARGENES_MM = (0.0, 5.0, 10.0, 15.0, 20.0, 30.0)
CORTES = (1, 3, 5, 10)


def ruta_mascara(carpeta: Path, sid: str) -> Path | None:
    for r in (carpeta / sid / "brain.nii.gz", carpeta / f"{sid}.nii.gz", carpeta / sid / "brain.nii"):
        if r.exists():
            return r
    return None


def distancias(rec: dict, mascara: MascaraCerebro) -> dict:
    """Distancia (mm) de cada candidato de la lista larga y de cada lesión."""
    frame = rec.get("frame") or {}
    origin = frame.get("origin_mm") or (0.0, 0.0, 0.0)
    direction = frame.get("direction")
    lista = rec.get("long_list") or rec.get("candidates") or []
    lesiones = rec.get("lesions") or []

    def medir(items):
        if not items:
            return []
        pts = np.array([[float(v) for v in it["position"]] for it in items])
        return [round(float(d), 2) for d in mascara.distancia_malla_mm(pts, origin, direction)]

    return {"candidatos": medir(lista), "lesiones": medir(lesiones)}


def filas_filtradas(estudios: dict[str, dict], dist: dict[str, dict], regla,
                    margen: float | None) -> list[dict]:
    """Como `froc_zenodo.preparar`, sin los candidatos a más de *margen* mm (None = sin filtro)."""
    filas = []
    for sid in sorted(dist):
        d = estudios[sid]
        lesiones = d.get("lesions") or []
        lista = d.get("long_list") or d.get("candidates") or []
        cands, n = [], 0
        for c, dc in zip(lista, dist[sid]["candidatos"]):
            if margen is not None and dc > margen:
                continue
            n += 1
            cands.append({"rank": n, "rank_original": int(c["rank"]),
                          "toca": [i for i, l in enumerate(lesiones) if regla(l, c)]})
        filas.append({"study": sid, "ia": bool(d["meta"]["has_ia"]),
                      "lesiones": [float(l["diameter_mm"]) for l in lesiones], "cands": cands})
    return filas


def vistas(filas: list[dict], k: int) -> set[tuple[str, int]]:
    return {(f["study"], i) for f in filas for c in f["cands"] if c["rank"] <= k for i in c["toca"]}


def evaluar(estudios: dict[str, dict], dist: dict[str, dict],
            margenes=MARGENES_MM, cortes=CORTES) -> dict:
    out: dict = {"estudios": len(dist), "reglas": {}}
    for nombre, regla in REGLAS.items():
        base = filas_filtradas(estudios, dist, regla, None)
        por_margen = {}
        for m in [None, *margenes]:
            filas = base if m is None else filas_filtradas(estudios, dist, regla, m)
            fila = {"quitados_por_estudio": (sum(len(f["cands"]) for f in base)
                                             - sum(len(f["cands"]) for f in filas)) / max(1, len(filas))}
            for k in cortes:
                c = contar(filas, k)
                perdidas = sorted(vistas(base, k) - vistas(filas, k))
                ganadas = sorted(vistas(filas, k) - vistas(base, k))
                fila[str(k)] = {"lesiones": c["lesiones"], "n_lesiones": c["n_lesiones"],
                                "fp_por_estudio": round(c["fp_por_estudio"], 3),
                                "perdidas": [f"{s}#{i + 1}" for s, i in perdidas],
                                "ganadas": len(ganadas)}
            por_margen["sin filtro" if m is None else f"{m:g}"] = fila
        out["reglas"][nombre] = por_margen
    les = [(sid, i, d) for sid, v in dist.items() for i, d in enumerate(v["lesiones"])]
    ds = sorted(d for _, _, d in les)
    out["lesiones_distancia_mm"] = {
        "n": len(ds),
        "dentro": sum(1 for d in ds if d == 0.0),
        "percentiles": {p: ds[min(len(ds) - 1, int(p / 100 * len(ds)))] for p in (50, 90, 95, 100)} if ds else {},
        "lejos": sorted(([f"{s}#{i + 1}", d] for s, i, d in les if d > 10.0), key=lambda t: -t[1]),
    }
    cand = [d for v in dist.values() for d in v["candidatos"]]
    out["candidatos_distancia_mm"] = {"n": len(cand),
                                      "fuera_de_10": sum(1 for d in cand if d > 10.0),
                                      "fuera_de_20": sum(1 for d in cand if d > 20.0)}
    return out


def imprimir(res: dict) -> None:
    ld = res["lesiones_distancia_mm"]
    print(f"{res['estudios']} estudios con máscara · {ld['n']} lesiones, {ld['dentro']} dentro del cerebro; "
          f"distancia p50/p90/p95/máx: {ld.get('percentiles')}")
    if ld["lejos"]:
        print("  lesiones a > 10 mm:", ", ".join(f"{s} ({d} mm)" for s, d in ld["lejos"]))
    for nombre, por_margen in res["reglas"].items():
        print(f"\n== Regla {nombre}")
        print("margen       quitados/est  " + "  ".join(f"K={k}: les  FP/est  perd." for k in CORTES))
        for m, fila in por_margen.items():
            cols = "  ".join(f"     {fila[str(k)]['lesiones']:3d}  {fila[str(k)]['fp_por_estudio']:5.2f}  "
                             f"{len(fila[str(k)]['perdidas']):4d}" for k in CORTES)
            print(f"{m:>10s}   {fila['quitados_por_estudio']:9.1f}    {cols}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=Path, nargs="+", required=True)
    ap.add_argument("--mascaras", type=Path, required=True)
    ap.add_argument("--margenes", type=float, nargs="*", default=list(MARGENES_MM))
    ap.add_argument("--etiqueta", type=int, default=None,
                    help="valor del cerebro si la máscara es de varias clases (--ml)")
    ap.add_argument("--json", type=Path, default=None)
    a = ap.parse_args(argv)

    estudios = {s: r for s, r in cargar(a.runs).items() if r.get("status", "ok") == "ok"}
    dist: dict[str, dict] = {}
    sin = []
    for sid in sorted(estudios):
        ruta = ruta_mascara(a.mascaras, sid)
        if ruta is None:
            sin.append(sid)
            continue
        m = MascaraCerebro.desde_fichero(ruta, etiqueta=a.etiqueta)
        if m.vacia:
            print(f"[{sid}] máscara vacía, fuera")
            sin.append(sid)
            continue
        dist[sid] = distancias(estudios[sid], m)
    if sin:
        print(f"{len(sin)} estudios sin máscara (no cuentan): {' '.join(sin[:20])}{' …' if len(sin) > 20 else ''}")
    if not dist:
        print("ningún estudio con máscara")
        return 1
    res = evaluar(estudios, dist, margenes=tuple(a.margenes))
    res["sin_mascara"] = sin
    res["distancias"] = dist
    imprimir(res)
    if a.json:
        a.json.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n→ {a.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
