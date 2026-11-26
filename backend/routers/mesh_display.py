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
from services.errores import mensaje_error
from services.mapa_calibre import SUFIJO as SUFIJO_CALIBRE
from services.mapa_calibre import copia_con_calibre
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


class CalibreMeshResult(BaseModel):
    url: str = Field(..., description="URL of the smoothed copy carrying the `calibre_mm` point field (.vtp)")
    campo: str = Field("calibre_mm", description="Name of the point field: local diameter in mm")
    p5_mm: float = Field(..., description="5th percentile of the local diameter over the vertices")
    mediana_mm: float = Field(..., description="Median local diameter")
    p95_mm: float = Field(..., description="95th percentile of the local diameter")
    maximo_mm: float = Field(..., description="Largest local diameter")


@router.post(
    "/mesh/{session_id}/calibre",
    response_model=CalibreMeshResult,
    summary="Local vessel diameter at every vertex, for the calibre colour map",
    description=(
        "Inward ray from every vertex of the smoothed copy to the opposite wall of the mesh, "
        "with chords running along the vessel corrected and a two-pass neighbour median. "
        "Cached next to the mesh as `<name>.calibre.vtp` (the smoothed copy plus the "
        "`calibre_mm` point field) and rebuilt when the mesh is newer. Display only."
    ),
)
async def calibre_mesh(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
    name: str = Query(..., description="File name inside the session's meshes folder"),
) -> CalibreMeshResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    require_session(db, current_user, session_id)
    if (not _NOMBRE.fullmatch(name) or name.endswith(SUFIJO) or name.endswith(SUFIJO_CALIBRE)
            or ".." in name):
        raise HTTPException(status_code=422, detail="Nombre de malla no válido.")
    src = session_subdir(session_id, "meshes") / name
    if not src.exists():
        raise HTTPException(status_code=404, detail="No existe esa malla en la sesión.")
    try:
        dst, resumen = await asyncio.to_thread(copia_con_calibre, src)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=mensaje_error("No se pudo calcular el mapa de calibre", exc))
    return CalibreMeshResult(url=f"{mesh_url(session_id, dst.name)}?v={int(dst.stat().st_mtime * 1000)}", **resumen)
