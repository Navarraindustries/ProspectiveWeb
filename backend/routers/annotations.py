"""Anotaciones persistentes de una sesión.

GET /api/annotations/{sid} — las que hay (lista vacía si todavía no hay ninguna).
PUT /api/annotations/{sid} — sustituye la lista entera.

Viven en `annotations.json` dentro de la carpeta de la sesión: así viajan con
«Guardar progreso» y «Reanudar» sin tocar nada más, y el informe las lee de
ahí. Borrar una anotación deja rastro en la auditoría; crearla o editarla no,
porque el fichero ya dice quién y cuándo la creó.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from models.annotations import AnnotationsIn, AnnotationsResult
from services.access import require_session, session_patient_id
from services.audit import ACT_ANNOTATIONS_DELETED, audit_append, audit_patient
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import Patient, User
from services.sessions import session_dir, session_exists

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/annotations", tags=["annotations"])

FILE = "annotations.json"


def _check(db: Session, user: User | None, session_id: str) -> None:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    require_session(db, user, session_id)


def _read(session_id: str) -> AnnotationsResult:
    f = session_dir(session_id) / FILE
    if not f.exists():
        return AnnotationsResult(annotations=[])
    try:
        return AnnotationsResult.model_validate_json(f.read_text(encoding="utf-8"))
    except (OSError, ValueError, ValidationError) as exc:
        # Un fichero ilegible no debe dejar el visor sin abrir: se avisa en el
        # log y se sigue con la lista vacía (el siguiente guardado lo reescribe).
        logger.warning("annotations.json ilegible en %s: %s", session_id, exc)
        return AnnotationsResult(annotations=[])


@router.get(
    "/{session_id}",
    response_model=AnnotationsResult,
    summary="Anotaciones guardadas en la sesión",
)
async def get_annotations(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> AnnotationsResult:
    _check(db, current_user, session_id)
    return _read(session_id)


@router.put(
    "/{session_id}",
    response_model=AnnotationsResult,
    summary="Sustituir las anotaciones de la sesión",
    description=(
        "Guarda la lista entera. `created_by` y `created_at` los pone el servidor "
        "cuando llegan vacíos. Las anotaciones que desaparecen respecto a la lista "
        "anterior quedan registradas en la auditoría (ANNOTATIONS_DELETED)."
    ),
)
async def put_annotations(
    session_id: str,
    body: AnnotationsIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> AnnotationsResult:
    _check(db, current_user, session_id)
    username = getattr(current_user, "username", "") or ""
    ahora = datetime.now(UTC).isoformat()
    lista = [a.model_copy(update={"created_by": a.created_by or username,
                                  "created_at": a.created_at or ahora})
             for a in body.annotations]
    out = AnnotationsResult(annotations=lista)

    antes = [a.id for a in _read(session_id).annotations]
    nuevos = {a.id for a in lista}
    borradas = [i for i in antes if i not in nuevos]

    # Escritura atómica: un corte a mitad no puede dejar un JSON a medias.
    f = session_dir(session_id) / FILE
    tmp = f.with_suffix(".json.tmp")
    tmp.write_text(out.model_dump_json(), encoding="utf-8")
    os.replace(tmp, f)

    if borradas:
        pid = session_patient_id(db, session_id)
        paciente = db.get(Patient, pid) if pid is not None else None
        audit_append(ACT_ANNOTATIONS_DELETED,
                     {"session_id": session_id, "deleted": borradas, "remaining": len(lista)},
                     username=username, **audit_patient(paciente))
    return out
