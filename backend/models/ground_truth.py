"""Confirmación de la lesión por el profesional (verdad de referencia del detector)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.detection import Position3D

LesionSource = Literal["candidate", "marked", "no_lesion"]


class LesionConfirmIn(BaseModel):
    session_id: str
    imaging_study_id: Optional[int] = Field(
        None, description="El estudio archivado. Sin él la confirmación cuenta para "
                          "la estadística pero no se puede volver a pasar el detector.")
    source: LesionSource
    candidate_id: Optional[str] = Field(None, description="'cand-003' cuando source=candidate")
    position: Optional[Position3D] = Field(None, description="mm, cuando source=marked")


class LesionConfirmOut(BaseModel):
    id: int
    session_id: str
    imaging_study_id: Optional[int]
    source: LesionSource
    position: Optional[Position3D]
    candidate_rank: Optional[int] = Field(
        None, description="Puesto del candidato que ES la lesión; None si ninguno lo era.")
    n_candidates: int
    channels: str
    modality: str
    reproducible: bool = Field(
        ..., description="Hay estudio archivado: se puede volver a segmentar y detectar.")
    created_at: datetime
    created_by: str = ""


class LesionSummary(BaseModel):
    confirmed: int = Field(..., description="Estudios con lesión confirmada (marcada o candidato)")
    no_lesion: int
    first: int
    top3: int
    top5: int
    missed: int = Field(..., description="La lesión no estaba en la lista")
    by_modality: dict[str, int]
    reproducible: int
