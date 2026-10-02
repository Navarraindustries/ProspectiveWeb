"""Vessel centerline extraction router (medial-axis between two points)."""
from __future__ import annotations

import asyncio
import logging
import time

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated

from services.auth_service import get_current_user
from services.audit import audit_device
from services.db_models import User

from models.centerline import (
    CenterlineClearResult, CenterlineRequest, CenterlineResult,
    CrossSectionRequest, CrossSectionResult, ClStentRequest, ClStentResult,
    FdSizingResult,
)
from services.centerline import extract_centerline
from services.cross_section import compute_cross_sections
from services.stent_deployment import deploy_stent_on_centerline
from services.segmentation import read_vtp, write_vtp
from services.sessions import mesh_url, session_exists, session_subdir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["centerline"])


def _run_extraction(vessel_path, source, target, voxel_size, out_path, points_path):
    """Synchronous heavy work — run in a worker thread."""
    vessel = read_vtp(vessel_path)
    result = extract_centerline(vessel, source, target, voxel_size_mm=voxel_size)
    write_vtp(result.poly_data, out_path)
    # Persist geometry so cross-section analysis can reuse it without recomputing.
    np.savez(
        points_path,
        points=result.points.astype(np.float32),
        radii=result.radii.astype(np.float32),
    )
    return result


@router.post(
    "/centerline/{session_id}",
    response_model=CenterlineResult,
    summary="Extract the vessel centreline between two points",
    description=(
        "Computes the medial-axis centreline of the segmented vessel between a "
        "source and a target point (voxelisation + EDT + Dijkstra on the "
        "distance-weighted grid). Returns a tube mesh of varying radius plus "
        "clinical metrics: arc length, tortuosity and vessel diameter statistics."
    ),
)
async def compute_centerline(session_id: str, req: CenterlineRequest) -> CenterlineResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    vessel_path = meshes_dir / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise HTTPException(
            status_code=409,
            detail="No hay malla vascular. Ejecuta la segmentación primero.",
        )

    source = (req.source.x, req.source.y, req.source.z)
    target = (req.target.x, req.target.y, req.target.z)
    out_path    = meshes_dir / "centerline.vtp"
    points_path = meshes_dir / "centerline_points.npz"

    try:
        result = await asyncio.to_thread(
            _run_extraction, vessel_path, source, target,
            req.voxel_size_mm, out_path, points_path,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Centerline extraction failed")
        raise HTTPException(status_code=500, detail=f"Error en línea central: {exc}")

    url = f"{mesh_url(session_id, 'centerline.vtp')}?v={int(time.time() * 1000)}"
    return _to_out(result, url)


def _to_out(result, url: str) -> CenterlineResult:
    """Las métricas de la respuesta, igual al extraer que al volver a leerlas."""
    tort = result.tortuosity
    warning = None
    if tort >= 1.25:
        warning = f"Tortuosidad alta ({tort:.2f}) — acceso endovascular potencialmente difícil."

    return CenterlineResult(
        centerline_mesh_url=url,
        n_points=int(len(result.points)),
        arc_length_mm=round(result.arc_length_mm, 1),
        chord_length_mm=round(result.chord_length_mm, 1),
        tortuosity=round(result.tortuosity, 3),
        tortuosity_index_pct=round(result.tortuosity_index * 100.0, 1),
        mean_diameter_mm=round(result.mean_radius_mm * 2.0, 2),
        min_diameter_mm=round(result.min_radius_mm * 2.0, 2),
        max_diameter_mm=round(result.max_radius_mm * 2.0, 2),
        warning=warning,
    )


@router.get(
    "/centerline/{session_id}",
    response_model=CenterlineResult | None,
    summary="The centreline already extracted in this session, or null",
    description=(
        "Rebuilds the metrics from the medial-axis points the extraction saved "
        "(`centerline_points.npz`), with the same arithmetic as the extraction. "
        "After «Reanudar» the tube came back but the metrics table stayed empty "
        "until the centreline was extracted again. Null when none was extracted."
    ),
)
async def get_centerline(session_id: str) -> CenterlineResult | None:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    meshes_dir = session_subdir(session_id, "meshes")
    points_path = meshes_dir / "centerline_points.npz"
    if not points_path.exists() or not (meshes_dir / "centerline.vtp").exists():
        return None
    try:
        with np.load(points_path) as data:
            pts = data["points"].astype(float)
            radii = data["radii"].astype(float)
    except Exception as exc:  # noqa: BLE001 — un fichero dañado es «no hay»
        logger.warning("centerline_points.npz ilegible en %s: %s", session_id, exc)
        return None
    if len(pts) < 2:
        return None
    from services.centerline import CenterlineExtractor
    result = CenterlineExtractor._compute_metrics(pts, radii)
    url = f"{mesh_url(session_id, 'centerline.vtp')}?v={int(points_path.stat().st_mtime * 1000)}"
    return _to_out(result, url)


def _run_cross_section(vessel_path, points_path, n_samples):
    vessel = read_vtp(vessel_path)
    data = np.load(points_path)
    return compute_cross_sections(data["points"], vessel, n_samples)


@router.post(
    "/cross-section/{session_id}",
    response_model=CrossSectionResult,
    summary="Analyse vessel cross-sections along the centreline",
    description=(
        "Cuts the vessel with planes perpendicular to the extracted centreline "
        "and measures the cross-sectional area (shoelace) at each, yielding a "
        "diameter profile and a stenosis estimate. Requires that the centreline "
        "was extracted first (POST /api/centerline/{session_id})."
    ),
)
async def compute_cross_section(session_id: str, req: CrossSectionRequest) -> CrossSectionResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    vessel_path = meshes_dir / "vessel_tree.vtp"
    points_path = meshes_dir / "centerline_points.npz"
    if not vessel_path.exists():
        raise HTTPException(status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero.")
    if not points_path.exists():
        raise HTTPException(status_code=409, detail="Extrae la línea central primero.")

    try:
        result = await asyncio.to_thread(
            _run_cross_section, vessel_path, points_path, req.n_samples,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Cross-section analysis failed")
        raise HTTPException(status_code=500, detail=f"Error en sección transversal: {exc}")

    pct = (1.0 - result.stenosis_ratio) * 100.0
    if pct < 20:
        label = "Sin estenosis"
    elif pct < 50:
        label = "Leve"
    else:
        label = "Significativa"
    warning = None
    if pct >= 50:
        warning = f"Estenosis significativa (~{pct:.0f}%) en el punto más estrecho."

    return CrossSectionResult(
        arc_positions_mm=[round(float(a), 2) for a in result.arc_positions_mm],
        diameters_mm=[round(float(d), 3) for d in result.diameters_mm],
        mean_diameter_mm=round(result.mean_diameter_mm, 2),
        median_diameter_mm=round(result.median_diameter_mm, 2),
        min_diameter_mm=round(result.min_diameter_mm, 2),
        max_diameter_mm=round(result.max_diameter_mm, 2),
        mean_area_mm2=round(result.mean_area_mm2, 2),
        stenosis_ratio=round(result.stenosis_ratio, 3),
        stenosis_pct=round(pct, 1),
        stenosis_label=label,
        warning=warning,
    )


def _run_cl_stent(points_path, req: ClStentRequest, out_path, session_id: str | None = None):
    data = np.load(points_path)
    result = deploy_stent_on_centerline(
        data["points"], data["radii"],
        stent_diameter_mm=req.stent_diameter_mm,
        start_arc_mm=req.start_arc_mm,
        end_arc_mm=req.end_arc_mm,
        braid=req.braid,
        braid_count=req.braid_count,
    )
    write_vtp(result.stent_poly_data, out_path)
    if session_id:
        _measure_vessel_like_sizing(session_id, data["points"], req, result, out_path.parent)
    return result


def _measure_vessel_like_sizing(session_id, points, req, result, meshes_dir) -> None:
    """Sustituye el calibre de los radios de la línea central por el de los
    cortes, el mismo que da el dimensionado (services/fd_sizing.py). Si no hay
    cortes suficientes, se queda el de los radios."""
    from routers.plan import _load_float
    from services.fd_sizing import _arc, project_on_centerline, segment_diameter
    vessel = meshes_dir / "vessel_tree.vtp"
    if not vessel.exists():
        return
    pts = np.asarray(points, float)
    arc = _arc(pts)
    s0 = req.start_arc_mm if req.start_arc_mm is not None else 0.0
    s1 = req.end_arc_mm if req.end_arc_mm is not None else float(arc[-1])
    exclude = None
    neck = [_load_float(session_id, f"morpho.neck_origin_{k}", float("nan")) for k in "xyz"]
    neck_mm = _load_float(session_id, "morpho.neck_mm", 0.0)
    if not any(v != v for v in neck) and neck_mm > 0:
        sn, _d = project_on_centerline(pts, arc, neck)
        exclude = (sn - neck_mm / 2, sn + neck_mm / 2)
    d, _n = segment_diameter(read_vtp(vessel), pts, s0, s1, exclude)
    if d > 0:
        result.mean_vessel_diameter_mm = d
        result.coverage_ratio = req.stent_diameter_mm / d


@router.post(
    "/cl-stent/{session_id}",
    response_model=ClStentResult,
    summary="Deploy a stent along the vessel centreline",
    description=(
        "Sweeps a stent tube along the previously-extracted centreline between two "
        "arc-length positions (parallel-transport frames + optional helical braids), "
        "following the true vessel curvature — unlike the straight neck stent. "
        "Requires that the centreline was extracted first "
        "(POST /api/centerline/{session_id})."
    ),
)
async def deploy_cl_stent(
    session_id: str,
    req: ClStentRequest,
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> ClStentResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    points_path = meshes_dir / "centerline_points.npz"
    if not points_path.exists():
        raise HTTPException(status_code=409, detail="Extrae la línea central primero.")

    out_path = meshes_dir / "cl_stent.vtp"
    try:
        result = await asyncio.to_thread(_run_cl_stent, points_path, req, out_path, session_id)
        from services.device_state import save_stent
        save_stent(session_id, {
            "name": "Stent guiado por centerline",
            "manufacturer": "",
            "diameter_mm": req.stent_diameter_mm,
            "length_mm": round(result.length_mm, 1),
            "coverage_pct": round(result.coverage_ratio * 100, 1),
            "kind": "centerline",
        })
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Centreline stent deployment failed")
        raise HTTPException(status_code=500, detail=f"Error desplegando el stent: {exc}")

    # El diámetro del vaso sale de los radios de la línea central, así que aquí
    # el dimensionado sí se puede juzgar contra la arteria portadora. El aviso
    # decía «riesgo de sobreexpansión», que no dice qué pasa; lo que pasa está
    # medido: la trenza se abre y la cobertura metálica baja.
    from services.endovascular import metal_coverage_note

    cov = result.coverage_ratio
    _sizing, texto = metal_coverage_note(
        result.nominal_diameter_mm, result.mean_vessel_diameter_mm,
    )
    warning = None
    if cov < 0.9:
        warning = (
            f"Infradimensionado (Ø stent / Ø vaso = {cov:.2f}). {texto}"
        )
    elif cov > 1.15:
        warning = (
            f"Sobredimensionado (Ø stent / Ø vaso = {cov:.2f}). {texto}"
        )

    url = f"{mesh_url(session_id, 'cl_stent.vtp')}?v={int(time.time() * 1000)}"
    audit_device("stent_cl", session_id, current_user, {
        "length_mm": round(result.length_mm, 1),
        "nominal_diameter_mm": round(result.nominal_diameter_mm, 2),
    })
    return ClStentResult(
        stent_mesh_url=url,
        length_mm=round(result.length_mm, 1),
        nominal_diameter_mm=round(result.nominal_diameter_mm, 2),
        mean_vessel_diameter_mm=round(result.mean_vessel_diameter_mm, 2),
        coverage_ratio=round(result.coverage_ratio, 2),
        total_arc_mm=round(result.total_arc_mm, 1),
        warning=warning,
    )


# ── POST /centerline/{session_id}/fd-sizing ───────────────────────────────── #

def _run_fd_sizing(session_id: str, vessel_path, points_path):
    from routers.detect import _read_rim_points
    from routers.plan import _STENT_LIBRARY, _load_float
    from services.fd_sizing import size_flow_diverter

    neck = [_load_float(session_id, f"morpho.neck_origin_{k}", float("nan")) for k in "xyz"]
    neck_mm = _load_float(session_id, "morpho.neck_mm", 0.0)
    if any(v != v for v in neck) or neck_mm <= 0:
        raise ValueError("Falta la morfometría: hace falta el cuello medido para "
                         "saber dónde caen los anclajes.")
    rim = [(p.x, p.y, p.z) for p in _read_rim_points(session_id)]
    r = size_flow_diverter(
        read_vtp(vessel_path), np.load(points_path)["points"], neck, neck_mm,
        [s.model_dump() for s in _STENT_LIBRARY], rim_points=rim,
    )
    # Dos medidas de la misma arteria que no casan: la pestaña «Stents»
    # dimensiona con la de la morfometría. En un caso real dio 1,67 mm donde
    # los cortes sobre la línea central miden 4–5 mm.
    parent = _load_float(session_id, "morpho.parent_artery_mm", 0.0)
    medidos = [z.diameter_mm for z in (r.proximal, r.distal) if z.diameter_mm > 0]
    if parent > 0 and medidos:
        aqui = sum(medidos) / len(medidos)
        if abs(parent - aqui) > 1.0:
            from services.sessions import read_state
            vieja = read_state(session_id, "morpho.parent_artery_method", "") != "p25"
            r.warnings.append(
                f"La arteria madre de la morfometría ({parent:.2f} mm) no coincide con "
                f"el calibre medido aquí sobre la línea central ({aqui:.2f} mm). La "
                f"pestaña «Stents» dimensiona con la de la morfometría: "
                + ("es de una versión anterior del cálculo; vuelve a ejecutar la morfometría."
                   if vieja else "compruébala."))
    return r


@router.post(
    "/centerline/{session_id}/fd-sizing",
    response_model=FdSizingResult,
    summary="Dimensionar un flow-diverter sobre la línea central",
    description=(
        "Mide el calibre del vaso en el anclaje proximal y en el distal del "
        "cuello con cortes perpendiculares a la línea central, y propone el "
        "diámetro y la longitud etiquetada de cada flow-diverter del catálogo. "
        "Necesita la línea central y la morfometría. No simula el despliegue "
        "de la trenza: ver services/fd_sizing.py."
    ),
)
async def fd_sizing(session_id: str) -> FdSizingResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    meshes_dir = session_subdir(session_id, "meshes")
    points_path = meshes_dir / "centerline_points.npz"
    vessel_path = meshes_dir / "vessel_tree.vtp"
    if not points_path.exists():
        raise HTTPException(status_code=422, detail="Extrae primero la línea central.")
    if not vessel_path.exists():
        raise HTTPException(status_code=422, detail="No hay malla segmentada.")
    try:
        r = await asyncio.to_thread(_run_fd_sizing, session_id, vessel_path, points_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    from dataclasses import asdict
    d = asdict(r)
    d["neck_arc_mm"] = list(r.neck_arc_mm)
    for o in d["options"]:
        o["deploy_arc_mm"] = list(o["deploy_arc_mm"])
    return FdSizingResult(**d)


# ── DELETE /centerline/{session_id} ───────────────────────────────────────── #

@router.delete(
    "/centerline/{session_id}",
    response_model=CenterlineClearResult,
    summary="Discard the extracted centreline",
    description=(
        "Deletes the centreline tube, its cached medial-axis points and any stent "
        "deployed along it. The centreline-guided stent is built from those points, "
        "so leaving it behind would keep a device following a centreline that no "
        "longer exists — which is why both go in one call.\n\n"
        "Idempotent: succeeds with `had_centerline=false` when nothing was extracted."
    ),
)
async def clear_centerline(session_id: str) -> CenterlineClearResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    had = (meshes_dir / "centerline.vtp").exists() or (meshes_dir / "centerline_points.npz").exists()

    removed: list[str] = []
    for name in ("centerline.vtp", "centerline_points.npz", "cl_stent.vtp"):
        path = meshes_dir / name
        if path.exists():
            try:
                path.unlink()
                removed.append(name)
            except OSError as exc:  # noqa: BLE001
                logger.warning("Could not delete %s for %s: %s", name, session_id, exc)

    # A centreline-guided stent is recorded as the session's stent; dropping its
    # geometry without the record would leave the report describing a phantom.
    if "cl_stent.vtp" in removed:
        from services.device_state import read_stent, save_stent
        if (read_stent(session_id) or {}).get("kind") == "centerline":
            save_stent(session_id, None)

    logger.info("Cleared centreline for session=%s (%s)", session_id, removed or "nothing")
    return CenterlineClearResult(removed=removed, had_centerline=had)
