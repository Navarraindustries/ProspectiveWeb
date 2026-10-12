"""Confirmar la lesión: el profesional dice cuál es, y eso mide al detector.

El detector se ha ajustado con DOS casos con diagnóstico (case 3 e IM_0055) y
el orden de su lista es inestable (17 vértices de 12 776 mueven la lesión del
puesto 1 al 4). Sin más casos con verdad no se puede saber si un cambio lo
mejora o lo empeora. Cada confirmación es uno más, recogido donde ya se está
mirando el caso, en vez de en una sesión de anotación aparte que nadie hace.

Tres respuestas posibles:
- `candidate`: este candidato de la lista es la lesión;
- `marked`: ninguno lo es, y aquí está (un punto sobre la malla);
- `no_lesion`: este estudio no tiene aneurisma.

Se guarda con la lista de candidatos tal como salió y los parámetros de la
malla, para poder volver a pasar un detector nuevo sobre el mismo estudio
archivado y comparar. Nada de texto libre.
"""
from __future__ import annotations

import json
import logging
import math
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from models.detection import Position3D
from models.ground_truth import LesionConfirmIn, LesionConfirmOut, LesionSummary
from services import mesh_backup
from services.audit import (ACT_LESION_CONFIRMED, ACT_LESION_RETRACTED,
                            audit_append, audit_patient)
from services.access import require_patient
from services.auth_service import get_current_user, require_admin
from services.database import get_db
from services.db_models import ImagingStudy, LesionConfirmation, Patient, User
from services.sessions import read_state, session_exists, session_lineage
from routers.detect import MANUAL_CHANNEL, add_manual_candidate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ground-truth", tags=["ground-truth"])

#: Un punto marcado a mano «es» un candidato si cae a menos de esto de su
#: centro: el diámetro del candidato, y nunca menos de 5 mm. El centro es el de
#: la región sobre la superficie y el clic cae en algún punto del domo, así que
#: un radio más estricto contaría como fallos candidatos que sí eran la lesión.
MIN_MATCH_MM = 5.0


def _int(session_id: str, key: str) -> int:
    try:
        return int(read_state(session_id, key, "0") or 0)
    except ValueError:
        return 0


def _candidates(session_id: str) -> list[dict]:
    """Toda la lista de la sesión, en su orden: aceptados, descartados y marcados a mano.

    Antes solo los aceptados: un descartado elegido en el panel no se podía
    confirmar (F1-145), y un punto marcado sobre él contaba como un fallo
    lejos de todo. `kind` dice de qué parte de la lista viene cada uno;
    `rank` es el número de su id (`cand-00N`), que en los aceptados es su
    puesto.
    """
    n_acc = _int(session_id, "detect.n_candidates")
    n_rej = _int(session_id, "detect.n_rejected")
    n_man = _int(session_id, "detect.n_manual")
    out = []
    for rank in range(1, n_acc + n_rej + n_man + 1):
        p = f"detect.cand_{rank:03d}"
        try:
            pos = [float(read_state(session_id, f"{p}.centroid_{k}", "nan")) for k in "xyz"]
            diam = float(read_state(session_id, f"{p}.diameter_mm", "0") or 0)
        except ValueError:
            continue
        if any(math.isnan(v) for v in pos):
            continue
        kind = ("accepted" if rank <= n_acc else "rejected" if rank <= n_acc + n_rej
                else "manual")
        if read_state(session_id, f"{p}.patch_kind", "") == MANUAL_CHANNEL:
            kind = "manual"
        out.append({"rank": rank, "id": f"cand-{rank:03d}", "kind": kind,
                    "position": pos, "diameter_mm": diam,
                    "channels": read_state(session_id, f"{p}.channels", "")})
    return out


def _puesto(c: dict) -> Optional[int]:
    """El puesto que cuenta para la estadística del detector.

    Solo los aceptados lo tienen: un descartado o un marcado a mano no estaban
    en la lista corta que el detector propuso, así que para medirlo son un
    fallo (`missed`), aunque el profesional los confirme.
    """
    return c["rank"] if c["kind"] == "accepted" else None


def match_rank(point: tuple[float, float, float], candidates: list[dict]) -> Optional[dict]:
    """El candidato más cercano al punto, si cae dentro de su radio de acierto."""
    best, best_d = None, math.inf
    for c in candidates:
        d = math.dist(point, c["position"])
        if d <= max(MIN_MATCH_MM, c["diameter_mm"]) and d < best_d:
            best, best_d = c, d
    return best


def _seg_params(session_id: str) -> dict:
    """Con qué se hizo la malla: lo necesario para rehacerla desde el archivo."""
    try:
        params = json.loads(read_state(session_id, "seg.params", "{}") or "{}")
    except ValueError:
        params = {}
    for k in ("threshold_lower", "threshold_upper", "method", "downsample_factor",
              "n_vertices", "strategy"):
        params.setdefault(k, read_state(session_id, f"seg.{k}", ""))
    params["preprocess_ops"] = read_state(session_id, "preprocess.ops", "")
    # Recortes y borrados después de segmentar: la detección corrió sobre la
    # malla editada, que no sale de rehacer la segmentación sin más.
    params["mesh_edits"] = mesh_backup.depth(session_id)
    return params


def _confirmed_id(row: LesionConfirmation) -> Optional[str]:
    """Qué candidato de la lista es la lesión confirmada.

    Va marcado en la propia lista guardada (`candidates_json`, `confirmed`) y
    no en una columna: es un dato de esa lista, y así el export lo lleva. Las
    filas de antes no lo tienen y se reconstruyen con el puesto, que en los
    aceptados es el número del id.
    """
    try:
        lista = json.loads(row.candidates_json or "[]")
    except ValueError:
        lista = []
    for c in lista:
        if isinstance(c, dict) and c.get("confirmed") and c.get("id"):
            return str(c["id"])
    return f"cand-{row.candidate_rank:03d}" if row.candidate_rank else None


def _out(row: LesionConfirmation, db: Session) -> LesionConfirmOut:
    pos = (Position3D(x=row.x_mm, y=row.y_mm, z=row.z_mm)
           if row.x_mm is not None else None)
    autor = db.get(User, row.created_by) if row.created_by else None
    return LesionConfirmOut(
        id=row.id, session_id=row.session_id, imaging_study_id=row.imaging_study_id,
        source=row.source, position=pos, candidate_rank=row.candidate_rank,
        candidate_id=_confirmed_id(row),
        n_candidates=row.n_candidates, channels=row.channels, modality=row.modality,
        reproducible=bool(row.imaging_study_id), created_at=row.created_at,
        created_by=autor.username if autor else "",
    )


def _active(db: Session, session_id: str, imaging_study_id: Optional[int]):
    q = db.query(LesionConfirmation).filter(LesionConfirmation.retracted.is_(False))
    if imaging_study_id:
        q = q.filter(LesionConfirmation.imaging_study_id == imaging_study_id)
    else:
        # Por el linaje y no por el id exacto: «Reanudar» da a la sesión viva un
        # id nuevo, y la lesión confirmada antes de guardar dejaba de verse al
        # volver (F1-246). Confirmar en la reanudada retira la del origen: una
        # sola vigente por sesión, se mire desde donde se mire.
        q = q.filter(LesionConfirmation.session_id.in_(sorted(session_lineage(session_id))))
    return q.order_by(LesionConfirmation.id.desc())


def _auditar(db: Session, accion: str, row: LesionConfirmation, user: User | None) -> None:
    paciente = audit_patient(db.get(Patient, row.patient_id)) if row.patient_id else {}
    audit_append(accion, {
        "confirmation": row.id, "imaging_study": row.imaging_study_id,
        "session_id": row.session_id, "source": row.source,
        "candidate_rank": row.candidate_rank, "n_candidates": row.n_candidates,
    }, username=user.username if user else "", **paciente)


@router.post(
    "",
    response_model=LesionConfirmOut,
    status_code=201,
    summary="Confirmar dónde está la lesión (o que no la hay)",
    description=(
        "Sustituye a la confirmación anterior del mismo estudio (o sesión), que "
        "queda retirada en el historial. Devuelve en qué puesto de la lista "
        "estaba la lesión, o null si el detector no la encontró."
    ),
)
async def confirm_lesion(
    req: LesionConfirmIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> LesionConfirmOut:
    if not session_exists(req.session_id):
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")

    img = None
    if req.imaging_study_id is not None:
        img = db.get(ImagingStudy, req.imaging_study_id)
        if img is None:
            raise HTTPException(status_code=404,
                                detail=f"No existe el estudio de imagen {req.imaging_study_id}.")
        require_patient(db, current_user, img.patient_id)

    cands = _candidates(req.session_id)
    point = None
    rank = None
    channels = ""
    chosen: Optional[dict] = None
    if req.source == "candidate":
        chosen = next((c for c in cands if c["id"] == req.candidate_id), None)
        if chosen is None:
            raise HTTPException(status_code=422,
                                detail="Ese candidato no está en la última detección.")
        point = tuple(chosen["position"])
    elif req.source == "marked":
        if req.position is None:
            raise HTTPException(status_code=422, detail="Falta el punto marcado.")
        point = (req.position.x, req.position.y, req.position.z)
        chosen = match_rank(point, cands)
        if chosen is None:
            # F1-146: el detector no la encontró. El punto pasa a la lista como
            # candidato «marcado a mano», elegible en el panel; si no, en un
            # fallo del detector no había nada que llevar a Morfometría.
            new_id = add_manual_candidate(req.session_id, point)
            if new_id is not None:
                chosen = next((c for c in _candidates(req.session_id) if c["id"] == new_id), None)
                if chosen is not None:
                    cands = cands + [chosen]
    if chosen is not None:
        rank, channels = _puesto(chosen), chosen["channels"]
    # La lista que se guarda con la confirmación marca cuál es la lesión.
    guardada = [dict(c, confirmed=True) if chosen is not None and c["id"] == chosen["id"] else c
                for c in cands]

    for old in _active(db, req.session_id, req.imaging_study_id).all():
        old.retracted = True

    row = LesionConfirmation(
        imaging_study_id=img.id if img else None,
        case_id=img.case_id if img else None,
        patient_id=img.patient_id if img else None,
        session_id=req.session_id[:64],
        source=req.source,
        x_mm=point[0] if point else None,
        y_mm=point[1] if point else None,
        z_mm=point[2] if point else None,
        candidate_rank=rank,
        # Los N de «no estaba entre los N candidatos»: la lista corta del
        # detector, sin descartados ni marcados a mano.
        n_candidates=sum(1 for c in cands if c["kind"] == "accepted"),
        channels=channels[:64],
        modality=(read_state(req.session_id, "dicom.modality", "") or "")[:16],
        seg_params_json=json.dumps(_seg_params(req.session_id), default=str),
        candidates_json=json.dumps(guardada),
        created_by=current_user.id if current_user else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Lesión confirmada (%s) en sesión %s: puesto %s de %d",
                row.source, row.session_id, row.candidate_rank, row.n_candidates)
    _auditar(db, ACT_LESION_CONFIRMED, row, current_user)
    return _out(row, db)


@router.get(
    "/current",
    response_model=Optional[LesionConfirmOut],
    summary="La confirmación vigente de un estudio (o de una sesión sin estudio)",
)
async def current_confirmation(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
    session_id: str = Query(""),
    imaging_study_id: Optional[int] = Query(None),
) -> Optional[LesionConfirmOut]:
    if not session_id and not imaging_study_id:
        raise HTTPException(status_code=422, detail="Hace falta la sesión o el estudio.")
    if imaging_study_id:
        img = db.get(ImagingStudy, imaging_study_id)
        if img is not None:
            require_patient(db, current_user, img.patient_id)
    row = _active(db, session_id, imaging_study_id).first()
    return _out(row, db) if row else None


@router.delete(
    "/{confirmation_id}",
    status_code=204,
    summary="Retirar una confirmación (queda en el historial como retirada)",
)
async def retract_confirmation(
    confirmation_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> Response:
    row = db.get(LesionConfirmation, confirmation_id)
    if row is None or row.retracted:
        raise HTTPException(status_code=404, detail="No hay esa confirmación vigente.")
    require_patient(db, current_user, row.patient_id)
    row.retracted = True
    db.commit()
    _auditar(db, ACT_LESION_RETRACTED, row, current_user)
    return Response(status_code=204)


@router.get(
    "/summary",
    response_model=LesionSummary,
    summary="Cómo le va al detector frente a lo confirmado",
    description=(
        "Sobre las confirmaciones vigentes, una por estudio (o por sesión si "
        "no hay estudio archivado): en cuántas la "
        "lesión salió primera, entre las 3 y las 5 primeras, o no salió. Es lo "
        "que el panel de detección enseña en vez de una cifra fija."
    ),
)
async def summary(db: Annotated[Session, Depends(get_db)]) -> LesionSummary:
    vigentes = (db.query(LesionConfirmation)
                .filter(LesionConfirmation.retracted.is_(False))
                .order_by(LesionConfirmation.id).all())
    # F1-149: «Con 3 lesiones confirmadas» contaba filas. Confirmar por la API
    # retira la anterior del mismo estudio (`_active`), pero el resumen es una
    # cifra sobre ESTUDIOS y no puede fiarse de eso: se agrupa por estudio
    # archivado, o por sesión si no lo hay, y vale la última de cada uno.
    ultima: dict[tuple, LesionConfirmation] = {}
    for r in vigentes:
        clave = (("estudio", r.imaging_study_id) if r.imaging_study_id
                 else ("sesion", r.session_id))
        ultima[clave] = r
    rows = list(ultima.values())
    con = [r for r in rows if r.source != "no_lesion"]
    by_mod: dict[str, int] = {}
    for r in con:
        by_mod[r.modality or "?"] = by_mod.get(r.modality or "?", 0) + 1
    ranked = [r.candidate_rank for r in con]
    return LesionSummary(
        confirmed=len(con),
        no_lesion=len(rows) - len(con),
        first=sum(1 for k in ranked if k == 1),
        top3=sum(1 for k in ranked if k is not None and k <= 3),
        top5=sum(1 for k in ranked if k is not None and k <= 5),
        missed=sum(1 for k in ranked if k is None),
        by_modality=by_mod,
        reproducible=sum(1 for r in con if r.imaging_study_id),
    )


@router.get(
    "/export",
    summary="Todas las confirmaciones vigentes, para volver a evaluar el detector",
    description=(
        "Solo administradores. Sin nombres ni nada que identifique al paciente: "
        "ids internos, la posición, los parámetros de la malla y la lista de "
        "candidatos que vio el profesional."
    ),
)
async def export(
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[User, Depends(require_admin)],
) -> list[dict]:
    rows = (db.query(LesionConfirmation)
            .filter(LesionConfirmation.retracted.is_(False))
            .order_by(LesionConfirmation.id).all())
    return [{
        "id": r.id, "imaging_study_id": r.imaging_study_id, "source": r.source,
        "position_mm": [r.x_mm, r.y_mm, r.z_mm] if r.x_mm is not None else None,
        "candidate_rank": r.candidate_rank, "n_candidates": r.n_candidates,
        "channels": r.channels, "modality": r.modality,
        "seg_params": json.loads(r.seg_params_json or "{}"),
        "candidates": json.loads(r.candidates_json or "[]"),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]
