"""Stent planning router."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models import PlanRequest, PlanResult, StentLibraryItem
from services.endovascular import stent_bridging
from services.sessions import read_state, session_exists, session_subdir, mesh_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["planning"])


def _load_float(session_id: str, key: str, default: float) -> float:
    try:
        raw = read_state(session_id, key, "")
        return float(raw) if raw else default
    except (ValueError, Exception):
        return default

# Realistic stent library (subset)
_STENT_LIBRARY: list[StentLibraryItem] = [
    StentLibraryItem(
        id="pipeline-flex-3.75-25",
        name="Pipeline Flex",
        manufacturer="Medtronic",
        min_diameter_mm=2.5,
        max_diameter_mm=5.0,
        available_lengths_mm=[10, 14, 16, 18, 20, 25, 30, 35],
        type="flow_diverter",
    ),
    StentLibraryItem(
        id="surpass-streamline-4.0-25",
        name="Surpass Streamline",
        manufacturer="Stryker",
        min_diameter_mm=2.0,
        max_diameter_mm=5.0,
        available_lengths_mm=[12, 15, 20, 25, 30, 40],
        type="flow_diverter",
    ),
    StentLibraryItem(
        id="enterprise2-4.5-22",
        name="Enterprise 2",
        manufacturer="Codman",
        min_diameter_mm=3.0,
        max_diameter_mm=4.5,
        available_lengths_mm=[14, 22, 28, 37, 44],
        type="coil_assist",
    ),
    StentLibraryItem(
        id="leo-plus-4.0-25",
        name="Leo Plus",
        manufacturer="Balt",
        min_diameter_mm=2.5,
        max_diameter_mm=5.5,
        available_lengths_mm=[12, 18, 25, 35, 50],
        type="neck_bridge",
    ),
]


@router.get(
    "/stents",
    response_model=list[StentLibraryItem],
    summary="Get stent device library",
    description="Returns all available stent models with their size specifications.",
)
async def get_stent_library() -> list[StentLibraryItem]:
    return _STENT_LIBRARY


@router.post(
    "/plan",
    response_model=PlanResult,
    summary="Compute stent deployment plan",
    description=(
        "Places the selected stent at the aneurysm neck and checks whether it "
        "can bridge that neck. Returns the deployed mesh URL, how much of the "
        "neck plus its landing zones the device spans, and what this planner "
        "does not compute."
    ),
)
async def compute_plan(req: PlanRequest) -> PlanResult:
    if not session_exists(req.session_id):
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")

    import time
    from services import devices
    from services.segmentation import write_vtp

    p = req.stent
    device = next((s for s in _STENT_LIBRARY if s.id == p.stent_id), None)

    # ── Fit check (real, from the device envelope + neck geometry) ───────── #
    # The sizing itself lives in services/endovascular.py, next to the rest of
    # the endovascular knowledge; see the comment there for what this used to
    # compute and why it was wrong.
    neck_mm = _load_float(req.session_id, "morpho.neck_mm", 0.0)
    # El diámetro de la arteria portadora es la referencia real de dimensionado.
    # `morpho.parent_artery_mm` se calcula desde la migración (services/
    # parent_artery.py, cortando la malla por debajo del cuello) y aquí no lo
    # leía nadie, así que el planificador comparaba contra el CUELLO.
    parent_mm = _load_float(req.session_id, "morpho.parent_artery_mm", 0.0)
    fit = stent_bridging(
        neck_mm=neck_mm,
        length_mm=p.length_mm,
        diameter_mm=p.diameter_mm,
        min_diameter_mm=getattr(device, "min_diameter_mm", 0.0),
        max_diameter_mm=getattr(device, "max_diameter_mm", 0.0),
        parent_artery_mm=parent_mm,
    )
    warnings = list(fit.warnings)
    coverage = fit.coverage_pct
    neck_covered = fit.neck_covered_mm
    deployed = fit.deployed

    # ── Build the device geometry ────────────────────────────────────────── #
    # Cuando hay línea central, el dispositivo la SIGUE. Antes esta pestaña
    # dibujaba siempre un cilindro recto perpendicular al eje del cuello, que
    # en una arteria curva atraviesa la pared; y el transporte paralelo que lo
    # resuelve ya estaba escrito en services/stent_deployment.py, usado sólo
    # por la pestaña «Stent CL». Dos geometrías para el mismo dispositivo.
    stent_url = "/static/sample-meshes/stent_deployed.vtp"
    follows_centerline = False
    meshes_dir = session_subdir(req.session_id, "meshes")
    points_path = meshes_dir / "centerline_points.npz"
    try:
        world = None
        if points_path.exists():
            try:
                import numpy as np
                from services.stent_deployment import (
                    arc_window_around, deploy_stent_on_centerline,
                )
                data = np.load(points_path)
                s0, s1 = arc_window_around(
                    data["points"],
                    (p.position.x, p.position.y, p.position.z),
                    p.length_mm,
                )
                cl = deploy_stent_on_centerline(
                    data["points"], data["radii"],
                    stent_diameter_mm=p.diameter_mm,
                    start_arc_mm=s0, end_arc_mm=s1,
                )
                world = cl.stent_poly_data
                follows_centerline = True
            except Exception as exc:   # noqa: BLE001 — se cae al tubo recto
                logger.warning("Centreline stent failed, falling back: %s", exc)
                world = None

        if world is None:
            axis = (
                _load_float(req.session_id, "morpho.axis_x", 0.0),
                _load_float(req.session_id, "morpho.axis_y", 0.0),
                _load_float(req.session_id, "morpho.axis_z", 1.0),
            )
            # Flow diverter runs along the parent artery ≈ perpendicular to neck→dome.
            stent_dir = devices.perpendicular(axis)
            local = devices.make_stent(p.diameter_mm, p.length_mm)
            t = devices.pose_transform(
                (p.position.x, p.position.y, p.position.z), stent_dir, p.rotation_deg
            )
            world = devices.apply_transform(local, t)

        write_vtp(world, meshes_dir / "stent_deployed.vtp")
        stent_url = f"{mesh_url(req.session_id, 'stent_deployed.vtp')}?v={int(time.time() * 1000)}"
    except Exception as exc:
        logger.warning("Stent mesh generation skipped: %s", exc)

    if follows_centerline:
        fit.notes.append(
            "El dispositivo sigue la línea central extraída, así que respeta la "
            "curvatura real de la arteria."
        )
    else:
        fit.notes.append(
            "Sin línea central, el dispositivo se dibuja como un tubo recto: en "
            "una arteria curva es una aproximación grosera. Extrae la línea "
            "central para que siga el vaso."
        )

    # ── Persist the deployed stent for the report / session restore ──────── #
    from services.device_state import save_stent
    save_stent(req.session_id, {
        "name": getattr(device, "name", p.stent_id),
        "manufacturer": getattr(device, "manufacturer", ""),
        "diameter_mm": p.diameter_mm,
        "length_mm": p.length_mm,
        "coverage_pct": coverage,
        # `kind` dice QUÉ MAGNITUD lleva `coverage_pct`, no qué forma tiene la
        # malla: sigue siendo el planificador de cuello aunque ahora la
        # geometría siga la línea central. El informe lo lee así.
        "kind": "straight",
        "sizing": fit.sizing,
        "parent_artery_mm": fit.parent_artery_mm,
        "follows_centerline": follows_centerline,
    })

    return PlanResult(
        stent_mesh_url=stent_url,
        coverage_pct=coverage,
        neck_diameter_covered_mm=round(neck_covered, 2),
        required_length_mm=fit.required_length_mm,
        deployed=deployed,
        sizing=fit.sizing,
        parent_artery_mm=fit.parent_artery_mm,
        follows_centerline=follows_centerline,
        notes=fit.notes,
        sources=fit.sources,
        warning=" ".join(warnings) if warnings else None,
    )
