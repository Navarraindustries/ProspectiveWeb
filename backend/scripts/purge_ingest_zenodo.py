# -*- coding: utf-8 -*-
"""Quita de la app las ingestas de Zenodo (`scripts/ingest_zenodo.py`), coherentemente.

La ingesta del 2026-10-09 metió 44 estudios como pacientes de la app, cada uno
con tres copias de su DICOM (archivo duradero `study_files/`, copia de la sesión
en `data/session_saves/<id>/dicom` y caché del volumen `_volume.npy`, 1,3 GB):
unos 33 GB. El banco (`eval_zenodo.py`) trabaja desde el dataset, así que esas
ingestas ya no sirven para medir.

Hace lo mismo que `DELETE /patients/{id}` (filas de sesiones de planificación,
confirmaciones de lesión, casos y paciente, con asiento de auditoría) y además
lo que el endpoint no toca: el archivo duradero de cada estudio de imagen y la
carpeta de la sesión guardada.

Uso (el usuario lo ejecuta a mano; por defecto solo enseña):
    .venv/Scripts/python.exe scripts/purge_ingest_zenodo.py
    .venv/Scripts/python.exe scripts/purge_ingest_zenodo.py --yes
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

REPORT = Path(__file__).resolve().parents[1] / "data" / "ingest_zenodo.json"


def _dir_bytes(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.exists() else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--report", type=Path, default=REPORT)
    ap.add_argument("--yes", action="store_true", help="borrar de verdad (por defecto solo enseña)")
    a = ap.parse_args(argv)

    from services.audit import ACT_PATIENT_DELETED, audit_append, audit_patient
    from services.database import SessionLocal
    from services.db_models import (ImagingStudy, LesionConfirmation, Patient,
                                    PlanningSession)
    from services.sessions import SAVES_ROOT, SESSIONS_ROOT
    from services.storage import get_storage

    recs = json.loads(a.report.read_text(encoding="utf-8"))
    patient_ids = sorted({r["patient_id"] for r in recs.values() if r.get("patient_id")})
    ingest_sessions = sorted({r["session_id"] for r in recs.values() if r.get("session_id")})
    print(f"{len(patient_ids)} pacientes y {len(ingest_sessions)} sesiones en {a.report.name}")

    db = SessionLocal()
    storage = get_storage()
    total = 0
    vistas: set[str] = set()
    try:
        for pid in patient_ids:
            patient = db.get(Patient, pid)
            if patient is None:
                print(f"  paciente {pid}: ya no está")
                continue
            imaging = db.query(ImagingStudy).filter(ImagingStudy.patient_id == pid).all()
            sessions = db.query(PlanningSession).filter(PlanningSession.patient_id == pid).all()
            confirms = db.query(LesionConfirmation).filter(LesionConfirmation.patient_id == pid).count()
            archive = sum(storage.size_bytes(i.storage_prefix) for i in imaging if i.storage_prefix)
            saves = sorted({SAVES_ROOT / s.session_id for s in sessions if (SAVES_ROOT / s.session_id).exists()}, key=str)
            vistas.update(s.session_id for s in sessions)
            saved_bytes = sum(_dir_bytes(p) for p in saves)
            total += archive + saved_bytes
            print(f"  paciente {pid} «{patient.surname}, {patient.given_name}»: {len(patient.studies or [])} casos, "
                  f"{len(imaging)} estudios de imagen ({archive / 1e9:.2f} GB de archivo), "
                  f"{len(sessions)} sesiones, {confirms} confirmaciones, "
                  f"{len(saves)} carpetas guardadas ({saved_bytes / 1e9:.2f} GB)")
            if not a.yes:
                continue
            paciente = audit_patient(patient)
            n_casos = len(patient.studies or [])
            for i in imaging:
                if i.storage_prefix:
                    storage.delete_prefix(i.storage_prefix)
            n_ses = db.query(PlanningSession).filter(PlanningSession.patient_id == pid).delete()
            db.query(LesionConfirmation).filter(LesionConfirmation.patient_id == pid).delete()
            db.delete(patient)
            db.commit()
            for p in saves:
                shutil.rmtree(p, ignore_errors=True)
            for s in sessions:
                if (SESSIONS_ROOT / s.session_id).exists():
                    shutil.rmtree(SESSIONS_ROOT / s.session_id, ignore_errors=True)
            audit_append(ACT_PATIENT_DELETED,
                         {"patient": pid, "cases": n_casos, "planning_sessions": n_ses,
                          "reason": "purge_ingest_zenodo"},
                         username="purge_ingest_zenodo", **paciente)
            print("    borrado")
        # Sesiones de la ingesta que ya no cuelgan de ningún paciente (huérfanas).
        for sid in ingest_sessions:
            p = SAVES_ROOT / sid
            if sid not in vistas and p.exists():
                b = _dir_bytes(p)
                total += b
                print(f"  sesión huérfana {sid[:8]}… ({b / 1e9:.2f} GB)")
                if a.yes:
                    shutil.rmtree(p, ignore_errors=True)
    finally:
        db.close()
    print(f"{'liberado' if a.yes else 'liberaría'}: {total / 1e9:.1f} GB")
    if not a.yes:
        print("(nada borrado: repite con --yes)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
