"""Mete el dataset Zenodo 15697196 (CTA de cabeza + STL de aneurisma) en Prospective.

    python scripts/ingest_zenodo.py [--dataset DIR] [--api URL] [--studies 002,008]
        [--method tubular|threshold] [--half-resolution] [--redo] [--out FICHERO]
        [--user U --password P | --token T]

El dataset (CC-BY, https://zenodo.org/records/15697196) trae `Studies/<id>/*.dcm`
y, para los estudios con aneurisma, `Annotations/an_<id>[_n].stl` en las mismas
coordenadas del paciente que el DICOM (comprobado: el centroide cae en vaso
con contraste, 240–700 HU). Para cada estudio, por la API y como lo haría una
persona:

1. POST /api/upload con todos los .dcm → sesión.
2. POST /api/sessions/{id}/attach → paciente «ZENODO <id>» (historia
   `ZENODO-15697196-<id>`) con un caso nuevo; archiva el DICOM. Si ese paciente
   ya existía (una tanda anterior que murió a medias, o --redo) se borra antes y
   se rehace entero: nunca hay dos pacientes para el mismo estudio.
3. GET /api/thresholds → POST /api/segment?background=true → se espera el resultado.
4. POST /api/detect → candidatos.
5. POST /api/ground-truth: el centroide del STL mayor como lesión «marcada» (o
   «sin lesión» en los controles), pasado de coordenadas de paciente a las de
   la malla (origen del volumen restado). La API devuelve en qué puesto quedó.
6. POST /api/sessions/save en el paso de detección, para que se pueda reanudar.

Cada estudio deja un registro en `--out` (por defecto `backend/data/ingest_zenodo.json`,
que git ignora) y al final se imprime el resumen: en cuántos la lesión salió
primera / entre 3 / entre 5 / no salió, y cuántos candidatos sobran en los
controles. Volver a lanzar el script continúa donde se quedó.

Sin `--user`/`--token`, y si corre en la misma máquina que el servidor, firma un
token para `admin` con el secreto del servidor (`secrets/jwt_secret.txt`).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ZENODO_RECORD = "15697196"
HOSPITAL_ID_PREFIX = f"ZENODO-{ZENODO_RECORD}-"
DX_ANEURISMA = "Aneurisma intracraneal (dataset Zenodo 15697196)"
DX_CONTROL = "Control sin aneurisma (dataset Zenodo 15697196)"
#: Igual que routers.ground_truth.MIN_MATCH_MM.
MIN_MATCH_MM = 5.0
#: Índice del paso «Detección» en frontend/src/pipeline/steps.ts.
STEP_DETECT = 2
DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "Archivos DICOM"
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "data" / "ingest_zenodo.json"

Point = tuple[float, float, float]


# ── El dataset en disco ────────────────────────────────────────────────────── #

@dataclass
class Annotation:
    file: str
    centroid: Point
    diameter_mm: float      # mayor lado de la caja, como `max_diameter_mm` del detector
    n_points: int


def study_ids(dataset: Path) -> list[str]:
    """Los estudios con algún .dcm, en orden."""
    root = dataset / "Studies"
    return sorted(d.name for d in root.iterdir() if d.is_dir() and any(d.glob("*.dcm")))


def dicom_files(dataset: Path, sid: str) -> list[Path]:
    def _key(p: Path):
        return (0, int(p.stem)) if p.stem.isdigit() else (1, p.stem)
    return sorted((dataset / "Studies" / sid).glob("*.dcm"), key=_key)


def _read_stl(path: Path) -> Annotation:
    import vtk
    r = vtk.vtkSTLReader()
    r.SetFileName(str(path)); r.Update()
    poly = r.GetOutput()
    com = vtk.vtkCenterOfMass()
    com.SetInputData(poly); com.SetUseScalarsAsWeights(False); com.Update()
    b = poly.GetBounds()
    return Annotation(
        file=path.name,
        centroid=tuple(float(v) for v in com.GetCenter()),
        diameter_mm=float(max(b[1] - b[0], b[3] - b[2], b[5] - b[4])),
        n_points=int(poly.GetNumberOfPoints()),
    )


def annotations_for(dataset: Path, sid: str) -> list[Annotation]:
    """Los STL del estudio, del mayor al menor: el primero es la lesión principal."""
    pat = re.compile(rf"^an_{re.escape(sid)}(?:_\d+)?\.stl$")
    files = [p for p in (dataset / "Annotations").glob("an_*.stl") if pat.match(p.name)]
    anns = [_read_stl(p) for p in files]
    return sorted(anns, key=lambda a: a.diameter_mm, reverse=True)


# ── Marco del volumen ──────────────────────────────────────────────────────── #
#
# La malla de la sesión nace con origen (0,0,0): índice × espaciado
# (services/segmentation.py, SetOrigin(0,0,0)), y los candidatos del detector
# van en esas coordenadas. El STL del dataset está en coordenadas de paciente,
# las del DICOM: paciente = origen + D · malla. Comprobado en el estudio 002:
# restando el origen, el centroide del STL queda a 4 mm de la pared de la malla
# (dentro del saco, de 11 mm); sin restarlo, a 900 mm.

Direction = tuple[float, ...]
IDENTITY: Direction = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def volume_frame(dataset: Path, sid: str) -> tuple[Point, Direction]:
    """Origen y dirección del volumen tal como los lee el servidor (SimpleITK/GDCM)."""
    import SimpleITK as sitk
    d = str(dataset / "Studies" / sid)
    names = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(d)
    if not names:
        raise ValueError(f"el estudio {sid} no tiene ninguna serie DICOM legible")
    fr = sitk.ImageFileReader()
    fr.SetFileName(names[0])          # GDCM ordena por posición: el primero es el origen
    fr.ReadImageInformation()
    origin = tuple(float(v) for v in fr.GetOrigin()[:3])
    direction = tuple(float(v) for v in fr.GetDirection())
    if len(direction) != 9:
        direction = IDENTITY
    return origin, direction


def patient_to_mesh(point: Point, origin: Point, direction: Direction = IDENTITY) -> Point:
    """Coordenadas de paciente → coordenadas de la malla de la sesión."""
    dx, dy, dz = (point[i] - origin[i] for i in range(3))
    # D es ortonormal: la inversa es la traspuesta. Fila i de D^T = columna i de D.
    return (
        direction[0] * dx + direction[3] * dy + direction[6] * dz,
        direction[1] * dx + direction[4] * dy + direction[7] * dz,
        direction[2] * dx + direction[5] * dy + direction[8] * dz,
    )


# ── La regla del puesto (routers.ground_truth.match_rank) ──────────────────── #

def rank_for(point: Point, candidates: list[dict]) -> int | None:
    """Puesto (1-based) del candidato más cercano que «es» la lesión, o None."""
    best, best_d = None, math.inf
    for i, c in enumerate(candidates, start=1):
        pos = c["center_mm"]
        d = math.dist(point, (pos["x"], pos["y"], pos["z"]))
        if d <= max(MIN_MATCH_MM, float(c.get("max_diameter_mm", 0.0))) and d < best_d:
            best, best_d = i, d
    return best


# ── Orquestación por la API ────────────────────────────────────────────────── #

class ApiError(RuntimeError):
    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


def _detail(resp) -> str:
    try:
        return str(resp.json().get("detail", resp.text))
    except Exception:  # noqa: BLE001 — la respuesta no es JSON
        return resp.text


def _ok(resp, *expected: int):
    if resp.status_code not in (expected or (200,)):
        raise ApiError(resp.status_code, _detail(resp))
    return resp.json() if resp.content else None      # un 204 no trae cuerpo


class Ingestor:
    """Pasa un estudio por la API. `client` es httpx.Client o un TestClient."""

    def __init__(self, client, dataset: Path, *, method: str = "tubular",
                 half_resolution: bool = False, poll_s: float = 3.0,
                 timeout_s: float = 3600.0, log: Callable[..., None] = print,
                 frame_of: Callable[[Path, str], tuple[Point, Direction]] = volume_frame):
        self.client = client
        self.frame_of = frame_of
        self.dataset = Path(dataset)
        self.method = method
        self.half_resolution = half_resolution
        self.poll_s = poll_s
        self.timeout_s = timeout_s
        self.log = log

    # Pasos -------------------------------------------------------------- #

    def _upload(self, sid: str) -> dict:
        files = dicom_files(self.dataset, sid)
        handles = [f.open("rb") for f in files]
        try:
            resp = self.client.post(
                "/api/upload",
                files=[("files", (f.name, h, "application/dicom")) for f, h in zip(files, handles)],
            )
        finally:
            for h in handles:
                h.close()
        up = _ok(resp)
        if not up.get("series"):
            raise ApiError(422, "la subida no encontró ninguna serie DICOM")
        return up

    def _replace_previous_patient(self, sid: str) -> int | None:
        """Borra el paciente ZENODO de este estudio si ya existe. Devuelve su id."""
        hc = HOSPITAL_ID_PREFIX + sid
        previo = next((p for p in _ok(self.client.get("/api/patients"))
                       if p.get("hospital_id") == hc), None)
        if previo is None:
            return None
        _ok(self.client.delete(f"/api/patients/{previo['id']}"), 204)
        self.log(f"  había un paciente anterior ({previo['id']}): borrado para rehacerlo")
        return int(previo["id"])

    def _attach(self, session_id: str, sid: str, anns: list[Annotation]) -> dict:
        body = {
            "patient_id": None, "case_id": None,
            "new_patient": {"surname": "ZENODO", "given_name": sid,
                            "hospital_id": HOSPITAL_ID_PREFIX + sid, "dob": "", "sex": ""},
            "new_case": {"dx_principal": DX_ANEURISMA if anns else DX_CONTROL, "study_date": ""},
        }
        return _ok(self.client.post(f"/api/sessions/{session_id}/attach", json=body))

    def _segment(self, session_id: str, series_id: str) -> dict:
        th = _ok(self.client.get(f"/api/thresholds/{session_id}"))
        body = {
            "session_id": session_id, "series_id": series_id,
            "lower": th["lower"], "upper": th["upper"],
            "method": self.method, "half_resolution": self.half_resolution,
        }
        _ok(self.client.post("/api/segment", json=body, params={"background": "true"}), 202)
        t0 = time.monotonic()
        while True:
            resp = self.client.get(f"/api/segment/result/{session_id}")
            if resp.status_code != 409:
                break
            if time.monotonic() - t0 > self.timeout_s:
                raise ApiError(504, f"la segmentación no terminó en {self.timeout_s:.0f} s")
            if self.poll_s:
                try:
                    p = self.client.get(f"/api/progress/{session_id}").json()
                    self.log(f"    … {p.get('phase', '')} {p.get('pct', 0):.0f}%")
                except Exception as exc:  # noqa: BLE001 — el progreso es decorativo
                    self.log(f"    … (sin progreso: {exc})")
                time.sleep(self.poll_s)
        seg = _ok(resp)
        seg["thresholds"] = {"lower": th["lower"], "upper": th["upper"], "strategy": th["strategy"]}
        return seg

    def _detect(self, session_id: str) -> list[dict]:
        return _ok(self.client.post(f"/api/detect/{session_id}"))["candidates"]

    def _confirm(self, session_id: str, imaging_study_id: int, lesion: Point | None) -> dict:
        body: dict[str, Any] = {"session_id": session_id, "imaging_study_id": imaging_study_id}
        if lesion is not None:
            x, y, z = lesion
            body.update(source="marked", position={"x": x, "y": y, "z": z})
        else:
            body["source"] = "no_lesion"
        return _ok(self.client.post("/api/ground-truth", json=body), 201)

    def _save(self, session_id: str, sid: str, att: dict) -> None:
        _ok(self.client.post("/api/sessions/save", json={
            "session_id": session_id, "label": f"Zenodo {sid}",
            "patient_id": att["patient"]["id"], "study_id": att["case_id"],
            "imaging_study_id": att["imaging_study_id"], "current_step": STEP_DETECT,
        }))

    # Un estudio entero ---------------------------------------------------- #

    def ingest(self, sid: str) -> dict:
        t0 = time.monotonic()
        anns = annotations_for(self.dataset, sid)
        rec: dict[str, Any] = {
            "study": sid, "n_annotations": len(anns),
            "annotations": [asdict(a) for a in anns],
            "status": "error", "seconds": {},
        }
        self.log(f"[{sid}] {len(dicom_files(self.dataset, sid))} ficheros, "
                 f"{len(anns)} aneurisma(s)")
        try:
            replaced = self._replace_previous_patient(sid)
            if replaced is not None:
                rec["replaced_patient_id"] = replaced

            t = time.monotonic()
            up = self._upload(sid)
            session_id = up["session_id"]
            series = up["series"][0]
            rec.update(session_id=session_id, series_id=series["series_id"],
                       modality=series["modality"], slices=series["slices"])
            rec["seconds"]["upload"] = round(time.monotonic() - t, 1)
            self.log(f"  subido → sesión {session_id} ({series['modality']}, {series['slices']} cortes)")

            att = self._attach(session_id, sid, anns)
            rec.update(patient_id=att["patient"]["id"], case_id=att["case_id"],
                       imaging_study_id=att["imaging_study_id"])
            self.log(f"  paciente {att['patient']['id']}, estudio de imagen {att['imaging_study_id']}")

            t = time.monotonic()
            seg = self._segment(session_id, series["series_id"])
            rec["seconds"]["segment"] = round(time.monotonic() - t, 1)
            rec["segment"] = {k: seg.get(k) for k in (
                "method", "vertices", "faces", "downsample_factor", "fallback_note",
                "components", "boundary_edges", "voxel_fraction", "thresholds")}
            self.log(f"  malla: {seg.get('vertices')} vértices, método {seg.get('method')}, "
                     f"factor {seg.get('downsample_factor')}"
                     + (f" — {seg['fallback_note']}" if seg.get("fallback_note") else ""))

            t = time.monotonic()
            cands = self._detect(session_id)
            rec["seconds"]["detect"] = round(time.monotonic() - t, 1)
            rec["n_candidates"] = len(cands)
            rec["candidates"] = [{"id": c["id"], "center_mm": c["center_mm"],
                                  "max_diameter_mm": c["max_diameter_mm"],
                                  "channels": c.get("channels", [])} for c in cands]

            origin, direction = self.frame_of(self.dataset, sid)
            rec["frame"] = {"origin_mm": list(origin), "direction": list(direction)}
            lesions = [patient_to_mesh(a.centroid, origin, direction) for a in anns]
            rec["lesions_mesh_mm"] = [list(p) for p in lesions]
            gt = self._confirm(session_id, att["imaging_study_id"], lesions[0] if lesions else None)
            rec["gt_rank"] = gt["candidate_rank"]
            rec["extra_ranks"] = [rank_for(p, cands) for p in lesions[1:]]
            if anns:
                self.log(f"  {len(cands)} candidatos; la lesión "
                         + (f"salió en el puesto {gt['candidate_rank']}"
                            if gt["candidate_rank"] else "NO está en la lista"))
            else:
                self.log(f"  control: {len(cands)} candidatos (todos falsos positivos)")

            self._save(session_id, sid, att)
            rec["status"] = "ok"
        except ApiError as exc:
            rec["error"] = exc.detail
            self.log(f"  ERROR {exc}")
        except Exception as exc:  # noqa: BLE001 — un estudio roto no para los demás
            rec["error"] = f"{type(exc).__name__}: {exc}"
            self.log(f"  ERROR {rec['error']}")
        rec["seconds"]["total"] = round(time.monotonic() - t0, 1)
        return rec


# ── Informe acumulado ──────────────────────────────────────────────────────── #

def load_report(path: Path) -> dict[str, dict]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_report(path: Path, recs: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(recs, indent=1, ensure_ascii=False), encoding="utf-8")


def run(ing: Ingestor, sids: list[str], out: Path, *, redo: bool = False) -> dict[str, dict]:
    """Ingesta los estudios que falten (o todos con `redo`) y guarda tras cada uno."""
    recs = load_report(out)
    for sid in sids:
        if not redo and recs.get(sid, {}).get("status") == "ok":
            ing.log(f"[{sid}] ya hecho, se salta (--redo para repetirlo)")
            continue
        recs[sid] = ing.ingest(sid)
        save_report(out, recs)
    return recs


def summarize(recs: dict[str, dict]) -> dict:
    ok = [r for r in recs.values() if r.get("status") == "ok"]
    con = [r for r in ok if r.get("n_annotations", 0) > 0]
    ctl = [r for r in ok if r.get("n_annotations", 0) == 0]
    ranks = [r.get("gt_rank") for r in con]
    fp = [r.get("n_candidates", 0) for r in ctl]
    return {
        "confirmed": len(con),
        "first": sum(1 for k in ranks if k == 1),
        "top3": sum(1 for k in ranks if k is not None and k <= 3),
        "top5": sum(1 for k in ranks if k is not None and k <= 5),
        "missed": sum(1 for k in ranks if k is None),
        "controls": len(ctl),
        "controls_clean": sum(1 for n in fp if n == 0),
        "false_positives_mean": round(sum(fp) / len(fp), 2) if fp else 0.0,
        "errors": sum(1 for r in recs.values() if r.get("status") == "error"),
    }


def print_summary(recs: dict[str, dict], log: Callable[..., None] = print) -> None:
    s = summarize(recs)
    log("")
    log(f"Con aneurisma: {s['confirmed']}  →  1.ª: {s['first']}  ·  entre 3: {s['top3']}"
        f"  ·  entre 5: {s['top5']}  ·  no sale: {s['missed']}")
    log(f"Controles: {s['controls']}  →  sin candidatos: {s['controls_clean']}"
        f"  ·  falsos positivos de media: {s['false_positives_mean']}")
    if s["errors"]:
        log(f"Errores: {s['errors']}")
    for sid, r in sorted(recs.items()):
        if r.get("status") == "error":
            log(f"  {sid}: {r.get('error')}")


# ── Línea de órdenes ───────────────────────────────────────────────────────── #

def _token(args) -> str:
    import httpx
    if args.token:
        return args.token
    if args.user:
        password = args.password or os.environ.get("PROSPECTIVE_PASSWORD") or ""
        with httpx.Client(base_url=args.api, timeout=30) as c:
            return _ok(c.post("/api/auth/login",
                              json={"username": args.user, "password": password}))["access_token"]
    # Misma máquina que el servidor: se firma con su secreto.
    from services.auth_service import create_access_token
    return create_access_token(subject="admin")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--studies", default="", help="ids separados por comas; por defecto todos")
    ap.add_argument("--method", choices=["tubular", "threshold"], default="tubular")
    ap.add_argument("--half-resolution", action="store_true")
    ap.add_argument("--redo", action="store_true", help="repetir los estudios ya hechos")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--timeout", type=float, default=3600.0, help="segundos por segmentación")
    ap.add_argument("--user")
    ap.add_argument("--password")
    ap.add_argument("--token")
    a = ap.parse_args(argv)

    # Redirigido a un fichero, Windows escribe en cp1252 y una flecha rompe el log.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    import httpx
    sids = [s.strip() for s in a.studies.split(",") if s.strip()] or study_ids(a.dataset)
    headers = {"Authorization": f"Bearer {_token(a)}"}
    with httpx.Client(base_url=a.api, headers=headers,
                      timeout=httpx.Timeout(600.0, read=a.timeout + 60.0)) as client:
        _ok(client.get("/api/auth/me"))
        ing = Ingestor(client, a.dataset, method=a.method, half_resolution=a.half_resolution,
                       timeout_s=a.timeout)
        recs = run(ing, sids, a.out, redo=a.redo)
    print_summary(recs)
    print(f"\nInforme: {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
