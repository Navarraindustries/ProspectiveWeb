"""Evaluación completa del dataset Zenodo 15697196 sin pasar por el servidor.

Por qué fuera del servidor: la ingesta por API (`ingest_zenodo.py`) deja 1,8 GB
por estudio (sesión viva + instantánea con `_volume.npy` + archivo DICOM) y
los 172 estudios no caben. Aquí se recorre EL MISMO camino que
`routers.segment._run_segmentation_sync` (método tubular, umbrales
automáticos, la misma regla de reducción de resolución) y que
`routers.detect._detect_hits`, con las mismas funciones y parámetros, pero
se guarda solo la malla (`<out>/meshes/<id>.vtp`) y un registro JSON por
estudio. Las 44 mallas que el servidor ya produjo en la ingesta se reutilizan
tal cual (`--reuse data/ingest_zenodo.json`): son la salida real de la app.

Qué mide, por estudio:
  · segmentación: factor de reducción, vértices, piezas, volumen de la pieza
    mayor (lo que apaga calibre y cociente), y por lesión la fracción de la
    superficie del STL que la malla recupera (`surface_recall`);
  · detección: la lista oficial (5) y una lista larga (40) con la traza por
    región; por lesión, puesto, canal, motivo del fallo; por candidato, la HU
    media del volumen alrededor del punto (hueso ≥ 700 HU) y distancia a la
    lesión más cercana.

Uso (desde backend/):
    .venv/Scripts/python.exe scripts/eval_zenodo.py --studies 002 010
    .venv/Scripts/python.exe scripts/eval_zenodo.py --workers 2
    .venv/Scripts/python.exe scripts/eval_zenodo.py --summary
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import shutil
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.bench_detector import (
    _region_dict,
    build_detector,
    failure_reason,
    match_rank,
    nearest_region,
)
from scripts.ingest_zenodo import (
    Annotation,
    annotations_for,
    patient_to_mesh,
    study_ids,
)

logger = logging.getLogger("eval_zenodo")

Point = tuple[float, float, float]

DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "Archivos DICOM"
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "data" / "zenodo_eval"
DEFAULT_REUSE = Path(__file__).resolve().parents[1] / "data" / "ingest_zenodo.json"
SAVES_ROOT = Path(__file__).resolve().parents[1] / "data" / "session_saves"

#: HU media alrededor del candidato a partir de la cual se cuenta como hueso.
BONE_HU = 700.0
#: Radio de la bola donde se promedia la HU de un candidato.
HU_BALL_MM = 2.0
#: Lista larga del banco: hasta dónde se busca la lesión más allá de los 5.
LONG_LIST = 40


# ── Metadata.csv ───────────────────────────────────────────────────────────── #

@dataclass
class LesionMeta:
    study: str
    index: int                 # 1-based, el «k» de `an_<id>_k.stl`
    n_in_study: int
    artery: str | None = None
    saccular: bool | None = None
    position: str | None = None
    type: str | None = None
    size_class: str | None = None       # miliary / middle / large / giant
    neck_mm: float | None = None
    length_mm: float | None = None
    width_mm: float | None = None
    volume_mm3: float | None = None
    rupture: bool | None = None
    bleb: bool | None = None
    thrombus: bool | None = None
    vessel: bool | None = None
    calcification: bool | None = None

    @property
    def kind(self) -> str:
        """Familia morfológica: saccular / blister-like / fusiform / other."""
        if self.type and "blister" in self.type:
            return "blister-like"
        if self.type and "fusiform" in self.type:
            return "fusiform"
        if self.saccular:
            return "saccular"
        return self.type or "other"


@dataclass
class StudyMeta:
    study: str
    has_ia: bool
    sex: str | None = None
    age: int | None = None
    images_count: int | None = None
    slice_thickness_mm: float | None = None
    head_neck: bool | None = None
    lesions: list[LesionMeta] = field(default_factory=list)


def _num(s: str) -> float | None:
    s = (s or "").strip()
    if not s or s.upper() in ("NA", "N/A"):
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _flag(s: str) -> bool | None:
    v = _num(s)
    return None if v is None else bool(v)


def _txt(s: str) -> str | None:
    s = (s or "").strip()
    return None if not s or s.upper() in ("NA", "N/A") else s


def parse_metadata(path: Path) -> dict[str, StudyMeta]:
    """`Metadata.csv` del dataset: una fila por lesión, la primera con el estudio."""
    out: dict[str, StudyMeta] = {}
    text = Path(path).read_bytes().decode("cp1252", errors="replace")
    rows = list(csv.reader(text.splitlines(), delimiter=";"))
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        sid = row[0].strip()
        ia = row[1].strip()
        st = out.get(sid)
        if st is None:
            st = StudyMeta(study=sid, has_ia=ia != "0")
            out[sid] = st
        if _txt(row[2]) and st.sex is None:
            st.sex = _txt(row[2])
            age = _num(row[3]); st.age = int(age) if age is not None else None
            cnt = _num(row[18]); st.images_count = int(cnt) if cnt is not None else None
            st.slice_thickness_mm = _num(row[19])
            st.head_neck = _flag(row[20])
        if ia == "0":
            continue
        k, _, n = ia.partition("_")
        st.lesions.append(LesionMeta(
            study=sid, index=int(k), n_in_study=int(n or 1),
            artery=_txt(row[4]), saccular=_flag(row[5]), position=_txt(row[6]),
            type=_txt(row[7]), size_class=_txt(row[8]), neck_mm=_num(row[9]),
            length_mm=_num(row[10]), width_mm=_num(row[11]), volume_mm3=_num(row[12]),
            rupture=_flag(row[13]), bleb=_flag(row[14]), thrombus=_flag(row[15]),
            vessel=_flag(row[16]), calcification=_flag(row[17]),
        ))
    return out


def stl_index(filename: str) -> int | None:
    """`an_002.stl` → 1; `an_008_2.stl` → 2."""
    stem = Path(filename).stem
    parts = stem.split("_")
    if len(parts) == 2:
        return 1
    if len(parts) == 3 and parts[2].isdigit():
        return int(parts[2])
    return None


def lesion_for_stl(study: StudyMeta, filename: str) -> LesionMeta | None:
    k = stl_index(filename)
    for l in study.lesions:
        if l.index == k:
            return l
    return None


# ── Medidas ────────────────────────────────────────────────────────────────── #

def hu_around(volume: np.ndarray, spacing, point: Point, radius_mm: float) -> float | None:
    """HU media del volumen (z, y, x) en una bola alrededor de un punto de malla (x, y, z)."""
    r = hu_stats(volume, spacing, point, radius_mm)
    return None if r is None else r[0]


def hu_stats(volume: np.ndarray, spacing, point: Point, radius_mm: float) -> tuple[float, float] | None:
    """(media, máximo) de HU en la bola; None si cae fuera del volumen."""
    sz, sy, sx = (float(v) for v in spacing)
    x, y, z = point
    ci = (z / sz, y / sy, x / sx)
    rad = (radius_mm / sz, radius_mm / sy, radius_mm / sx)
    lo = [int(math.floor(c - r)) for c, r in zip(ci, rad)]
    hi = [int(math.ceil(c + r)) + 1 for c, r in zip(ci, rad)]
    if any(h <= 0 for h in hi) or any(l >= n for l, n in zip(lo, volume.shape)):
        return None
    lo = [max(0, v) for v in lo]
    hi = [min(n, v) for v, n in zip(hi, volume.shape)]
    sub = volume[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    if sub.size == 0:
        return None
    zz, yy, xx = np.mgrid[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    d2 = ((zz - ci[0]) * sz) ** 2 + ((yy - ci[1]) * sy) ** 2 + ((xx - ci[2]) * sx) ** 2
    inside = d2 <= radius_mm ** 2 + 1e-9
    if not inside.any():
        return None
    vals = sub[inside]
    return float(vals.mean()), float(vals.max())


def tissue_label(hu_mean: float | None, hu_max: float | None) -> str | None:
    """Qué hay alrededor de un candidato: hueso, vaso con contraste, u otra cosa."""
    if hu_mean is None or hu_max is None:
        return None
    if hu_max >= BONE_HU:
        return "bone"
    if hu_max >= 150.0 and hu_mean >= 100.0:
        return "vessel"
    return "other"


def surface_recall(points_mesh: np.ndarray, mesh, tol_mm: float) -> float | None:
    """Fracción de los puntos del STL (ya en coordenadas de malla) a ≤ tol de la malla."""
    pts = np.asarray(points_mesh, dtype=np.float64).reshape(-1, 3)
    if len(pts) == 0 or mesh is None or mesh.GetNumberOfPoints() == 0:
        return None
    from scipy.spatial import cKDTree
    from vtkmodules.util import numpy_support as ns
    verts = ns.vtk_to_numpy(mesh.GetPoints().GetData()).astype(np.float64)
    d, _ = cKDTree(verts).query(pts, k=1)
    return float(np.mean(d <= tol_mm))


def server_downsample_factor(shape) -> int:
    """La regla de `routers.segment` para el método tubular sin pedir resolución.

    Solo el tope de vóxeles (`_TUBULAR_MAX_VOXELS`): el servidor además baja a
    media resolución cuando su memoria libre no da para el volumen, y eso
    depende de la máquina y del momento. Aquí se evalúa lo que la app hace
    cuando tiene memoria, que es el resultado reproducible.
    """
    from routers.segment import _TUBULAR_MAX_VOXELS, _half_factor
    if int(np.prod(shape)) > _TUBULAR_MAX_VOXELS:
        return _half_factor(tuple(shape))
    return 1


def _stl_points_mesh(path: Path, origin: Point, direction) -> np.ndarray:
    import vtk
    from vtkmodules.util import numpy_support as ns
    r = vtk.vtkSTLReader(); r.SetFileName(str(path)); r.Update()
    pts = ns.vtk_to_numpy(r.GetOutput().GetPoints().GetData()).astype(np.float64)
    return np.array([patient_to_mesh(tuple(p), origin, direction) for p in pts])


# ── Segmentación como la hace el servidor ──────────────────────────────────── #

def load_study(dataset: Path, sid: str):
    """La serie principal del estudio tal como la carga el servidor."""
    from services.dicom_loader import load_series, scan_series
    d = dataset / "Studies" / sid
    series = scan_series(d)
    if not series:
        raise ValueError(f"el estudio {sid} no tiene ninguna serie DICOM legible")
    main = max(series, key=lambda s: s.get("n_slices", 0) or s.get("n_files", 0))
    return load_series(main["series_uid"], d), main


def segment_like_server(dcm, *, on_progress=None) -> tuple[object, dict]:
    """El método tubular de `_run_segmentation_sync` con sus valores por defecto.

    Devuelve (malla, estadísticas) y deja en `stats["seg_volume"]` el volumen
    reducido con el que se segmentó (lo necesita `hu_around`).
    """
    from routers.segment import segment_tubular

    # memory_guard=False: la resolución la decide solo el tope de vóxeles, no
    # la RAM libre del momento (ver server_downsample_factor).
    poly, info = segment_tubular(dcm, lower=None, upper=0.0, memory_guard=False,
                                 keep_volume=True, say=on_progress, **SEGMENT_OPTS)
    info.pop("mask_stats", None)
    return poly, info


#: Opciones extra para `segment_tubular` (la CLI las rellena: `--no-band`).
SEGMENT_OPTS: dict = {}


def _components_info(poly) -> dict:
    from services.mesh_components import describe_components, looks_like_tree
    comps = describe_components(poly)
    if not comps:
        return {"n": 0}
    ok, why = looks_like_tree(comps[0])
    c = comps[0]
    return {"n": len(comps), "main_volume_cm3": round(c.volume_mm3 / 1000.0, 1),
            "main_thickness_mm": round(c.thickness_mm, 2), "main_extent_mm": round(c.extent_mm, 1),
            "looks_like_tree": ok, "why_not_tree": why}


# ── Detección ──────────────────────────────────────────────────────────────── #

def detect_long(poly, modality: str = "CT", top: int = LONG_LIST, overrides=None):
    """La lista larga del banco: los `top` primeros del MISMO orden que la API.

    Los cinco primeros son exactamente la lista oficial de `POST /detect`:
    el tope solo recorta la lista ya ordenada y los puestos de los que no
    tocan el borde no cambian con él.
    """
    import routers.detect as rd
    det = build_detector(modality, overrides)
    det.trace_regions = True
    det.max_candidates = max(det.max_candidates, top)
    old = rd._MAX_CANDIDATES
    rd._MAX_CANDIDATES = top
    try:
        return rd._detect_hits(poly, modality, det)
    finally:
        rd._MAX_CANDIDATES = old


def detection_status(det) -> str:
    """«ok», o «incomplete» si calibre y cociente tenían que correr y no
    pudieron (sin memoria): el registro se guarda, pero `run` lo repite en la
    siguiente ronda en vez de darlo por bueno con un canal menos."""
    return "incomplete" if getattr(det, "geometric_error", "") else "ok"


def _hit_dict(rank: int, hit, lesions_mesh: list[Point], volume, spacing) -> dict:
    from services.aneurysm_consensus import hit_confidence, hit_diameter_mm
    pos = tuple(float(v) for v in hit.position)
    d = {
        "rank": rank, "position": [round(v, 2) for v in pos],
        "diameter_mm": round(hit_diameter_mm(hit), 2),
        "confidence": round(hit_confidence(hit), 3),
        "channels": list(hit.channels), "ranks": dict(hit.ranks),
        "on_border": bool(hit.on_border),
        "hu": None, "hu_max": None, "tissue": None, "nearest_lesion_mm": None,
    }
    if hit.candidate is not None:
        c = hit.candidate
        d["region"] = {"radius_mm": round(c.radius_mm, 2), "n_points": c.n_points,
                       "pgf": round(c.positive_gauss_frac, 3), "compactness": round(c.compactness, 3),
                       "sphericity": round(c.sphericity, 3), "score": round(c.score, 3)}
    if volume is not None:
        r = hu_stats(volume, spacing, pos, max(HU_BALL_MM, 1.5 * max(spacing)))
        if r is not None:
            d["hu"], d["hu_max"] = round(r[0], 0), round(r[1], 0)
            d["tissue"] = tissue_label(*r)
    if lesions_mesh:
        d["nearest_lesion_mm"] = round(min(math.dist(pos, p) for p in lesions_mesh), 1)
    return d


# ── Un estudio ─────────────────────────────────────────────────────────────── #

def reuse_map(report_path: Path) -> dict[str, dict]:
    """Estudio → registro de la ingesta cuya malla sigue guardada."""
    if not report_path or not Path(report_path).exists():
        return {}
    recs = json.loads(Path(report_path).read_text(encoding="utf-8"))
    out = {}
    for sid, rec in recs.items():
        if rec.get("status") != "ok" or not rec.get("session_id"):
            continue
        vtp = SAVES_ROOT / rec["session_id"] / "meshes" / "vessel_tree.vtp"
        if vtp.exists():
            out[sid] = {"vtp": vtp, "record": rec}
    return out


def _cached(root: Path | None, sid: str) -> dict | None:
    """Malla, volumen reducido y registro de una evaluación anterior, si están los tres."""
    if root is None:
        return None
    vtp = Path(root) / "meshes" / f"{sid}.vtp"
    vol = Path(root) / "volumes" / f"{sid}.npy"
    rec = Path(root) / f"{sid}.json"
    if not (vtp.exists() and vol.exists() and rec.exists()):
        return None
    try:
        r = json.loads(rec.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if r.get("status") != "ok" or "frame" not in r or "seg_spacing_mm" not in r.get("segment", {}):
        return None
    return {"vtp": vtp, "vol": vol, "record": r}


def evaluate_study(sid: str, dataset: Path, out: Path, meta: dict[str, StudyMeta],
                   reuse: dict[str, dict] | None = None, *, modality: str = "CT",
                   overrides: list[str] | None = None, meshes_from: Path | None = None,
                   log=print) -> dict:
    """Un estudio de principio a fin. Devuelve el registro (se guarda fuera).

    El volumen reducido (int16) y la malla se guardan en `out/volumes` y
    `out/meshes`: una segunda pasada con otro ajuste del detector
    (`--meshes-from`) no vuelve a leer el DICOM ni a segmentar.
    """
    from services.segmentation import read_vtp, write_vtp

    t_start = time.perf_counter()
    st = meta.get(sid) or StudyMeta(study=sid, has_ia=False)
    rec: dict = {"study": sid, "has_ia": st.has_ia, "status": "ok",
                 "meta": {k: v for k, v in asdict(st).items() if k != "lesions"}}
    meshes = out / "meshes"; meshes.mkdir(parents=True, exist_ok=True)
    volumes = out / "volumes"; volumes.mkdir(parents=True, exist_ok=True)
    vtp_path = meshes / f"{sid}.vtp"
    vol_path = volumes / f"{sid}.npy"

    cache = _cached(out, sid) or _cached(meshes_from, sid)
    if cache:
        # 1+2. Todo de la pasada anterior: ni DICOM ni segmentación. Se lee
        # EN SITIO: copiar malla y volumen a la carpeta nueva (como se hacía)
        # costaba 1,2 GB por pasada de 16 estudios y 4,4 GB por pasada de 172,
        # y las pasadas de detector son muchas. El registro anota de dónde
        # vienen (`segment.meshes_from`).
        log(f"[{sid}] malla y volumen de {cache['vtp'].parent.parent.name}")
        prev = cache["record"]
        poly = read_vtp(cache["vtp"])
        seg_volume = np.load(cache["vol"]).astype(np.float32)
        seg_spacing = tuple(float(v) for v in prev["segment"]["seg_spacing_mm"])
        origin = tuple(prev["frame"]["origin_mm"]); direction = tuple(prev["frame"]["direction"])
        rec["series"] = prev.get("series"); rec["frame"] = prev["frame"]
        seg = dict(prev["segment"]); seg["source"] = f"cache:{seg.get('source', '?')}"
        seg["meshes_from"] = str(cache["vtp"].parent.parent)
    else:
        # 1. Volumen (hace falta para la HU de los candidatos y el marco)
        log(f"[{sid}] carga")
        dcm, series = load_study(dataset, sid)
        origin = tuple(float(v) for v in dcm.origin)
        direction = tuple(float(v) for v in dcm.direction)
        if len(direction) != 9:
            direction = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
        rec["series"] = {"uid": series.get("series_uid"), "n_slices": series.get("n_slices"),
                         "modality": dcm.modality, "description": series.get("description")}
        rec["frame"] = {"origin_mm": [round(v, 3) for v in origin], "direction": list(direction)}

        # 2. Malla: la de la app si existe, si no la misma receta
        src = (reuse or {}).get(sid)
        if src:
            log(f"[{sid}] malla del servidor (sesión {src['record']['session_id'][:8]})")
            shutil.copy2(src["vtp"], vtp_path)
            poly = read_vtp(vtp_path)
            seg = dict(src["record"].get("segment", {}))
            seg["source"] = "ingest"
            factor = int(seg.get("downsample_factor") or server_downsample_factor(dcm.volume.shape))
            seg["shape"] = [int(v) for v in dcm.volume.shape]
            seg["spacing_mm"] = [round(float(v), 4) for v in dcm.spacing]
        else:
            log(f"[{sid}] segmentación tubular ({dcm.volume.shape}, factor {server_downsample_factor(dcm.volume.shape)})")
            poly, seg = segment_like_server(dcm)
            seg = {k: v for k, v in seg.items() if k not in ("seg_volume", "seg_spacing")}
            seg["source"] = "eval"
            factor = int(seg["downsample_factor"])
            write_vtp(poly, vtp_path)
        # El volumen con el que se mide la HU: el reducido, que es el que vio la malla.
        from routers.segment import _downsample_by
        if factor > 1:
            seg_volume, seg_spacing, _ = _downsample_by(dcm.volume, dcm.spacing, factor)
        else:
            seg_volume, seg_spacing = dcm.volume, tuple(dcm.spacing)
        del dcm
        seg["downsample_factor"] = factor
        seg["seg_spacing_mm"] = [round(float(v), 4) for v in seg_spacing]
        np.save(vol_path, np.clip(np.rint(seg_volume), -32768, 32767).astype(np.int16))
    seg["components_info"] = _components_info(poly)
    rec["segment"] = seg
    rec["mesh"] = {"vertices": int(poly.GetNumberOfPoints()), "faces": int(poly.GetNumberOfPolys()),
                   "bounds_mm": [round(v, 1) for v in poly.GetBounds()]}

    # 3. Lesiones en coordenadas de malla
    anns: list[Annotation] = annotations_for(dataset, sid) if st.has_ia else []
    tol = 1.5 * max(seg_spacing)
    lesions = []
    for a in anns:
        lm = lesion_for_stl(st, a.file)
        pos = patient_to_mesh(a.centroid, origin, direction)
        pts = _stl_points_mesh(dataset / "Annotations" / a.file, origin, direction)
        lesions.append({
            "file": a.file, "position": [round(v, 2) for v in pos],
            "diameter_mm": round(a.diameter_mm, 2), "stl_points": a.n_points,
            "size_class": lm.size_class if lm else None, "kind": lm.kind if lm else None,
            "artery": lm.artery if lm else None, "type": lm.type if lm else None,
            "length_mm": lm.length_mm if lm else None, "width_mm": lm.width_mm if lm else None,
            "volume_mm3": lm.volume_mm3 if lm else None, "thrombus": lm.thrombus if lm else None,
            "calcification": lm.calcification if lm else None,
            "surface_recall": surface_recall(pts, poly, tol),
            "surface_tol_mm": round(tol, 2),
            "hu": (lambda h: None if h is None else round(h, 0))(
                hu_around(seg_volume, seg_spacing, pos, max(HU_BALL_MM, a.diameter_mm / 4))),
        })
    lesion_pts = [tuple(l["position"]) for l in lesions]

    # 4. Detección: la lista larga, cuyos 5 primeros son la oficial
    log(f"[{sid}] detección ({poly.GetNumberOfPoints()} vértices)")
    t0 = time.perf_counter()
    hits, det = detect_long(poly, modality, LONG_LIST, overrides)
    rec["detect_seconds"] = round(time.perf_counter() - t0, 1)
    rec["head_crop"] = getattr(det, "head_crop", None)
    rec["status"] = detection_status(det)
    if det.geometric_error:
        rec["error"] = det.geometric_error
    rec["candidates"] = [_hit_dict(i, h, lesion_pts, seg_volume, seg_spacing)
                         for i, h in enumerate(hits[:5], start=1)]
    rec["n_candidates"] = len(rec["candidates"])
    rec["long_list"] = [_hit_dict(i, h, lesion_pts, None, None)
                        for i, h in enumerate(hits, start=1)]
    rec["channels_on"] = sorted({c for h in hits for c in h.channels})
    rec["regions"] = {"total": det.n_regions_total, "ok": len(det.candidates),
                      "failed": {"points": det.n_failed_points, "size": det.n_failed_size,
                                 "mean_curv": det.n_failed_mean_curv, "pgf": det.n_failed_pgf,
                                 "compactness": det.n_failed_compact,
                                 "sphericity": det.n_failed_sphericity, "merged": det.n_merged}}
    for l in lesions:
        pos = tuple(l["position"])
        rank, hit = match_rank(pos, hits)
        near = nearest_region(pos, det.regions)
        l["rank"] = rank
        l["channel_ranks"] = dict(hit.ranks) if hit else {}
        l["reason"] = None if rank else failure_reason(pos, l["diameter_mm"], det.regions)
        l["nearest_hit_mm"] = round(min(math.dist(pos, h.position) for h in hits), 1) if hits else None
        l["region"] = _region_dict(near) if near else None
        l["region_dist_mm"] = round(math.dist(pos, near.centroid), 1) if near else None
    rec["lesions"] = lesions
    rec["seconds"] = round(time.perf_counter() - t_start, 1)
    return rec


# ── Resumen ────────────────────────────────────────────────────────────────── #

def _bucket(d: dict, key, rank):
    b = d.setdefault(key or "?", {"n": 0, "top5": 0, "in_list": 0})
    b["n"] += 1
    if rank:
        b["in_list"] += 1
        if rank <= 5:
            b["top5"] += 1


def summarize(recs: dict[str, dict]) -> dict:
    s = {"studies": len(recs), "errors": 0, "ia_studies": 0, "controls": 0,
         "lesions": 0, "in_list": 0, "top5": 0, "top10": 0,
         "studies_with_lesion_in_top5": 0, "studies_with_lesion_in_list": 0,
         "by_size": {}, "by_kind": {}, "reasons": {}, "by_channel": {},
         "controls_with_candidates": 0, "fp_per_control": 0.0,
         "candidates_total": 0, "candidates_bone": 0, "candidates_with_hu": 0,
         "candidates_tissue": {},
         "recall_median": None, "recall_lt_half": 0, "geometric_on": 0}
    recalls = []
    fp = []
    for rec in recs.values():
        if rec.get("status") != "ok":
            s["errors"] += 1
            continue
        cands = rec.get("candidates", [])
        s["candidates_total"] += len(cands)
        for c in cands:
            if c.get("hu") is not None:
                s["candidates_with_hu"] += 1
                hu_max = c.get("hu_max", c["hu"])
                if hu_max >= BONE_HU:
                    s["candidates_bone"] += 1
                lab = c.get("tissue") or tissue_label(c["hu"], hu_max)
                s["candidates_tissue"][lab] = s["candidates_tissue"].get(lab, 0) + 1
        if any(ch in ("calibre", "cociente") for ch in rec.get("channels_on", [])):
            s["geometric_on"] += 1
        if not rec.get("has_ia"):
            s["controls"] += 1
            fp.append(len(cands))
            if cands:
                s["controls_with_candidates"] += 1
            continue
        s["ia_studies"] += 1
        best = None
        for l in rec.get("lesions", []):
            s["lesions"] += 1
            r = l.get("rank")
            if r:
                s["in_list"] += 1
                s["top5"] += r <= 5
                s["top10"] += r <= 10
                best = r if best is None else min(best, r)
                for ch in l.get("channel_ranks", {}):
                    s["by_channel"][ch] = s["by_channel"].get(ch, 0) + 1
            elif l.get("reason"):
                s["reasons"][l["reason"]] = s["reasons"].get(l["reason"], 0) + 1
            _bucket(s["by_size"], l.get("size_class"), r)
            _bucket(s["by_kind"], l.get("kind"), r)
            if l.get("surface_recall") is not None:
                recalls.append(l["surface_recall"])
                s["recall_lt_half"] += l["surface_recall"] < 0.5
        if best:
            s["studies_with_lesion_in_list"] += 1
            if best <= 5:
                s["studies_with_lesion_in_top5"] += 1
    s["fp_per_control"] = round(float(np.mean(fp)), 2) if fp else 0.0
    s["recall_median"] = round(float(np.median(recalls)), 3) if recalls else None
    return s


def print_summary(s: dict, log=print) -> None:
    log(f"Estudios {s['studies']} (aneurisma {s['ia_studies']}, control {s['controls']}, "
        f"errores {s['errors']})")
    log(f"Lesiones {s['lesions']}: en la lista de 40 → {s['in_list']}, entre 5 → {s['top5']}, "
        f"entre 10 → {s['top10']}; estudios con la lesión entre 5 → {s['studies_with_lesion_in_top5']}")
    log(f"Por tamaño: {s['by_size']}")
    log(f"Por tipo: {s['by_kind']}")
    log(f"Motivos del fallo: {s['reasons']}  · canales: {s['by_channel']}")
    log(f"Controles con candidatos: {s['controls_with_candidates']}/{s['controls']} "
        f"({s['fp_per_control']} por control)")
    log(f"Candidatos en hueso (HU ≥ {BONE_HU:.0f}): {s['candidates_bone']}/{s['candidates_with_hu']}")
    log(f"Superficie del saco recuperada: mediana {s['recall_median']}, "
        f"< 50 % en {s['recall_lt_half']} lesiones · calibre/cociente encendidos en {s['geometric_on']}")


# ── Lote ───────────────────────────────────────────────────────────────────── #

def load_results(out: Path) -> dict[str, dict]:
    recs = {}
    for p in sorted(Path(out).glob("*.json")):
        if p.name == "summary.json":
            continue
        try:
            recs[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
    return recs


def run(sids: list[str], dataset: Path, out: Path, meta, reuse, *, redo=False,
        overrides=None, meshes_from: Path | None = None, limit: int = 0, log=print) -> int:
    """Evalúa los estudios que faltan. Devuelve cuántos ha hecho.

    `limit` > 0 corta tras ese número de estudios: el proceso retiene unos
    300 MB por estudio (VTK/SimpleITK no devuelven todo al sistema) y a los
    50 estudios pasaba de 16 GB; un lanzador externo lo relanza y el script
    reanuda solo.
    """
    out.mkdir(parents=True, exist_ok=True)
    done = 0
    for i, sid in enumerate(sids, start=1):
        if limit and done >= limit:
            log(f"tope de {limit} estudios alcanzado; quedan {len(sids) - i + 1}")
            break
        p = out / f"{sid}.json"
        if p.exists() and not redo:
            try:
                if json.loads(p.read_text(encoding="utf-8")).get("status") == "ok":
                    log(f"[{sid}] ya hecho ({i}/{len(sids)})")
                    continue
            except json.JSONDecodeError:
                pass
        log(f"── {sid} ({i}/{len(sids)}) ──")
        try:
            rec = evaluate_study(sid, dataset, out, meta, reuse, overrides=overrides,
                                 meshes_from=meshes_from, log=log)
        except Exception as exc:
            logger.exception("fallo en %s", sid)
            rec = {"study": sid, "status": "error", "error": f"{type(exc).__name__}: {exc}",
                   "has_ia": bool(meta.get(sid) and meta[sid].has_ia)}
        p.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        done += 1
        les = rec.get("lesions", [])
        ranks = [l.get("rank") for l in les]
        log(f"[{sid}] {rec['status']} · {rec.get('seconds', 0)} s · "
            f"{rec.get('n_candidates', 0)} candidatos · lesiones {ranks}")
    return done


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--reuse", type=Path, default=DEFAULT_REUSE,
                    help="informe de la ingesta cuyas mallas se reutilizan")
    ap.add_argument("--no-reuse", action="store_true", help="segmentar todo de nuevo, sin reutilizar")
    ap.add_argument("--studies", nargs="*", help="solo estos estudios")
    ap.add_argument("--shard", default="", help="«k/n»: el trabajador k de n (0-based)")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="parar tras N estudios (ver `run`)")
    ap.add_argument("--set", action="append", default=[], metavar="CLAVE=VALOR",
                    help="ajuste del detector (como en bench_detector)")
    ap.add_argument("--meshes-from", type=Path, default=None,
                    help="carpeta de otra pasada cuyas mallas y volúmenes se reutilizan")
    ap.add_argument("--summary", action="store_true", help="solo resumir lo ya evaluado")
    ap.add_argument("--no-band", action="store_true",
                    help="sin la pasada a resolución nativa en la banda del árbol (paso 1)")
    args = ap.parse_args(argv)
    if args.no_band:
        SEGMENT_OPTS["band_refine"] = False

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    if args.summary:
        recs = load_results(args.out)
        s = summarize(recs)
        (args.out / "summary.json").write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
        print_summary(s)
        return 0

    meta = parse_metadata(args.dataset / "Metadata.csv")
    sids = args.studies or study_ids(args.dataset)
    if args.shard:
        k, n = (int(v) for v in args.shard.split("/"))
        sids = [s for i, s in enumerate(sids) if i % n == k]
    reuse = {} if args.no_reuse else reuse_map(args.reuse)
    print(f"{len(sids)} estudios · {len(reuse)} mallas reutilizables · salida {args.out}")
    run(sids, args.dataset, args.out, meta, reuse, redo=args.redo, overrides=args.set or None,
        meshes_from=args.meshes_from, limit=args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
