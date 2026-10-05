"""«Adjuntar a un caso»: ligar a paciente y caso una sesión empezada sin ellos.

Antes había que crear el paciente, luego el caso y luego subir el estudio
dentro, y solo entonces usar el pipeline. Un profesional quiere abrir el DICOM
y mirar, y decidir después si eso merece guardarse. Ahora puede empezar sin
paciente y, cuando quiera, adjuntar la sesión en una sola operación:

1. el paciente: uno que ya existe, o uno nuevo;
2. el caso: uno de ese paciente, o uno nuevo con solo el motivo;
3. el DICOM ya subido se archiva como estudio de imagen del caso (sin volver a
   subirlo), la sesión queda ligada, y lo que ya se hizo se re-engancha: la
   confirmación de lesión pasa a colgar del estudio.

La cabecera DICOM puede PROPONER los datos del paciente (GET .../identity),
pero nunca se escriben solos: el profesional los ve y los confirma. Y se busca
antes si ese nº de historia ya existe, porque el riesgo de este flujo es crear
pacientes duplicados.
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models.patient import PatientSummary
from services.audit import ACT_SESSION_ATTACHED, audit_append, audit_patient
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import (ImagingStudy, LesionConfirmation, Patient,
                                PlanningSession, Study, User)
from services.sessions import read_state, session_exists, session_subdir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ── Modelos ────────────────────────────────────────────────────────────────── #

class PatientSuggestion(BaseModel):
    surname: str = ""
    given_name: str = ""
    hospital_id: str = ""
    dob: str = Field("", description="YYYY-MM-DD")
    sex: str = ""


class PatientMatch(BaseModel):
    id: int
    full_name: str
    hospital_id: str
    dob: str
    reason: str = Field(..., description="'hospital_id' | 'name'")


class SessionIdentity(BaseModel):
    """Lo que dice la cabecera DICOM y a quién podría corresponder."""

    suggestion: PatientSuggestion
    study_date: str = Field("", description="Fecha del estudio YYYY-MM-DD")
    modality: str = ""
    matches: list[PatientMatch] = Field(default_factory=list)
    attached: bool = Field(False, description="La sesión ya está ligada a un estudio")


class NewPatient(BaseModel):
    surname: str
    given_name: str = ""
    hospital_id: str = ""
    dob: str = ""
    sex: str = ""


class NewCase(BaseModel):
    dx_principal: str = Field(..., description="Motivo / diagnóstico principal")
    study_date: str = ""


class AttachRequest(BaseModel):
    patient_id: Optional[int] = None
    new_patient: Optional[NewPatient] = None
    case_id: Optional[int] = None
    new_case: Optional[NewCase] = None


class AttachResult(BaseModel):
    patient: PatientSummary
    case_id: int
    case_label: str
    imaging_study_id: int
    relinked_confirmations: int


# ── Cabecera DICOM ─────────────────────────────────────────────────────────── #

def _dicom_date(v: str) -> str:
    v = (v or "").strip()
    return f"{v[:4]}-{v[4:6]}-{v[6:8]}" if len(v) >= 8 and v[:8].isdigit() else ""


def read_dicom_identity(session_id: str) -> tuple[PatientSuggestion, str, str]:
    """(sugerencia de paciente, fecha del estudio, modalidad) de la cabecera.

    Lee el primer fichero legible: los DICOM de este proyecto no llevan
    extensión, así que no se filtra por nombre."""
    import pydicom
    d = session_subdir(session_id, "dicom")
    for f in sorted(p for p in d.rglob("*") if p.is_file()):
        try:
            ds = pydicom.dcmread(str(f), stop_before_pixels=True, force=True)
        except Exception:  # noqa: BLE001 — no era DICOM
            continue
        if not hasattr(ds, "PatientName") and not hasattr(ds, "Modality"):
            continue
        name = str(getattr(ds, "PatientName", "") or "")
        surname, _, given = name.partition("^")
        sex = str(getattr(ds, "PatientSex", "") or "").upper()[:1]
        return (
            PatientSuggestion(
                surname=surname.strip().title(),
                given_name=given.replace("^", " ").strip().title(),
                hospital_id=str(getattr(ds, "PatientID", "") or "").strip(),
                dob=_dicom_date(str(getattr(ds, "PatientBirthDate", "") or "")),
                sex=sex if sex in ("M", "F", "O") else "",
            ),
            _dicom_date(str(getattr(ds, "StudyDate", "") or "")),
            str(getattr(ds, "Modality", "") or ""),
        )
    return PatientSuggestion(), "", read_state(session_id, "dicom.modality", "") or ""


def _visible(db: Session, user: User | None):
    q = db.query(Patient)
    if user is not None and user.role != "admin":
        q = q.filter(Patient.created_by == user.id)
    return q


def _session_row(db: Session, session_id: str) -> PlanningSession | None:
    return db.query(PlanningSession).filter_by(session_id=session_id).first()


@router.get(
    "/{session_id}/identity",
    response_model=SessionIdentity,
    summary="Datos del paciente que propone la cabecera DICOM, y posibles coincidencias",
    description=(
        "Solo PROPONE: no escribe nada. Busca pacientes con el mismo nº de "
        "historia y, si no hay, con el mismo apellido, para no crear duplicados."
    ),
)
async def session_identity(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> SessionIdentity:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    sug, study_date, modality = read_dicom_identity(session_id)

    matches: list[PatientMatch] = []
    q = _visible(db, current_user)
    if sug.hospital_id:
        for p in q.filter(Patient.hospital_id == sug.hospital_id).limit(5):
            matches.append(PatientMatch(id=p.id, full_name=p.full_name, hospital_id=p.hospital_id or "",
                                        dob=p.dob or "", reason="hospital_id"))
    if not matches and sug.surname:
        for p in q.filter(Patient.surname.ilike(sug.surname)).limit(5):
            matches.append(PatientMatch(id=p.id, full_name=p.full_name, hospital_id=p.hospital_id or "",
                                        dob=p.dob or "", reason="name"))
    ps = _session_row(db, session_id)
    return SessionIdentity(suggestion=sug, study_date=study_date, modality=modality,
                           matches=matches, attached=bool(ps and ps.imaging_study_id))


# ── Adjuntar ───────────────────────────────────────────────────────────────── #

@router.post(
    "/{session_id}/attach",
    response_model=AttachResult,
    summary="Adjuntar la sesión a un paciente y un caso, archivando su DICOM",
    description=(
        "Paciente existente (`patient_id`) o nuevo (`new_patient`); caso "
        "existente de ese paciente (`case_id`) o nuevo (`new_case`). Archiva el "
        "DICOM de la sesión como estudio de imagen del caso, liga la sesión y "
        "pasa al estudio las confirmaciones de lesión hechas en ella. Si algo "
        "falla no deja paciente ni caso a medias."
    ),
)
async def attach_session(
    session_id: str,
    req: AttachRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> AttachResult:
    from routers.patients import _patient_to_summary
    from routers.studies import archive_into_case

    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    ps = _session_row(db, session_id)
    if ps is not None and ps.imaging_study_id:
        raise HTTPException(status_code=409, detail="Esta sesión ya está adjunta a un caso.")
    if (req.patient_id is None) == (req.new_patient is None):
        raise HTTPException(status_code=422, detail="Elige un paciente o crea uno nuevo (uno de los dos).")
    if (req.case_id is None) == (req.new_case is None):
        raise HTTPException(status_code=422, detail="Elige un caso o crea uno nuevo (uno de los dos).")
    dicom_dir = session_subdir(session_id, "dicom")
    if not any(p.is_file() for p in dicom_dir.rglob("*")):
        raise HTTPException(status_code=422, detail="La sesión no tiene DICOM que archivar.")

    created: list = []          # lo creado aquí, para deshacerlo si algo falla
    try:
        # ── Paciente ───────────────────────────────────────────────────── #
        if req.patient_id is not None:
            patient = _visible(db, current_user).filter(Patient.id == req.patient_id).first()
            if patient is None:
                raise HTTPException(status_code=404, detail=f"Paciente {req.patient_id} no encontrado.")
        else:
            np_ = req.new_patient
            if not (np_.surname.strip() or np_.given_name.strip()):
                raise HTTPException(status_code=422, detail="El nombre del paciente es obligatorio.")
            hc = np_.hospital_id.strip()
            if hc:
                dup = db.query(Patient).filter(Patient.hospital_id == hc).first()
                if dup is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Ya existe un paciente con la historia clínica '{hc}' "
                               f"({dup.full_name}). Elígelo en lugar de crear otro.",
                    )
            patient = Patient(surname=np_.surname.strip(), given_name=np_.given_name.strip(),
                              hospital_id=hc, dob=np_.dob, sex=np_.sex,
                              created_by=current_user.id if current_user else None)
            db.add(patient)
            db.commit()
            db.refresh(patient)
            created.append(patient)

        # ── Caso ───────────────────────────────────────────────────────── #
        if req.case_id is not None:
            case = db.query(Study).filter(Study.id == req.case_id,
                                          Study.patient_id == patient.id).first()
            if case is None:
                raise HTTPException(status_code=404, detail="Ese caso no es de este paciente.")
        else:
            nc = req.new_case
            if not nc.dx_principal.strip():
                raise HTTPException(status_code=422, detail="Escribe el motivo del caso.")
            case = Study(patient_id=patient.id, description=nc.dx_principal.strip(),
                         dx_principal=nc.dx_principal.strip(), acquired_at=nc.study_date or "",
                         modality=read_state(session_id, "dicom.modality", "") or "")
            db.add(case)
            db.commit()
            db.refresh(case)
            created.append(case)

        # ── Archivar y ligar ───────────────────────────────────────────── #
        try:
            img = archive_into_case(db, case, session_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BaseException:
        for row in reversed(created):
            db.delete(row)
        db.commit()
        raise

    if ps is None:
        # Sin guardar todavía: la fila mínima que la liga. «Guardar progreso»
        # la completa con la morfometría y la instantánea.
        ps = PlanningSession(session_id=session_id, study_id=case.id, patient_id=patient.id,
                             imaging_study_id=img.id, label=f"{patient.full_name}")
        db.add(ps)
    # Lo que se hizo antes de adjuntar pasa a colgar del estudio.
    n = (db.query(LesionConfirmation)
         .filter(LesionConfirmation.session_id == session_id,
                 LesionConfirmation.imaging_study_id.is_(None))
         .update({"imaging_study_id": img.id, "case_id": case.id, "patient_id": patient.id},
                 synchronize_session=False))
    db.commit()
    db.refresh(patient)

    audit_append(ACT_SESSION_ATTACHED, {
        "session_id": session_id, "patient": patient.id, "case": case.id,
        "imaging_study": img.id, "new_patient": req.new_patient is not None,
        "new_case": req.new_case is not None, "relinked_confirmations": n,
    }, username=current_user.username if current_user else "", **audit_patient(patient))
    logger.info("Session %s attached to patient %d case %d study %d", session_id, patient.id, case.id, img.id)
    return AttachResult(patient=_patient_to_summary(patient), case_id=case.id,
                        case_label=case.dx_principal or case.description or "Caso",
                        imaging_study_id=img.id, relinked_confirmations=n)
