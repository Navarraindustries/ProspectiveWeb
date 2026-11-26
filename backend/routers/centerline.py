"""Vessel centerline extraction router (medial-axis between two points)."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated

from services.auth_service import get_current_user
from services.audit import audit_device
from services.db_models import User

from models.centerline import (
    CenterlineClearResult, CenterlinePoints, CenterlineRequest, CenterlineResult,
    CrossSectionRequest, CrossSectionResult, ClStentApposition, ClStentCoverage, ClStentRequest, ClStentResult,
    FdSizingResult, StentTresClicsRequest, StentTresClicsResult,
    BifurcacionRequest, BifurcacionResult,
)
from models.detection import Position3D
from services.centerline import extract_centerline, voxel_linea
from services.curvatura import SIGMA_MM
from services.cross_section import compute_cross_sections, grade_stenosis
from services.stent_deployment import deploy_stent_on_centerline
from services.numero import cifra
from services.segmentation import read_vtp, write_vtp
from services.sessions import mesh_url, read_state, session_exists, session_subdir
from services.errores import mensaje_error

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["centerline"])


def _run_extraction(vessel_path, source, target, voxel_size, out_path, points_path, lesion_path=None):
    """Synchronous heavy work — run in a worker thread."""
    vessel = read_vtp(vessel_path)
    region = read_vtp(lesion_path) if lesion_path is not None else None
    result = extract_centerline(vessel, source, target, voxel_size_mm=voxel_size, target_region=region)
    write_vtp(result.poly_data, out_path)
    # Persist geometry so cross-section analysis can reuse it without recomputing.
    np.savez(
        points_path,
        points=result.points.astype(np.float32),
        radii=result.radii.astype(np.float32),
        ends_in_lesion=np.array(region is not None),
        # Hasta dónde llega el vaso portador (P13): -1 = toda la línea.
        n_portador=np.array(-1 if result.n_portador is None else result.n_portador),
        # La rejilla con la que se midió el radio (P15).
        voxel_mm=np.array(result.voxel_mm if result.voxel_mm else 0.0),
    )
    return result


def _lesion_mesh(session_id: str, meshes_dir) -> Path | None:
    """La malla de la lesión donde termina una línea sin destino marcado.

    El saco medido si lo hay (morfometría del candidato elegido: es cerrado y
    su centro es el del saco de verdad); si no, la zona del candidato elegido
    (o del primero de la lista). None si no hay ninguna de las dos."""
    sac = meshes_dir / (read_state(session_id, "morpho.sac_vtp_name", "") or "aneurysm_sac.vtp")
    if sac.exists():
        return sac
    chosen = read_state(session_id, "detect.selected_candidate", "") or "cand-001"
    m = re.fullmatch(r"cand-(\d+)", chosen)
    if m:
        name = read_state(session_id, f"detect.cand_{m.group(1)}.vtp_name", "") or f"aneurysm_cand_{m.group(1)}.vtp"
        dome = meshes_dir / name
        if dome.exists():
            return dome
    return None


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

    meshes_dir = session_subdir(session_id, "meshes")
    vessel_path = meshes_dir / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise HTTPException(
            status_code=409,
            detail="No hay malla vascular. Ejecuta la segmentación primero.",
        )

    source = (req.source.x, req.source.y, req.source.z)
    target = (req.target.x, req.target.y, req.target.z) if req.target is not None else None
    lesion_path = None
    if target is None:
        lesion_path = _lesion_mesh(session_id, meshes_dir)
        if lesion_path is None:
            raise HTTPException(
                status_code=422,
                detail="Sin destino marcado la línea termina dentro del candidato, y no hay ninguno: "
                       "detecta aneurismas o marca el destino sobre el vaso.",
            )
    out_path    = meshes_dir / "centerline.vtp"
    points_path = meshes_dir / "centerline_points.npz"

    try:
        result = await asyncio.to_thread(
            _run_extraction, vessel_path, source, target,
            req.voxel_size_mm, out_path, points_path, lesion_path,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Centerline extraction failed")
        raise HTTPException(status_code=500, detail=mensaje_error(f"Error en línea central", exc))

    url = f"{mesh_url(session_id, 'centerline.vtp')}?v={int(time.time() * 1000)}"
    return _to_out(result, url, ends_in_lesion=lesion_path is not None)


def _ends_in_lesion(data) -> bool:
    """Lo que la extracción guardó; las líneas de antes no lo llevan: no."""
    return bool(data["ends_in_lesion"]) if "ends_in_lesion" in data.files else False


def _to_out(result, url: str, ends_in_lesion: bool = False) -> CenterlineResult:
    """Las métricas de la respuesta, igual al extraer que al volver a leerlas."""
    tort = result.tortuosity
    warning = None
    if tort >= 1.25:
        warning = f"Tortuosidad alta ({cifra(tort, 2)}) — acceso endovascular potencialmente difícil."

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
        ends_in_lesion=ends_in_lesion,
        mean_curvature_per_mm=_redondeo(result.curvatura_media, 4),
        mean_curvature_radius_mm=(round(1.0 / result.curvatura_media, 1)
                                  if result.curvatura_media and result.curvatura_media > 1e-6 else None),
        mean_torsion_per_mm=_redondeo(result.torsion_media, 4),
        curvature_length_mm=_redondeo(result.longitud_curvatura_mm, 1),
        curvature_sigma_mm=SIGMA_MM,
        voxel_mm=_redondeo(result.voxel_mm, 2) if result.voxel_mm else None,
        warning=warning,
    )


def _redondeo(v: float | None, n: int) -> float | None:
    return None if v is None else round(float(v), n)


def _n_portador(data, en_lesion: bool) -> int | None | bool:
    """Lo que guardó la extracción. Las líneas de antes no lo llevan: si
    terminan en la lesión no se sabe dónde empieza el saco y se devuelve
    False (sin curvatura); si no, la línea entera es vaso portador (None)."""
    if "n_portador" in data.files:
        n = int(data["n_portador"])
        return None if n < 0 else n
    return False if en_lesion else None


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    meshes_dir = session_subdir(session_id, "meshes")
    points_path = meshes_dir / "centerline_points.npz"
    if not points_path.exists() or not (meshes_dir / "centerline.vtp").exists():
        return None
    try:
        with np.load(points_path) as data:
            pts = data["points"].astype(float)
            radii = data["radii"].astype(float)
            en_lesion = _ends_in_lesion(data)
            n_portador = _n_portador(data, en_lesion)
            voxel = voxel_linea(data)
    except Exception as exc:  # noqa: BLE001 — un fichero dañado es «no hay»
        logger.warning("centerline_points.npz ilegible en %s: %s", session_id, exc)
        return None
    if len(pts) < 2:
        return None
    from services.centerline import CenterlineExtractor
    if n_portador is False:
        result = CenterlineExtractor._compute_metrics(pts, radii, 0)
    else:
        result = CenterlineExtractor._compute_metrics(pts, radii, n_portador)
    result.voxel_mm = voxel
    url = f"{mesh_url(session_id, 'centerline.vtp')}?v={int(points_path.stat().st_mtime * 1000)}"
    return _to_out(result, url, ends_in_lesion=en_lesion)


@router.get(
    "/centerline/{session_id}/points",
    response_model=CenterlinePoints,
    summary="The centreline points, radii and arc positions",
    description=(
        "The medial-axis points `centerline_points.npz` holds, so the client can walk "
        "the vessel section by section and the calibre chart can lead to a position. "
        "404 when no centreline was extracted; 409 when the file is unreadable or degenerate."
    ),
)
async def get_centerline_points(session_id: str) -> CenterlinePoints:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    points_path = session_subdir(session_id, "meshes") / "centerline_points.npz"
    if not points_path.exists():
        raise HTTPException(status_code=404, detail="No hay línea central extraída.")
    try:
        with np.load(points_path) as data:
            pts = data["points"].astype(float)
            radii = data["radii"].astype(float)
            en_lesion = _ends_in_lesion(data)
    except Exception as exc:  # noqa: BLE001 — un fichero dañado no es un 500
        # El detalle va al usuario: la excepción (rutas, internos de numpy) se
        # queda en el log.
        logger.warning("centerline_points.npz ilegible en %s: %s", session_id, exc)
        raise HTTPException(status_code=409, detail="La línea central guardada no se puede leer.")
    if len(radii) != len(pts):
        raise HTTPException(status_code=409, detail="La línea central guardada es inconsistente.")
    if len(pts) < 2:
        raise HTTPException(status_code=409, detail="La línea central tiene menos de dos puntos.")
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return CenterlinePoints(
        points=[Position3D(x=round(float(p[0]), 2), y=round(float(p[1]), 2), z=round(float(p[2]), 2)) for p in pts],
        radii_mm=[round(float(r), 3) for r in radii],
        arc_mm=[round(float(a), 2) for a in arc],
        ends_in_lesion=en_lesion,
    )


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

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
        raise HTTPException(status_code=500, detail=mensaje_error(f"Error en sección transversal", exc))

    pct = (1.0 - result.stenosis_ratio) * 100.0
    # F1-169: con un perfil de saltos (bifurcaciones) no se pone grado.
    grade = grade_stenosis(result.areas_mm2, result.stenosis_ratio)

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
        stenosis_label=grade.label,
        stenosis_note=grade.note,
        warning=grade.warning,
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
        result.apposition = _apposition(session_id, result, out_path)
        result.coverage = _coverage(result, req, out_path) if result.apposition and req.braid else None
    return result


def _coverage(result, req: ClStentRequest, out_path):
    """Cobertura metálica de la trenza sobre el mapa de aposición. Igual que
    él, si no sale el stent se queda como estaba."""
    from dataclasses import asdict
    from services.braid_coverage import PIPELINE, annotate, braid_for
    try:
        c = annotate(result.stent_poly_data, result.centerline_segment, req.stent_diameter_mm,
                     braid_for(req.device_id) or PIPELINE)
        write_vtp(result.stent_poly_data, out_path)
        # La etiqueta estimada sobre la malla (diámetros de la aposición) no
        # coincide con la del dispositivo que eligió el dimensionado (diámetros
        # de los cortes): en Case 3, «≈ 18 mm» para un Pipeline de 20. Si se
        # sabe cuál es, se da esa.
        return {**asdict(c), "catalogue_length_mm": req.catalogue_length_mm}
    except ValueError as exc:            # fuera de las medidas de la familia
        logger.info("Coverage map not applicable: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Coverage map skipped: %s", exc)
        return None


def _apposition(session_id: str, result, out_path):
    """Pinta en la malla del stent su distancia a la pared y la resume. Si
    falla, el stent se queda como estaba: un mapa no vale un despliegue."""
    from dataclasses import asdict
    from routers.plan import _load_float
    from services.apposition import annotate
    vessel = out_path.parent / "vessel_tree.vtp"
    if not vessel.exists():
        return None
    try:
        neck = [_load_float(session_id, f"morpho.neck_origin_{k}", float("nan")) for k in "xyz"]
        neck_mm = _load_float(session_id, "morpho.neck_mm", 0.0)
        tiene_cuello = not any(v != v for v in neck) and neck_mm > 0
        a = annotate(
            result.stent_poly_data, read_vtp(vessel), result.centerline_segment,
            neck_center=neck if tiene_cuello else None, neck_mm=neck_mm if tiene_cuello else 0.0,
            # El vóxel más grueso de los tres ejes: con cortes de 0,6 mm y píxel de
            # 0,3 solo contaba el 0,3 y marcaba como hueco lo que era resolución.
            voxel_mm=max(_load_float(session_id, f"dicom.spacing_{k}", 0.0) for k in "xyz"),
        )
        write_vtp(result.stent_poly_data, out_path)
        return asdict(a)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Apposition map skipped for %s: %s", session_id, exc)
        return None


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

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
        raise HTTPException(status_code=500, detail=mensaje_error(f"Error desplegando el stent", exc))

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
            f"Infradimensionado (Ø stent / Ø vaso = {cifra(cov, 2)}). {texto}"
        )
    elif cov > 1.15:
        warning = (
            f"Sobredimensionado (Ø stent / Ø vaso = {cifra(cov, 2)}). {texto}"
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
        apposition=ClStentApposition(**ap) if (ap := getattr(result, "apposition", None)) else None,
        coverage=ClStentCoverage(**cv) if (cv := getattr(result, "coverage", None)) else None,
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
    # Dos medidas de la misma arteria que no casan: la pestaña «Stent recto»
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
                f"La arteria madre de la morfometría ({cifra(parent, 2)} mm) no coincide con "
                f"el calibre medido aquí sobre la línea central ({cifra(aqui, 2)} mm). La "
                f"pestaña «Stent recto» dimensiona con la de la morfometría: "
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
        "Necesita la línea central y la morfometría. Con el trenzado del "
        "dispositivo en el catálogo estima, en este vaso, la cobertura, la "
        "porosidad y la densidad de poros delante del cuello y la longitud "
        "desplegada; no simula el despliegue: ver services/fd_sizing.py."
    ),
)
async def fd_sizing(session_id: str) -> FdSizingResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
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

    return _sizing_out(r)


def _sizing_out(r) -> FdSizingResult:
    from dataclasses import asdict
    d = asdict(r)
    d["neck_arc_mm"] = list(r.neck_arc_mm)
    for o in d["options"]:
        o["deploy_arc_mm"] = list(o["deploy_arc_mm"])
    return FdSizingResult(**d)


# ── POST /stent-tres-clics/{session_id} (P10) ─────────────────────────────── #

def _mallas_de_lesion(session_id: str, meshes_dir: Path) -> list[tuple[str, np.ndarray]]:
    """El saco medido primero, luego el candidato elegido y los demás."""
    from vtkmodules.util.numpy_support import vtk_to_numpy

    nombres: list[str] = []
    saco = read_state(session_id, "morpho.sac_vtp_name", "") or "aneurysm_sac.vtp"
    nombres.append(saco)
    elegido = _lesion_mesh(session_id, meshes_dir)
    if elegido is not None:
        nombres.append(elegido.name)
    nombres += sorted(p.name for p in meshes_dir.glob("aneurysm_cand_*.vtp"))
    out: list[tuple[str, np.ndarray]] = []
    for n in dict.fromkeys(nombres):                 # sin repetir, en orden
        p = meshes_dir / n
        if not p.exists():
            continue
        poly = read_vtp(p)
        if poly.GetNumberOfPoints() > 0:
            out.append((n, vtk_to_numpy(poly.GetPoints().GetData()).astype(float)))
    return out


def _run_stent_tres_clics(session_id: str, meshes_dir: Path, req):
    """Lo pesado, en un hilo: extraer, localizar el cuello y dimensionar."""
    from services.stent_tres_clics import elegir_saco

    vessel_path = meshes_dir / "vessel_tree.vtp"
    clic = (req.sac.x, req.sac.y, req.sac.z) if req.sac is not None else None
    elegida = elegir_saco(_mallas_de_lesion(session_id, meshes_dir), clic)
    if elegida is None:
        raise ValueError(
            "El tercer clic no cae sobre ningún saco ni candidato detectado (a menos de 3 mm). "
            "Haz clic sobre el saco, o detecta aneurismas primero."
            if clic is not None else
            "No hay saco medido ni candidatos: detecta aneurismas o haz clic sobre el saco.")
    nombre, lesion = elegida

    source = (req.source.x, req.source.y, req.source.z)
    target = (req.target.x, req.target.y, req.target.z)
    # La línea nueva se escribe aparte y solo sustituye a la actual si todo
    # cuadra: un fallo (cuello fuera de la línea, dispositivo que no encaja)
    # deja intacta la línea de antes y lo que cuelga de ella.
    tmp_vtp, tmp_npz = meshes_dir / "centerline_p10.vtp", meshes_dir / "centerline_p10.npz"
    try:
        linea = _run_extraction(vessel_path, source, target, 0.8, tmp_vtp, tmp_npz)
        linea, sizing, cuello, opcion = _cuello_y_dimensionado(session_id, vessel_path, linea, lesion, req)
    except BaseException:
        for p in (tmp_vtp, tmp_npz):
            p.unlink(missing_ok=True)
        raise
    _quitar_lo_que_cuelga_de_la_linea(session_id, meshes_dir)
    os.replace(tmp_vtp, meshes_dir / "centerline.vtp")
    os.replace(tmp_npz, meshes_dir / "centerline_points.npz")
    return linea, sizing, cuello, nombre, opcion


def _cuello_y_dimensionado(session_id: str, vessel_path: Path, linea, lesion, req):
    from routers.detect import _read_rim_points
    from routers.plan import _STENT_LIBRARY, _load_float
    from services.fd_sizing import size_flow_diverter
    from services.stent_tres_clics import (MAX_CUELLO_A_SACO_MM, Cuello, cuello_desde_saco,
                                           distancia_a_malla, elegir_opcion)

    # El cuello medido, si es de este saco; si no, donde la línea toca el saco.
    neck = [_load_float(session_id, f"morpho.neck_origin_{k}", float("nan")) for k in "xyz"]
    neck_mm = _load_float(session_id, "morpho.neck_mm", 0.0)
    cuello = None
    if not any(v != v for v in neck) and neck_mm > 0 and \
            distancia_a_malla(lesion, neck) <= MAX_CUELLO_A_SACO_MM:
        cuello = Cuello(centro=tuple(neck), ancho_mm=neck_mm, fuente="morfometria",
                        borde=[(p.x, p.y, p.z) for p in _read_rim_points(session_id)])
    if cuello is None:
        cuello = cuello_desde_saco(linea.points, linea.radii, lesion)
    if cuello is None:
        raise ValueError(
            "La línea central no pasa por delante de ese saco: marca el punto proximal antes del "
            "cuello y el distal después, sobre la arteria que lo lleva.")

    sizing = size_flow_diverter(read_vtp(vessel_path), linea.points, cuello.centro, cuello.ancho_mm,
                                [s.model_dump() for s in _STENT_LIBRARY], rim_points=cuello.borde)
    return linea, sizing, cuello, elegir_opcion(sizing.options, req.device_id)


@router.post(
    "/stent-tres-clics/{session_id}",
    response_model=StentTresClicsResult,
    summary="Flow diverter en tres clics: proximal, distal y saco (P10)",
    description=(
        "Extracts the centreline from the proximal to the distal point (it REPLACES the current "
        "one), locates the neck along it (the measured neck of that sac, or where the line's "
        "inscribed sphere touches the sac mesh), sizes the flow diverter like "
        "POST /centerline/{id}/fd-sizing and deploys the first catalogue option that fits — or "
        "`device_id` — like POST /cl-stent/{id}. When no option fits, nothing is deployed and "
        "the sizing says why."
    ),
)
async def stent_tres_clics(
    session_id: str,
    req: StentTresClicsRequest,
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> StentTresClicsResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    meshes_dir = session_subdir(session_id, "meshes")
    if not (meshes_dir / "vessel_tree.vtp").exists():
        raise HTTPException(status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero.")
    try:
        linea, sizing, cuello, nombre, opcion = await asyncio.to_thread(
            _run_stent_tres_clics, session_id, meshes_dir, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    from services.neck_provenance import neck_is_marked
    url = f"{mesh_url(session_id, 'centerline.vtp')}?v={int(time.time() * 1000)}"
    # El cuello de Morfometría puede ser la estimación automática del saco
    # («auto»): llamarlo «medido» daba por marcado lo que nadie marcó.
    marcado = cuello.fuente == "morfometria" and \
        neck_is_marked(read_state(session_id, "morpho.neck_source", "") or "")
    out = StentTresClicsResult(
        centerline=_to_out(linea, url), sizing=_sizing_out(sizing),
        neck_source=cuello.fuente, neck_marked=marcado, lesion_mesh=nombre, message="")
    if opcion is None:
        out.message = ("Ninguna opción del catálogo encaja en este vaso: no se ha desplegado nada. "
                       "El dimensionado dice por qué.")
        return out

    a, b = opcion.deploy_arc_mm
    stent = await deploy_cl_stent(session_id, ClStentRequest(
        session_id=session_id, stent_diameter_mm=opcion.diameter_mm,
        start_arc_mm=a, end_arc_mm=b, braid=True, device_id=opcion.device_id,
        catalogue_length_mm=opcion.length_mm or None), current_user)
    out.device_id, out.device_name = opcion.device_id, opcion.name
    out.diameter_mm, out.labelled_length_mm = opcion.diameter_mm, opcion.length_mm
    out.deploy_arc_mm, out.stent = [a, b], stent
    cuello_txt = ("el cuello medido en Morfometría" if marcado
                  else "el cuello estimado en Morfometría" if cuello.fuente == "morfometria"
                  else "el tramo donde la línea toca el saco")
    out.message = (f"{opcion.name} Ø{cifra(opcion.diameter_mm, 2)} × {opcion.length_mm:.0f} mm "
                   f"desplegado de {cifra(a)} a {cifra(b)} mm, centrado en {cuello_txt}.")
    return out


def _quitar_archivos(session_id: str, meshes_dir: Path, nombres) -> list[str]:
    removed: list[str] = []
    for name in nombres:
        path = meshes_dir / name
        if path.exists():
            try:
                path.unlink()
                removed.append(name)
            except OSError as exc:  # noqa: BLE001
                logger.warning("Could not delete %s for %s: %s", name, session_id, exc)
    return removed


def _quitar_lo_que_cuelga_de_la_linea(session_id: str, meshes_dir: Path) -> list[str]:
    """El stent guiado y el IVUS se construyen sobre la línea central: al
    quitarla o sustituirla, dejarlos seguiría una línea que ya no existe."""
    removed = _quitar_archivos(session_id, meshes_dir,
                               ("cl_stent.vtp", "ivus_pullback.u8", "ivus_pullback.json"))
    # A centreline-guided stent is recorded as the session's stent; dropping its
    # geometry without the record would leave the report describing a phantom.
    if "cl_stent.vtp" in removed:
        from services.device_state import read_stent, save_stent
        if (read_stent(session_id) or {}).get("kind") == "centerline":
            save_stent(session_id, None)
    return removed


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

    meshes_dir = session_subdir(session_id, "meshes")
    had = (meshes_dir / "centerline.vtp").exists() or (meshes_dir / "centerline_points.npz").exists()

    removed = _quitar_archivos(session_id, meshes_dir, ("centerline.vtp", "centerline_points.npz"))
    removed += _quitar_lo_que_cuelga_de_la_linea(session_id, meshes_dir)

    logger.info("Cleared centreline for session=%s (%s)", session_id, removed or "nothing")
    return CenterlineClearResult(removed=removed, had_centerline=had)


# ── Ángulo de bifurcación guiado ──────────────────────────────────────────── #

_BIFURCACION = "bifurcacion.json"


def _run_bifurcacion(session_id: str, meshes_dir: Path, req: BifurcacionRequest) -> BifurcacionResult:
    from services.angulo_bifurcacion import medir_bifurcacion
    malla = read_vtp(meshes_dir / "vessel_tree.vtp")
    saco_path = meshes_dir / (read_state(session_id, "morpho.sac_vtp_name", "") or "aneurysm_sac.vtp")
    saco = read_vtp(saco_path) if saco_path.exists() else None
    p = lambda q: (q.x, q.y, q.z)  # noqa: E731
    r = medir_bifurcacion(malla, p(req.madre), p(req.hija_1), p(req.hija_2), saco=saco)
    pos = lambda v: Position3D(x=float(v[0]), y=float(v[1]), z=float(v[2]))  # noqa: E731
    out = BifurcacionResult(
        punto=pos(r.punto), angulo_hijas_deg=round(r.angulo_hijas_deg, 1),
        angulo_hija1_deg=round(r.angulo_hija1_deg, 1), angulo_hija2_deg=round(r.angulo_hija2_deg, 1),
        diametro_madre_mm=round(r.diametro_madre_mm, 2), diametro_hija1_mm=round(r.diametro_hija1_mm, 2),
        diametro_hija2_mm=round(r.diametro_hija2_mm, 2), medido_a_mm=round(r.medido_a_mm, 1),
        sin_saco=r.sin_saco, madre=req.madre, hija_1=req.hija_1, hija_2=req.hija_2,
        linea_1=[pos(v) for v in r.linea1], linea_2=[pos(v) for v in r.linea2])
    (meshes_dir / _BIFURCACION).write_text(out.model_dump_json(), encoding="utf-8")
    return out


@router.post(
    "/centerline/{session_id}/bifurcacion",
    response_model=BifurcacionResult,
    summary="Bifurcation angles from three clicks (parent, daughter 1, daughter 2)",
    description=(
        "Traces two centrelines from the parent point to each daughter (with the deep part of the "
        "measured sac kept out of the mask, so they do not cut through it), finds where they "
        "separate and returns the angle between the daughters and of each daughter against the "
        "parent's straight continuation, measured two parent diameters from the bifurcation. "
        "Saved with the session (meshes/bifurcacion.json)."
    ),
)
async def medir_angulo_bifurcacion(session_id: str, req: BifurcacionRequest) -> BifurcacionResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    meshes_dir = session_subdir(session_id, "meshes")
    if not (meshes_dir / "vessel_tree.vtp").exists():
        raise HTTPException(status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero.")
    try:
        return await asyncio.to_thread(_run_bifurcacion, session_id, meshes_dir, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=mensaje_error("No se pudo medir el ángulo de bifurcación", exc))


@router.get(
    "/centerline/{session_id}/bifurcacion",
    response_model=BifurcacionResult | None,
    summary="The bifurcation angles measured in this session, if any",
)
async def leer_angulo_bifurcacion(session_id: str) -> BifurcacionResult | None:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
    f = session_subdir(session_id, "meshes") / _BIFURCACION
    if not f.exists():
        return None
    try:
        return BifurcacionResult.model_validate_json(f.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — un fichero dañado es como no haber medido
        return None
