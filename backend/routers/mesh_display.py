"""La copia suavizada de una malla para el visor (ver services/mesh_smooth.py)."""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from services.access import require_session
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import User
from services.mesh_smooth import SUFIJO, copia_suave
from services.sessions import mesh_url, session_exists, session_subdir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["mesh-display"])

_NOMBRE = re.compile(r"^[A-Za-z0-9_.-]+\.vtp$")


class SmoothMeshResult(BaseModel):
    url: str = Field(..., description="URL of the smoothed copy (.vtp), for display only")


@router.post(
    "/mesh/{session_id}/smooth",
    response_model=SmoothMeshResult,
    summary="A smoothed copy of a session mesh, for display only",
    description=(
        "Windowed-sinc smoothing (40 iterations, pass band 0.02) plus per-vertex normals, "
        "cached next to the mesh as `<name>.suave.vtp` and rebuilt when the mesh is newer. "
        "Measurements keep reading the original mesh."
    ),
)
async def smooth_mesh(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
    name: str = Query(..., description="File name inside the session's meshes folder"),
) -> SmoothMeshResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    require_session(db, current_user, session_id)
    if not _NOMBRE.fullmatch(name) or name.endswith(SUFIJO) or ".." in name:
        raise HTTPException(status_code=422, detail="Nombre de malla no válido.")
    src = session_subdir(session_id, "meshes") / name
    if not src.exists():
        raise HTTPException(status_code=404, detail="No existe esa malla en la sesión.")
    try:
        dst = await asyncio.to_thread(copia_suave, src)
    except Exception as exc:  # noqa: BLE001 — sin copia el visor enseña la original
        logger.warning("No se pudo suavizar %s de %s: %s", name, session_id, exc)
        raise HTTPException(status_code=500, detail="No se pudo suavizar la malla.")
    return SmoothMeshResult(url=f"{mesh_url(session_id, dst.name)}?v={int(dst.stat().st_mtime * 1000)}")
