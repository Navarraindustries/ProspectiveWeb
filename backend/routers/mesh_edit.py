"""Interactive mesh-editing router: ROI crop (box/sphere) and grow-from-seeds.

Both operate on the working vessel mesh (`vessel_tree.vtp`) so that downstream
steps (detection, morphometry) transparently use the edited result. Crop reads
and rewrites the mesh; grow rebuilds it from seed points on the volume.
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException

from models.detection import Position3D
from models.mesh_edit import (
    ComponentDeleteRequest, ComponentDeleteResult, ComponentInfoOut,
    ComponentListResult, GrowRequest, GrowResult, MeshBoundsResult,
    MeshCropRequest, MeshCropResult, MeshHistoryResult, MeshHistoryStep,
    MeshPlaneCutRequest, MeshPlaneCutResult, MeshRestoreRequest,
    MeshRestoreResult, RegionEraseRequest, RegionEraseResult,
)
import threading
from collections import defaultdict

from services import mesh_backup
from services.grow import grow_from_seeds
from services.mesh_crop import clip_box, clip_plane, clip_sphere
from services.segmentation import (
    read_vtp, write_vtp,
    level_to_smooth_iters, level_to_cleanup_verts,
)
from services.sessions import mesh_url, session_exists, session_subdir, write_state

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["mesh-edit"])


# Un cerrojo por sesión para las ediciones de malla.
#
# La escritura del .vtp ya es atómica, así que dos peticiones simultáneas no
# pueden dejar el fichero corrupto —que es lo que pasó en vivo: dos clics del
# borrador con 1,6 s de trabajo cada uno, y la malla quedó en 3,9 MB ilegibles—.
# Pero sin cerrojo siguen siendo dos leer-modificar-escribir sobre el mismo
# fichero: la segunda parte de la malla ANTERIOR a la primera, y al guardar
# deshace su borrado sin decir nada. Aquí se serializan.
_EDIT_LOCKS: dict[str, threading.Lock] = defaultdict(threading.Lock)


def _edit_lock(session_id: str) -> threading.Lock:
    return _EDIT_LOCKS[session_id]


def _versioned(session_id: str, name: str) -> str:
    return f"{mesh_url(session_id, name)}?v={int(time.time() * 1000)}"


def _invalidate_derived(session_id: str) -> None:
    """Forget everything measured on the mesh that just changed.

    The panel cleared its own screen state, but the session kept the candidate
    domes, the morphometry and the recommendation — so a report generated after a
    crop described an aneurysm from the mesh as it was before the crop.
    """
    from routers.detect import _clear_detection_state
    _clear_detection_state(session_id, session_subdir(session_id, "meshes"), morphometry=True)


# ── POST /mesh-crop/{session_id} ────────────────────────────────────────────── #

def _run_crop(vessel_path: Path, req: MeshCropRequest) -> "tuple[object, int, int, int]":
    mesh = read_vtp(vessel_path)
    n_before = mesh.GetNumberOfPoints()
    if n_before == 0:
        raise ValueError("La malla vascular está vacía.")

    c = (req.center.x, req.center.y, req.center.z)
    if req.mode == "sphere":
        out = clip_sphere(mesh, c, req.radius, invert=req.invert)
    else:
        hs = req.half_size
        hx = hs.x if hs else req.radius
        hy = hs.y if hs else req.radius
        hz = hs.z if hs else req.radius
        out = clip_box(
            mesh,
            c[0] - hx, c[0] + hx,
            c[1] - hy, c[1] + hy,
            c[2] - hz, c[2] + hz,
            invert=req.invert,
        )

    n_after = out.GetNumberOfPoints()
    if n_after == 0:
        raise ValueError(
            "El recorte deja la malla vacía. Ajusta el centro, el radio o invierte la operación."
        )
    write_vtp(out, vessel_path)
    return out, n_before, n_after, out.GetNumberOfPolys()


@router.post(
    "/mesh-crop/{session_id}",
    response_model=MeshCropResult,
    summary="Crop the vessel mesh to a box/sphere ROI",
    description=(
        "Non-destructive ROI crop of the working vessel mesh. `mode='sphere'` keeps "
        "geometry within `radius` of the picked centre; `mode='box'` uses an "
        "axis-aligned box (`half_size` per axis, or `radius` as a cube half-side). "
        "`invert=true` removes the ROI instead (useful to delete a bone/noise blob). "
        "The result overwrites `vessel_tree.vtp`; re-run segmentation to restore."
    ),
)
async def mesh_crop(session_id: str, req: MeshCropRequest) -> MeshCropResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    vessel_path = session_subdir(session_id, "meshes") / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise HTTPException(
            status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero."
        )

    # Snapshot first: the crop overwrites the mesh in place, and without a copy
    # the only way back is a full re-segmentation.
    await asyncio.to_thread(mesh_backup.snapshot, session_id, "crop")

    try:
        _out, n_before, n_after, n_faces = await asyncio.to_thread(
            _run_crop, vessel_path, req
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Mesh crop failed")
        raise HTTPException(status_code=500, detail=f"Error al recortar la malla: {exc}")

    write_state(session_id, "seg.n_vertices", str(n_after))
    write_state(session_id, "seg.n_faces", str(n_faces))
    _invalidate_derived(session_id)

    return MeshCropResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=n_after,
        faces=n_faces,
        removed_vertices=max(0, n_before - n_after),
        undo_depth=mesh_backup.depth(session_id),
    )


# ── Corte por plano: el recorte que no pide un centro ─────────────────────── #

@router.get(
    "/mesh-bounds/{session_id}",
    response_model=MeshBoundsResult,
    summary="Bounding box of the working mesh",
    description=(
        "Los extremos reales de la malla, para que el deslizador del corte por "
        "plano tenga un recorrido con sentido en vez de un rango inventado."
    ),
)
async def mesh_bounds(session_id: str) -> MeshBoundsResult:
    path = _mesh_or_404(session_id)
    mesh = await asyncio.to_thread(read_vtp, path)
    b = mesh.GetBounds()
    return MeshBoundsResult(
        min=Position3D(x=b[0], y=b[2], z=b[4]),
        max=Position3D(x=b[1], y=b[3], z=b[5]),
        vertices=mesh.GetNumberOfPoints(),
    )


@router.post(
    "/mesh-plane-cut/{session_id}",
    response_model=MeshPlaneCutResult,
    summary="Cut the mesh with a plane and keep one side",
    description=(
        "Un corte que NO necesita un centro. El recorte por caja o esfera "
        "obliga a acertar un punto a ojo, y para quitar la chapa que queda "
        "bajo el árbol en una 3DRA eso son varios intentos. Un plano se define "
        "con una dirección y una altura: un deslizador.\n\n"
        "Se deshace como cualquier otra edición de malla."
    ),
)
async def mesh_plane_cut(
    session_id: str, req: MeshPlaneCutRequest
) -> MeshPlaneCutResult:
    path = _mesh_or_404(session_id)

    if req.axis == "custom":
        if req.normal is None:
            raise HTTPException(
                status_code=422,
                detail="Con axis='custom' hace falta una normal.")
        n = np.asarray([req.normal.x, req.normal.y, req.normal.z], dtype=float)
        if not np.any(n):
            raise HTTPException(status_code=422, detail="La normal es nula.")
        n = n / np.linalg.norm(n)
        origin = tuple(n * req.offset_mm)
    else:
        eje = {"x": 0, "y": 1, "z": 2}[req.axis]
        n = np.zeros(3); n[eje] = 1.0
        origin = tuple(n * req.offset_mm)

    mesh = await asyncio.to_thread(read_vtp, path)
    n_before = mesh.GetNumberOfPoints()

    out = await asyncio.to_thread(
        clip_plane, mesh, origin, tuple(n), not req.keep_positive)

    if out is None or out.GetNumberOfPoints() == 0:
        raise HTTPException(
            status_code=422,
            detail=("Ese corte deja la malla vacía. Mueve el plano o cambia "
                    "qué lado se conserva."))

    await asyncio.to_thread(mesh_backup.snapshot, session_id, "crop")
    await asyncio.to_thread(write_vtp, out, path)

    from services.mesh_components import describe_components
    comps = describe_components(out)

    write_state(session_id, "seg.n_vertices", str(out.GetNumberOfPoints()))
    write_state(session_id, "seg.n_faces", str(out.GetNumberOfPolys()))
    _invalidate_derived(session_id)

    return MeshPlaneCutResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=out.GetNumberOfPoints(),
        faces=out.GetNumberOfPolys(),
        removed_vertices=max(0, n_before - out.GetNumberOfPoints()),
        components_left=len(comps),
        undo_depth=mesh_backup.depth(session_id),
    )


# ── Piezas sueltas: listarlas y borrarlas de un clic ───────────────────────── #
#
# Medido en case 3: la malla sale con once piezas conexas, y diez son hueso —
# bloques de 228 a 2948 mm3 a 37-92 mm del árbol. No son motas (el filtro por
# tamaño descarta por debajo de 5 mm3) y ningún umbral HU las separa: el 99 %
# del hueso cae dentro del rango de intensidad del propio árbol. Lo que sí las
# separa es que no se tocan.

def _mesh_or_404(session_id: str) -> Path:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    path = session_subdir(session_id, "meshes") / "vessel_tree.vtp"
    if not path.exists():
        raise HTTPException(
            status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero."
        )
    return path


def _info_out(c) -> ComponentInfoOut:
    return ComponentInfoOut(
        n_points=c.n_points,
        volume_mm3=round(c.volume_mm3, 2),
        extent_mm=round(c.extent_mm, 2),
        thickness_mm=round(c.thickness_mm, 3),
        sphericity=round(c.sphericity, 4),
    )


@router.get(
    "/mesh-components/{session_id}",
    response_model=ComponentListResult,
    summary="List the mesh's connected pieces",
    description=(
        "Every connected component of the working mesh, largest first, with the "
        "shape descriptors that tell a vessel tree from a slab of bone. Also "
        "says whether the largest one looks like a tree at all — on CTA it does "
        "not, because contrast touches bone and the whole head is one piece."
    ),
)
async def mesh_components(session_id: str) -> ComponentListResult:
    path = _mesh_or_404(session_id)
    from services.mesh_components import describe_components, looks_like_tree

    comps = await asyncio.to_thread(lambda: describe_components(read_vtp(path)))
    if not comps:
        return ComponentListResult(components=[], total=0, largest_is_tree=False,
                                   warning="La malla está vacía.")
    ok, motivo = looks_like_tree(comps[0])
    return ComponentListResult(
        components=[_info_out(c) for c in comps],
        total=len(comps), largest_is_tree=ok, warning=motivo,
    )


@router.post(
    "/mesh-component-delete/{session_id}",
    response_model=ComponentDeleteResult,
    summary="Delete the connected piece under the picked point",
    description=(
        "One click removes one whole piece. The noise in an angiographic mesh "
        "arrives as separate pieces, so a painting eraser is not needed and "
        "would leave half-erased edges. Undoable like any other mesh edit; a "
        "click that lands away from the surface removes nothing and says so."
    ),
)
async def mesh_component_delete(
    session_id: str, req: ComponentDeleteRequest
) -> ComponentDeleteResult:
    path = _mesh_or_404(session_id)
    from services.mesh_components import (describe_components,
                                          remove_component_at)

    mesh = read_vtp(path)
    out, removed, warning = await asyncio.to_thread(
        remove_component_at, mesh,
        (req.point.x, req.point.y, req.point.z), req.max_distance_mm,
    )

    if removed is None:
        # No se ha borrado nada: ni instantánea ni invalidación. Un clic fallido
        # no debe gastar un paso de deshacer ni tirar la morfometría.
        comps = describe_components(mesh)
        return ComponentDeleteResult(
            mesh_url=_versioned(session_id, "vessel_tree.vtp"),
            vertices=mesh.GetNumberOfPoints(), faces=mesh.GetNumberOfPolys(),
            removed=None, components_left=len(comps), warning=warning,
            undo_depth=mesh_backup.depth(session_id),
        )

    await asyncio.to_thread(mesh_backup.snapshot, session_id, "edit")
    await asyncio.to_thread(write_vtp, out, path)

    write_state(session_id, "seg.n_vertices", str(out.GetNumberOfPoints()))
    write_state(session_id, "seg.n_faces", str(out.GetNumberOfPolys()))
    _invalidate_derived(session_id)

    comps = describe_components(out)
    return ComponentDeleteResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=out.GetNumberOfPoints(), faces=out.GetNumberOfPolys(),
        removed=_info_out(removed), components_left=len(comps), warning="",
        undo_depth=mesh_backup.depth(session_id),
    )


# ── POST /segment/grow/{session_id} ─────────────────────────────────────────── #

def _band_from_seeds(volume: np.ndarray, seed_voxels: list[tuple[int, int, int]]) -> tuple[float, float]:
    """Narrow HU band around the vessel intensity sampled at the seeds.

    Samples a small neighbourhood at each seed and takes a high percentile (the
    vessel is the bright part even if the click is slightly off-centre), then
    builds a window around the seeds' brightness: low enough to follow dimmer
    connected vessel, high enough for bright cores, but bounded so it excludes
    bone (typically brighter) and background/tissue (dimmer).
    """
    nz, ny, nx = volume.shape
    seed_vals: list[float] = []
    bright_vals: list[float] = []
    exact_vals: list[float] = []
    for (z, y, x) in seed_voxels:
        if not (0 <= z < nz and 0 <= y < ny and 0 <= x < nx):
            continue
        z0, z1 = max(0, z - 2), min(nz, z + 3)
        y0, y1 = max(0, y - 2), min(ny, y + 3)
        x0, x1 = max(0, x - 2), min(nx, x + 3)
        nb = volume[z0:z1, y0:y1, x0:x1]
        if nb.size:
            seed_vals.append(float(np.percentile(nb, 75)))
            bright_vals.append(float(nb.max()))
            exact_vals.append(float(volume[z, y, x]))
    if not seed_vals:
        return 80.0, 600.0
    v_lo = float(np.min(seed_vals))
    v_hi = float(np.max(seed_vals))
    center = 0.5 * (v_lo + v_hi)
    spread = max(v_hi - v_lo, abs(center) * 0.35)   # at least ±35% of the value
    lower = v_lo - spread * 0.6

    # Upper bound: the brightest voxel actually seen at the seeds, not a fixed
    # fraction of the median. Its job is to exclude material BRIGHTER than the
    # vessel (bone on CT); a bound below the vessel's own core instead chokes
    # the growth — and on 3DRA/XA, where the contrast column spans a far wider
    # range than CT HU, it stopped the region at a few hundred voxels.
    upper = max(v_hi + spread * 0.6, max(bright_vals))

    # ConnectedThreshold returns an EMPTY region unless every seed's own value
    # is inside the band, so make sure the window brackets the seeds themselves.
    lo_seed, hi_seed = min(exact_vals), max(exact_vals)
    pad = max(1.0, 0.05 * max(abs(lo_seed), abs(hi_seed)))
    lower = min(lower, lo_seed - pad)
    upper = max(upper, hi_seed + pad)
    return round(lower, 1), round(upper, 1)


def _run_grow(session_id: str, meshes_dir: Path, req: GrowRequest) -> GrowResult:
    """Load full-res volume, map world seeds → voxels, region-grow, write mesh."""
    from routers.segment import _maybe_downsample
    from services.mpr import _get_volume, ensure_volume_cached

    meta = ensure_volume_cached(session_id)
    volume = np.asarray(_get_volume(session_id))
    spacing = tuple(float(s) for s in meta["spacing"])  # (sz, sy, sx)

    # Grow at FULL resolution: thin vessels are only a few voxels wide, so the
    # downsample used for global thresholding would break their connectivity and
    # drop distal branches. The grown region is small, so this stays fast
    # (measured ~15 s on 198×512×512). The cap is only for volumes bigger than
    # the 512³ that reconstructions produce — at 400 it fired on every standard
    # study, which is exactly what this comment says must not happen.
    seg_volume, seg_spacing, _factor = _maybe_downsample(volume, spacing, max_axis=512)
    sz, sy, sx = seg_spacing

    # World (mm) → voxel index. Mesh space has origin 0 and axis-aligned spacing.
    seeds: list[tuple[int, int, int]] = []
    for p in req.seeds:
        seeds.append((
            int(round(p.z / sz)),
            int(round(p.y / sy)),
            int(round(p.x / sx)),
        ))

    # Band: either the user's sliders, or derived from the vessel intensity at the
    # seeds — a narrow window that excludes bone (brighter) and tissue (dimmer),
    # so a single click on a vessel gives a clean tree without tuning thresholds.
    # Sample it from the FULL-RES volume: on a downsampled grid a thin vessel
    # falls between samples and the band comes back centred on air.
    lower, upper = req.lower, req.upper
    if req.auto_band:
        fz, fy, fx = spacing
        full_seeds = [
            (int(round(p.z / fz)), int(round(p.y / fy)), int(round(p.x / fx)))
            for p in req.seeds
        ]
        lower, upper = _band_from_seeds(volume, full_seeds)

    result = grow_from_seeds(
        seg_volume, seg_spacing, seeds,
        lower_hu=lower,
        upper_hu=upper,
        smooth_iterations=level_to_smooth_iters(req.smoothing),
        target_reduction=0.30,   # keep thin-vessel detail (was 0.70)
        keep_top_n=0,            # keep ALL seed-connected growth (multi-seed)
        morpho_closing_mm=1.0,   # bridge small intensity gaps along the vessel
    )

    vtp_path = meshes_dir / "vessel_tree.vtp"
    # The grow replaces the whole mesh; keep the previous one so a seed placed on
    # the wrong vessel costs one click to undo instead of a re-segmentation.
    mesh_backup.snapshot(session_id, "grow")
    write_vtp(result.poly_data, vtp_path)

    # Persist state so detection/morphometry can run on the grown mesh. Volume
    # geometry uses the FULL-RES shape/spacing (mesh coords are physical mm).
    write_state(session_id, "seg.mesh_url", mesh_url(session_id, "vessel_tree.vtp"))
    write_state(session_id, "seg.n_vertices", str(result.n_vertices))
    write_state(session_id, "seg.n_faces", str(result.n_triangles))
    write_state(session_id, "seg.threshold_lower", str(lower))
    write_state(session_id, "seg.threshold_upper", str(upper))
    write_state(session_id, "seg.strategy", "grow_from_seeds")
    write_state(session_id, "dicom.volume_z", str(volume.shape[0]))
    write_state(session_id, "dicom.volume_y", str(volume.shape[1]))
    write_state(session_id, "dicom.volume_x", str(volume.shape[2]))
    write_state(session_id, "dicom.spacing_z", str(spacing[0]))
    write_state(session_id, "dicom.spacing_y", str(spacing[1]))
    write_state(session_id, "dicom.spacing_x", str(spacing[2]))
    _invalidate_derived(session_id)

    return GrowResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=result.n_vertices,
        faces=result.n_triangles,
        n_voxels=result.n_voxels,
        fragments_removed=result.n_fragments_removed,
        seeds=len(seeds),
        band_lower=round(float(lower), 1),
        band_upper=round(float(upper), 1),
        undo_depth=mesh_backup.depth(session_id),
    )


@router.post(
    "/segment/grow/{session_id}",
    response_model=GrowResult,
    summary="Grow a vessel mesh from seed points",
    description=(
        "Region-growing segmentation (SimpleITK ConnectedThreshold) starting from "
        "one or more seed points placed on the volume, expanding through connected "
        "voxels within [lower, upper] HU. Builds a fresh `vessel_tree.vtp` — an "
        "alternative to threshold segmentation for cases where a global threshold "
        "leaks into bone. Requires that a DICOM volume has been uploaded."
    ),
)
async def segment_grow(session_id: str, req: GrowRequest) -> GrowResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    dicom_dir = session_subdir(session_id, "dicom")
    if not dicom_dir.exists() or not any(dicom_dir.iterdir()):
        raise HTTPException(
            status_code=422, detail="No hay DICOM en la sesión. Sube los archivos primero."
        )
    meshes_dir = session_subdir(session_id, "meshes")

    try:
        return await asyncio.to_thread(_run_grow, session_id, meshes_dir, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Grow-from-seeds failed")
        raise HTTPException(status_code=500, detail=f"Error en crecimiento por semillas: {exc}")


# ── Mesh edit history: undo one edit / restore the segmentation output ─────── #

def _mesh_counts(path: Path) -> tuple[int, int]:
    mesh = read_vtp(path)
    return mesh.GetNumberOfPoints(), mesh.GetNumberOfPolys()


@router.get(
    "/mesh-restore/{session_id}",
    response_model=MeshHistoryResult,
    summary="How far the vessel mesh can be rolled back",
    description=(
        "Reports how many crop/grow edits are still undoable for this session, so "
        "the mesh-tools panel can enable «Deshacer» and «Restaurar malla original» "
        "instead of guessing (a resumed session starts with no client-side history)."
    ),
)
async def mesh_history(session_id: str) -> MeshHistoryResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    d = mesh_backup.depth(session_id)
    return MeshHistoryResult(
        undo_depth=d,
        redo_depth=mesh_backup.redo_depth(session_id),
        has_original=d > 0,
        steps=[
            MeshHistoryStep(label=st.label, title=st.title, vertices=st.vertices, at=st.at)
            for st in mesh_backup.history(session_id)
        ],
    )


@router.post(
    "/mesh-restore/{session_id}",
    response_model=MeshRestoreResult,
    summary="Undo a mesh edit / restore the segmented mesh",
    description=(
        "`scope='undo'` puts back the mesh as it was before the last ROI crop or "
        "grow-from-seeds. `scope='original'` restores the mesh the segmentation "
        "produced, discarding every interactive edit.\n\n"
        "Both are cheap file operations — no re-segmentation. Everything derived "
        "from the mesh (candidates, morphometry, centreline) must be re-run, which "
        "is what the frontend does after calling this."
    ),
)
async def mesh_restore(session_id: str, req: MeshRestoreRequest) -> MeshRestoreResult:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    vessel_path = session_subdir(session_id, "meshes") / "vessel_tree.vtp"

    if req.scope == "original":
        ok = await asyncio.to_thread(mesh_backup.restore_baseline, session_id)
        detail = "No hay una malla anterior guardada: aún no se ha editado esta malla."
    elif req.scope == "redo":
        ok = await asyncio.to_thread(mesh_backup.redo, session_id)
        detail = "No hay ninguna edición deshecha que rehacer."
    else:
        ok = await asyncio.to_thread(mesh_backup.undo, session_id)
        detail = "No hay ninguna edición de malla que deshacer."
    if not ok:
        raise HTTPException(status_code=409, detail=detail)

    if not vessel_path.exists():
        raise HTTPException(status_code=500, detail="La malla restaurada no está disponible.")

    try:
        n_vertices, n_faces = await asyncio.to_thread(_mesh_counts, vessel_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not read the restored mesh")
        raise HTTPException(status_code=500, detail=f"Error leyendo la malla restaurada: {exc}")

    write_state(session_id, "seg.n_vertices", str(n_vertices))
    write_state(session_id, "seg.n_faces", str(n_faces))
    _invalidate_derived(session_id)

    return MeshRestoreResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=n_vertices,
        faces=n_faces,
        scope=req.scope,
        undo_depth=mesh_backup.depth(session_id),
        redo_depth=mesh_backup.redo_depth(session_id),
    )


@router.post(
    "/mesh-erase-region/{session_id}",
    response_model=RegionEraseResult,
    summary="Erase attached tissue around the picked point",
    description=(
        "For bone that TOUCHES the tree, which the piece eraser cannot reach: "
        "at full resolution the petrous bone and the skull base are part of the "
        "largest connected component, so 'main tree only' keeps them.\n\n"
        "Deliberately manual. Two automatic separators were measured on case 3 "
        "at full resolution and neither works: surface roughness is 0.742 on the "
        "bone plate against 0.717 on the rest of the tree, and local calibre is "
        "0.69 mm on both. Locally they are the same thing.\n\n"
        "The radius is straight-line distance from the click, but the erase "
        "spreads ACROSS THE SURFACE — so a vessel that crosses that ball while "
        "joining the tree outside it is left alone, which the existing spherical "
        "crop cannot do. Undoable like any other mesh edit."
    ),
)
async def mesh_erase_region(
    session_id: str, req: RegionEraseRequest
) -> RegionEraseResult:
    path = _mesh_or_404(session_id)
    from services.mesh_components import erase_region_at

    def _trabajo():
        with _edit_lock(session_id):
            mesh_local = read_vtp(path)
            res = erase_region_at(
                mesh_local,
                (req.point.x, req.point.y, req.point.z),
                req.radius_mm, req.max_distance_mm,
            )
            if res[1] > 0:
                mesh_backup.snapshot(session_id, "edit")
                write_vtp(res[0], path)
            return mesh_local, res

    mesh, (out, removed, warning) = await asyncio.to_thread(_trabajo)

    if removed <= 0:
        # Un clic fallido no gasta un paso de deshacer ni tira la morfometría.
        return RegionEraseResult(
            mesh_url=_versioned(session_id, "vessel_tree.vtp"),
            vertices=mesh.GetNumberOfPoints(), faces=mesh.GetNumberOfPolys(),
            removed_vertices=0, warning=warning,
            undo_depth=mesh_backup.depth(session_id),
        )

    write_state(session_id, "seg.n_vertices", str(out.GetNumberOfPoints()))
    write_state(session_id, "seg.n_faces", str(out.GetNumberOfPolys()))
    _invalidate_derived(session_id)

    return RegionEraseResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=out.GetNumberOfPoints(), faces=out.GetNumberOfPolys(),
        removed_vertices=removed, warning="",
        undo_depth=mesh_backup.depth(session_id),
    )
