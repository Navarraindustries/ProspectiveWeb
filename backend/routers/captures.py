"""Capturas del visor guardadas en el caso.

El profesional pulsa un botón y la imagen de lo que está viendo queda adjunta
al estudio de imagen, con el estado que la produjo.

DÓNDE VIVEN. En el archivo durable (`services.storage`), junto al DICOM del
mismo estudio, y se sirven SOLO por el endpoint autenticado de aquí abajo.
Nunca bajo `data/`, que es StaticFiles: además de ser otro régimen de acceso,
`data/sessions/…` se purga a las SESSION_TTL_HOURS y una captura que el
cirujano guarda hoy tiene que seguir ahí el lunes.

QUÉ NO HACE. No retoca la imagen ni la recomprime: lo que manda el visor es lo
que se guarda. Lo único que comprueba es que sean bytes de PNG de verdad y que
no pasen del tope — un cliente puede equivocarse, y un endpoint que guarda
cualquier cosa que le digan que es una imagen acaba sirviendo cualquier cosa.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from models.captures import CaptureCreate, CaptureOut, CaptureRename
from services.auth_service import get_current_user
from services.database import get_db
from services.db_models import CaseCapture, ImagingStudy, User
from services.storage import capture_key, get_storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/captures", tags=["captures"])

# Un PNG del visor a pantalla completa ronda el megabyte. El tope está muy por
# encima para no cortar una pantalla 4K, y muy por debajo de lo que haría daño.
MAX_PNG_BYTES = 12 * 1024 * 1024
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _decode_png(png_b64: str) -> bytes:
    """Los bytes del PNG, o 422 diciendo qué venía mal."""
    payload = png_b64.strip()
    # Por comodidad del cliente se acepta también el data URL entero.
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="La imagen no es base64 válido.") from exc
    if not raw:
        raise HTTPException(status_code=422, detail="La imagen llegó vacía.")
    if len(raw) > MAX_PNG_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"La imagen pesa {len(raw) / 1e6:.1f} MB y el tope son {MAX_PNG_BYTES / 1e6:.0f} MB.",
        )
    if not raw.startswith(_PNG_MAGIC):
        raise HTTPException(status_code=422, detail="Los bytes no son un PNG.")
    return raw


def _state(row: CaseCapture) -> dict[str, Any]:
    """El estado guardado, o vacío si la fila es antigua o quedó corrupta."""
    try:
        parsed = json.loads(row.state_json or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _is_video(row: CaseCapture) -> bool:
    return (row.media_type or "image/png").startswith("video/")


def _out(row: CaseCapture) -> CaptureOut:
    video = _is_video(row)
    return CaptureOut(
        id=row.id,
        imaging_study_id=row.imaging_study_id,
        case_id=row.case_id,
        patient_id=row.patient_id,
        session_id=row.session_id or "",
        step=row.step or "",
        label=row.label or "",
        width=row.width or 0,
        height=row.height or 0,
        size_bytes=row.size_bytes or 0,
        created_at=row.created_at,
        created_by=(row.author.username if row.author else ""),
        image_url="" if video else f"/api/captures/{row.id}/image",
        media_type=row.media_type or "image/png",
        duration_s=float(row.duration_s or 0.0),
        video_url=f"/api/captures/{row.id}/video" if video else "",
        state=_state(row),
    )


def _get(db: Session, capture_id: int) -> CaseCapture:
    row = db.query(CaseCapture).filter(CaseCapture.id == capture_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No existe la captura {capture_id}.")
    return row


# ── POST /api/captures ─────────────────────────────────────────────────────── #

@router.post(
    "",
    response_model=CaptureOut,
    status_code=201,
    summary="Guardar una captura del visor en el estudio",
    description=(
        "Recibe el PNG en base64 y lo archiva junto al DICOM del estudio de "
        "imagen indicado, con el estado que lo produjo.\n\n"
        "La captura cuelga del ESTUDIO DE IMAGEN, no del caso: así un caso con "
        "TAC y angiografía de control sabe de qué adquisición salió cada "
        "imagen. El caso y el paciente se copian a la fila para poder listar "
        "por cualquiera de los tres."
    ),
)
async def create_capture(
    req:          CaptureCreate,
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
) -> CaptureOut:
    img = db.query(ImagingStudy).filter(ImagingStudy.id == req.imaging_study_id).first()
    if img is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el estudio de imagen {req.imaging_study_id}.",
        )

    raw = _decode_png(req.png_b64)
    uid = uuid.uuid4().hex
    key = capture_key(img.id, uid)
    try:
        get_storage().put_bytes(key, raw)
    except Exception as exc:  # noqa: BLE001 — el almacén puede estar caído o lleno
        logger.exception("No se pudo archivar la captura del estudio %s", img.id)
        raise HTTPException(status_code=500, detail="No se pudo guardar la imagen.") from exc

    ahora = datetime.now()
    row = CaseCapture(
        imaging_study_id=img.id,
        case_id=img.case_id,
        patient_id=img.patient_id,
        session_id=(req.session_id or "")[:64],
        step=(req.step or "")[:32],
        # El rótulo por defecto lo pone el cliente, que es quien sabe cómo se
        # llama cada paso (`pipeline/steps.ts`, una sola lista). Aquí solo hay
        # un último recurso para que ninguna fila quede sin nombre.
        label=(req.label or f"Captura {ahora:%d/%m %H:%M}")[:256],
        storage_key=key,
        width=req.width,
        height=req.height,
        size_bytes=len(raw),
        state_json=json.dumps(req.state, ensure_ascii=False, default=str),
        created_by=(current_user.id if current_user else None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Captura %s archivada en el estudio %s (%.0f KB)", row.id, img.id, len(raw) / 1024)
    return _out(row)


# ── POST /api/captures/video ───────────────────────────────────────────────── #

#: El grabador pide 2,5 Mbit/s y corta a los 3 minutos: ~56 MB en el peor
#: caso, y en la práctica una malla que gira comprime bastante menos. El tope no
#: corta un uso normal y sí un fichero que no es lo que dice ser.
MAX_VIDEO_BYTES = 80 * 1024 * 1024
#: Lo que el grabador del visor produce. Nada más: un endpoint que guarda
#: cualquier cosa que digan que es un vídeo acaba sirviendo cualquier cosa.
_VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm"}


def _video_kind(head: bytes) -> str | None:
    """El tipo real por los primeros bytes: MP4 lleva `ftyp` en el 4; WebM
    empieza por la cabecera EBML."""
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "video/mp4"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    return None


@router.post(
    "/video",
    response_model=CaptureOut,
    status_code=201,
    summary="Guardar una grabación del visor en el estudio",
    description=(
        "Recibe el vídeo tal cual (multipart, no base64: pesa megas) y lo "
        "archiva junto al DICOM del estudio de imagen, como una captura. Solo "
        "MP4 o WebM, comprobados por sus bytes, y como mucho "
        f"{MAX_VIDEO_BYTES // (1024 * 1024)} MB."
    ),
)
async def create_video(
    db:           Annotated[Session,     Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_current_user)],
    file:             UploadFile = File(..., description="El vídeo, MP4 o WebM"),
    imaging_study_id: int   = Form(...),
    session_id:       str   = Form(""),
    step:             str   = Form(""),
    label:            str   = Form(""),
    width:            int   = Form(0, ge=0),
    height:           int   = Form(0, ge=0),
    duration_s:       float = Form(0.0, ge=0.0),
    state:            str   = Form("{}", description="El estado del visor, en JSON"),
) -> CaptureOut:
    img = db.query(ImagingStudy).filter(ImagingStudy.id == imaging_study_id).first()
    if img is None:
        raise HTTPException(status_code=404, detail=f"No existe el estudio de imagen {imaging_study_id}.")

    # Por trozos y con tope: no se carga en memoria lo que ya se sabe que sobra.
    trozos: list[bytes] = []
    total = 0
    while True:
        trozo = await file.read(1024 * 1024)
        if not trozo:
            break
        total += len(trozo)
        if total > MAX_VIDEO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"El vídeo pasa de {MAX_VIDEO_BYTES // (1024 * 1024)} MB.",
            )
        trozos.append(trozo)
    raw = b"".join(trozos)
    if not raw:
        raise HTTPException(status_code=422, detail="El vídeo llegó vacío.")
    kind = _video_kind(raw[:16])
    if kind is None:
        raise HTTPException(status_code=422, detail="Los bytes no son un MP4 ni un WebM.")

    try:
        estado = json.loads(state or "{}")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="El estado no es JSON válido.") from exc
    if not isinstance(estado, dict):
        raise HTTPException(status_code=422, detail="El estado tiene que ser un objeto JSON.")

    key = capture_key(img.id, uuid.uuid4().hex, _VIDEO_TYPES[kind])
    try:
        get_storage().put_bytes(key, raw)
    except Exception as exc:  # noqa: BLE001 — el almacén puede estar caído o lleno
        logger.exception("No se pudo archivar la grabación del estudio %s", img.id)
        raise HTTPException(status_code=500, detail="No se pudo guardar el vídeo.") from exc

    ahora = datetime.now()
    row = CaseCapture(
        imaging_study_id=img.id,
        case_id=img.case_id,
        patient_id=img.patient_id,
        session_id=(session_id or "")[:64],
        step=(step or "")[:32],
        label=(label or f"Grabación {ahora:%d/%m %H:%M}")[:256],
        storage_key=key,
        width=width,
        height=height,
        size_bytes=len(raw),
        state_json=json.dumps(estado, ensure_ascii=False, default=str),
        media_type=kind,
        duration_s=round(float(duration_s), 2),
        created_by=(current_user.id if current_user else None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Grabación %s archivada en el estudio %s (%.1f MB, %.0f s)",
                row.id, img.id, len(raw) / 1e6, duration_s)
    return _out(row)


# ── GET /api/captures ──────────────────────────────────────────────────────── #

@router.get(
    "",
    response_model=list[CaptureOut],
    summary="Listar capturas de un estudio, un caso o un paciente",
    description=(
        "Las más recientes primero. Sin los bytes: cada fila trae el endpoint "
        "que sirve su PNG. Hay que dar al menos uno de los tres filtros; una "
        "lista de todas las capturas de la base no le sirve a nadie y sería un "
        "volcado de imágenes de pacientes."
    ),
)
async def list_captures(
    db: Annotated[Session, Depends(get_db)],
    imaging_study_id: int | None = Query(None, description="Capturas de esta adquisición"),
    case_id:          int | None = Query(None, description="Capturas de todo el caso clínico"),
    patient_id:       int | None = Query(None, description="Capturas de todos los casos del paciente"),
    limit:            int        = Query(200, ge=1, le=500),
) -> list[CaptureOut]:
    if imaging_study_id is None and case_id is None and patient_id is None:
        raise HTTPException(
            status_code=422,
            detail="Indica imaging_study_id, case_id o patient_id.",
        )
    q = db.query(CaseCapture)
    if imaging_study_id is not None:
        q = q.filter(CaseCapture.imaging_study_id == imaging_study_id)
    if case_id is not None:
        q = q.filter(CaseCapture.case_id == case_id)
    if patient_id is not None:
        q = q.filter(CaseCapture.patient_id == patient_id)
    rows = q.order_by(CaseCapture.created_at.desc(), CaseCapture.id.desc()).limit(limit).all()
    return [_out(r) for r in rows]


# ── GET /api/captures/{id}/image ───────────────────────────────────────────── #

@router.get(
    "/{capture_id}/image",
    summary="El PNG de una captura",
    description=(
        "Sirve la imagen desde el archivo durable. Es el ÚNICO camino hacia "
        "estos bytes: no hay ninguna ruta estática que los exponga."
    ),
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No existe"}},
)
async def get_capture_image(
    capture_id: int,
    db:         Annotated[Session, Depends(get_db)],
) -> Response:
    row = _get(db, capture_id)
    if _is_video(row):
        raise HTTPException(status_code=404, detail="Es una grabación: su vídeo va por /video.")
    try:
        data = get_storage().get_bytes(row.storage_key)
    except Exception as exc:  # noqa: BLE001 — la fila puede sobrevivir al fichero
        logger.warning("Captura %s sin fichero en %s: %s", capture_id, row.storage_key, exc)
        raise HTTPException(status_code=404, detail="La imagen ya no está en el archivo.") from exc
    # `inline` y no `attachment`: la galería la enseña; descargar es cosa del
    # botón de descarga, que pone él el nombre del fichero.
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ── GET /api/captures/{id}/video ───────────────────────────────────────────── #

@router.get(
    "/{capture_id}/video",
    summary="El vídeo de una grabación",
    description="Como la imagen: solo por aquí, autenticado, desde el archivo durable.",
    responses={200: {"content": {"video/mp4": {}, "video/webm": {}}}, 404: {"description": "No existe"}},
)
async def get_capture_video(
    capture_id: int,
    db:         Annotated[Session, Depends(get_db)],
) -> Response:
    row = _get(db, capture_id)
    if not _is_video(row):
        raise HTTPException(status_code=404, detail="Es una captura: su imagen va por /image.")
    try:
        data = get_storage().get_bytes(row.storage_key)
    except Exception as exc:  # noqa: BLE001 — la fila puede sobrevivir al fichero
        logger.warning("Grabación %s sin fichero en %s: %s", capture_id, row.storage_key, exc)
        raise HTTPException(status_code=404, detail="El vídeo ya no está en el archivo.") from exc
    return Response(
        content=data,
        media_type=row.media_type,
        headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "none"},
    )


# ── PATCH /api/captures/{id} ───────────────────────────────────────────────── #

@router.patch(
    "/{capture_id}",
    response_model=CaptureOut,
    summary="Renombrar una captura",
    description=(
        "El rótulo se pone solo al guardar para no romper el «un botón, una "
        "captura». Cambiarlo después es donde el profesional dice qué era."
    ),
)
async def rename_capture(
    capture_id: int,
    req:        CaptureRename,
    db:         Annotated[Session, Depends(get_db)],
) -> CaptureOut:
    row = _get(db, capture_id)
    nuevo = req.label.strip()
    if not nuevo:
        raise HTTPException(status_code=422, detail="El rótulo no puede quedar vacío.")
    row.label = nuevo[:256]
    db.commit()
    db.refresh(row)
    return _out(row)


# ── DELETE /api/captures/{id} ──────────────────────────────────────────────── #

@router.delete(
    "/{capture_id}",
    status_code=204,
    summary="Borrar una captura",
    description="Quita la fila y el fichero del archivo. No se puede deshacer.",
)
async def delete_capture(
    capture_id: int,
    db:         Annotated[Session, Depends(get_db)],
) -> Response:
    row = _get(db, capture_id)
    key = row.storage_key
    db.delete(row)
    db.commit()
    try:
        get_storage().delete_key(key)
    except Exception:  # noqa: BLE001 — la fila ya no está; un huérfano no rompe nada
        logger.warning("Captura %s borrada pero su fichero %s sigue ahí", capture_id, key)
    return Response(status_code=204)
