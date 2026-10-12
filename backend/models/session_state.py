"""Session save / restore models.

Matches prospective/io/session.py (SessionData dataclass).
Allows the user to save progress and resume from any step.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .clips import PlacedClipsState
from .dicom import SeriesInfo
from .trajectory import TrajectoryResult
from .treatment import TreatmentDecisionRequest, TreatmentDecisionResult


#: Índice del último paso del flujo (el Informe). Va a la par de
#: `frontend/src/pipeline/steps.ts`.
LAST_STEP = 7

class SessionSaveRequest(BaseModel):
    """Request to persist the current session state."""

    session_id: str
    label: str = Field("", description="Optional user label for this saved session")
    patient_id: int | None = Field(
        None, description="Associate this session with a patient record"
    )
    study_id: int | None = Field(
        None, description="Clinical case this session belongs to"
    )
    imaging_study_id: int | None = Field(
        None, description="Imaging study (acquisition) this session analysed"
    )
    # «Reanudar» da a la sesión viva un id nuevo; guardar por ese id añadía una
    # fila más en «Sesiones guardadas» cada vez (seis casi iguales en la ficha
    # del paciente de prueba). Por defecto se guarda sobre la sesión de la que
    # salió; `False` la guarda como una sesión nueva, como antes.
    overwrite_origin: bool = Field(
        True,
        description=(
            "If this live session was resumed from a saved one and has no record of "
            "its own yet, update that saved record (it takes this session's id) "
            "instead of adding a new one. False saves it as a new session."
        ),
    )
    # Ocho pasos desde que «Fabricación» entró antes del informe (índices 0–7).
    # El tope seguía en 6: guardar el progreso estando en el Informe se
    # rechazaba, y el botón del propio informe guardaba un 6, que ya es
    # Fabricación, así que «Reanudar» dejaba un paso antes de donde se guardó.
    current_step: int = Field(
        0, ge=0, le=LAST_STEP,
        description="Current workflow step index (0-based: 0=Carga … 6=Fabricación, 7=Informe)"
    )


class SessionSaveResult(BaseModel):
    """Confirmation of a successful session save."""

    file_path: str = Field(..., description="Server-side path of the saved .prospective file")
    download_url: str = Field(..., description="URL to download the session file")
    saved_at: datetime


class ViewerWindow(BaseModel):
    """Ventana y nivel de los cortes, tal como los dejó el profesional."""

    wc: float = Field(..., description="Centro de la ventana (nivel)")
    ww: float = Field(..., gt=0, description="Anchura de la ventana")


class ReportUrls(BaseModel):
    """Los documentos ya generados que siguen en disco."""

    pdf_url: str | None = Field(None, description="Informe PDF, si existe el fichero")
    dicom_sr_url: str | None = Field(None, description="DICOM SR, si existe el fichero")
    pdf_current: bool = Field(
        False,
        description=(
            "El PDF se generó con el plan que la sesión tiene ahora. False si el "
            "plan cambió después o no se sabe con cuál se generó: hay que regenerarlo."
        ),
    )
    sr_current: bool = Field(False, description="Lo mismo para el DICOM SR")


class SessionRestoreResult(BaseModel):
    """Result of loading a saved session."""

    session_id: str = Field(..., description="New session_id for this restored session")
    current_step: int = Field(..., description="Step the session was saved at")
    label: str
    has_segmentation: bool
    has_detection: bool
    has_morphometry: bool
    has_plan: bool
    restored_at: datetime
    # Rehydration payload — lets the frontend repopulate the store without re-upload.
    mesh_url: str = Field("", description="URL of the restored vessel mesh (empty if none)")
    n_vertices: int = Field(0, description="Vertex count of the restored mesh")
    n_faces: int = Field(0, description="Face count of the restored mesh")
    modality: str = Field("", description="DICOM modality of the restored volume")
    patient_id: int | None = Field(None, description="Patient this session belongs to")
    study_id: int | None = Field(None, description="Clinical case this session belongs to")
    study_label: str = Field("", description="Human label of that case, for the breadcrumb")
    imaging_study_id: int | None = Field(
        None, description="Imaging study this session was analysing"
    )
    series: SeriesInfo | None = Field(
        None,
        description=(
            "Series of the restored volume. Without it the upload step shows an "
            "empty drop zone even though the viewer is already rendering the MPR."
        ),
    )
    # Cómo se hizo la malla restaurada. Las sesiones guardadas antes de que
    # existieran no las tienen: 0 / "" y el frontend cae a lo de antes.
    downsample_factor: int = Field(
        0, description="Submuestreo con el que se segmentó la malla (1 = nativa; 0 = desconocido)"
    )
    method: str = Field("", description="Método de segmentación ('tubular' o 'threshold'; '' = desconocido)")
    fallback_note: str = Field(
        "", description="Por qué el servidor bajó a media resolución, si lo hizo"
    )
    centerline_mesh_url: str = Field(
        "",
        description=(
            "URL of the restored centreline (empty if the session had none). "
            "Without it the centreline-guided stent stays unavailable even "
            "though its geometry came back with the snapshot."
        ),
    )
    centerline_arc_mm: float = Field(
        0.0, description="Total arc length of the restored centreline (mm)"
    )
    # ── Lo hecho a mano después de detectar (familia S) ──────────────────── #
    # Reanudar volvía sin nada de esto aunque estuviera en el estado: la
    # decisión (y con ella «Planificar dispositivos» apagado), el corredor, la
    # lista editable de clips, la ventana y los enlaces del informe. Null =
    # no se hizo (o se borró) en la sesión guardada.
    treatment: TreatmentDecisionResult | None = Field(
        None, description="La recomendación guardada, igual que la devolvió el motor"
    )
    treatment_inputs: TreatmentDecisionRequest | None = Field(
        None, description="Las entradas clínicas con que se pidió (con el session_id nuevo)"
    )
    trajectory: TrajectoryResult | None = Field(
        None, description="La trayectoria guardada con su ángulo, profundidad y corredor"
    )
    placed_clips: PlacedClipsState | None = Field(
        None, description="La lista editable de clips colocados y su verificación"
    )
    window: ViewerWindow | None = Field(
        None, description="Ventana y nivel de los cortes; null = la del DICOM"
    )
    report_urls: ReportUrls | None = Field(
        None, description="Enlaces al PDF y al SR ya generados, si siguen en disco"
    )
    lesion_confirmed: bool = Field(
        False,
        description=(
            "Hay una confirmación de lesión vigente para esta sesión (por su "
            "estudio o por su linaje de sesiones)"
        ),
    )


class SessionListItem(BaseModel):
    """One entry in the user's saved session list."""

    id: int
    session_id: str
    label: str
    current_step: int
    patient_name: str = ""
    created_at: datetime
    updated_at: datetime
    file_size_kb: float
