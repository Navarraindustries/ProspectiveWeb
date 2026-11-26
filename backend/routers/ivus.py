"""IVUS virtual de VINI 3D (ver services/ivus_virtual.py)."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.centerline import IvusCompareRequest, IvusCompareResult, IvusResult
from services.access import require_session
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import User
from services.sessions import mesh_url, session_exists, session_subdir
from services.errores import mensaje_error

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["centerline"])

PILA = "ivus_pullback.u8"
DATOS = "ivus_pullback.json"
STENT = "cl_stent.vtp"
# Sube cuando cambian las medidas que se guardan: la caché vieja no las trae.
VERSION_DATOS = 2           # 2: Ø por perímetro, Ø inscrito y circularidad (P4)


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
                           meta["spacing"], read_vtp(lesion_path) if lesion_path else None,
                           read_vtp(meshes_dir / STENT) if (meshes_dir / STENT).exists() else None)
    (meshes_dir / PILA).write_bytes(np.ascontiguousarray(pb.pila).tobytes())
    return serializar(pb)


def resumen_out(r) -> dict | None:
    return None if r is None else {
        "mla_mm2": _r(r.mla_mm2), "mla_index": r.mla_indice, "mla_arc_mm": _r(r.mla_arc_mm, 2),
        "d_min_mm": _r(r.d_min_mm), "d_max_mm": _r(r.d_max_mm), "eccentricity": _r(r.excentricidad),
        "ref_prox_mm2": _r(r.ref_prox_mm2), "ref_prox_arc_mm": _r(r.ref_prox_arc_mm, 2),
        "ref_dist_mm2": _r(r.ref_dist_mm2), "ref_dist_arc_mm": _r(r.ref_dist_arc_mm, 2),
        "ref_mm2": _r(r.ref_mm2), "area_stenosis_pct": _r(r.estenosis_area_pct, 1),
    }


def serializar(pb) -> dict:
    """El pullback como lo da la API, sin la URL de la pila."""
    from services.ivus_virtual import TAMANO_PX

    secciones = [{
        "arc_mm": round(s.arc_mm, 2), "valid": s.valida, "in_lesion": s.en_lesion, "in_branch": s.en_rama,
        "area_mm2": _r(s.area_mm2), "perimeter_mm": _r(s.perimetro_mm), "d_min_mm": _r(s.d_min_mm),
        "d_max_mm": _r(s.d_max_mm), "d_eq_mm": _r(s.d_eq_mm), "eccentricity": _r(s.excentricidad),
        "d_perimeter_mm": _r(s.d_perimetro_mm), "d_inscribed_mm": _r(s.d_inscrito_mm),
        "inscribed_center": [round(c, 3) for c in s.centro_inscrito] if s.centro_inscrito else None,
        "circularity": _r(s.circularidad),
        "angle_min_deg": _r(s.angulo_min_deg, 1), "angle_max_deg": _r(s.angulo_max_deg, 1),
        "centroid": [round(c, 3) for c in s.centroide] if s.centroide else None,
        "contour": [[a, b] for a, b in s.contorno],
        "stent": None if s.stent is None else {
            "contour": [[a, b] for a, b in s.stent.contorno], "apposition_mm": s.stent.aposicion,
            "max_gap_mm": _r(s.stent.separacion_max_mm), "max_compression_mm": _r(s.stent.compresion_max_mm),
            "at_neck": s.stent.frente_al_cuello,
        },
    } for s in pb.secciones]
    resumen = resumen_out(pb.resumen)
    return {
        "n_sections": len(secciones), "size_px": TAMANO_PX, "fov_mm": round(pb.fov_mm, 3),
        "window": [round(v, 2) for v in pb.ventana], "sections": secciones, "summary": resumen, "note": pb.nota,
        "stent": None if pb.stent is None else {
            "from_arc_mm": _r(pb.stent.desde_mm, 2), "to_arc_mm": _r(pb.stent.hasta_mm, 2), "noise_mm": _r(pb.stent.ruido_mm),
            "gap_length_mm": _r(pb.stent.separado_mm, 1), "max_gap_mm": _r(pb.stent.separacion_max_mm),
            "compressed_length_mm": _r(pb.stent.comprimido_mm, 1), "neck_length_mm": _r(pb.stent.cuello_mm, 1),
            "proximal_gap_mm": _r(pb.stent.anclaje_prox_mm), "distal_gap_mm": _r(pb.stent.anclaje_dist_mm),
        },
    }


class SinLinea(Exception):
    """Falta algo para calcular (línea, malla, superposición): el texto es para la persona."""


def _linea(meshes_dir):
    with np.load(meshes_dir / "centerline_points.npz") as d:
        pts = d["points"].astype(float)
        radios = d["radii"].astype(float)
    arco = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return pts, radios, arco


def obtener_pullback(session_id: str) -> dict:
    """El pullback de la sesión: de la caché si sigue valiendo, si no se calcula.

    Síncrono (tarda segundos al calcular): el endpoint lo llama en un hilo y el
    informe, que ya corre en uno, directamente. La pila queda en `PILA`.
    """
    from routers.centerline import _lesion_mesh

    meshes_dir = session_subdir(session_id, "meshes")
    puntos, vaso = meshes_dir / "centerline_points.npz", meshes_dir / "vessel_tree.vtp"
    if not puntos.exists():
        raise SinLinea("Extrae la línea central primero.")
    if not vaso.exists():
        raise SinLinea("No hay malla vascular. Ejecuta la segmentación primero.")
    lesion = _lesion_mesh(session_id, meshes_dir)
    # El stent guiado por la línea entra en la clave: desplegarlo o moverlo rehace el pullback.
    entradas = [puntos, vaso, lesion, meshes_dir / "_volume.npy", meshes_dir / STENT]
    datos_path, pila_path = meshes_dir / DATOS, meshes_dir / PILA
    if datos_path.exists() and pila_path.exists():
        try:
            guardado = json.loads(datos_path.read_text(encoding="utf-8"))
            if guardado.get("clave") == f"v{VERSION_DATOS}|{_clave(entradas)}":
                return guardado["datos"]
        except (OSError, ValueError, KeyError):
            pass
    datos = _calcular(session_id, meshes_dir, lesion)
    # La clave se toma después: el cálculo puede haber escrito el volumen en caché.
    datos_path.write_text(json.dumps({"clave": f"v{VERSION_DATOS}|{_clave(entradas)}", "datos": datos}), encoding="utf-8")
    return datos


def ramas_de_la_linea(session_id: str) -> tuple[list[dict], float | None]:
    """Los orígenes de rama visibles sobre la pared de la arteria recorrida.

    No van en la caché del pullback: salen del barrido congelado al segmentar,
    que vive en el estado de la sesión, y situarlos cuesta milisegundos.
    """
    from services.branch_origins import thaw_scan
    from services.ivus_virtual import ramas_en_linea

    scan = thaw_scan(session_id)
    if scan is None:
        return [], None
    suelo = round(scan.calibre_floor_mm, 2) if scan.calibre_floor_mm else None
    meshes_dir = session_subdir(session_id, "meshes")
    if not (meshes_dir / "centerline_points.npz").exists():
        return [], suelo
    pts, radios, arco = _linea(meshes_dir)
    ramas = [{"arc_mm": round(b.arc_mm, 2), "calibre_mm": round(b.calibre_mm, 2), "parent_mm": round(b.padre_mm, 2),
              "angle_deg": round(b.angulo_deg, 1), "distance_mm": round(b.distancia_mm, 2)}
             for b in ramas_en_linea(pts, radios, arco, scan.origins)]
    return ramas, suelo


@router.post(
    "/centerline/{session_id}/ivus",
    response_model=IvusResult,
    summary="Virtual IVUS pullback along the centreline (VINI 3D)",
    description=(
        "One section perpendicular to the centreline at each of its points: the volume "
        "resampled in that plane (raw uint8 stack at `stack_url`), the lumen contour cut "
        "from the vessel mesh (the loop around the centreline) and its IVUS measures "
        "(area, perimeter, min/max diameter through the centroid, eccentricity, perimeter and "
        "inscribed diameters, circularity), plus the "
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
    try:
        datos = await asyncio.to_thread(obtener_pullback, session_id)
    except SinLinea as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("IVUS virtual falló en %s", session_id)
        raise HTTPException(status_code=500, detail=mensaje_error(f"No se pudo calcular el IVUS virtual", exc))
    ramas, suelo = await asyncio.to_thread(ramas_de_la_linea, session_id)
    pila_path = session_subdir(session_id, "meshes") / PILA
    url = f"{mesh_url(session_id, PILA)}?v={int(pila_path.stat().st_mtime * 1000)}"
    return IvusResult(stack_url=url, branches=ramas, branch_floor_mm=suelo, **datos)


# ── Comparar con el estudio anterior (VINI 3D, 18-11) ───────────────────────── #

COMPARA = "ivus_compare.json"


def registro_guardado(session_id: str) -> dict | None:
    """La superposición que calculó Seguimiento en esta sesión, si la hay."""
    from routers.followup import FOLLOWUP_STATE_KEY
    from services.sessions import read_state
    raw = read_state(session_id, FOLLOWUP_STATE_KEY, "")
    try:
        d = json.loads(raw) if raw else None
    except ValueError:
        return None
    return d if d and len(d.get("prev_to_curr") or []) == 4 else None


def comparar_con_anterior(session_id: str, previous_session_id: str) -> dict:
    """La línea actual cortando el estudio anterior ya superpuesto (síncrono)."""
    from routers.centerline import _lesion_mesh
    from routers.followup import _study_dir
    from services.followup import _transform
    from services.ivus_virtual import en_lesion, medir_sobre_malla, resumir
    from services.segmentation import read_vtp

    reg = registro_guardado(session_id)
    if reg is None or reg.get("previous_session_id") != previous_session_id:
        raise SinLinea("Superpón primero ese estudio en Seguimiento (Morfometría): la comparación usa esa superposición.")
    meshes_dir = session_subdir(session_id, "meshes")
    if not (meshes_dir / "centerline_points.npz").exists():
        raise SinLinea("Extrae la línea central primero.")
    prev_vaso_path = _study_dir(previous_session_id) / "meshes" / "vessel_tree.vtp"
    if not prev_vaso_path.exists():
        raise SinLinea("El estudio anterior no tiene malla segmentada.")
    entradas = [meshes_dir / "centerline_points.npz", meshes_dir / "vessel_tree.vtp", prev_vaso_path]
    clave = _clave(entradas) + "|" + json.dumps(reg["prev_to_curr"])
    cache = meshes_dir / COMPARA
    if cache.exists():
        try:
            g = json.loads(cache.read_text(encoding="utf-8"))
            if g.get("clave") == clave:
                return g["datos"]
        except (OSError, ValueError, KeyError):
            pass
    pts, _radios, arco = _linea(meshes_dir)
    prev = _transform(read_vtp(prev_vaso_path), np.asarray(reg["prev_to_curr"], dtype=float))
    lesion = _lesion_mesh(session_id, meshes_dir)
    vaso = read_vtp(meshes_dir / "vessel_tree.vtp")
    secs = medir_sobre_malla(pts, arco, prev, en_lesion(pts, read_vtp(lesion) if lesion else None, vaso))
    datos = {
        "previous_session_id": previous_session_id,
        "sections": [{"arc_mm": round(s.arc_mm, 2), "valid": s.valida, "in_branch": s.en_rama,
                      "area_mm2": _r(s.area_mm2), "d_min_mm": _r(s.d_min_mm), "d_max_mm": _r(s.d_max_mm),
                      "contour": [[a, b] for a, b in s.contorno]} for s in secs],
        "summary": resumen_out(resumir(secs)),
        "noise_mm": float(reg.get("noise_mm") or 0.0),
        "residual_median_mm": float(reg.get("residual_median_mm") or 0.0),
    }
    cache.write_text(json.dumps({"clave": clave, "datos": datos}), encoding="utf-8")
    return datos


@router.post(
    "/centerline/{session_id}/ivus/compare",
    response_model=IvusCompareResult,
    summary="Cut the earlier study with the current centreline (VINI 3D follow-up)",
    description=(
        "Uses the registration computed in Seguimiento (earlier study → current mesh) and "
        "cuts the earlier vessel mesh with the same section planes as the current pullback, "
        "so section i of both studies is the same place. Contours and measures only (no "
        "image). 409 until that study has been superimposed in Seguimiento."
    ),
)
async def ivus_compare(
    session_id: str,
    req: IvusCompareRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> IvusCompareResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    require_session(db, user, session_id)
    require_session(db, user, req.previous_session_id)
    try:
        datos = await asyncio.to_thread(comparar_con_anterior, session_id, req.previous_session_id)
    except SinLinea as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Comparación IVUS falló en %s", session_id)
        raise HTTPException(status_code=500, detail=mensaje_error(f"No se pudo comparar con el estudio anterior", exc))
    return IvusCompareResult(**datos)
