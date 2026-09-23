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
    ComponentListResult, MeshBoundsResult,
    MeshCropRequest, MeshCropResult, MeshHistoryResult, MeshHistoryStep,
    MeshPlaneCutRequest, MeshPlaneCutResult, MeshRestoreRequest,
    MeshRestoreResult, RegionEraseRequest, RegionEraseResult,
)
import threading
from collections import defaultdict

from services import mesh_backup
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
