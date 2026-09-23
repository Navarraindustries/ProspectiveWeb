"""Models for interactive mesh editing: ROI crop and grow-from-seeds."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .detection import Position3D


class MeshCropRequest(BaseModel):
    """Crop the working vessel mesh to (or away from) a box or sphere ROI.

    Coordinates are in the mesh/world space (mm) returned by 3D picking, the same
    space used for centreline source/target points.
    """

    mode: Literal["box", "sphere"] = Field(..., description="ROI shape")
    center: Position3D = Field(..., description="ROI centre (picked point), mm")
    radius: float = Field(
        10.0, gt=0.0, le=200.0,
        description="Sphere radius (mode='sphere'), mm",
    )
    half_size: Position3D | None = Field(
        None,
        description="Box half-extents per axis (mode='box'), mm. Omit to use `radius` as a cube half-side.",
    )
    invert: bool = Field(
        False,
        description="False = keep geometry INSIDE the ROI; True = remove it (keep the outside).",
    )


class MeshCropResult(BaseModel):
    mesh_url: str = Field(..., description="URL of the cropped mesh (.vtp), cache-busted")
    vertices: int = Field(..., description="Vertex count after cropping")
    faces: int = Field(..., description="Triangle count after cropping")
    removed_vertices: int = Field(..., description="Vertices removed by the crop")
    undo_depth: int = Field(
        0, description="Mesh edits that can still be undone after this one"
    )


class MeshPlaneCutRequest(BaseModel):
    """Cortar por un plano, sin tener que elegir un centro.

    El recorte por caja o esfera obliga a acertar un centro a ojo, y para
    quitar la chapa que queda bajo el árbol eso son varios intentos. Un plano
    se define con una dirección y una altura: un deslizador.
    """

    axis: Literal["x", "y", "z", "custom"] = Field(
        "y", description="Eje del corte. «custom» usa `normal`."
    )
    offset_mm: float = Field(
        ..., description="Dónde cruza el plano ese eje, en coordenadas de mundo"
    )
    normal: Position3D | None = Field(
        None, description="Normal del plano cuando axis='custom'"
    )
    keep_positive: bool = Field(
        True,
        description=(
            "True conserva el lado hacia el que apunta la normal. Para quitar "
            "lo de abajo en el eje Y: axis='y' y keep_positive=True."
        ),
    )


class MeshPlaneCutResult(BaseModel):
    mesh_url: str
    vertices: int
    faces: int
    removed_vertices: int
    components_left: int = 0
    undo_depth: int = 0


class MeshBoundsResult(BaseModel):
    """La caja de la malla, para que el deslizador tenga extremos reales."""

    min: Position3D
    max: Position3D
    vertices: int = 0


class ComponentDeleteRequest(BaseModel):
    """Borrar de un clic la pieza conexa señalada.

    El borrador manual, con la granularidad que el dato ya tiene: el ruido de
    una malla angiográfica viene en piezas enteras y separadas —medido en case
    3, diez bloques de 228 a 2948 mm3 a 37-92 mm del árbol—, así que pintar
    sobre él no hace falta y dejaría bordes a medio borrar.
    """

    point: Position3D = Field(
        ..., description="Punto señalado sobre la superficie de la pieza a borrar"
    )
    max_distance_mm: float = Field(
        5.0, gt=0, le=50,
        description=(
            "Tolerancia del clic. Más allá no se borra nada y se dice, en vez "
            "de borrar la pieza que casualmente quedara más cerca."
        ),
    )


class ComponentInfoOut(BaseModel):
    """Lo que se acaba de borrar, para poder decir qué era."""

    n_points: int = 0
    volume_mm3: float = 0.0
    extent_mm: float = 0.0
    thickness_mm: float = 0.0
    sphericity: float = 0.0


class ComponentDeleteResult(BaseModel):
    mesh_url: str = Field(..., description="URL de la malla resultante (.vtp)")
    vertices: int
    faces: int
    removed: ComponentInfoOut | None = Field(
        None, description="La pieza borrada. Null si no se borró ninguna."
    )
    components_left: int = Field(0, description="Piezas conexas que quedan")
    warning: str = Field(
        "", description="Por qué no se borró nada, cuando no se borró nada."
    )
    undo_depth: int = Field(0, description="Ediciones que se pueden deshacer")


class ComponentListResult(BaseModel):
    """Las piezas de la malla, para poder enseñar cuántas hay y de qué tamaño."""

    components: list[ComponentInfoOut] = Field(default_factory=list)
    total: int = 0
    largest_is_tree: bool = Field(
        True, description="Si la mayor parece un árbol vascular y no un bloque"
    )
    warning: str = Field("", description="Por qué la mayor no parece un árbol")


class GrowRequest(BaseModel):
    """Region-grow a fresh vessel mesh from seed points placed on the volume."""

    seeds: list[Position3D] = Field(
        ..., min_length=1, description="Seed points in mesh/world space (mm)"
    )
    lower: float = Field(80.0, description="Lower HU bound for connected-threshold growing")
    upper: float = Field(600.0, description="Upper HU bound for connected-threshold growing")
    auto_band: bool = Field(
        False,
        description=(
            "Derive the HU band automatically from the intensity at the seeds — a "
            "narrow window around the vessel value that excludes bone/tissue. When "
            "true, `lower`/`upper` are ignored."
        ),
    )
    smoothing: int = Field(5, ge=0, le=10, description="Smoothing level 0–10")
    cleanup: int = Field(5, ge=0, le=10, description="Component cleanup level 0–10")


class GrowResult(BaseModel):
    mesh_url: str = Field(..., description="URL of the grown mesh (.vtp), cache-busted")
    vertices: int
    faces: int
    n_voxels: int = Field(..., description="Voxels in the grown region")
    fragments_removed: int = Field(..., description="Satellite components discarded")
    seeds: int = Field(..., description="Number of seeds used")
    band_lower: float = Field(0.0, description="Lower HU bound actually used (derived when auto_band)")
    band_upper: float = Field(0.0, description="Upper HU bound actually used")
    undo_depth: int = Field(
        0, description="Mesh edits that can still be undone after this one"
    )


class MeshRestoreRequest(BaseModel):
    """Step the working vessel mesh back or forward through the edit history."""

    scope: Literal["undo", "redo", "original"] = Field(
        "undo",
        description=(
            "'undo' restores the mesh as it was before the last edit (crop, grow "
            "or re-segmentation); 'redo' replays the last undone edit; 'original' "
            "goes back to the oldest state still kept — the first segmentation's "
            "output. All three are reversible."
        ),
    )


class MeshRestoreResult(BaseModel):
    mesh_url: str = Field(..., description="URL of the restored mesh (.vtp), cache-busted")
    vertices: int
    faces: int
    scope: Literal["undo", "redo", "original"]
    undo_depth: int = Field(..., description="Edits that can still be undone")
    redo_depth: int = Field(0, description="Undone edits that can be replayed")


class MeshHistoryStep(BaseModel):
    """One recoverable mesh state, as the panel lists it."""

    label: str = Field(..., description="Raw kind: 'segment' | 'crop' | 'grow' | 'edit'")
    title: str = Field(..., description="Human-readable name of the step")
    vertices: int = Field(..., description="Vertex count of that state")
    at: float = Field(..., description="Unix timestamp when it was recorded")


class MeshHistoryResult(BaseModel):
    """What the mesh-edit panel needs to drive its undo/redo controls."""

    undo_depth: int = Field(..., description="Edits that can be undone")
    redo_depth: int = Field(0, description="Undone edits that can be replayed")
    has_original: bool = Field(
        ..., description="True when an earlier mesh state can be restored"
    )
    steps: list[MeshHistoryStep] = Field(
        default_factory=list,
        description="The undo stack, oldest first — «quedan 3» alone said nothing about what they were",
    )


class RegionEraseRequest(BaseModel):
    """Borrar de un clic el tejido PEGADO al árbol.

    `ComponentDeleteRequest` borra una pieza entera y sirve cuando el hueso
    viene suelto. En 3DRA a resolución completa no lo está: el peñasco y la
    base del cráneo tocan el árbol, así que forman parte del componente mayor
    y «solo el árbol principal» los conserva.

    Es manual a propósito. Se midieron dos vías para distinguirlos solos sobre
    case 3 a resolución completa, y ninguna separa: la rugosidad de la chapa es
    0,742 y la del resto del árbol 0,717; el calibre local es 0,69 mm en ambos.
    Localmente son la misma cosa.
    """

    point: Position3D = Field(
        ..., description="Punto señalado sobre la zona a borrar"
    )
    radius_mm: float = Field(
        6.0, gt=0, le=100,
        description=(
            "Hasta dónde llega el borrado, medido en LÍNEA RECTA desde el "
            "clic. La propagación va por la superficie, así que un vaso que "
            "cruza esa bola pero se une al árbol por fuera de ella no se toca."
        ),
    )
    max_distance_mm: float = Field(
        5.0, gt=0, le=50,
        description="Si el clic cae más lejos que esto de la malla, no se borra nada.",
    )


class RegionEraseResult(BaseModel):
    """Resultado de borrar una región pegada."""

    mesh_url: str
    vertices: int
    faces: int
    removed_vertices: int = Field(
        0, description="Vértices que ha quitado esta pasada (0 = no se borró nada)"
    )
    warning: str = ""
    undo_depth: int = 0
