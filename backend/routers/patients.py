"""Patient and study management router — real SQLite CRUD (Session D)."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (CaseCreate, PatientCreate, PatientDetail, PatientSessionInfo, PatientShareOut,
                    PatientSharesIn, PatientSummary, StudyCreate, StudySummary)

# Study clinical-case fields copied from a CaseCreate payload.
_STUDY_CASE_FIELDS = (
    "sintomas_positivos", "dx_principal", "dx_secundario", "tipo_aneurisma",
    "tratamiento_propuesto", "region_anatomica", "lateralidad", "angiographer",
    "mod_tac", "mod_angio", "mod_rm", "mod_pangio",
)
from services.database import get_db
from services.access import own_patient_ids, require_patient, require_share_right
from services.auth_service import get_current_user
from services.audit import (ACT_CASE_DELETED, ACT_PATIENT_DELETED, ACT_PATIENT_SHARED,
                            audit_append, audit_patient)
from services.db_models import Patient, PatientShare, PlanningSession, Study, User

# Patient demographic + history fields copied on create / update.
_PATIENT_FIELDS = (
    "surname", "given_name", "hospital_id", "dob", "sex", "institution",
    "ocupacion", "antecedentes_patologicos", "antecedentes_toxicologicos",
    "antecedentes_quirurgicos", "antecedentes_alergicos",
    "antecedentes_farmacologicos", "notes",
)


def _require_owner_or_admin(patient: Patient, user: User | None) -> None:
    """A non-admin authenticated user may only touch patients they created."""
    if user is not None and user.role != "admin" and patient.created_by != user.id:
        raise HTTPException(status_code=403, detail="No autorizado sobre este paciente.")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/patients", tags=["patients"])


# ── Mappers ────────────────────────────────────────────────────────────────── #

def _patient_to_summary(p: Patient, shared_with_count: int | None = None,
                        is_shared_with_me: bool = False) -> PatientSummary:
    # La lista pasa el recuento ya calculado (una sola consulta agrupada, no una
    # por paciente); crear, editar o adjuntar devuelven UN paciente y lo cuentan
    # aquí. Quien llama sabe si el paciente le llega compartido (adjuntar).
    if shared_with_count is None:
        shared_with_count = len(p.shares)
    return PatientSummary(
        id=p.id,
        full_name=p.full_name,
        hospital_id=p.hospital_id,
        dob=p.dob,
        sex=p.sex,
        institution=p.institution,
        study_count=p.study_count,
        created_at=p.created_at,
        owner_id=p.created_by,
        shared_with_count=shared_with_count,
        is_shared_with_me=is_shared_with_me,
    )


def _study_to_summary(s: Study) -> StudySummary:
    return StudySummary(
        id=s.id,
        patient_id=s.patient_id,
        dicom_path=s.dicom_path,
        modality=s.modality,
        description=s.description,
        acquired_at=s.acquired_at,
        session_count=s.session_count,
        sintomas_positivos=s.sintomas_positivos,
        dx_principal=s.dx_principal,
        dx_secundario=s.dx_secundario,
        tipo_aneurisma=s.tipo_aneurisma,
        tratamiento_propuesto=s.tratamiento_propuesto,
        region_anatomica=s.region_anatomica,
        lateralidad=s.lateralidad,
        angiographer=s.angiographer,
        mod_tac=s.mod_tac,
        mod_angio=s.mod_angio,
        mod_rm=s.mod_rm,
        mod_pangio=s.mod_pangio,
    )


# ── GET /patients ──────────────────────────────────────────────────────────── #

@router.get(
    "",
    response_model=list[PatientSummary],
    summary="List all patients",
    description=(
        "Returns all patient records.  "
        "Non-admin users see the patients they created plus the ones shared "
        "with them (admins see all). Each row says who owns it, with how many "
        "accounts it is shared and whether it is shared with the caller."
    ),
)
async def list_patients(
    db:           Annotated[Session,    Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[PatientSummary]:
    query = db.query(Patient)
    shares = db.query(PatientShare.patient_id, func.count(PatientShare.id))

    # La misma regla que el resto de rutas (services/access.py): antes este
    # filtro iba aparte y solo miraba al creador.
    visibles = own_patient_ids(db, current_user)
    if visibles is not None:
        query = query.filter(Patient.id.in_(visibles))
        shares = shares.filter(PatientShare.patient_id.in_(visibles))

    patients = query.order_by(Patient.created_at.desc()).all()
    counts = dict(shares.group_by(PatientShare.patient_id).all())
    mine_by_share: set[int] = set()
    if current_user is not None:
        mine_by_share = {pid for (pid,) in db.query(PatientShare.patient_id)
                         .filter(PatientShare.user_id == current_user.id)}
    return [
        _patient_to_summary(
            p,
            shared_with_count=counts.get(p.id, 0),
            is_shared_with_me=(p.id in mine_by_share
                               and (current_user is None or p.created_by != current_user.id)),
        )
        for p in patients
    ]


# ── POST /patients ─────────────────────────────────────────────────────────── #

@router.post(
    "",
    response_model=PatientSummary,
    status_code=201,
    summary="Register a new patient",
    description="Creates a patient record. Authentication is recommended (records the creator).",
)
async def create_patient(
    req:          PatientCreate,
    db:           Annotated[Session,    Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> PatientSummary:
    # Enforce a unique medical-record number (historia clínica). Enforced at the
    # application layer rather than a DB constraint so it does not require a
    # dedup migration of pre-existing rows; empty HC is allowed (unknown).
    hc = (req.hospital_id or "").strip()
    if hc:
        existing = db.query(Patient).filter(Patient.hospital_id == hc).first()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un paciente con la historia clínica '{hc}'.",
            )

    patient = Patient(
        surname                    = req.surname,
        given_name                 = req.given_name,
        hospital_id                = req.hospital_id,
        dob                        = req.dob,
        sex                        = req.sex,
        institution                = req.institution,
        ocupacion                  = req.ocupacion,
        antecedentes_patologicos   = req.antecedentes_patologicos,
        antecedentes_toxicologicos = req.antecedentes_toxicologicos,
        antecedentes_quirurgicos   = req.antecedentes_quirurgicos,
        antecedentes_alergicos     = req.antecedentes_alergicos,
        antecedentes_farmacologicos= req.antecedentes_farmacologicos,
        notes                      = req.notes,
        created_by                 = current_user.id if current_user else None,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    logger.info(
        "Patient created — id=%d surname=%s creator=%s",
        patient.id, patient.surname,
        current_user.username if current_user else "anonymous",
    )
    return _patient_to_summary(patient)


# ── POST /patients/case (Nuevo Caso: paciente + estudio) ───────────────────── #

@router.post(
    "/case",
    response_model=PatientSummary,
    status_code=201,
    summary="Create a full clinical case (patient + study) — SUPERSEDED",
    description=(
        "Desktop 'Nuevo Caso' equivalent: creates a Patient (demographics + "
        "history) and a linked Study in one call. "
        "**Do not wire this into the UI.** It always creates a NEW patient, "
        "which is exactly the duplication the two-step flow was built to avoid: "
        "the app uses `POST /api/patients` and then "
        "`POST /api/patients/{id}/studies`, so a second case attaches to the "
        "patient who already exists. Kept for API clients that predate that "
        "flow; the frontend method was removed."
    ),
)
async def create_case(
    req:          CaseCreate,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> PatientSummary:
    # Validation mirrors the desktop dialog.
    if not (req.surname.strip() or req.given_name.strip()):
        raise HTTPException(status_code=422, detail="El nombre del paciente es obligatorio.")
    hc = (req.hospital_id or "").strip()
    if not hc:
        raise HTTPException(status_code=422, detail="La cédula / NHC es obligatoria.")
    if not req.dx_principal.strip():
        raise HTTPException(status_code=422, detail="El diagnóstico principal es obligatorio.")
    if db.query(Patient).filter(Patient.hospital_id == hc).first() is not None:
        raise HTTPException(status_code=409, detail=f"Ya existe un paciente con la historia clínica '{hc}'.")

    patient = Patient(
        **{f: getattr(req, f) for f in _PATIENT_FIELDS},
        created_by=current_user.id if current_user else None,
    )
    db.add(patient)
    db.flush()   # assign patient.id before linking the study

    modality = ("CT" if req.mod_tac else "XA" if req.mod_angio
                else "MR" if req.mod_rm else "XA" if req.mod_pangio else "")
    study = Study(
        patient_id=patient.id,
        acquired_at=req.study_date,
        modality=modality,
        description=req.dx_principal,
        **{f: getattr(req, f) for f in _STUDY_CASE_FIELDS},
    )
    db.add(study)
    db.commit()
    db.refresh(patient)
    logger.info("Case created — patient=%d study=%d dx=%s", patient.id, study.id, req.dx_principal)
    return _patient_to_summary(patient)


# ── GET /patients/{patient_id}/studies ────────────────────────────────────── #

@router.get(
    "/{patient_id}/studies",
    response_model=list[StudySummary],
    summary="List DICOM studies for a patient",
)
async def list_studies(
    patient_id:   int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[StudySummary]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    require_patient(db, current_user, patient_id)  # misma regla que la ficha

    studies = (
        db.query(Study)
        .filter(Study.patient_id == patient_id)
        .order_by(Study.acquired_at.desc())
        .all()
    )
    return [_study_to_summary(s) for s in studies]


# ── POST /patients/{patient_id}/studies (add a study to an existing patient) ─ #

@router.post(
    "/{patient_id}/studies",
    response_model=StudySummary,
    status_code=201,
    summary="Add a clinical study/case to an existing patient",
)
async def create_study(
    patient_id:   int,
    req:          StudyCreate,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> StudySummary:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    _require_owner_or_admin(patient, current_user)
    if not req.dx_principal.strip():
        raise HTTPException(status_code=422, detail="El diagnóstico principal es obligatorio.")

    modality = ("CT" if req.mod_tac else "XA" if req.mod_angio
                else "MR" if req.mod_rm else "XA" if req.mod_pangio else "")
    study = Study(
        patient_id=patient_id,
        acquired_at=req.study_date,
        modality=modality,
        description=req.dx_principal,
        **{f: getattr(req, f) for f in _STUDY_CASE_FIELDS},
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    logger.info("Study added — patient=%d study=%d", patient_id, study.id)
    return _study_to_summary(study)


def _get_owned_study(db: Session, patient_id: int, study_id: int, user: User | None) -> Study:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    _require_owner_or_admin(patient, user)
    study = db.get(Study, study_id)
    if study is None or study.patient_id != patient_id:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found for patient {patient_id}")
    return study


# ── PUT /patients/{patient_id}/studies/{study_id} ──────────────────────────── #

@router.put(
    "/{patient_id}/studies/{study_id}",
    response_model=StudySummary,
    summary="Update a patient's study/case",
)
async def update_study(
    patient_id:   int,
    study_id:     int,
    req:          StudyCreate,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> StudySummary:
    study = _get_owned_study(db, patient_id, study_id, current_user)
    if not req.dx_principal.strip():
        raise HTTPException(status_code=422, detail="El diagnóstico principal es obligatorio.")
    for field in _STUDY_CASE_FIELDS:
        setattr(study, field, getattr(req, field))
    study.acquired_at = req.study_date
    study.description = req.dx_principal
    study.modality = ("CT" if req.mod_tac else "XA" if req.mod_angio
                      else "MR" if req.mod_rm else "XA" if req.mod_pangio else "")
    db.commit()
    db.refresh(study)
    logger.info("Study updated — patient=%d study=%d", patient_id, study_id)
    return _study_to_summary(study)


# ── DELETE /patients/{patient_id}/studies/{study_id} ───────────────────────── #

@router.delete(
    "/{patient_id}/studies/{study_id}",
    status_code=204,
    summary="Delete a patient's study/case",
)
async def delete_study(
    patient_id:   int,
    study_id:     int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> None:
    study = _get_owned_study(db, patient_id, study_id, current_user)
    paciente = audit_patient(db.get(Patient, patient_id))
    # Its planning sessions have a study_id FK without cascade — detach them so
    # the saved planning work survives under the patient.
    db.query(PlanningSession).filter(PlanningSession.study_id == study_id).update({"study_id": None})
    db.delete(study)
    db.commit()
    logger.info("Study deleted — patient=%d study=%d", patient_id, study_id)
    audit_append(ACT_CASE_DELETED, {"patient": patient_id, "case": study_id},
                 username=current_user.username if current_user else "", **paciente)


# ── GET /patients/{patient_id} ─────────────────────────────────────────────── #

@router.get(
    "/{patient_id}",
    response_model=PatientDetail,
    summary="Get a patient's full record (for editing)",
)
async def get_patient(
    patient_id:   int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> PatientDetail:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    # Editar y borrar ya comprobaban al dueño, pero leer no: un Médico abría la
    # ficha de otro profesional con solo cambiar el id en la URL (?paciente=1).
    require_patient(db, current_user, patient_id)
    return PatientDetail(id=patient.id, **{f: getattr(patient, f) for f in _PATIENT_FIELDS})


# ── PUT /patients/{patient_id} ─────────────────────────────────────────────── #

@router.put(
    "/{patient_id}",
    response_model=PatientSummary,
    summary="Update a patient",
    description="Updates a patient's demographics and clinical history.",
)
async def update_patient(
    patient_id:   int,
    req:          PatientCreate,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> PatientSummary:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    _require_owner_or_admin(patient, current_user)

    # Medical-record number stays unique (excluding this patient).
    hc = (req.hospital_id or "").strip()
    if hc:
        clash = (
            db.query(Patient)
            .filter(Patient.hospital_id == hc, Patient.id != patient_id)
            .first()
        )
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un paciente con la historia clínica '{hc}'.",
            )

    for field in _PATIENT_FIELDS:
        setattr(patient, field, getattr(req, field))
    db.commit()
    db.refresh(patient)
    logger.info("Patient updated — id=%d surname=%s", patient.id, patient.surname)
    return _patient_to_summary(patient)


# ── DELETE /patients/{patient_id} ──────────────────────────────────────────── #

@router.delete(
    "/{patient_id}",
    status_code=204,
    summary="Delete a patient",
    description="Deletes a patient and its studies and planning sessions (cascade).",
)
async def delete_patient(
    patient_id:   int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> None:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    _require_owner_or_admin(patient, current_user)

    paciente = audit_patient(patient)
    n_casos = len(patient.studies or [])
    # Planning sessions carry a patient_id FK without cascade — remove them first
    # (studies are removed by the ORM cascade on Patient.studies).
    n_sesiones = db.query(PlanningSession).filter(PlanningSession.patient_id == patient_id).delete()
    db.delete(patient)
    db.commit()
    logger.info("Patient deleted — id=%d", patient_id)
    audit_append(ACT_PATIENT_DELETED,
                 {"patient": patient_id, "cases": n_casos, "planning_sessions": n_sesiones},
                 username=current_user.username if current_user else "", **paciente)


# ── GET /patients/{patient_id}/sessions ────────────────────────────────────── #

@router.get(
    "/{patient_id}/sessions",
    response_model=list[PatientSessionInfo],
    summary="List planning sessions done on a patient",
)
async def list_patient_sessions(
    patient_id:   int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[PatientSessionInfo]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    require_patient(db, current_user, patient_id)  # misma regla que la ficha

    sessions = (
        db.query(PlanningSession)
        .filter(PlanningSession.patient_id == patient_id)
        .order_by(PlanningSession.updated_at.desc())
        .all()
    )
    return [
        PatientSessionInfo(
            session_id=s.session_id,
            label=s.label,
            current_step=s.current_step,
            max_diameter_mm=s.max_diameter_mm,
            rupture_risk_label=s.rupture_risk_label,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


# ── Compartir (F2-75) ──────────────────────────────────────────────────────── #

def _shares_out(db: Session, patient_id: int) -> list[PatientShareOut]:
    rows = (
        db.query(PatientShare, User)
        .join(User, User.id == PatientShare.user_id)
        .filter(PatientShare.patient_id == patient_id)
        .order_by(PatientShare.id)
        .all()
    )
    return [
        PatientShareOut(user_id=u.id, username=u.username, full_name=u.full_name or "",
                        role=u.role, shared_at=sh.created_at)
        for sh, u in rows
    ]


@router.get(
    "/{patient_id}/shares",
    response_model=list[PatientShareOut],
    summary="Cuentas con las que está compartido un paciente",
    description="La ve cualquiera que vea al paciente (creador, compartidos y administrador).",
)
async def list_patient_shares(
    patient_id:   int,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[PatientShareOut]:
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    require_patient(db, current_user, patient_id)
    return _shares_out(db, patient_id)


@router.put(
    "/{patient_id}/shares",
    response_model=list[PatientShareOut],
    summary="Fijar con qué cuentas se comparte un paciente",
    description=(
        "Sustituye la lista entera por `user_ids`. Solo quien creó al paciente o un "
        "administrador; el creador y quien comparte se ignoran si vienen en la lista. "
        "Una cuenta que no existe o no está activa es un 422. Deja un bloque "
        "`PATIENT_SHARED` en la auditoría."
    ),
)
async def set_patient_shares(
    patient_id:   int,
    req:          PatientSharesIn,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[PatientShareOut]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    require_share_right(db, current_user, patient_id)

    # El creador ya lo ve, y quien comparte (creador o administrador) también:
    # una fila suya solo engordaría el contador de «compartido con».
    fuera = {patient.created_by, current_user.id if current_user else None}
    wanted = [uid for uid in dict.fromkeys(req.user_ids) if uid not in fuera]

    if wanted:
        activos = {uid for (uid,) in db.query(User.id).filter(
            User.id.in_(wanted), User.is_active == True,  # noqa: E712
            User.status == User.STATUS_ACTIVE,
        )}
        faltan = [uid for uid in wanted if uid not in activos]
        if faltan:
            raise HTTPException(
                status_code=422,
                detail=f"No se puede compartir con la cuenta {faltan[0]}: no existe o no está activa.",
            )

    actuales = {sh.user_id: sh for sh in db.query(PatientShare).filter(PatientShare.patient_id == patient_id)}
    for uid, sh in actuales.items():
        if uid not in wanted:
            db.delete(sh)
    for uid in wanted:
        # Quien ya estaba conserva su fecha: «compartido el» no cambia por
        # volver a guardar la misma lista.
        if uid not in actuales:
            db.add(PatientShare(patient_id=patient_id, user_id=uid,
                                shared_by=current_user.id if current_user else None))
    db.commit()

    logger.info("Patient shares set — patient=%d users=%s by=%s", patient_id, wanted,
                current_user.username if current_user else "anonymous")
    audit_append(ACT_PATIENT_SHARED, {"patient_id": patient_id, "user_ids": wanted},
                 username=current_user.username if current_user else "", **audit_patient(patient))
    return _shares_out(db, patient_id)
