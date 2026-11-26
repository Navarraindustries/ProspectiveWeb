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
    MeshRestoreRequest, ScissorsRequest, ScissorsResult,
    MeshRestoreResult, RegionEraseRequest, RegionEraseResult,
    NeckDetailRequest, NeckDetailResult,
)

from services import mesh_backup
from services.mesh_crop import clip_box, clip_sphere
from services.segmentation import (
    read_vtp, write_vtp,
    level_to_smooth_iters, level_to_cleanup_verts,
)
from services.sessions import cerrojo_de_sesion, mesh_url, session_exists, session_subdir, write_state
from services.errores import mensaje_error

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
# El mismo cerrojo que la segmentación, que también reescribe la malla.
def _edit_lock(session_id: str):
    return cerrojo_de_sesion(session_id, "malla")


def _versioned(session_id: str, name: str) -> str:
    return f"{mesh_url(session_id, name)}?v={int(time.time() * 1000)}"


def _invalidate_derived(session_id: str) -> None:
    """Forget everything measured on the mesh that just changed.

    The panel cleared its own screen state, but the session kept the candidate
    domes, the morphometry and the recommendation — so a report generated after a
    crop described an aneurysm from the mesh as it was before the crop.

    Y también los dispositivos con su oclusión y
    su cobertura, la línea central, el IVUS y el seguimiento: la
    regla vive en services/invalidacion.py.
    """
    from services.invalidacion import olvidar_lo_medido_en_la_malla
    olvidar_lo_medido_en_la_malla(session_id)


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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

    vessel_path = session_subdir(session_id, "meshes") / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise HTTPException(
            status_code=409, detail="No hay malla vascular. Ejecuta la segmentación primero."
        )

    # Snapshot first: the crop overwrites the mesh in place, and without a copy
    # the only way back is a full re-segmentation. Instantánea y recorte bajo el
    # cerrojo de la malla: dos ediciones a la vez se pisaban.
    def _trabajo():
        with _edit_lock(session_id):
            mesh_backup.snapshot(session_id, "crop")
            return _run_crop(vessel_path, req)

    try:
        _out, n_before, n_after, n_faces = await asyncio.to_thread(_trabajo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Mesh crop failed")
        raise HTTPException(status_code=500, detail=mensaje_error(f"Error al recortar la malla", exc))

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


# ── Piezas sueltas: listarlas y borrarlas de un clic ───────────────────────── #
#
# Medido en case 3: la malla sale con once piezas conexas, y diez son hueso —
# bloques de 228 a 2948 mm3 a 37-92 mm del árbol. No son motas (el filtro por
# tamaño descarta por debajo de 5 mm3) y ningún umbral HU las separa: el 99 %
# del hueso cae dentro del rango de intensidad del propio árbol. Lo que sí las
# separa es que no se tocan.

def _mesh_or_404(session_id: str) -> Path:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
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

    # Leer, quitar y escribir de una vez, bajo el cerrojo de la malla y fuera
    # del bucle de eventos (leer la malla congelaba el servidor).
    def _trabajo():
        with _edit_lock(session_id):
            malla = read_vtp(path)
            salida, quitada, aviso = remove_component_at(
                malla, (req.point.x, req.point.y, req.point.z), req.max_distance_mm)
            if quitada is not None:
                mesh_backup.snapshot(session_id, "edit")
                write_vtp(salida, path)
            return malla, salida, quitada, aviso

    mesh, out, removed, warning = await asyncio.to_thread(_trabajo)

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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")
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
        raise HTTPException(status_code=404, detail=f"Sesión '{session_id}' no encontrada: puede haber caducado; vuelve a cargar el estudio")

    vessel_path = session_subdir(session_id, "meshes") / "vessel_tree.vtp"

    if req.scope == "original":
        paso = mesh_backup.restore_baseline
        detail = "No hay una malla anterior guardada: aún no se ha editado esta malla."
    elif req.scope == "redo":
        paso = mesh_backup.redo
        detail = "No hay ninguna edición deshecha que rehacer."
    else:
        paso = mesh_backup.undo
        detail = "No hay ninguna edición de malla que deshacer."

    def _trabajo():
        with _edit_lock(session_id):    # deshacer mientras otra edición escribe la pisaba
            return paso(session_id)

    ok = await asyncio.to_thread(_trabajo)
    if not ok:
        raise HTTPException(status_code=409, detail=detail)

    if not vessel_path.exists():
        raise HTTPException(status_code=500, detail="La malla restaurada no está disponible.")

    try:
        n_vertices, n_faces = await asyncio.to_thread(_mesh_counts, vessel_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not read the restored mesh")
        raise HTTPException(status_code=500, detail=mensaje_error(f"Error leyendo la malla restaurada", exc))

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


@router.post(
    "/mesh-scissors/{session_id}",
    response_model=ScissorsResult,
    summary="Seccionar un vaso por un anillo de puntos marcados",
    description=(
        "La tijera. El profesional marca puntos alrededor de la arteria —como "
        "los del cuello del aneurisma— y la malla se secciona ahí.\n\n"
        "El plano sale de ajustar esos puntos por mínimos cuadrados, y el "
        "corte se limita a una bola centrada en el anillo: un plano es "
        "infinito y aplicarlo entero amputaría todo lo que cruce. Fuera de esa "
        "bola la malla no se toca, así que un vaso paralelo a un centímetro no "
        "se entera.\n\n"
        "NO corta por defecto. Con `apply` en falso devuelve la pieza que se "
        "iría, para pintarla en el visor; el corte llega cuando quien mira "
        "dice que sí. Las dos respuestas salen del mismo cálculo, así que la "
        "vista previa no puede discrepar del corte — que es justo lo que "
        "hundió al corte por plano anterior, que recortaba sin dibujar nada.\n\n"
        "Se deshace como cualquier otra edición de malla."
    ),
)
async def mesh_scissors(session_id: str, req: ScissorsRequest) -> ScissorsResult:
    path = _mesh_or_404(session_id)
    from services.mesh_crop import ScissorsError, scissors_preview

    puntos = [(p.x, p.y, p.z) for p in req.points]

    def _trabajo():
        with _edit_lock(session_id):
            malla = read_vtp(path)
            res = scissors_preview(malla, puntos, req.keep_side, req.margin_mm)
            if not req.apply:
                # La pieza condenada, a un fichero propio para que el visor la
                # pinte. Nombre fijo: solo hay una vista previa viva a la vez.
                write_vtp(res.doomed, path.parent / "scissors_preview.vtp")
                return res, False
            mesh_backup.snapshot(session_id, "crop")
            write_vtp(res.kept, path)
            return res, True

    try:
        res, aplicado = await asyncio.to_thread(_trabajo)
    except ScissorsError as exc:
        # Un anillo que no vale es cosa de quien lo marcó, no un fallo del
        # servidor: se le dice qué pasó para que lo vuelva a intentar.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not aplicado:
        return ScissorsResult(
            applied=False,
            separated=res.separated,
            removed_vertices=res.removed_vertices,
            kept_vertices=res.kept.GetNumberOfPoints(),
            preview_url=_versioned(session_id, "scissors_preview.vtp"),
            undo_depth=mesh_backup.depth(session_id),
        )

    write_state(session_id, "seg.n_vertices", str(res.kept.GetNumberOfPoints()))
    write_state(session_id, "seg.n_faces", str(res.kept.GetNumberOfPolys()))
    _invalidate_derived(session_id)
    return ScissorsResult(
        applied=True,
        separated=res.separated,
        removed_vertices=res.removed_vertices,
        kept_vertices=res.kept.GetNumberOfPoints(),
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        undo_depth=mesh_backup.depth(session_id),
    )


# ── POST /mesh-neck-detail/{session_id}: la zona del cuello fina (P6) ─────── #

def _neck_center(session_id: str) -> "tuple[tuple[float, float, float], str] | None":
    """El cuello medido por la morfometría o, sin ella, el candidato elegido."""
    from services.sessions import measured_candidate_centroid, read_state

    vals = [read_state(session_id, f"morpho.neck_origin_{k}", "") for k in "xyz"]
    if all(vals):
        try:
            return (float(vals[0]), float(vals[1]), float(vals[2])), "morfometria"
        except ValueError:
            pass
    cand = measured_candidate_centroid(session_id)
    if cand is not None:
        return (float(cand[0]), float(cand[1]), float(cand[2])), "candidato"
    return None


def _volume_loader(session_id: str):
    """(volumen, espaciado) del estudio tal como se segmentó, al pedirlo."""
    def cargar():
        import json as _json

        from routers.segment import _preprocessed_source
        from services.dicom_loader import load_series
        from services.sessions import read_state

        series = (_json.loads(read_state(session_id, "seg.params", "") or "{}").get("series_id")
                  or read_state(session_id, "dicom.series_id", ""))
        dcm = _preprocessed_source(session_id, series) or load_series(series, session_subdir(session_id, "dicom"))
        return dcm.volume, tuple(float(v) for v in dcm.spacing)
    return cargar


def _in_zone(scan, center, radius: float) -> int:
    import math
    return 0 if scan is None else sum(1 for o in scan.origins if math.dist(o.position, center) <= radius)


@router.post(
    "/mesh-neck-detail/{session_id}",
    response_model=NeckDetailResult,
    summary="Rebuild the neck zone of the mesh with full detail",
    description=(
        "Rebuilds the working mesh from the mask saved at segmentation with a "
        "sphere around the neck at full detail: lighter pre-blur (0.5 voxel "
        "instead of 0.7) and no decimation. Measured on case 3 and Zenodo 015, "
        "decimation removes nothing near the neck; the 0.7-voxel blur is what "
        "cuts thin branches into islands that the island cleanup then drops.\n\n"
        "Outside the zone the mesh comes out as before. Pieces the working mesh "
        "no longer has (main-tree filter, crops, erased pieces) stay out. The "
        "branch-origin scan is redone inside the zone. Undoable like any mesh "
        "edit; it does not clear the morphometry (the sac surface moves < 0.1 mm).\n\n"
        "409 if the mesh predates this feature (no saved mask) or there is no neck yet."
    ),
)
async def mesh_neck_detail(session_id: str, req: NeckDetailRequest) -> NeckDetailResult:
    import json as _json
    import math

    from routers.segment import mesh_fingerprint
    from services import zona_fina
    from services.branch_origins import (BranchScan, freeze_scan, scan_branch_origins,
                                         thaw_scan)
    from services.segmentation import _with_normals
    from services.sessions import read_state, write_states

    path = _mesh_or_404(session_id)
    meshes = path.parent
    datos = await asyncio.to_thread(zona_fina.cargar, meshes)
    if datos is None:
        raise HTTPException(status_code=409, detail=(
            "Esta malla no guardó su máscara (es de una segmentación anterior a esta función "
            "o del umbral clásico). Vuelve a segmentar con el método tubular para poder afinar el cuello."))
    neck = _neck_center(session_id)
    if neck is None:
        raise HTTPException(status_code=409, detail=(
            "Aún no hay cuello: elige el aneurisma y mide la morfometría primero."))
    center, source = neck
    radius = float(req.radius_mm)
    # Huellas de una malla de trabajo sin editar: la de la segmentación y la de
    # una zona fina anterior (rehacerla con otro radio no es una edición).
    try:
        previa = _json.loads(read_state(session_id, "seg.neck_detail", "") or "{}").get("huella", "")
    except ValueError:
        previa = ""
    limpias = {h for h in (datos.get("huella", ""), previa) if h}

    def _trabajo():
        with _edit_lock(session_id):
            actual = read_vtp(path)
            nueva = zona_fina.rehacer(datos, center, radius, volumen=_volume_loader(session_id))
            nueva = _with_normals(zona_fina.ajustar(nueva, actual, datos, center, radius, limpias))
            if nueva.GetNumberOfPolys() == 0:
                raise ValueError("La malla rehecha quedó vacía: no se ha cambiado nada.")
            mesh_backup.snapshot(session_id, "cuello")
            write_vtp(nueva, path)
            return actual, nueva

    try:
        actual, nueva = await asyncio.to_thread(_trabajo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Ramas: las de fuera de la zona, como estaban (pueden venir del árbol
    # entero antes de un recorte); las de dentro, del barrido de la malla nueva.
    antes = thaw_scan(session_id)
    nuevo = await asyncio.to_thread(scan_branch_origins, nueva)
    fuera = [o for o in (antes.origins if antes else []) if math.dist(o.position, center) > radius]
    dentro = [o for o in nuevo.origins if math.dist(o.position, center) <= radius]
    for i, o in enumerate(fuera + dentro, start=1):
        o.index = i
    freeze_scan(session_id, BranchScan(
        origins=fuera + dentro, voxel_mm=nuevo.voxel_mm, calibre_floor_mm=nuevo.calibre_floor_mm,
        mesh_points=nueva.GetNumberOfPoints(), elapsed_s=nuevo.elapsed_s))

    estado = {
        "seg.n_vertices": str(nueva.GetNumberOfPoints()),
        "seg.n_faces": str(nueva.GetNumberOfPolys()),
        "seg.neck_detail": _json.dumps({"center": list(center), "radius_mm": radius, "source": source,
                                        "huella": mesh_fingerprint(nueva)}),
    }
    # Afinar el cuello no es una edición para el detector: si detect_tree.vtp
    # acompañaba a la malla de antes, acompaña a esta (routers/detect.py).
    if (read_state(session_id, "seg.detect_tree_for", "") or "") == mesh_fingerprint(actual):
        estado["seg.detect_tree_for"] = mesh_fingerprint(nueva)
    write_states(session_id, estado)
    # La malla teñida por zonas de riesgo se hizo sobre la de antes.
    (meshes / "perforators_risk.vtp").unlink(missing_ok=True)

    return NeckDetailResult(
        mesh_url=_versioned(session_id, "vessel_tree.vtp"),
        vertices=nueva.GetNumberOfPoints(), faces=nueva.GetNumberOfPolys(),
        added_vertices=nueva.GetNumberOfPoints() - actual.GetNumberOfPoints(),
        center=Position3D(x=center[0], y=center[1], z=center[2]), radius_mm=radius,
        neck_source=source,
        branches_in_zone=len(dentro), branches_in_zone_before=_in_zone(antes, center, radius),
        undo_depth=mesh_backup.depth(session_id),
    )
