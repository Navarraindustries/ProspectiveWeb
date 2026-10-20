"""Banco de medida del detector sobre las lesiones anotadas del dataset Zenodo.

    python scripts/bench_detector.py [--report data/ingest_zenodo.json] [--studies 002,008]
        [--top 40] [--roi-mm 40] [--set clave=valor ...] [--out data/bench_detector.json]

Para cada estudio ingerido con `scripts/ingest_zenodo.py` que tenga aneurisma,
toma la malla guardada de su sesión y pasa el mismo camino que la API
(`routers.detect._detect_hits`: curvatura sobre ≤ 80 000 vértices, calibre y
cociente sobre ≤ 40 000, consenso), con la traza por región del detector
encendida. Por cada lesión (centroide del STL en coordenadas de malla) dice:

- `rank`: puesto en la lista del consenso (misma regla que la verdad de terreno:
  a menos de max(5 mm, diámetro del candidato) de su centro), o null;
- `channel_ranks`: puesto en cada canal del candidato que es la lesión;
- `reason` cuando no está: la puerta que rechazó la región de curvatura más
  cercana ("size", "mean_curv", "pgf", "compactness", "sphericity", "points"),
  "merged"/"cap" si pasó todas y se perdió después, o "sin_region" si ninguna
  región de curvatura alta llegó a menos del diámetro de la lesión;
- `region`: las métricas de esa región, para ver cuánto le faltó.

`--set` cambia un parámetro del preset del detector solo en este proceso
(`--set min_positive_gauss_frac=0.3`), para probar un ajuste sobre las 46
lesiones antes de tocar el código. `--roi-mm R` recorta la malla a una esfera
de R mm alrededor de la lesión ANTES de detectar: es un oráculo (usa la
respuesta), y mide el techo de lo que daría una región de interés automática.

El resumen final cuenta lesiones en la lista, entre 5 y entre 10, cuántas
encuentra cada canal y el reparto de motivos de los fallos. El JSON de --out
(en `backend/data/`, que git ignora) guarda todo por lesión.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("PROSPECTIVE_ALLOW_MULTI_PROCESS", "1")

#: Igual que routers.ground_truth.MIN_MATCH_MM.
MIN_MATCH_MM = 5.0
DEFAULT_REPORT = Path(__file__).resolve().parents[1] / "data" / "ingest_zenodo.json"
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "data" / "bench_detector.json"

Point = tuple[float, float, float]


@dataclass
class Lesion:
    position: Point          # coordenadas de malla (mm)
    diameter_mm: float
    file: str


@dataclass
class Case:
    study: str
    session_id: str
    modality: str
    mesh_path: Path
    lesions: list[Lesion]


# ── Casos ──────────────────────────────────────────────────────────────────── #

def _mesh_path(root: Path, session_id: str) -> Path | None:
    for sub in ("session_saves", "sessions"):
        p = root / sub / session_id / "meshes" / "vessel_tree.vtp"
        if p.exists():
            return p
    return None


def load_cases(report: dict, root: Path, studies: list[str] | None = None) -> list[Case]:
    """Los estudios con aneurisma del informe de la ingesta que aún tienen malla."""
    out = []
    for sid, rec in sorted(report.items()):
        if studies and sid not in studies:
            continue
        if rec.get("status") != "ok" or not rec.get("n_annotations"):
            continue
        mesh = _mesh_path(root, rec["session_id"])
        if mesh is None:
            continue
        lesions = [Lesion(position=tuple(float(v) for v in pos), diameter_mm=float(a["diameter_mm"]),
                          file=a["file"])
                   for pos, a in zip(rec["lesions_mesh_mm"], rec["annotations"])]
        out.append(Case(study=sid, session_id=rec["session_id"], modality=rec.get("modality", "CT"),
                        mesh_path=mesh, lesions=lesions))
    return out


# ── Reglas ─────────────────────────────────────────────────────────────────── #

def match_rank(point: Point, hits: list) -> tuple[int | None, Any]:
    """Puesto (1-based) del primer candidato que «es» la lesión, y el candidato."""
    from services.aneurysm_consensus import hit_diameter_mm
    for i, h in enumerate(hits, start=1):
        if math.dist(point, h.position) <= max(MIN_MATCH_MM, hit_diameter_mm(h)):
            return i, h
    return None, None


def nearest_region(point: Point, regions: list):
    return min(regions, key=lambda t: math.dist(point, t.centroid)) if regions else None


def failure_reason(point: Point, diameter_mm: float, regions: list) -> str:
    """Por qué la lesión no está: la puerta de la región más cercana, si la hay."""
    r = nearest_region(point, regions)
    if r is None or math.dist(point, r.centroid) > diameter_mm:
        return "sin_region"
    return r.gate


def summarize(rows: list[dict]) -> dict:
    ranks = [r["rank"] for r in rows]
    by_channel: dict[str, int] = {}
    reasons: dict[str, int] = {}
    for r in rows:
        for ch in r.get("channel_ranks", {}):
            by_channel[ch] = by_channel.get(ch, 0) + 1
        if r["rank"] is None and r.get("reason"):
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
    return {
        "lesions": len(rows),
        "in_list": sum(1 for k in ranks if k is not None),
        "top5": sum(1 for k in ranks if k is not None and k <= 5),
        "top10": sum(1 for k in ranks if k is not None and k <= 10),
        "by_channel": by_channel,
        "reasons": reasons,
    }


# ── Detector ───────────────────────────────────────────────────────────────── #

def build_detector(modality: str, overrides: list[str] | None = None):
    """El preset de la API para la modalidad, con `clave=valor` encima."""
    from routers.detect import _detector_for_modality
    det = _detector_for_modality(modality)
    for item in overrides or []:
        key, _, val = item.partition("=")
        key = key.strip()
        if not hasattr(det, key) or key.startswith("_"):
            raise ValueError(f"el detector no tiene el parámetro «{key}»")
        cur = getattr(det, key)
        setattr(det, key, type(cur)(val) if cur is not None else float(val))
    return det


def _clip_sphere(poly, center: Point, radius_mm: float):
    import vtk
    sph = vtk.vtkSphere(); sph.SetCenter(*center); sph.SetRadius(radius_mm)
    clip = vtk.vtkClipPolyData(); clip.SetInputData(poly); clip.SetClipFunction(sph)
    clip.InsideOutOn(); clip.Update()
    return clip.GetOutput()


def _region_dict(t) -> dict:
    d = asdict(t)
    d["centroid"] = [round(v, 2) for v in d["centroid"]]
    for k in ("radius_mm", "mean_curvature", "mean_curv_x_radius", "positive_gauss_frac",
              "compactness", "sphericity", "score"):
        d[k] = round(d[k], 4)
    return d


def bench_mesh(poly, lesions: list[Lesion], *, modality: str = "CT", detector=None,
               top: int = 40, roi_mm: float | None = None) -> dict:
    """Pasa el detector por una malla y mide cada lesión."""
    import routers.detect as rd

    detector = detector or build_detector(modality)
    detector.trace_regions = True
    detector.max_candidates = max(detector.max_candidates, top)
    old_top = rd._MAX_CANDIDATES
    rd._MAX_CANDIDATES = top
    try:
        out_lesions = []
        t0 = time.perf_counter()
        if roi_mm:
            # Oráculo: una pasada por lesión, cada una con su recorte.
            runs = [(_clip_sphere(poly, les.position, roi_mm), [les]) for les in lesions]
        else:
            runs = [(poly, lesions)]
        n_vertices = 0
        for mesh, group in runs:
            n_vertices = mesh.GetNumberOfPoints()
            hits, det = rd._detect_hits(mesh, modality, detector)
            for les in group:
                rank, hit = match_rank(les.position, hits)
                near = nearest_region(les.position, det.regions)
                row = {
                    "file": les.file, "diameter_mm": round(les.diameter_mm, 2),
                    "position": [round(v, 2) for v in les.position],
                    "rank": rank,
                    "channel_ranks": dict(hit.ranks) if hit else {},
                    "n_hits": len(hits),
                    "channels_on": sorted({c for h in hits for c in h.channels}),
                    "reason": None if rank else failure_reason(les.position, les.diameter_mm, det.regions),
                    "nearest_hit_mm": round(min(math.dist(les.position, h.position) for h in hits), 1) if hits else None,
                    "region": _region_dict(near) if near else None,
                    "region_dist_mm": round(math.dist(les.position, near.centroid), 1) if near else None,
                    "regions_total": det.n_regions_total,
                    "regions_ok": len(det.candidates),
                }
                out_lesions.append(row)
        return {
            "mesh": {"vertices": n_vertices, "roi_mm": roi_mm},
            "seconds": round(time.perf_counter() - t0, 1),
            "lesions": out_lesions,
        }
    finally:
        rd._MAX_CANDIDATES = old_top


# ── Línea de órdenes ───────────────────────────────────────────────────────── #

def _print_rows(study: str, res: dict, log=print) -> None:
    for r in res["lesions"]:
        puesto = f"puesto {r['rank']:>2}" if r["rank"] else "fuera    "
        canales = ",".join(f"{k}:{v}" for k, v in sorted(r["channel_ranks"].items())) or "-"
        motivo = "" if r["rank"] else f"  motivo {r['reason']}"
        reg = r["region"]
        extra = ""
        if reg and not r["rank"] and r["reason"] not in ("sin_region",):
            extra = (f"  (r={reg['radius_mm']:.1f} mm, H·r={reg['mean_curv_x_radius']:.2f}, "
                     f"pgf={reg['positive_gauss_frac']:.2f}, comp={reg['compactness']:.2f}, "
                     f"esf={reg['sphericity']:.2f}, {reg['n_points']} pts)")
        log(f"  {study} {r['file']:<14} ø{r['diameter_mm']:>5.1f} mm  {puesto}  canales {canales}{motivo}{extra}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--root", type=Path, default=DEFAULT_REPORT.parent, help="carpeta data/ con sessions y session_saves")
    ap.add_argument("--studies", default="")
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--roi-mm", type=float, default=None)
    ap.add_argument("--set", action="append", default=[], metavar="CLAVE=VALOR")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    a = ap.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    import vtk

    report = json.loads(a.report.read_text(encoding="utf-8"))
    studies = [s.strip() for s in a.studies.split(",") if s.strip()] or None
    cases = load_cases(report, a.root, studies)
    print(f"{len(cases)} estudios con aneurisma, {sum(len(c.lesions) for c in cases)} lesiones"
          + (f", ROI oráculo {a.roi_mm:.0f} mm" if a.roi_mm else "")
          + (f", ajustes {a.set}" if a.set else ""))

    results: dict[str, Any] = {"settings": {"top": a.top, "roi_mm": a.roi_mm, "set": a.set}, "studies": {}}
    rows: list[dict] = []
    for c in cases:
        rd = vtk.vtkXMLPolyDataReader(); rd.SetFileName(str(c.mesh_path)); rd.Update()
        det = build_detector(c.modality, a.set)
        res = bench_mesh(rd.GetOutput(), c.lesions, modality=c.modality, detector=det,
                         top=a.top, roi_mm=a.roi_mm)
        res["session_id"] = c.session_id
        results["studies"][c.study] = res
        rows.extend(res["lesions"])
        _print_rows(c.study, res)
        print(f"  {c.study}: {res['mesh']['vertices']} vértices, {res['seconds']} s", flush=True)
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")

    s = summarize(rows)
    results["summary"] = s
    a.out.write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    print()
    print(f"Lesiones: {s['lesions']}  →  en la lista: {s['in_list']}  ·  entre 5: {s['top5']}"
          f"  ·  entre 10: {s['top10']}")
    print(f"Por canal: {s['by_channel']}")
    print(f"Motivos de los fallos: {s['reasons']}")
    print(f"\nDetalle: {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
