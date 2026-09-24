"""Detection and morphometry router — wires real AneurysmDetector + MorphometricAnalyzer."""
from __future__ import annotations

import asyncio
import time
import logging
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models import (
    AneurysmCandidate as PydAneurysmCandidate,
    AneurysmDetectionResult,
    DetectionDiagnostics,
    MorphometryResult,
    NeckPlaneRequest,
    Position3D,
)
from services.sessions import (
    read_state, session_exists, session_subdir, write_state, write_states, mesh_url,
)
from services.aneurysm_detector import AneurysmDetector, AneurysmCandidate as DetCandidate
from services.morphometrics import MorphometricAnalyzer
from services.sac_isolation import isolate_closed_sac, isolate_sac_volumetric
from services.perforator_risk import neck_origin_from_morpho
from services.segmentation import read_vtp, write_vtp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["detection"])

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="det-worker")

# Modalities that produce noisy 3DRA meshes needing the XA preset
_XA_MODALITIES = {"XA", "RF", "DX", "CR", "DR"}


def _clamp01(v: float) -> float:
    """Clamp a shape index to the [0, 1] the API contract (and the PDF) assume."""
    return min(1.0, max(0.0, v))


#: Cuántos sitios se ofrecen. Es una LISTA CORTA para recorrer, no un
#: veredicto: el clínico los mira todos.
_MAX_CANDIDATES: int = 5


def _detector_for_modality(modality: str) -> AneurysmDetector:
    """Build the detector with the modality preset.

    XA/3DRA meshes are much noisier than CTA, so they need heavier Laplacian
    pre-smoothing and lower curvature percentiles or the hard gates reject
    every real dome.

    Por qué la fracción de gauss+ bajó de 0.55 a 0.40
    -------------------------------------------------
    Medido sobre case 3, el único caso con diagnóstico médico: el detector
    generaba 144 regiones y devolvía UNA, y no era la buena. La lesión que los
    médicos sitúan en el tronco basilar salía como la región **mejor puntuada**
    (214 puntos, score 0.52) y la tiraba este umbral, por tener una fracción de
    curvatura gaussiana positiva de 0.42.

    El motivo es estructural: una región grande llega hasta el cuello, y el
    cuello es una silla de montar — curvatura negativa. **Cuanto mejor recorta
    la cúpula, peor puntúa aquí.** En las ocho regiones de case 3 la correlación
    entre tamaño y fracción gauss+ es −0.29, y la fracción más alta (0.75) es
    una mota de veinte puntos.

    Con 0.40, y con el radio ya medido sobre la esfera ajustada en vez del
    parche (`_dome_radius_mm`), la lesión del tronco **entra en la lista**.

    Lo que NO se promete es el orden. Entre dos mallas del mismo estudio que
    difieren en 17 vértices de 12 776 esa misma lesión pasa del puesto 1 al 4,
    con el pipeline siendo determinista: los cuatro primeros puntúan entre 0,40
    y 0,57 y la puntuación no los separa. Ver `test_detector_case3.py`.

    Así que esto es una **lista corta**, no un veredicto — y por eso la pantalla
    dejó de etiquetar al primero como «Principal».
    """
    if modality.upper() in _XA_MODALITIES:
        return AneurysmDetector(
            gauss_percentile          = 60.0,
            mean_curv_gate_percentile = 40.0,
            # Radio de la cúpula, no del parche: 1.25 mm ≈ un aneurisma de
            # 2.5 mm de diámetro, por debajo del corte de «tratar o vigilar».
            min_radius_mm             = 1.25,
            max_radius_mm             = 20.0,
            min_points                = 4,
            min_positive_gauss_frac   = 0.40,
            min_sphericity            = 0.25,
            pre_smooth_iterations     = 25,
        )
    return AneurysmDetector(
        gauss_percentile          = 85.0,
        mean_curv_gate_percentile = 75.0,
        min_radius_mm             = 1.0,
        max_radius_mm             = 20.0,
        min_points                = 8,
        # Mismo razonamiento, con margen: en TC las mallas son mucho más
        # densas y aflojar de más llena la lista de hueso.
        min_positive_gauss_frac   = 0.50,
        min_sphericity            = 0.35,
        pre_smooth_iterations     = 10,
    )


# ── POST /detect/{session_id} ──────────────────────────────────────────────── #

# ── Clearing detection + morphometry ──────────────────────────────────────── #

#: Morphometry state is written per-metric rather than as one blob, so clearing
#: it means listing the keys. `morpho.plane_*` matters most: a manually marked
#: neck plane is REUSED by every later morphometry call, so a plane left over
#: from an edited mesh keeps re-measuring against geometry that has moved.
_MORPHO_STATE_KEYS = (
    "morpho.plane_origin_x", "morpho.plane_origin_y", "morpho.plane_origin_z",
    "morpho.plane_normal_x", "morpho.plane_normal_y", "morpho.plane_normal_z",
    "morpho.plane_seed_x", "morpho.plane_seed_y", "morpho.plane_seed_z",
    "morpho.neck_origin_x", "morpho.neck_origin_y", "morpho.neck_origin_z",
    "morpho.axis_x", "morpho.axis_y", "morpho.axis_z",
    "morpho.max_diameter_mm", "morpho.neck_mm", "morpho.neck_perimeter_mm",
    "morpho.dome_height_mm",
    "morpho.volume_mm3", "morpho.surface_area_mm2",
    "morpho.ar", "morpho.dnr", "morpho.bf", "morpho.ui",
    "morpho.compactness", "morpho.rupture_risk",
    "morpho.neck_source", "morpho.neck_tilt_deg", "morpho.parent_artery_mm",
    # El saco aislado y los puntos del borde. Sin esto, «Limpiar candidatos y
    # morfometría» dejaba el saco verde pintado en el visor y los puntos del
    # cuello listos para reaparecer al reanudar: una medida borrada que seguía
    # viéndose.
    "morpho.sac_vtp_name", "morpho.rim_points",
)


def _clear_detection_state(session_id: str, meshes_dir: Path, *, morphometry: bool) -> int:
    """Drop candidate meshes + their state. Returns how many files were deleted.

    Re-running the detector used to leave the previous run's candidate files and
    `detect.cand_*` keys in place, so a run that found fewer candidates than the
    last one kept the extra ones on disk and in the state the report reads.
    """
    removed = 0
    for path in meshes_dir.glob("aneurysm_cand_*.vtp"):
        try:
            path.unlink()
            removed += 1
        except OSError as exc:  # noqa: BLE001
            logger.warning("Could not delete %s: %s", path.name, exc)

    # Candidate indices are 1-based and bounded by the previous run's count.
    try:
        previous = int(read_state(session_id, "detect.n_candidates", "0") or 0)
    except ValueError:
        previous = 0
    for i in range(1, max(previous, removed) + 1):
        prefix = f"detect.cand_{i:03d}"
        for suffix in ("vtp_name", "url", "centroid_x", "centroid_y", "centroid_z",
                       "diameter_mm", "score", "channels", "patch_kind"):
            write_state(session_id, f"{prefix}.{suffix}", "")
    write_state(session_id, "detect.n_candidates", "0")
    write_state(session_id, "detect.best_vtp_name", "")

    if morphometry:
        for key in _MORPHO_STATE_KEYS:
            write_state(session_id, key, "")
        # Y el fichero del saco, no solo su clave: dejarlo en disco hacía que
        # una sesión reanudada volviera a pintarlo.
        sac = meshes_dir / "aneurysm_sac.vtp"
        if sac.exists():
            try:
                sac.unlink()
                removed += 1
            except OSError as exc:  # noqa: BLE001
                logger.warning("Could not delete %s: %s", sac.name, exc)
        # The recommendation and the PHASES score are computed FROM the
        # morphometry, so they describe measurements that no longer exist.
        # Leaving them behind made the PDF recommend a treatment for an
        # aneurysm the same PDF reported as unmeasured.
        from routers.treatment import clear_treatment_state
        clear_treatment_state(session_id)

    return removed


@router.delete(
    "/detect/{session_id}",
    summary="Clear detected candidates and their morphometry",
    description=(
        "Removes the candidate dome meshes, the detection state and the "
        "morphometry derived from them — including a manually marked neck "
        "plane, which is otherwise reapplied to every later measurement. "
        "Use it to start the analysis over on an edited mesh. Idempotent."
    ),
)
async def clear_detection(session_id: str) -> dict:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    meshes_dir = session_subdir(session_id, "meshes")
    removed = await asyncio.to_thread(
        _clear_detection_state, session_id, meshes_dir, morphometry=True
    )
    logger.info("Cleared detection for session=%s (%d candidate mesh(es))", session_id, removed)
    return {"status": "cleared", "candidate_meshes_removed": removed}


@router.post(
    "/detect/{session_id}",
    response_model=AneurysmDetectionResult,
    summary="Detect aneurysm candidates in the segmented mesh",
    description=(
        "Runs the v6 aneurysm detector on the stored vessel-tree mesh.\n\n"
        "**Algorithm:** Gaussian curvature thresholding → connected-component "
        "analysis → 3 hard shape gates (positive_gauss_frac, compactness, "
        "sphericity) → composite score.\n\n"
        "Each candidate is written as an isolated `.vtp` mesh and its URL is "
        "returned so vtk.js can render individual domes.\n\n"
        "**Prerequisite:** `POST /segment` must be called first."
    ),
)
async def detect_aneurysm(session_id: str) -> AneurysmDetectionResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir = session_subdir(session_id, "meshes")
    vtp_path   = meshes_dir / "vessel_tree.vtp"

    if not vtp_path.exists():
        raise HTTPException(
            status_code=422,
            detail="No segmented mesh found. Run POST /segment first.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            partial(
                _run_detection_sync,
                session_id=session_id,
                vtp_path=vtp_path,
                meshes_dir=meshes_dir,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Detection failed for session %s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection error: {exc}") from exc

    return result


def _run_detection_sync(
    session_id: str,
    vtp_path:   Path,
    meshes_dir: Path,
) -> AneurysmDetectionResult:
    """Load VTP → run AneurysmDetector → write candidate VTPs → update state."""
    # Start from a clean slate: a run that finds fewer candidates than the last
    # one must not leave the extra domes on disk and in the report's state.
    _clear_detection_state(session_id, meshes_dir, morphometry=False)

    poly = read_vtp(vtp_path)

    if poly.GetNumberOfPoints() == 0:
        raise ValueError("Segmented mesh has no geometry. Re-run segmentation.")

    modality   = read_state(session_id, "dicom.modality") or "CT"
    detector   = _detector_for_modality(modality)
    logger.info("Detection preset for modality %s", modality)
    det_result = detector.detect(poly)

    # ── Consenso de tres criterios ────────────────────────────────────── #
    #
    # La curvatura sola no bastaba: sobre case 3 devolvía cinco candidatos, los
    # cinco en la chapa de la parte inferior, y la lesión que el clínico
    # confirma —el punto de MAYOR CALIBRE del árbol, radio 2,33 mm contra una
    # mediana de 0,57— no salía en ninguno. No destaca por curvatura; destaca
    # por grosor. Ver services/aneurysm_consensus.py.
    from services.aneurysm_consensus import (consensus, hit_confidence,
                                             hit_diameter_mm, hit_patch)

    hits = consensus(poly, detector, top=_MAX_CANDIDATES)

    pyd_candidates: list[PydAneurysmCandidate] = []

    for rank, hit in enumerate(hits, start=1):
        cand_name = f"aneurysm_cand_{rank:03d}.vtp"
        patch, patch_kind = hit_patch(poly, hit)
        write_vtp(patch, meshes_dir / cand_name)
        url = mesh_url(session_id, cand_name)
        diameter = hit_diameter_mm(hit)
        confidence = hit_confidence(hit)

        # Persist candidate metadata to session state.
        # En UN lote: las nueve claves de un candidato describen el mismo
        # objeto y no tiene sentido que puedan quedar a medias. Escritas de
        # una en una, cada una reescribía el fichero entero, y en una sesión
        # real eso dejó un candidato sin `centroid_x` —que se lee como 0.0,
        # o sea desplazado al origen— y otro sin `score`.
        prefix = f"detect.cand_{rank:03d}"
        write_states(session_id, {
            f"{prefix}.vtp_name":    cand_name,
            f"{prefix}.url":         url,
            f"{prefix}.centroid_x":  str(hit.position[0]),
            f"{prefix}.centroid_y":  str(hit.position[1]),
            f"{prefix}.centroid_z":  str(hit.position[2]),
            f"{prefix}.diameter_mm": str(diameter),
            f"{prefix}.score":       str(confidence),
            f"{prefix}.channels":    ",".join(hit.channels),
            f"{prefix}.patch_kind":  patch_kind,
        })

        pyd_candidates.append(
            PydAneurysmCandidate(
                id=f"cand-{rank:03d}",
                center_mm=Position3D(x=hit.position[0], y=hit.position[1],
                                     z=hit.position[2]),
                max_diameter_mm=diameter,
                confidence=round(confidence, 4),
                dome_mesh_url=url,
                selected=(rank == 1),
                channels=hit.channels,
                patch_kind=patch_kind,
            )
        )

    # Persist summary for downstream morphometry / perforators
    write_state(session_id, "detect.n_candidates", str(len(pyd_candidates)))
    if pyd_candidates:
        write_state(session_id, "detect.best_vtp_name", f"aneurysm_cand_001.vtp")
    else:
        # No aneurysm found — clear any stale state from a previous run
        write_state(session_id, "detect.best_vtp_name", "")

    logger.info(
        "Detection complete — session=%s  candidates=%d",
        session_id, len(pyd_candidates),
    )

    return AneurysmDetectionResult(
        found=len(pyd_candidates) > 0,
        candidates=pyd_candidates,
        # Carried out so an empty result can explain itself. On a complete mesh
        # the size gate rejects the vast majority: high-curvature patches merge
        # across several vessels and their equivalent radius exceeds the bound.
        diagnostics=DetectionDiagnostics(
            regions_analyzed        = det_result.n_regions_total,
            rejected_too_few_points = det_result.n_failed_points,
            rejected_size           = det_result.n_failed_size,
            rejected_mean_curvature = det_result.n_failed_mean_curv,
            rejected_positive_gauss = det_result.n_failed_pgf,
            rejected_compactness    = det_result.n_failed_compact,
            rejected_sphericity     = det_result.n_failed_sphericity,
            merged                  = det_result.n_merged,
            removed_components      = det_result.n_removed_components,
            min_radius_mm           = detector.min_radius_mm,
            max_radius_mm           = detector.max_radius_mm,
        ),
    )


# ── GET /morphometry/{session_id} ─────────────────────────────────────────── #

@router.get(
    "/morphometry/{session_id}",
    response_model=MorphometryResult,
    summary="Compute aneurysm morphometry",
    description=(
        "Runs the full morphometric analysis on the best-scoring candidate "
        "mesh from the most recent detection run.\n\n"
        "Returns all clinical indices:\n"
        "- **DNR** (Dome-to-Neck Ratio) — risk ↑ if > 2.0\n"
        "- **AR** (Aspect Ratio) — risk ↑ if > 1.6\n"
        "- **BF** (Bottleneck Factor) — wide neck if > 1.5\n"
        "- **UI** (Undulation Index) — irregular dome if > 0.15\n"
        "- **EI** (Ellipticity Index) — non-spherical if > 0.35\n"
        "- **NSI** (Non-Sphericity Index)\n\n"
        "Neck origin is saved to session state for the perforators endpoint.\n\n"
        "**Prerequisite:** `POST /detect/{session_id}` must be called first."
    ),
)
async def get_morphometry(session_id: str) -> MorphometryResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    best_vtp_name = read_state(session_id, "detect.best_vtp_name", "")
    if not best_vtp_name:
        raise HTTPException(
            status_code=422,
            detail=(
                "No aneurysm candidate available. "
                "Run POST /detect/{session_id} first."
            ),
        )

    meshes_dir = session_subdir(session_id, "meshes")
    vtp_path   = meshes_dir / best_vtp_name

    if not vtp_path.exists():
        raise HTTPException(
            status_code=422,
            detail=f"Candidate mesh '{best_vtp_name}' not found on disk. Re-run detection.",
        )

    # A neck plane the user defined earlier is sticky: re-measuring the session
    # (e.g. after «Reanudar», which replays this endpoint) must reproduce the
    # manual closed-sac result, not fall back to the unreliable automatic one.
    saved_plane = _read_saved_neck_plane(session_id)

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            partial(
                _run_morphometry_sync,
                session_id=session_id,
                vtp_path=vtp_path,
                neck_plane=saved_plane,
            ),
        )
    except ValueError as exc:
        if saved_plane is None:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        # The stored plane no longer isolates a sac (mesh re-segmented, say).
        # Keep it on record — the user may just need to re-mark — but answer
        # with the automatic analysis instead of failing the whole step.
        logger.warning("Stored neck plane no longer valid for %s (%s) — using auto",
                       session_id, exc)
        result = await loop.run_in_executor(
            _executor,
            partial(_run_morphometry_sync, session_id=session_id, vtp_path=vtp_path),
        )
    except Exception as exc:
        logger.error("Morphometry failed for session %s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Morphometry error: {exc}") from exc

    return result


def _read_saved_neck_plane(session_id: str) -> NeckPlaneRequest | None:
    """Rebuild the user's neck plane from session state, or None if never set.

    Written by `_run_morphometry_sync` on every manual (Tier-2) run and copied
    verbatim into session snapshots, so it survives save → restore.
    """
    def _f(key: str) -> float | None:
        raw = read_state(session_id, key, "")
        try:
            return float(raw) if raw != "" else None
        except ValueError:
            return None

    ox, oy, oz = _f("morpho.plane_origin_x"), _f("morpho.plane_origin_y"), _f("morpho.plane_origin_z")
    nx, ny, nz = _f("morpho.plane_normal_x"), _f("morpho.plane_normal_y"), _f("morpho.plane_normal_z")
    if None in (ox, oy, oz, nx, ny, nz):
        return None
    if nx == 0.0 and ny == 0.0 and nz == 0.0:
        return None

    sx, sy, sz = _f("morpho.plane_seed_x"), _f("morpho.plane_seed_y"), _f("morpho.plane_seed_z")
    seed = None if None in (sx, sy, sz) else Position3D(x=sx, y=sy, z=sz)

    return NeckPlaneRequest(
        origin=Position3D(x=ox, y=oy, z=oz),
        normal=[nx, ny, nz],
        dome_seed=seed,
        rim_points=_read_rim_points(session_id),
    )


def _read_rim_points(session_id: str) -> list[Position3D]:
    """The points the user marked around the rim, as stored.

    Persisted because they cost real effort to place well: the plane can be
    rebuilt from its origin and normal alone, but without the points a resumed
    session shows the measurement with no marks in the scene, and refining it
    means starting the marking over.
    """
    raw = read_state(session_id, "morpho.rim_points", "")
    if not raw:
        return []
    out: list[Position3D] = []
    for triple in raw.split(";"):
        parts = triple.split(",")
        if len(parts) != 3:
            continue
        try:
            out.append(Position3D(x=float(parts[0]), y=float(parts[1]), z=float(parts[2])))
        except ValueError:
            continue
    return out


@router.post(
    "/morphometry/{session_id}/neck-plane",
    response_model=MorphometryResult,
    summary="Morphometry from a user-defined neck plane (closed-sac)",
    description=(
        "Semi-automatic Tier-2 morphometry. The user supplies a **neck plane** "
        "(a point on the neck and a normal pointing toward the dome). The "
        "backend clips the vessel tree at the plane, keeps the dome-side "
        "connected component, caps it into a **closed watertight sac**, and "
        "measures the neck directly from the clip contour.\n\n"
        "Use this when the automatic analysis returns `reliable=false` (the "
        "detector isolated an open surface cap, on which volume/neck degenerate)."
    ),
)
async def morphometry_neck_plane(
    session_id: str,
    request:    NeckPlaneRequest,
) -> MorphometryResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    meshes_dir  = session_subdir(session_id, "meshes")
    vessel_path = meshes_dir / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise HTTPException(
            status_code=422,
            detail="vessel_tree.vtp no encontrado. Ejecute la segmentación primero.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            partial(
                _run_morphometry_sync,
                session_id=session_id,
                vtp_path=vessel_path,      # parent dir holds vessel_tree.vtp + sac output
                neck_plane=request,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Neck-plane morphometry failed for %s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Morphometry error: {exc}") from exc

    return result


#: Las medidas de las que dependen la recomendación, el perfil endovascular y el
#: PHASES. Si alguna cambia, lo que se calculó con las anteriores describe un
#: aneurisma que ya no es el medido.
_DECISION_INPUTS: tuple[str, ...] = (
    "morpho.neck_mm", "morpho.ar", "morpho.dnr",
    "morpho.max_diameter_mm", "morpho.bf", "morpho.ui",
)


def _snapshot_decision_inputs(session_id: str) -> dict[str, str]:
    return {k: read_state(session_id, k, "") for k in _DECISION_INPUTS}


def _invalidate_stale_decision(session_id: str, before: dict[str, str]) -> None:
    """Tira la recomendación cuando las medidas de las que salió han cambiado.

    Sólo cuando cambian. Reanudar una sesión vuelve a pasar por aquí para
    reproducir el plano del cuello marcado a mano, y borrar la decisión en cada
    lectura la haría desaparecer por abrir el paso de morfometría.

    El caso que esto arregla: la morfometría automática de un casquete abierto
    da cuello 0, se evalúa el tratamiento igualmente —con el factor del cuello
    saltado— y después se marca el plano a mano y el cuello pasa a medir 3 mm.
    La recomendación guardada seguía siendo la anterior, y el informe la imprimía
    junto a la medida nueva. `_clear_detection_state` ya protegía la otra ruta,
    la de re-detectar, con este mismo razonamiento escrito al lado.
    """
    after = _snapshot_decision_inputs(session_id)
    changed = [k for k in _DECISION_INPUTS if not _same_measure(before[k], after[k])]
    if not changed:
        return
    if not read_state(session_id, "treatment.recommendation_key", ""):
        return          # no había nada que invalidar
    from routers.treatment import clear_treatment_state

    logger.info("Morphometry changed (%s) — clearing the stale treatment decision "
                "for session %s", ", ".join(changed), session_id)
    clear_treatment_state(session_id)


def _same_measure(a: str, b: str) -> bool:
    """Igualdad tolerante: las medidas viajan como texto de un float."""
    if a == b:
        return True
    try:
        return abs(float(a or 0.0) - float(b or 0.0)) < 1e-6
    except ValueError:
        return False


def _run_morphometry_sync(
    session_id: str,
    vtp_path:   Path,
    neck_plane: NeckPlaneRequest | None = None,
) -> MorphometryResult:
    """Load candidate VTP → run MorphometricAnalyzer → persist state → return result.

    When *neck_plane* is given (semi-automatic Tier 2), the vessel tree is
    clipped at the user's neck plane into a closed watertight sac, the neck is
    measured from the clip contour, and morphometry runs on that sac — yielding
    valid volume/DNR/AR/BF instead of the degenerate numbers an open detector
    cap produces.
    """
    before = _snapshot_decision_inputs(session_id)
    analyzer    = MorphometricAnalyzer()
    neck_source = "auto"
    plane_arg   = None
    neck_tilt_deg = 0.0
    used_plane: tuple[tuple[float, float, float], tuple[float, float, float]] | None = None
    sac_hit_crop = False

    if neck_plane is not None:
        # ── Semi-automatic closed-sac isolation ───────────────────────────── #
        rim = getattr(neck_plane, "rim_points", None) or []

        if neck_plane.dome_seed is not None:
            seed = (neck_plane.dome_seed.x, neck_plane.dome_seed.y, neck_plane.dome_seed.z)
        else:
            seed = None

        if len(rim) >= 3 and seed is not None:
            # Orientation from the marked rim, not from the neck→dome axis.
            from services.sac_isolation import fit_plane_to_rim

            o, n, neck_tilt_deg = fit_plane_to_rim(
                [(p.x, p.y, p.z) for p in rim], seed,
            )
            origin = tuple(float(v) for v in o)
            normal = tuple(float(v) for v in n)
            neck_source = "rim"
            logger.info(
                "Neck plane fitted to %d rim points — %.1f° from the dome axis",
                len(rim), neck_tilt_deg,
            )
        else:
            origin = (neck_plane.origin.x, neck_plane.origin.y, neck_plane.origin.z)
            nrm    = np.asarray(neck_plane.normal, dtype=float)
            nrm    = nrm / (np.linalg.norm(nrm) or 1.0)
            normal = tuple(float(v) for v in nrm)
            # Replaying a saved plane: the stored origin/normal ARE the fitted
            # ones, so a rim fit must not be relabelled as the coarser method
            # just because the rim points are not resent.
            if read_state(session_id, "morpho.neck_source", "") == "rim":
                neck_source = "rim"
                try:
                    neck_tilt_deg = float(read_state(session_id, "morpho.neck_tilt_deg", "0") or 0)
                except ValueError:
                    neck_tilt_deg = 0.0

        if seed is None:
            seed = tuple(origin[i] + 3.0 * normal[i] for i in range(3))

        # The two user clicks (neck point + dome apex) size the sac: their
        # distance is roughly the dome height, so bound the isolation to a
        # sphere of that radius around the apex — keeping parent vessels that
        # cross the neck plane out of the sac.
        apex_dist  = float(np.linalg.norm(np.asarray(seed) - np.asarray(origin)))
        bound_r    = apex_dist * 1.25 + 1.5
        crop_half  = max(12.0, apex_dist * 1.35 + 6.0)

        sac_mesh: "vtk.vtkPolyData | None" = None
        neck_diam = 0.0
        # Primary: build a WATERTIGHT sac in the volume domain from the cached
        # full-res volume (robust — marching cubes on a bounded mask is always
        # closed, unlike surface clip + fill-holes on the downsampled tree).
        try:
            from services.mpr import ensure_volume_cached, _get_volume
            meta   = ensure_volume_cached(session_id)
            volume = _get_volume(session_id)
            lower  = float(read_state(session_id, "seg.threshold_lower", "") or 0.0)
            upper  = float(read_state(session_id, "seg.threshold_upper", "") or 0.0)
            if lower or upper:
                sac_mesh, neck_diam = isolate_sac_volumetric(
                    volume, meta["spacing"], origin, normal, seed,
                    lower, upper, bound_r, half_extent_mm=crop_half,
                )
                logger.info("Volumetric sac isolation: %d pts, neck %.2f mm",
                            sac_mesh.GetNumberOfPoints(), neck_diam)
        except Exception as exc:
            logger.warning("Volumetric isolation failed, will try surface clip: %s", exc)
            sac_mesh = None

        # Fallback: surface clip + cap on the (coarse) vessel tree.
        if sac_mesh is None or sac_mesh.GetNumberOfPoints() < 50:
            vessel_path = vtp_path.parent / "vessel_tree.vtp"
            if not vessel_path.exists():
                raise ValueError(
                    "vessel_tree.vtp no disponible — se requiere para aislar el saco."
                )
            sac = isolate_closed_sac(read_vtp(vessel_path), origin, normal,
                                     dome_seed=seed, max_radius=bound_r)
            sac_mesh, neck_diam = sac.poly_data, sac.neck_diameter_mm

        # Validate: a valid sac needs a real neck and body.  A tiny result means
        # the apex was placed off the dome — ask the user to re-mark it.
        if sac_mesh.GetNumberOfPoints() < 50 or neck_diam < 1.0:
            raise ValueError(
                "No se aísla un saco válido con este plano. Verifica que el punto "
                "de cuello esté sobre el cuello y el ápice sobre la cúpula del domo."
            )
        # Persist the closed sac so the UI can display it.
        # El único objeto de este paso que delimita el CUERPO del aneurisma.
        # Se escribía al disco y no lo pintaba nadie: el visor no tenía una
        # sola referencia a él, así que el usuario solo veía el localizador de
        # Detección, que es una bola alrededor de un punto.
        write_vtp(sac_mesh, vtp_path.parent / "aneurysm_sac.vtp")
        write_state(session_id, "morpho.sac_vtp_name", "aneurysm_sac.vtp")
        poly        = sac_mesh
        plane_arg   = (origin, normal, neck_diam)
        # "rim" already recorded that the orientation came from marked points;
        # don't overwrite it with the coarser label.
        if neck_source != "rim":
            neck_source = "manual"

        # Persist the plane ITSELF (not just the numbers it produced) so the
        # measurement is reproducible: GET /morphometry replays it, which is
        # what makes a restored session come back with the manual sac instead
        # of the unreliable automatic cap.
        write_state(session_id, "morpho.plane_origin_x", str(origin[0]))
        write_state(session_id, "morpho.plane_origin_y", str(origin[1]))
        write_state(session_id, "morpho.plane_origin_z", str(origin[2]))
        write_state(session_id, "morpho.plane_normal_x", str(normal[0]))
        write_state(session_id, "morpho.plane_normal_y", str(normal[1]))
        write_state(session_id, "morpho.plane_normal_z", str(normal[2]))
        used_plane = (tuple(float(v) for v in origin), tuple(float(v) for v in normal))  # type: ignore[assignment]
        # Did the sac stop because the anatomy ended, or because the crop sphere
        # cut it off? One that reaches the bound was still growing when it was
        # clipped: the neck plane let the parent artery into the "sac", so the
        # max diameter, the volume and every index describe artery as much as
        # aneurysm. Without this the failure surfaces only as a 14 mm "aneurysm"
        # on a candidate detected at 4 mm — reported with a green OK badge.
        try:
            import numpy as _np
            pts = _np.asarray([poly.GetPoint(i) for i in range(poly.GetNumberOfPoints())])
            if pts.size:
                reach = float(_np.max(_np.linalg.norm(pts - _np.asarray(seed, dtype=float), axis=1)))
                sac_hit_crop = reach >= bound_r * 0.97
        except Exception as exc:  # noqa: BLE001 — a diagnostic must never break the measurement
            logger.warning("Sac crop-bound check skipped: %s", exc)
        # The marked points themselves, so a resumed session can put them back
        # in the scene instead of showing a plane with nothing behind it.
        if rim:
            write_state(session_id, "morpho.rim_points",
                        ";".join(f"{p.x},{p.y},{p.z}" for p in rim))
        write_state(session_id, "morpho.plane_seed_x",   str(seed[0]))
        write_state(session_id, "morpho.plane_seed_y",   str(seed[1]))
        write_state(session_id, "morpho.plane_seed_z",   str(seed[2]))

        # ── El PERÍMETRO del cuello, que es lo que dimensiona la mordaza ──── #
        #
        # El clip no cierra sobre el diámetro del cuello: cierra sobre lo que
        # mide el cuello aplastado, o sea la mitad de su perímetro. El diámetro
        # que se guarda arriba sale del ÁREA del contorno, y en un cuello
        # ovalado eso se queda corto justo por el lado que deja el cierre
        # incompleto — un cuello de 6,0 × 2,7 mm equivale a un círculo de 4,0 mm
        # pero su línea de cierre mide 7,1 mm, no 6,0.
        #
        # Solo aquí, con el plano marcado: es el único caso en que el contorno
        # describe el cuello y no un corte cualquiera del árbol. Sin esto, la
        # selección aplica la regla de ×1,5, que es lo que había.
        try:
            from services.sac_isolation import measure_neck_contour
            perim, _area = measure_neck_contour(
                poly,
                tuple(origin[i] + 0.6 * normal[i] for i in range(3)),
                normal, seed,
            )
            if perim > 0.0:
                write_state(session_id, "morpho.neck_perimeter_mm", str(round(perim, 3)))
                logger.info("Neck contour: %.2f mm perimeter → %.2f mm closing line "
                            "(equivalent-circle neck %.2f mm)",
                            perim, perim / 2.0, neck_diam)
        except Exception as exc:  # noqa: BLE001 — nunca hundir la morfometría por esto
            logger.warning("Neck perimeter not measured: %s", exc)
    else:
        poly = read_vtp(vtp_path)

    mr = analyzer.analyze(poly, neck_plane=plane_arg)

    # ── Size Ratio: estimate the parent-artery diameter from the full vessel ─ #
    # SR = max_aneurysm_diameter / parent_artery_diameter (Dhar 2008). Requires
    # the whole vascular tree (the candidate mesh alone is not enough).
    vessel_path = vtp_path.parent / "vessel_tree.vtp"
    if vessel_path.exists():
        try:
            from services.parent_artery import estimate_parent_artery_diameter
            vessel = read_vtp(vessel_path)
            parent_dia = estimate_parent_artery_diameter(
                vessel, mr.centroid, mr.principal_axis,
                mr.neck_diameter_mm, mr.neck_plane_pos,
            )
            if parent_dia > 0.1:
                mr.size_ratio = mr.max_diameter_mm / parent_dia
                write_state(session_id, "morpho.parent_artery_mm", str(round(parent_dia, 3)))
                logger.info("SR = %.2f (parent Ø %.2f mm)", mr.size_ratio, parent_dia)
        except Exception as exc:
            logger.warning("Parent-artery / SR estimation skipped: %s", exc)

    # ── Neck origin (for perforator router) ───────────────────────────── #
    neck_origin = neck_origin_from_morpho(mr, poly)
    write_state(session_id, "morpho.neck_origin_x",  str(neck_origin[0]))
    write_state(session_id, "morpho.neck_origin_y",  str(neck_origin[1]))
    write_state(session_id, "morpho.neck_origin_z",  str(neck_origin[2]))

    # Principal (neck→dome) axis — used as the neck-plane normal by the device
    # planning endpoints (clip coverage, stent orientation).
    axis = mr.principal_axis or (0.0, 0.0, 1.0)
    write_state(session_id, "morpho.axis_x", str(axis[0]))
    write_state(session_id, "morpho.axis_y", str(axis[1]))
    write_state(session_id, "morpho.axis_z", str(axis[2]))

    # ── Persist key morphometry ───────────────────────────────────────── #
    # Consumed by the longitudinal comparison, the treatment engine and the
    # report/DICOM-SR builders — every field those read must be written here,
    # or it silently renders as 0 in the PDF.
    write_state(session_id, "morpho.max_diameter_mm",  str(mr.max_diameter_mm))
    write_state(session_id, "morpho.neck_mm",          str(mr.neck_diameter_mm))
    write_state(session_id, "morpho.dome_height_mm",   str(mr.dome_height_mm))
    write_state(session_id, "morpho.volume_mm3",       str(mr.volume_mm3))
    write_state(session_id, "morpho.surface_area_mm2", str(mr.surface_area_mm2))
    write_state(session_id, "morpho.ar",               str(mr.aspect_ratio))
    write_state(session_id, "morpho.dnr",              str(mr.dome_to_neck_ratio))
    write_state(session_id, "morpho.bf",               str(mr.bottleneck_factor))
    write_state(session_id, "morpho.ui",               str(mr.undulation_index))
    # Clamped like the API response: an open mesh can yield sphericity > 1, and
    # the report prints this against a "1.0 = esfera perfecta" reference.
    write_state(session_id, "morpho.compactness",      str(_clamp01(mr.compactness)))
    write_state(session_id, "morpho.rupture_risk",     mr.rupture_risk_label)
    write_state(session_id, "morpho.neck_source",      neck_source)
    write_state(session_id, "morpho.neck_tilt_deg",     str(round(neck_tilt_deg, 2)))

    # ── Reliability guard (Tier 1) ────────────────────────────────────── #
    # analyze() nulls volume/neck metrics when the mesh is an open patch or the
    # sac is not physically plausible; surface that reason first so the UI can
    # flag the whole analysis, not just the neck.
    _invalidate_stale_decision(session_id, before)

    warning = None
    if not mr.reliable and mr.reliability_note:
        warning = mr.reliability_note

    # ── Per-group validity ────────────────────────────────────────────── #
    # analyze() nulls the volume group and the neck group INDEPENDENTLY, so both
    # have to travel independently too. Sending only the combined `reliable`
    # made the panel hide a perfectly good neck measurement whenever the volume
    # group had failed — while the 3D legend, which does not consult the flag,
    # went on annotating that same neck in the scene.
    volume_valid = mr.volume_mm3 > 0.0
    neck_valid = mr.neck_diameter_mm >= 1.0
    if not neck_valid and warning is None:
        warning = (
            "Cuello no detectado (diámetro < 1 mm). "
            "DNR, AR y BF son poco fiables. Ajuste manualmente si es posible."
        )

    # ── Clamp shape indices to physical range ─────────────────────────── #
    # Candidate domes are open surface patches, not closed volumes;
    # vtkMassProperties on an open mesh can yield sphericity > 1 or EI < 0.
    # The desktop dataclass shows these raw values; our API contract enforces
    # [0, 1], so clamp (see _clamp01) and flag the mesh as unreliable instead
    # of erroring.
    indices_out_of_range = (
        not (0.0 <= mr.compactness <= 1.0)
        or not (0.0 <= mr.ellipticity_index <= 1.0)
        or not (0.0 <= mr.undulation_index <= 1.0)
    )
    # ── Is the neck contour even possible? ────────────────────────────── #
    # The mouth of a sac cannot be wider than the widest part of the sac. When
    # it comes out that way the plane did not cut the neck: it cut across the
    # parent artery, or missed the sac altogether. Cheap to check, impossible to
    # argue with, and it fires on results that otherwise carry a green badge.
    if mr.neck_diameter_mm > mr.max_diameter_mm * 1.02 > 0:
        note = (
            f"El cuello medido ({mr.neck_diameter_mm:.1f} mm) es mayor que el Ø máximo "
            f"del saco ({mr.max_diameter_mm:.1f} mm), lo cual es imposible: el plano no "
            f"cortó por el cuello. Vuelve a marcar el borde en la unión del saco con el vaso."
        )
        warning = f"{warning} {note}" if warning else note
        logger.warning("Neck wider than the sac — session=%s neck=%.2f max=%.2f",
                       session_id, mr.neck_diameter_mm, mr.max_diameter_mm)

    # ── Did the isolation swallow the parent artery? ──────────────────── #
    if sac_hit_crop:
        note = (
            "El saco aislado llega hasta el límite del recorte: el plano de cuello "
            "dejó entrar vaso padre, así que Ø máximo, volumen y los índices "
            "describen arteria además de aneurisma. Vuelve a marcar el borde del "
            "cuello justo en la unión del saco con el vaso."
        )
        warning = f"{warning} {note}" if warning else note
        logger.warning("Sac isolation reached the crop bound — session=%s", session_id)

    if indices_out_of_range:
        note = (
            "Índices de forma fuera de rango físico (malla de domo abierta) — "
            "compacidad/EI/UI acotados a [0, 1]; interpretar con cautela."
        )
        warning = f"{warning} {note}" if warning else note

    # ── Map desktop dataclass → Pydantic model ────────────────────────── #
    # La URL del saco cerrado, si el plano de cuello llegó a aislarlo. Se lee
    # del estado y no de la variable local porque GET /morphometry reproduce un
    # plano guardado y tiene que devolver la misma malla.
    sac_name = read_state(session_id, "morpho.sac_vtp_name", "")
    sac_url = ""
    if sac_name and (vtp_path.parent / sac_name).exists():
        sac_url = f"{mesh_url(session_id, sac_name)}?v={int(time.time() * 1000)}"

    return MorphometryResult(
        sac_mesh_url      = sac_url,
        volume_mm3        = round(mr.volume_mm3,        2),
        surface_area_mm2  = round(mr.surface_area_mm2,  2),
        eq_sphere_diam_mm = round(mr.eq_sphere_diam_mm, 3),
        max_diameter_mm   = round(mr.max_diameter_mm,   3),
        bbox_w_mm         = round(mr.bbox_w_mm,         3),
        bbox_h_mm         = round(mr.bbox_h_mm,         3),
        neck_mm           = round(mr.neck_diameter_mm,  3),
        dome_height_mm    = round(mr.dome_height_mm,    3),
        dnr               = round(mr.dome_to_neck_ratio, 3),
        ar                = round(mr.aspect_ratio,       3),
        bf                = round(mr.bottleneck_factor,  3),
        compactness       = round(_clamp01(mr.compactness),        4),
        ui                = round(_clamp01(mr.undulation_index),   4),
        ei                = round(_clamp01(mr.ellipticity_index),  4),
        nsi               = round(_clamp01(mr.non_sphericity_idx), 4),
        sr                = round(max(0.0, mr.size_ratio),         3),
        rupture_risk_label= mr.rupture_risk_label,
        reliable          = mr.reliable,
        neck_source       = neck_source,
        neck_tilt_deg     = round(neck_tilt_deg, 2),
        volume_valid      = volume_valid,
        neck_valid        = neck_valid,
        warning           = warning,
        centroid          = Position3D(
            x=mr.centroid[0], y=mr.centroid[1], z=mr.centroid[2]
        ),
        principal_axis    = list(mr.principal_axis),
        neck_origin       = Position3D(
            x=neck_origin[0], y=neck_origin[1], z=neck_origin[2]
        ),
        rim_points        = _read_rim_points(session_id),
        plane_origin      = None if used_plane is None else Position3D(
            x=used_plane[0][0], y=used_plane[0][1], z=used_plane[0][2]
        ),
        plane_normal      = None if used_plane is None else Position3D(
            x=used_plane[1][0], y=used_plane[1][1], z=used_plane[1][2]
        ),
    )
