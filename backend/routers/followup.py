"""Superposición de un estudio de seguimiento: dónde ha cambiado el aneurisma.

GET  /api/followup/{sid}/studies — los otros estudios del mismo paciente con
     una sesión guardada que se pueda superponer.
POST /api/followup/{sid}        — superpone uno al actual y devuelve el mapa de
     cambio (vasos cerca de la lesión, con el cambio en mm por punto), el saco
     anterior ya colocado y las cifras. Ver services/followup.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Annotated, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from services.access import require_patient, require_session
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import ImagingStudy, LesionConfirmation, PlanningSession, User
from services.sessions import (_read_state_map, has_saved_session, mesh_url, saved_session_dir,
                               session_dir, session_exists, session_subdir)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/followup", tags=["followup"])


class FollowupStudy(BaseModel):
    imaging_study_id: int
    session_id: str
    acquired_at: str
    modality: str
    description: str
    has_sac: bool
    has_lesion: bool = Field(..., description="Hay dónde centrar la superposición")


class FollowupRequest(BaseModel):
    previous_session_id: str


class FollowupResultOut(BaseModel):
    map_url: str
    ghost_url: Optional[str]
    noise_mm: float = Field(..., description="Por debajo de esto un cambio no se distingue")
    residual_median_mm: float
    max_growth_mm: float
    max_shrink_mm: float
    grew_area_pct: float
    volume_prev_mm3: Optional[float]
    volume_curr_mm3: Optional[float]
    rotation_deg: float
    lesion_source_prev: str
    lesion_source_curr: str
    warnings: list[str]


# ── Lo que hace falta de cada estudio, esté vivo o guardado ───────────────── #

def _study_dir(session_id: str) -> Path:
    """La sesión viva si existe; si no, la guardada."""
    if session_exists(session_id):
        return session_dir(session_id)
    if has_saved_session(session_id):
        return saved_session_dir(session_id)
    raise HTTPException(status_code=404, detail=f"No existe la sesión {session_id}.")


def _state(d: Path) -> dict[str, str]:
    return _read_state_map(d / "state.txt")


def _lesion(db: Session, session_id: str, d: Path, st: dict) -> tuple[np.ndarray | None, str]:
    """Centro de la lesión, de lo más fiable a lo menos."""
    from services.followup import _pts
    from services.segmentation import read_vtp
    ps = db.query(PlanningSession).filter_by(session_id=session_id).first()
    q = db.query(LesionConfirmation).filter(LesionConfirmation.retracted.is_(False),
                                            LesionConfirmation.source != "no_lesion")
    if ps is not None and ps.imaging_study_id:
        q = q.filter(LesionConfirmation.imaging_study_id == ps.imaging_study_id)
    else:
        q = q.filter(LesionConfirmation.session_id == session_id)
    c = q.order_by(LesionConfirmation.id.desc()).first()
    if c is not None and c.x_mm is not None:
        return np.array([c.x_mm, c.y_mm, c.z_mm]), "lesión confirmada"
    sac = d / "meshes" / "aneurysm_sac.vtp"
    if sac.exists():
        p = _pts(read_vtp(sac))
        if len(p):
            return p.mean(0), "saco aislado"

    def _vec(prefix):
        try:
            v = [float(st[f"{prefix}_{k}"]) for k in "xyz"]
            return np.array(v) if all(np.isfinite(v)) else None
        except (KeyError, ValueError):
            return None
    v = _vec("morpho.neck_origin")
    if v is not None:
        return v, "cuello medido"
    v = _vec("detect.cand_001.centroid")
    if v is not None:
        return v, "primer candidato de la detección"
    return None, ""


def _geometry(d: Path, st: dict) -> np.ndarray:
    from services.followup import mesh_to_patient
    try:
        sz = float(st.get("dicom.spacing_z", "") or 0)
    except ValueError:
        sz = 0.0
    if sz <= 0:
        raise HTTPException(status_code=422, detail="Falta la geometría del volumen (espaciado entre cortes).")
    return mesh_to_patient(d / "dicom", st.get("dicom.series_id", ""), sz)


# ── Endpoints ──────────────────────────────────────────────────────────────── #

@router.get(
    "/{session_id}/studies",
    response_model=list[FollowupStudy],
    summary="Estudios del mismo paciente que se pueden superponer al actual",
)
async def followup_studies(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> list[FollowupStudy]:
    ps = db.query(PlanningSession).filter_by(session_id=session_id).first()
    if ps is None or not ps.patient_id:
        return []      # sesión sin paciente: no hay con qué compararla
    require_patient(db, current_user, ps.patient_id)
    out: list[FollowupStudy] = []
    imgs = (db.query(ImagingStudy).filter(ImagingStudy.patient_id == ps.patient_id)
            .order_by(ImagingStudy.acquired_at.desc(), ImagingStudy.id.desc()).all())
    for img in imgs:
        if img.id == ps.imaging_study_id:
            continue
        sessions = sorted(img.sessions or [], key=lambda s: s.updated_at or s.created_at, reverse=True)
        sess = next((s for s in sessions if has_saved_session(s.session_id)
                     and (saved_session_dir(s.session_id) / "meshes" / "vessel_tree.vtp").exists()), None)
        if sess is None:
            continue
        d = saved_session_dir(sess.session_id)
        lesion, _src = _lesion(db, sess.session_id, d, _state(d))
        out.append(FollowupStudy(
            imaging_study_id=img.id, session_id=sess.session_id,
            acquired_at=img.acquired_at or "", modality=img.modality or "",
            description=img.description or "", has_sac=(d / "meshes" / "aneurysm_sac.vtp").exists(),
            has_lesion=lesion is not None,
        ))
    return out


@router.post(
    "/{session_id}",
    response_model=FollowupResultOut,
    summary="Superponer un estudio anterior y medir dónde ha cambiado",
    description=(
        "Lleva las dos mallas al espacio del paciente con su geometría DICOM, "
        "superpone los centros de la lesión y afina con un ajuste rígido de los "
        "vasos de alrededor (la lesión se excluye del ajuste). Devuelve el mapa "
        "de cambio de los vasos actuales cerca de la lesión (mm, + hacia fuera), "
        "el saco anterior ya colocado y el ruido de la comparación."
    ),
)
async def followup(
    session_id: str,
    req: FollowupRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> FollowupResultOut:
    from services.followup import compare
    from services.segmentation import read_vtp

    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    if req.previous_session_id == session_id:
        raise HTTPException(status_code=422, detail="Elige otro estudio, no el mismo.")
    # Los dos estudios tienen que ser de pacientes que este usuario puede ver.
    require_session(db, current_user, session_id)
    require_session(db, current_user, req.previous_session_id)
    dc, dp = session_dir(session_id), _study_dir(req.previous_session_id)
    sc, sp = _state(dc), _state(dp)
    for d, nombre in ((dc, "actual"), (dp, "anterior")):
        if not (d / "meshes" / "vessel_tree.vtp").exists():
            raise HTTPException(status_code=422, detail=f"El estudio {nombre} no tiene malla segmentada.")
    lc, src_c = _lesion(db, session_id, dc, sc)
    lp, src_p = _lesion(db, req.previous_session_id, dp, sp)
    if lc is None or lp is None:
        raise HTTPException(status_code=422, detail=(
            "Hace falta saber dónde está la lesión en los dos estudios: confírmala, "
            "márca el cuello o ejecuta la detección."))

    Ac, Ap = _geometry(dc, sc), _geometry(dp, sp)

    def _sac(d):
        f = d / "meshes" / "aneurysm_sac.vtp"
        return read_vtp(f) if f.exists() else None

    def _run():
        def _f(st, k):
            try:
                return float(st.get(k, "") or 0)
            except ValueError:
                return 0.0
        voxel = max(_f(sc, "dicom.spacing_x"), _f(sp, "dicom.spacing_x"), _f(sc, "dicom.spacing_z"), _f(sp, "dicom.spacing_z"))
        return compare(read_vtp(dc / "meshes" / "vessel_tree.vtp"), read_vtp(dp / "meshes" / "vessel_tree.vtp"),
                       Ac, Ap, lc, lp, session_subdir(session_id, "meshes"),
                       curr_sac=_sac(dc), prev_sac=_sac(dp), voxel_mm=voxel)
    try:
        r = await asyncio.to_thread(_run)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    warnings = list(r.warnings)
    mc, mp = (sc.get("dicom.modality", "") or "").upper(), (sp.get("dicom.modality", "") or "").upper()
    if mc and mp and mc != mp:
        warnings.append(
            f"Modalidades distintas ({mp} antes, {mc} ahora): cada una dibuja la pared a su "
            f"manera, y eso aparece como un cambio uniforme que no es crecimiento.")
    v = int(time.time() * 1000)
    return FollowupResultOut(
        map_url=f"{mesh_url(session_id, r.map_path.name)}?v={v}",
        ghost_url=f"{mesh_url(session_id, r.ghost_path.name)}?v={v}" if r.ghost_path else None,
        noise_mm=r.noise_mm, residual_median_mm=r.residual_median_mm,
        max_growth_mm=r.max_growth_mm, max_shrink_mm=r.max_shrink_mm, grew_area_pct=r.grew_area_pct,
        volume_prev_mm3=r.volume_prev_mm3, volume_curr_mm3=r.volume_curr_mm3,
        rotation_deg=r.rotation_deg, lesion_source_prev=src_p, lesion_source_curr=src_c,
        warnings=warnings,
    )
