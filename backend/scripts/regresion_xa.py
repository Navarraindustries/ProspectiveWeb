"""Línea base de los dos casos XA con verdad de terreno: Case 3 e IM_0055.

Recorre el camino tubular del servidor (`routers.segment._run_segmentation_sync`
con el método tubular y sus valores por defecto) y la detección
(`routers.detect._detect_hits`) sin pasar por la API, y escribe un JSON con
todo lo que haría falta para notar un cambio: umbrales, cifras de la máscara,
tamaño de la malla, candidatos y puesto de la lesión. Es la red de seguridad
del paso 0 del plan Zenodo: cualquier corrección para angio-TC se compara
contra esta línea base para comprobar que la 3DRA sigue dando lo mismo.

Uso (desde backend/):
    .venv/Scripts/python.exe -u scripts/regresion_xa.py --label base
    .venv/Scripts/python.exe -u scripts/regresion_xa.py --label tras-paso-2 --compare base

Los DICOM están en `Archivos DICOM/` (en .gitignore); sin ellos no hay nada
que medir.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "data" / "regresion_xa"

#: Verdad de terreno en coordenadas de malla (x, y, z) mm. Case 3: tronco
#: basilar confirmado por el usuario (`test_detector_case3.GT_BASILAR`).
#: IM_0055: lesión anotada, 1.ª a 1,7 mm de este punto en la sesión del
#: usuario (memoria del proyecto, 2026-09-29).
CASES = {
    "case3": {
        "dir": ROOT / "Archivos DICOM" / "DICOM" / "Case 3" / "Case 3" / "Unknown Study" / "XA",
        "gt": (62.0, 64.0, 63.0),
        "pick": None,                    # la serie con más cortes
    },
    "im0055": {
        "dir": ROOT / "Archivos DICOM" / "DICOM-20260714T160737Z-1-001" / "DICOM",
        "gt": (72.6, 68.5, 83.7),
        "pick": 0.3634,                  # la única 3DRA con este espaciado
    },
}
#: Un candidato a menos de esto de la verdad de terreno es la lesión (como
#: `scripts/validate_case3.LESION_HIT_MM`).
HIT_MM = 8.0
#: Lista larga para saber el puesto aunque caiga fuera de los 5 oficiales.
LONG_LIST = 30


def _pick_series(series: list[dict], pick: float | None) -> dict:
    if pick is None:
        return series[0]
    cands = [s for s in series if abs(float(s.get("spacing_x", 0)) - pick) < 2e-3
             and int(s.get("n_slices", 0)) >= 100]
    if not cands:
        raise RuntimeError(f"ninguna serie con espaciado {pick}: "
                           + ", ".join(f"{s.get('spacing_x')}×{s.get('n_slices')}" for s in series))
    return cands[0]


def load_case(name: str):
    from services.dicom_loader import load_series, scan_series
    spec = CASES[name]
    series = scan_series(spec["dir"])
    ser = _pick_series(series, spec["pick"])
    dcm = load_series(ser["series_uid"], spec["dir"])
    return dcm, ser


def segment(dcm) -> tuple[object, dict]:
    """El método tubular del servidor con sus valores por defecto."""
    from routers.segment import segment_tubular
    t0 = time.perf_counter()
    # memory_guard=False: a resolución nativa decida lo que decida la RAM libre
    # de hoy; es la línea base reproducible, no la de una máquina de 2 GB.
    poly, info = segment_tubular(dcm, lower=None, upper=0.0, memory_guard=False)
    info.pop("mask_stats", None)
    info.pop("seg_spacing", None)
    info["seconds"] = round(time.perf_counter() - t0, 1)
    return poly, info


#: `clave=valor` sobre el detector del preset (la CLI `--set`), para medir una
#: variante del detector contra la línea base sin tocar el código.
OVERRIDES: list[str] = []


def detect(poly, modality: str, gt) -> dict:
    import routers.detect as rd
    from scripts.bench_detector import build_detector
    from services.aneurysm_consensus import hit_confidence
    rd._MAX_CANDIDATES = LONG_LIST
    t0 = time.perf_counter()
    hits, det = rd._detect_hits(poly, modality, build_detector(modality, OVERRIDES))
    secs = time.perf_counter() - t0
    dist = [math.dist(h.position, gt) for h in hits]
    idx = [i for i, d in enumerate(dist) if d <= HIT_MM]
    lesion = hits[idx[0]] if idx else None
    return {
        "lesion_rank": idx[0] + 1 if idx else None,
        "lesion_in_top5": bool(idx and idx[0] < 5),
        "lesion_distance_mm": round(dist[idx[0]], 2) if idx else None,
        "lesion_channels": dict(lesion.ranks) if lesion else None,
        "lesion_radius_mm": round(float(lesion.radius_mm), 3) if lesion else None,
        "n_hits": len(hits),
        "regions_total": int(det.n_regions_total),
        "regions_ok": len(det.candidates),
        "channels_on": sorted({c for h in hits for c in h.channels}),
        "candidates": [
            {"rank": i, "position": [round(float(v), 2) for v in h.position],
             "channel_ranks": dict(h.ranks), "radius_mm": round(float(h.radius_mm), 3),
             "confidence": round(float(hit_confidence(h)), 3),
             "distance_to_gt_mm": round(d, 1)}
            for i, (h, d) in enumerate(zip(hits[:10], dist[:10]), start=1)],
        "seconds": round(secs, 1),
    }


def run_case(name: str, log=print) -> dict:
    from services.mesh_components import keep_main_tree
    t0 = time.perf_counter()
    log(f"── {name}: carga")
    dcm, ser = load_case(name)
    rec = {"case": name, "status": "ok",
           "series": {"uid": ser.get("series_uid"), "n_slices": ser.get("n_slices")},
           "modality": dcm.modality, "shape": [int(v) for v in dcm.volume.shape],
           "spacing_mm": [round(float(v), 4) for v in dcm.spacing]}
    log(f"   {dcm.modality} {tuple(dcm.volume.shape)} {tuple(round(float(v), 4) for v in dcm.spacing)}")
    poly, seg = segment(dcm)
    rec["segment"] = seg
    log(f"   malla {seg['vertices']} vértices, {seg['components']} piezas, "
        f"umbral {seg['thresholds']['lower']:.0f}/{seg['thresholds']['upper']:.0f}, "
        f"factor {seg['downsample_factor']} ({seg['seconds']} s)")
    gt = CASES[name]["gt"]
    rec["full"] = detect(poly, dcm.modality, gt)
    log(f"   malla entera: lesión en el puesto {rec['full']['lesion_rank']} de {rec['full']['n_hits']} "
        f"({rec['full']['lesion_channels']}) en {rec['full']['seconds']} s")
    mt = keep_main_tree(poly)
    if mt.applied:
        rec["tree"] = detect(mt.poly, dcm.modality, gt)
        rec["tree"]["vertices"] = int(mt.poly.GetNumberOfPoints())
        log(f"   solo el árbol ({rec['tree']['vertices']} v): puesto {rec['tree']['lesion_rank']} "
            f"de {rec['tree']['n_hits']} ({rec['tree']['lesion_channels']})")
    else:
        rec["tree"] = {"applied": False, "warning": mt.warning}
        log(f"   solo el árbol: no aplicado ({mt.warning})")
    rec["seconds"] = round(time.perf_counter() - t0, 1)
    return rec


_KEYS = [
    ("segment.thresholds.lower", "umbral inferior"), ("segment.thresholds.upper", "techo"),
    ("segment.downsample_factor", "factor"), ("segment.vertices", "vértices"),
    ("segment.components", "piezas"), ("segment.seeds", "semillas"),
    ("segment.mask_mm3", "máscara mm³"), ("segment.reclaimed_mm3", "recuperado mm³"),
    ("segment.vetoed_mm3", "vetado mm³"),
    ("full.lesion_rank", "lesión, malla entera"), ("full.n_hits", "candidatos, malla entera"),
    ("full.regions_ok", "regiones ok, malla entera"),
    ("tree.lesion_rank", "lesión, solo árbol"), ("tree.n_hits", "candidatos, solo árbol"),
]


def _get(rec: dict, dotted: str):
    cur = rec
    for k in dotted.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def compare(base: dict, new: dict, log=print) -> int:
    """Imprime las diferencias; devuelve cuántas hay."""
    n = 0
    for key, label in _KEYS:
        a, b = _get(base, key), _get(new, key)
        same = (a == b) if not isinstance(a, float) else (b is not None and abs(a - b) < 1e-6)
        if not same:
            n += 1
            log(f"   ≠ {label}: {a} → {b}")
    for part in ("full", "tree"):
        ca = [tuple(c["position"]) for c in (base.get(part) or {}).get("candidates", [])[:5]]
        cb = [tuple(c["position"]) for c in (new.get(part) or {}).get("candidates", [])[:5]]
        if ca != cb:
            n += 1
            log(f"   ≠ los 5 candidatos de «{part}» cambian de sitio")
    if n == 0:
        log("   = sin diferencias")
    return n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--label", default="base")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--cases", default="case3,im0055")
    ap.add_argument("--compare", default="", help="etiqueta de la línea base con la que comparar")
    ap.add_argument("--set", action="append", default=[], metavar="CLAVE=VALOR",
                    help="parámetro del detector a cambiar (p. ej. order_by=area)")
    a = ap.parse_args(argv)
    OVERRIDES[:] = a.set
    a.out.mkdir(parents=True, exist_ok=True)
    records = {}
    for name in a.cases.split(","):
        name = name.strip()
        if not CASES[name]["dir"].exists():
            print(f"── {name}: no está en disco ({CASES[name]['dir']})")
            records[name] = {"case": name, "status": "missing"}
            continue
        try:
            records[name] = run_case(name)
        except Exception as exc:  # noqa: BLE001 — un caso roto no tapa al otro
            import traceback
            traceback.print_exc()
            records[name] = {"case": name, "status": "error", "error": f"{type(exc).__name__}: {exc}"}
    p = a.out / f"{a.label}.json"
    p.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"escrito {p}")
    worse = 0
    if a.compare:
        base = json.loads((a.out / f"{a.compare}.json").read_text(encoding="utf-8"))
        for name, rec in records.items():
            print(f"── {name} frente a «{a.compare}»")
            if rec.get("status") != "ok" or base.get(name, {}).get("status") != "ok":
                print("   (no comparable)")
                continue
            compare(base[name], rec)
            for part in ("full", "tree"):
                rb, rn = _get(base[name], f"{part}.lesion_rank"), _get(rec, f"{part}.lesion_rank")
                if rb is not None and (rn is None or rn > rb):
                    worse += 1
                    print(f"   ¡PEOR! la lesión baja del puesto {rb} al {rn} en «{part}»")
    return 1 if worse else 0


if __name__ == "__main__":
    sys.exit(main())
