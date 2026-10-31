"""Patient and study management router — real SQLite CRUD (Session D)."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (CaseCreate, PatientActivity, PatientCreate, PatientDetail, PatientSessionInfo, PatientShareOut,
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
                            SkullChain, audit_append, audit_patient, patient_hash_for)
from services.sessions import size_of_row
from services.db_models import (CaseCapture, ImagingStudy, LesionConfirmation, Patient,
                                PatientShare, PlanningSession, Study, User)

# Patient demographic + history fields copied on create / update.
_PATIENT_FIELDS = (
    "surname", "given_name", "hospital_id", "dob", "sex", "institution",
    "ocupacion", "antecedentes_patologicos", "antecedentes_toxicologicos",
    "antecedentes_quirurgicos", "antecedentes_alergicos",
    "antecedentes_farmacologicos", "notes",
)


def _require_owner_or_admin(patient: Patient, user: User | None) -> None:
    """Lo que solo decide quien creó al paciente (o un administrador).

    Regla T7: un compartido crea y edita casos y trabaja en las sesiones (es
    el equipo que lleva el caso), pero no cambia la ficha del paciente, no lo
    borra, no borra casos y no vuelve a compartir. Estas puertas usan esta
    función; las de crear y editar casos, `require_patient`.
    """
    if user is not None and user.role != "admin" and patient.created_by != user.id:
        raise HTTPException(status_code=403, detail="No autorizado sobre este paciente.")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/patients", tags=["patients"])


# ── Mappers ────────────────────────────────────────────────────────────────── #

def _patient_to_summary(p: Patient, shared_with_count: int | None = None,
                        is_shared_with_me: bool = False, study_count: int | None = None,
                        last_session: PlanningSession | None = None,
                        last_case_label: str = "",
                        last_capture_id: int | None = None,
                        last_imaging_study_id: int | None = None) -> PatientSummary:
    # La lista pasa los recuentos y la última actividad ya calculados (consultas
    # agrupadas, no una por paciente); crear, editar o adjuntar devuelven UN
    # paciente, lo cuentan aquí y dejan vacía la última actividad, que solo
    # sirve para ordenar la lista. Quien llama sabe si el paciente le llega
    # compartido (adjuntar).
    if shared_with_count is None:
        shared_with_count = len(p.shares)
    if study_count is None:
        study_count = p.study_count
    return PatientSummary(
        id=p.id,
        full_name=p.full_name,
        hospital_id=p.hospital_id,
        dob=p.dob,
        sex=p.sex,
        institution=p.institution,
        study_count=study_count,
        created_at=p.created_at,
        owner_id=p.created_by,
        shared_with_count=shared_with_count,
        is_shared_with_me=is_shared_with_me,
        last_session_at=last_session.updated_at if last_session else None,
        last_session_step=last_session.current_step if last_session else None,
        last_session_id=last_session.session_id if last_session else None,
        last_case_label=last_case_label,
        # El riesgo es el de la misma sesión que el paso: no se hereda de otra anterior.
        last_risk_label=last_session.rupture_risk_label if last_session else None,
        last_capture_id=last_capture_id,
        last_imaging_study_id=last_imaging_study_id,
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


# Acciones que no cuentan como «actividad del paciente» (además de todo USER_*,
# que el SQL excluye por prefijo): son de la cuenta o de la cadena, no clínicas.
_ACCIONES_FUERA_DE_ACTIVIDAD = {"LOGIN", "INTEGRITY_CHECK", "GENESIS", "password_change", "password_reset"}


# Va ANTES de las rutas /{patient_id}: si no, FastAPI tomaría «activity» por un id.
@router.get(
    "/activity",
    response_model=list[PatientActivity],
    summary="Actividad reciente de los pacientes visibles",
    description=(
        "Los últimos eventos de la cadena de auditoría de los pacientes que la "
        "cuenta puede ver (todos, para un administrador), el más reciente primero. "
        "No incluye eventos de cuentas ni de inicio de sesión."
    ),
)
async def patients_activity(
    db:           Annotated[Session,    Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
    limit:        Annotated[int, Query(ge=1, le=50)] = 8,
) -> list[PatientActivity]:
    visibles = own_patient_ids(db, current_user)
    query = db.query(Patient)
    if visibles is not None:
        query = query.filter(Patient.id.in_(visibles))
    # La cadena no guarda el id del paciente sino un hash de historia clínica y
    # fecha de nacimiento, el mismo con que escriben los routers. Se invierte
    # construyendo el hash de cada paciente visible. Límite aceptado (spec §4.4):
    # si se edita la historia o la fecha, los bloques anteriores dejan de casar.
    # Dos fichas con la misma historia y fecha comparten hash (la HC no es única
    # en BD si viene vacía o de datos antiguos). Se recorre por id y gana la
    # primera, la más antigua: así el nombre de la actividad no cambia de una
    # petición a otra según el orden en que devuelva las filas la base.
    por_hash = {}
    for p in query.order_by(Patient.id).all():
        args = audit_patient(p)
        h = patient_hash_for(args["patient_id"], args["patient_dob"])
        if h:
            por_hash.setdefault(h, p)
    bloques = SkullChain.instance().get_recent(set(por_hash), limit, _ACCIONES_FUERA_DE_ACTIVIDAD)
    return [PatientActivity(patient_id=por_hash[b["patient_hash"]].id,
                            patient_name=por_hash[b["patient_hash"]].full_name,
                            action=b["action"], at=b["iso_ts"], username=b["username"])
            for b in bloques]


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

    # Recuento de casos agrupado: `p.study_count` cargaba los casos de cada
    # paciente, una consulta por fila.
    n_casos = db.query(Study.patient_id, func.count(Study.id))
    # La sesión más reciente de cada paciente: el máximo de updated_at por
    # paciente y, unida a él, la fila que lo tiene (paso e id para reanudar).
    ult_ses = (db.query(PlanningSession.patient_id.label("pid"),
                        func.max(PlanningSession.updated_at).label("at"))
               .filter(PlanningSession.patient_id.isnot(None)))
    # El caso más reciente, igual: su diagnóstico es el «Último caso» de la fila.
    ult_caso = db.query(Study.patient_id.label("pid"), func.max(Study.created_at).label("at"))
    if visibles is not None:
        n_casos = n_casos.filter(Study.patient_id.in_(visibles))
        ult_ses = ult_ses.filter(PlanningSession.patient_id.in_(visibles))
        ult_caso = ult_caso.filter(Study.patient_id.in_(visibles))
    # Captura PNG (no vídeo) y estudio con miniatura más recientes, de cualquier
    # caso: la tarjeta del panel los enseña sin abrir la ficha.
    ult_cap = (db.query(CaseCapture.patient_id.label("pid"),
                        func.max(CaseCapture.created_at).label("at"))
               .filter(CaseCapture.patient_id.isnot(None), CaseCapture.media_type == "image/png"))
    ult_img = (db.query(ImagingStudy.patient_id.label("pid"),
                        func.max(ImagingStudy.created_at).label("at"))
               .filter(ImagingStudy.patient_id.isnot(None), ImagingStudy.thumb_key != ""))
    if visibles is not None:
        ult_cap = ult_cap.filter(CaseCapture.patient_id.in_(visibles))
        ult_img = ult_img.filter(ImagingStudy.patient_id.in_(visibles))
    ult_cap = ult_cap.group_by(CaseCapture.patient_id).subquery()
    ult_img = ult_img.group_by(ImagingStudy.patient_id).subquery()
    studies_by_patient = dict(n_casos.group_by(Study.patient_id).all())
    ult_ses = ult_ses.group_by(PlanningSession.patient_id).subquery()
    ult_caso = ult_caso.group_by(Study.patient_id).subquery()

    # Con dos filas empatadas en la misma fecha gana la de id mayor (la última
    # creada): el orden por id ascendente deja que la última sobrescriba.
    last_session: dict[int, PlanningSession] = {}
    for s in (db.query(PlanningSession)
              .join(ult_ses, (PlanningSession.patient_id == ult_ses.c.pid)
                    & (PlanningSession.updated_at == ult_ses.c.at))
              .order_by(PlanningSession.id)):
        last_session[s.patient_id] = s
    last_case: dict[int, str] = {}
    for pid, dx in (db.query(Study.patient_id, Study.dx_principal)
                    .join(ult_caso, (Study.patient_id == ult_caso.c.pid)
                          & (Study.created_at == ult_caso.c.at))
                    .order_by(Study.id)):
        last_case[pid] = dx or ""
    last_capture: dict[int, int] = {}
    for pid, cid in (db.query(CaseCapture.patient_id, CaseCapture.id)
                     .join(ult_cap, (CaseCapture.patient_id == ult_cap.c.pid)
                           & (CaseCapture.created_at == ult_cap.c.at)
                           & (CaseCapture.media_type == "image/png"))
                     .order_by(CaseCapture.id)):
        last_capture[pid] = cid
    last_image: dict[int, int] = {}
    for pid, iid in (db.query(ImagingStudy.patient_id, ImagingStudy.id)
                     .join(ult_img, (ImagingStudy.patient_id == ult_img.c.pid)
                           & (ImagingStudy.created_at == ult_img.c.at)
                           & (ImagingStudy.thumb_key != ""))
                     .order_by(ImagingStudy.id)):
        last_image[pid] = iid

    return [
        _patient_to_summary(
            p,
            shared_with_count=counts.get(p.id, 0),
            is_shared_with_me=(p.id in mine_by_share
                               and (current_user is None or p.created_by != current_user.id)),
            study_count=studies_by_patient.get(p.id, 0),
            last_session=last_session.get(p.id),
            last_case_label=last_case.get(p.id, ""),
            last_capture_id=last_capture.get(p.id),
            last_imaging_study_id=last_image.get(p.id),
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    # Crear un caso es trabajo clínico: lo puede el compartido (regla T7), como
    # al adjuntar una sesión con «caso nuevo».
    require_patient(db, current_user, patient_id)
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


def _get_owned_study(db: Session, patient_id: int, study_id: int, user: User | None,
                     owner_only: bool = False) -> Study:
    """El caso del paciente, con la puerta que toque: editar lo puede quien ve
    al paciente; borrar (`owner_only`), solo su creador o un administrador."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    if owner_only:
        _require_owner_or_admin(patient, user)
    else:
        require_patient(db, user, patient_id)
    study = db.get(Study, study_id)
    if study is None or study.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Caso no encontrado.")
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
    study = _get_owned_study(db, patient_id, study_id, current_user, owner_only=True)
    paciente = audit_patient(db.get(Patient, patient_id))
    # Its planning sessions have a study_id FK without cascade — detach them so
    # the saved planning work survives under the patient.
    db.query(PlanningSession).filter(PlanningSession.study_id == study_id).update({"study_id": None})
    # Las confirmaciones de lesión apuntan al caso y a sus estudios de imagen
    # sin cascada: sin esto, borrar un caso confirmado daba un 500 (FOREIGN KEY).
    # Se van con él: una verdad de terreno sin su estudio no se puede reproducir.
    db.query(LesionConfirmation).filter(LesionConfirmation.case_id == study_id).delete()
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    _require_owner_or_admin(patient, current_user)

    paciente = audit_patient(patient)
    n_casos = len(patient.studies or [])
    # Planning sessions carry a patient_id FK without cascade — remove them first
    # (studies are removed by the ORM cascade on Patient.studies).
    n_sesiones = db.query(PlanningSession).filter(PlanningSession.patient_id == patient_id).delete()
    # Y sus confirmaciones de lesión (misma razón que en delete_study).
    db.query(LesionConfirmation).filter(LesionConfirmation.patient_id == patient_id).delete()
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
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
            size_bytes=size_of_row(db, s),
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    require_patient(db, current_user, patient_id)
    return _shares_out(db, patient_id)


@router.put(
    "/{patient_id}/shares",
    response_model=list[PatientShareOut],
    summary="Fijar con qué cuentas se comparte un paciente",
    description=(
        "Sustituye la lista entera por `user_ids`. Solo quien creó al paciente o un "
        "administrador; el creador, quien comparte y los administradores se ignoran "
        "si vienen en la lista. Una cuenta que no existe o no está activa es un 422; "
        "dos guardados a la vez, un 409. Cada cambio real deja un bloque "
        "`PATIENT_SHARED` en la auditoría (guardar la misma lista, no)."
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
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    require_share_right(db, current_user, patient_id)

    # El creador ya lo ve, y quien comparte y los administradores también: una
    # fila suya solo engordaría el contador de «compartido con».
    fuera = {patient.created_by, current_user.id if current_user else None}
    fuera |= {uid for (uid,) in db.query(User.id).filter(User.id.in_(req.user_ids), User.role == "admin")}
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
    if set(actuales) == set(wanted):
        # Guardar la misma lista no cambia quién lo ve: sin bloque de auditoría
        # que diga lo contrario.
        return _shares_out(db, patient_id)
    for uid, sh in actuales.items():
        if uid not in wanted:
            db.delete(sh)
    for uid in wanted:
        # Quien ya estaba conserva su fecha: «compartido el» no cambia por
        # volver a guardar la misma lista.
        if uid not in actuales:
            db.add(PatientShare(patient_id=patient_id, user_id=uid,
                                shared_by=current_user.id if current_user else None))
    try:
        db.commit()
    except IntegrityError:
        # Dos guardados a la vez sobre el mismo paciente: el otro llegó antes.
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="Otra persona acaba de cambiar con quién se comparte este paciente. "
                                   "Vuelve a abrir la lista e inténtalo de nuevo.")

    logger.info("Patient shares set — patient=%d users=%s by=%s", patient_id, wanted,
                current_user.username if current_user else "anonymous")
    audit_append(ACT_PATIENT_SHARED, {"patient_id": patient_id, "user_ids": wanted},
                 username=current_user.username if current_user else "", **audit_patient(patient))
    return _shares_out(db, patient_id)
