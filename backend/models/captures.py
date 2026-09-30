"""Capturas del visor guardadas en el caso.

Una captura es un PNG de lo que el profesional tenía en pantalla —escena 3D,
cortes, MIP y la lectura del HUD— más el estado que lo produjo. Lo segundo es
lo que la mantiene útil: una imagen sin su paso, su cámara y sus medidas no se
puede situar seis semanas después.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CaptureCreate(BaseModel):
    """Lo que el visor manda al pulsar el botón."""

    imaging_study_id: int = Field(
        ..., description="Estudio de imagen del que sale la captura (su adquisición)"
    )
    session_id: str = Field(
        "", description="Sesión viva en la que se tomó; informativa, se purga a las 24 h"
    )
    step: str = Field("", description="Paso del pipeline: segment | detect | morpho | devices | …")
    label: str = Field("", description="Título; si viene vacío lo pone el servidor")
    png_b64: str = Field(..., description="La imagen en PNG, en base64 y sin la cabecera data:")
    width: int = Field(0, ge=0, description="Ancho en píxeles, para listar sin abrir el fichero")
    height: int = Field(0, ge=0, description="Alto en píxeles")
    state: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "El estado que produjo la imagen: cámara, candidato, umbral, medidas "
            "en pantalla, distribución de paneles. Se guarda tal cual."
        ),
    )


class CaptureRename(BaseModel):
    """Renombrar una captura ya guardada."""

    label: str = Field(..., max_length=256)


class CaptureOut(BaseModel):
    """Una captura en la galería. Sin los bytes: la imagen va por su endpoint."""

    id: int
    imaging_study_id: int
    case_id: int | None = None
    patient_id: int | None = None
    session_id: str = ""
    step: str = ""
    label: str = ""
    width: int = 0
    height: int = 0
    size_bytes: int = 0
    created_at: datetime
    created_by: str = Field("", description="Quién la tomó")
    image_url: str = Field(
        "", description="Endpoint autenticado que devuelve el PNG. Nunca una ruta bajo /data."
    )
    media_type: str = Field(
        "image/png", description="image/png para una captura; video/mp4 o video/webm para una grabación"
    )
    duration_s: float = Field(0.0, description="Duración de la grabación; 0 en una captura")
    video_url: str = Field(
        "", description="Endpoint autenticado del vídeo; vacío en una captura"
    )
    state: dict[str, Any] = Field(default_factory=dict)
