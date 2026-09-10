"""Perforator risk detection router — wires real compute_perforator_risk()."""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models import PerforatorCandidate, PerforatorsResult, Position3D
from models.perforators import RISK_COLORS, RISK_LABELS
from services.sessions import read_state, session_exists, session_subdir
from services.perforator_risk import compute_perforator_risk
from services.segmentation import read_vtp, write_vtp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["perforators"])

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="prf-worker")

# Default zone radii (mm): high / medium / low risk
_ZONE_RADII = (3.0, 5.0, 8.0)


# ── GET /perforators/{session_id} ─────────────────────────────────────────── #

@router.get(
    "/perforators/{session_id}",
    response_model=PerforatorsResult,
    summary="Detect perforator vessels at risk",
    description=(
        "Lists the VISIBLE BRANCH ORIGINS near the aneurysm neck: points where a "
        "thin vessel attaches to a thicker one, found by measuring calibre on the "
        "mesh — distance transform plus an inward march along the normals.\n\n"
        "**These are not perforators.** A true perforator is 0.1-0.5 mm and CT or "
        "MR angiography does not resolve it, so it never reaches the mesh. "
        "`calibre_floor_mm` states the diameter this scan could not have seen, so "
        "an empty list is not evidence that there are none.\n\n"
        "The scan runs on the FULL tree when segmentation finishes and is frozen "
        "in world coordinates: cropping to a ROI overwrites the mesh, so anything "
        "outside the box would otherwise be lost, and the open rim left by the cut "
        "would read as a branch that is not there.\n\n"
        "**Risk zones** (centred on neck origin):\n"
        "- Zone 1 (high / red)   — ≤ 3 mm from neck\n"
        "- Zone 2 (medium / yellow) — 3–5 mm from neck\n"
        "- Zone 3 (low / green)  — 5–8 mm from neck\n\n"
        "The tagged mesh (`perforators_risk.vtp`) is also written to the session "
        "for colour-mapped 3D display.\n\n"
        "**Best results:** run `POST /detect` and `GET /morphometry` first so the "
        "neck origin is accurate.  Falls back to the first detected candidate's "
        "centroid when morphometry has not been run."
    ),
)
async def get_perforators(session_id: str) -> PerforatorsResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    vtp_path   = meshes_dir / "vessel_tree.vtp"

    if not vtp_path.exists():
        raise HTTPException(
            status_code=422,
            detail="No segmented mesh found. Run POST /segment and POST /detect first.",
        )

    # ── Resolve neck origin ───────────────────────────────────────────── #
    # Priority 1: neck_origin from morphometry (most accurate)
    # Priority 2: centroid of best detected candidate (good fallback)
    # Priority 3: (0, 0, 0) — last resort when nothing else is available
    neck_origin = _resolve_neck_origin(session_id)

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            partial(
                _run_perforators_sync,
                session_id=session_id,
                vtp_path=vtp_path,
                meshes_dir=meshes_dir,
                neck_origin=neck_origin,
            ),
        )
    except Exception as exc:
        logger.error("Perforators failed for session %s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Perforator detection error: {exc}") from exc

    return result


def _resolve_neck_origin(session_id: str) -> tuple[float, float, float]:
    """Return neck_origin from morphometry state, candidate centroid, or (0,0,0)."""
    def _f(key: str) -> str:
        return read_state(session_id, key, "")

    # Priority 1: saved by morphometry endpoint
    ox, oy, oz = _f("morpho.neck_origin_x"), _f("morpho.neck_origin_y"), _f("morpho.neck_origin_z")
    if ox and oy and oz:
        try:
            return (float(ox), float(oy), float(oz))
        except ValueError:
            pass

    # Priority 2: centroid of best candidate (saved by detect endpoint)
    cx, cy, cz = _f("detect.cand_001.centroid_x"), _f("detect.cand_001.centroid_y"), _f("detect.cand_001.centroid_z")
    if cx and cy and cz:
        try:
            logger.warning(
                "Morphometry not run — using candidate centroid as neck origin for session %s",
                session_id,
            )
            return (float(cx), float(cy), float(cz))
        except ValueError:
            pass

    logger.warning("No neck origin available for session %s — using (0,0,0)", session_id)
    return (0.0, 0.0, 0.0)


def _run_perforators_sync(
    session_id:  str,
    vtp_path:    Path,
    meshes_dir:  Path,
    neck_origin: tuple[float, float, float],
) -> PerforatorsResult:
    """Load full vessel VTP → run perforator risk → write tagged VTP → return result."""
    poly = read_vtp(vtp_path)

    if poly.GetNumberOfPoints() == 0:
        logger.warning("Vessel mesh is empty for session %s — no perforators found", session_id)
        return PerforatorsResult(
            candidates=[], high_count=0, medium_count=0, low_count=0,
            search_radius_mm=_ZONE_RADII[2], zone_radii_mm=list(_ZONE_RADII),
        )

    from services.branch_origins import scan_and_freeze, thaw_scan

    # El barrido congelado del árbol COMPLETO, si lo hay. Se prefiere al que se
    # haría ahora sobre `vessel_tree.vtp`, porque ese fichero puede haber sido
    # sobrescrito por un recorte de ROI y las ramas de fuera de la caja ya no
    # estarían. Las coordenadas son de mundo, así que siguen cayendo donde deben
    # sobre la malla recortada.
    scan = thaw_scan(session_id)
    if scan is None:
        logger.info("No frozen branch scan for %s — scanning the current mesh", session_id)
        scan = scan_and_freeze(session_id, poly)

    # La malla teñida por zonas, para el color en el visor 3D.
    risk_result = compute_perforator_risk(
        vessel_poly=poly, neck_origin=neck_origin, zone_radii=_ZONE_RADII,
    )
    write_vtp(risk_result.risk_poly, meshes_dir / "perforators_risk.vtp")

    # ── Orígenes de rama → candidatos, con su distancia al cuello ─────── #
    import math

    origin = neck_origin
    candidates: list[PerforatorCandidate] = []
    scored = []
    for o in scan.origins:
        d = math.dist(o.position, origin)
        if d > _ZONE_RADII[2]:
            continue                       # fuera de la zona de interés
        rl = 1 if d <= _ZONE_RADII[0] else 2 if d <= _ZONE_RADII[1] else 3
        scored.append((d, rl, o))
    scored.sort(key=lambda t: t[0])

    for i, (d, rl, o) in enumerate(scored, start=1):
        candidates.append(
            PerforatorCandidate(
                id=f"br-{i:03d}",
                position_mm=Position3D(x=o.position[0], y=o.position[1], z=o.position[2]),
                # Medido sobre la malla, no una constante: antes todos los
                # candidatos salían con 0.4 mm porque el detector de valencia no
                # calculaba calibre y el campo se rellenaba con un valor «típico».
                radius_mm=max(0.1, min(5.0, round(o.calibre_mm / 2.0, 2))),
                distance_to_neck_mm=round(d, 2),
                risk_level=rl,
                risk_label=RISK_LABELS[rl],
                risk_color=RISK_COLORS[rl],
            )
        )

    high   = sum(1 for c in candidates if c.risk_level == 1)
    medium = sum(1 for c in candidates if c.risk_level == 2)
    low    = sum(1 for c in candidates if c.risk_level == 3)

    logger.info(
        "Perforators complete — session=%s  candidates=%d  (H=%d M=%d L=%d)",
        session_id, len(candidates), high, medium, low,
    )

    return PerforatorsResult(
        candidates     = candidates,
        high_count     = high,
        medium_count   = medium,
        low_count      = low,
        search_radius_mm = float(_ZONE_RADII[2]),
        zone_radii_mm  = [float(r) for r in _ZONE_RADII],
        calibre_floor_mm = scan.calibre_floor_mm,
        scanned_mesh_points = scan.mesh_points,
    )
