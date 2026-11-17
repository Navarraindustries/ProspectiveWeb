"""IVUS virtual de VINI 3D (ver services/ivus_virtual.py)."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.centerline import IvusResult
from services.access import require_session
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import User
from services.sessions import mesh_url, session_exists, session_subdir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["centerline"])

PILA = "ivus_pullback.u8"
DATOS = "ivus_pullback.json"


def _clave(rutas) -> str:
    """Las fechas de lo que entra en el cálculo: si cambia algo, se rehace."""
    return "|".join(f"{p.name}:{int(p.stat().st_mtime * 1000)}" if p and p.exists() else "-" for p in rutas)


def _r(x, n=3):
    return None if x is None else round(float(x), n)


def _calcular(session_id: str, meshes_dir, lesion_path) -> dict:
    from services.ivus_virtual import calcular_pullback
    from services.mpr import _get_volume, ensure_volume_cached
    from services.segmentation import read_vtp

    with np.load(meshes_dir / "centerline_points.npz") as d:
        pts = d["points"].astype(float)
        radios = d["radii"].astype(float)
    arco = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    meta = ensure_volume_cached(session_id)
    pb = calcular_pullback(pts, radios, arco, read_vtp(meshes_dir / "vessel_tree.vtp"), _get_volume(session_id),
                           meta["spacing"], read_vtp(lesion_path) if lesion_path else None)
    (meshes_dir / PILA).write_bytes(np.ascontiguousarray(pb.pila).tobytes())
    return serializar(pb)


def serializar(pb) -> dict:
    """El pullback como lo da la API, sin la URL de la pila."""
    from services.ivus_virtual import TAMANO_PX

    secciones = [{
        "arc_mm": round(s.arc_mm, 2), "valid": s.valida, "in_lesion": s.en_lesion, "in_branch": s.en_rama,
        "area_mm2": _r(s.area_mm2), "perimeter_mm": _r(s.perimetro_mm), "d_min_mm": _r(s.d_min_mm),
        "d_max_mm": _r(s.d_max_mm), "d_eq_mm": _r(s.d_eq_mm), "eccentricity": _r(s.excentricidad),
        "angle_min_deg": _r(s.angulo_min_deg, 1), "angle_max_deg": _r(s.angulo_max_deg, 1),
        "centroid": [round(c, 3) for c in s.centroide] if s.centroide else None,
        "contour": [[a, b] for a, b in s.contorno],
    } for s in pb.secciones]
    r = pb.resumen
    resumen = None if r is None else {
        "mla_mm2": _r(r.mla_mm2), "mla_index": r.mla_indice, "mla_arc_mm": _r(r.mla_arc_mm, 2),
        "d_min_mm": _r(r.d_min_mm), "d_max_mm": _r(r.d_max_mm), "eccentricity": _r(r.excentricidad),
        "ref_prox_mm2": _r(r.ref_prox_mm2), "ref_prox_arc_mm": _r(r.ref_prox_arc_mm, 2),
        "ref_dist_mm2": _r(r.ref_dist_mm2), "ref_dist_arc_mm": _r(r.ref_dist_arc_mm, 2),
        "ref_mm2": _r(r.ref_mm2), "area_stenosis_pct": _r(r.estenosis_area_pct, 1),
    }
    return {
        "n_sections": len(secciones), "size_px": TAMANO_PX, "fov_mm": round(pb.fov_mm, 3),
        "window": [round(v, 2) for v in pb.ventana], "sections": secciones, "summary": resumen, "note": pb.nota,
    }


@router.post(
    "/centerline/{session_id}/ivus",
    response_model=IvusResult,
    summary="Virtual IVUS pullback along the centreline (VINI 3D)",
    description=(
        "One section perpendicular to the centreline at each of its points: the volume "
        "resampled in that plane (raw uint8 stack at `stack_url`), the lumen contour cut "
        "from the vessel mesh (the loop around the centreline) and its IVUS measures "
        "(area, perimeter, min/max diameter through the centroid, eccentricity), plus the "
        "minimal lumen area and the proximal/distal references. Cached until the "
        "centreline, the vessel mesh, the lesion or the volume change."
    ),
)
async def ivus_virtual(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> IvusResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    require_session(db, user, session_id)
    meshes_dir = session_subdir(session_id, "meshes")
    puntos, vaso = meshes_dir / "centerline_points.npz", meshes_dir / "vessel_tree.vtp"
    if not puntos.exists():
        raise HTTPException(status_code=409, detail="Extrae la línea central primero.")
    if not vaso.exists():
        raise HTTPException(status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero.")
    from routers.centerline import _lesion_mesh
    lesion = _lesion_mesh(session_id, meshes_dir)
    entradas = [puntos, vaso, lesion, meshes_dir / "_volume.npy"]

    datos_path, pila_path = meshes_dir / DATOS, meshes_dir / PILA
    datos = None
    if datos_path.exists() and pila_path.exists():
        try:
            guardado = json.loads(datos_path.read_text(encoding="utf-8"))
            if guardado.get("clave") == _clave(entradas):
                datos = guardado["datos"]
        except (OSError, ValueError, KeyError):
            datos = None
    if datos is None:
        try:
            datos = await asyncio.to_thread(_calcular, session_id, meshes_dir, lesion)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("IVUS virtual falló en %s", session_id)
            raise HTTPException(status_code=500, detail=f"No se pudo calcular el IVUS virtual: {exc}")
        # La clave se toma después: el cálculo puede haber escrito el volumen en caché.
        datos_path.write_text(json.dumps({"clave": _clave(entradas), "datos": datos}), encoding="utf-8")
    url = f"{mesh_url(session_id, PILA)}?v={int(pila_path.stat().st_mtime * 1000)}"
    return IvusResult(stack_url=url, **datos)
