"""Coil embolization router."""
from __future__ import annotations

import logging
import math

from fastapi import APIRouter, HTTPException

from models import (
    CoilConstructResult, CoilConstructStep,
    CoilLibraryItem, CoilPlanRequest, CoilPlanResult,
)
from services.coils    import (
    catalogue_to_api, coils_for_aneurysm, estimate_coil_count, COIL_CATALOGUE,
    packing_assessment, suggest_construct, _slug,
    PACKING_AIM, PACKING_MIN, PACKING_MAX,
)
from services.sessions import read_state, session_exists, session_subdir, mesh_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["coils"])


def _load_float(session_id: str, key: str, default: float) -> float:
    try:
        raw = read_state(session_id, key, "")
        return float(raw) if raw else default
    except (ValueError, Exception):
        return default


@router.get(
    "/coils",
    response_model=list[CoilLibraryItem],
    summary="Get coil device library",
    description=(
        "Returns the full endovascular coil library (40+ models: Stryker Target 360°, "
        "Penumbra Ruby, MicroVention HydroCoil, Medtronic Axium). Each entry includes "
        "diameter, length, coil type (framing/filling/finishing) and required microwire."
    ),
)
async def get_coil_library() -> list[CoilLibraryItem]:
    return [CoilLibraryItem(**item) for item in catalogue_to_api()]


@router.get(
    "/coils/recommendations/{session_id}",
    response_model=CoilConstructResult,
    summary="Suggest a coil construct for the measured sac",
    description=(
        "Filters the catalogue by the measured dome diameter and proposes a "
        "framing → filling → finishing sequence sized to reach the planning "
        "target. Without morphometry it returns `feasible: false` rather than "
        "guessing a reference sac.\n\n"
        "This is the catalogue narrowed by published sizing rules, not a "
        "prescription: the operator chooses."
    ),
)
async def get_coil_recommendations(session_id: str) -> CoilConstructResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    dome_mm = _load_float(session_id, "morpho.max_diameter_mm", 0.0)
    volume  = _load_float(session_id, "morpho.volume_mm3", 0.0)
    c = suggest_construct(dome_mm, volume)

    return CoilConstructResult(
        steps=[
            CoilConstructStep(
                coil_id=_slug(s.spec.name),
                name=s.spec.name,
                manufacturer=s.spec.manufacturer,
                diameter_mm=s.spec.diameter_mm,
                length_cm=s.spec.length_cm,
                role=s.role,
                count=s.count,
                rationale=s.rationale,
            )
            for s in c.steps
        ],
        dome_mm=round(c.dome_mm, 2),
        volume_mm3=round(c.volume_mm3, 2),
        projected_packing=c.projected_packing,
        feasible=c.feasible,
        note=c.note,
    )


@router.post(
    "/coils/plan",
    response_model=CoilPlanResult,
    summary="Compute coil embolization plan",
    description=(
        "Accepts a list of coil placements and measures the resulting packing "
        "density from the catalogue wire volumes and the sac volume recorded by "
        "morphometry.\n\n"
        "Returns that measurement and what it supports saying. It deliberately "
        "does NOT return an occlusion percentage: the Raymond-Roy grade is read "
        "off the post-procedure angiogram, and no published curve maps packing "
        "density onto it. "
        f"Warning below {PACKING_MIN * 100:.0f}%; planning aims at "
        f"{PACKING_AIM * 100:.0f}% (Sluzewski et al., AJNR 2004)."
    ),
)
async def plan_coils(req: CoilPlanRequest) -> CoilPlanResult:
    if not session_exists(req.session_id):
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found")

    # Load aneurysm volume from session morphometry (written after morpho computation)
    aneurysm_vol = _load_float(req.session_id, "morpho.volume_mm3", 0.0)

    total_wire_vol = 0.0
    if aneurysm_vol > 0 and req.placements:
        # Compute actual packing density from coil wire volumes
        # Match placed coil IDs back to catalogue entries for wire_volume_mm3
        id_to_spec = {_slug(c.name): c for c in COIL_CATALOGUE}

        for placement in req.placements:
            spec = id_to_spec.get(placement.coil_id)
            if spec:
                total_wire_vol += spec.wire_volume_mm3

        packing = total_wire_vol / aneurysm_vol if aneurysm_vol > 0 else 0.0
        packing = min(packing, PACKING_MAX)
    else:
        # Sin volumen del saco no hay divisor, así que no hay densidad. Antes
        # aquí se rellenaba con 0.08 por coil: un número inventado en el sitio
        # de uno medido. Ver `packing_assessment`.
        packing = 0.0

    assessment = packing_assessment(
        packing, len(req.placements), volume_known=aneurysm_vol > 0,
    )

    # ── Build the coil mass inside the real sac ──────────────────────────── #
    # Antes: cinco esferas de tamaño arbitrario centradas en el ORIGEN DEL
    # CUELLO, así que la maraña quedaba a caballo del cuello en vez de dentro
    # del saco, y su tamaño no significaba nada. Desde el aislamiento de saco
    # (Tier 2) existe `aneurysm_sac.vtp`, que es el cuerpo medido: la masa se
    # dibuja ahí dentro y con el volumen de hilo real, de modo que lo que se ve
    # lleno se corresponde con la densidad que dice la tarjeta.
    coils_url = "/static/sample-meshes/coils_placed.vtp"
    try:
        import time
        from services import devices
        from services.segmentation import read_vtp, write_vtp

        meshes_dir = session_subdir(req.session_id, "meshes")
        sac_name = read_state(req.session_id, "morpho.sac_vtp_name", "")
        sac_path = meshes_dir / sac_name if sac_name else None

        world = None
        if sac_path is not None and sac_path.exists() and total_wire_vol > 0:
            sac = read_vtp(sac_path)
            world, _placed = devices.coil_mass_in_sac(sac, total_wire_vol)
            if world.GetNumberOfPoints() == 0:
                world = None

        if world is None:
            # Sin saco aislado no hay dónde meterlos, así que se cae al proxy de
            # siempre. Pero ya no en el origen del CUELLO, que dejaba la maraña
            # a caballo de él: el centro del saco está a media altura del domo
            # sobre el cuello, siguiendo el eje que mide la morfometría.
            sac_r = ((3.0 * aneurysm_vol) / (4.0 * math.pi)) ** (1.0 / 3.0) if aneurysm_vol > 0 else 3.0
            half_dome = _load_float(req.session_id, "morpho.dome_height_mm", 0.0) / 2.0
            centre = tuple(
                _load_float(req.session_id, f"morpho.neck_origin_{k}", 0.0)
                + half_dome * _load_float(req.session_id, f"morpho.axis_{k}", 0.0)
                for k in ("x", "y", "z")
            )
            local = devices.make_coil_bundle(sac_r * 2.0, n=max(3, len(req.placements)))
            t = devices.pose_transform(centre, (0.0, 0.0, 1.0), 0.0)
            world = devices.apply_transform(local, t)

        write_vtp(world, meshes_dir / "coils_placed.vtp")
        coils_url = f"{mesh_url(req.session_id, 'coils_placed.vtp')}?v={int(time.time() * 1000)}"
    except Exception as exc:
        logger.warning("Coil mesh generation skipped: %s", exc)

    # ── Persist placed coils for the report / session restore ────────────── #
    # Use the API catalogue (JSON-safe: coil_type already a plain string) keyed
    # by its id, which equals the slug the frontend sends as coil_id.
    _id_to_api = {item["id"]: item for item in catalogue_to_api()}
    from services.device_state import save_coils
    save_coils(req.session_id, [
        {
            "index": i + 1,
            "name": _id_to_api.get(pl.coil_id, {}).get("name", pl.coil_id),
            "position": [pl.position.x, pl.position.y, pl.position.z],
            "coil_type": _id_to_api.get(pl.coil_id, {}).get("coil_type", ""),
            "diameter_mm": _id_to_api.get(pl.coil_id, {}).get("diameter_mm", 0.0),
            "length_cm": _id_to_api.get(pl.coil_id, {}).get("length_cm", 0.0),
            "manufacturer": _id_to_api.get(pl.coil_id, {}).get("manufacturer", ""),
        }
        for i, pl in enumerate(req.placements)
    ])

    return CoilPlanResult(
        coils_mesh_url=coils_url,
        total_packing_density=round(packing, 3),
        packing_min=PACKING_MIN,
        meets_minimum=assessment.meets_minimum,
        durability=assessment.durability,
        sources=assessment.sources,
        warning=assessment.warning,
    )
