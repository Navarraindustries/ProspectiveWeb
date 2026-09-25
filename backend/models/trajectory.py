"""Surgical approach trajectory models."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .detection import Position3D


class TrajectoryRequest(BaseModel):
    """Entry → target surgical approach corridor (mesh/world space, mm)."""

    entry: Position3D = Field(..., description="Skin/craniotomy entry point (mm)")
    target: Position3D = Field(..., description="Aneurysm target point (mm)")


class VesselCrossingOut(BaseModel):
    """Un vaso que el corredor atraviesa antes de llegar al aneurisma."""

    distance_from_entry_mm: float
    position: Position3D
    calibre_mm: float
    calibre_source: str = Field(
        "", description="'barrido' = calibre medido en el barrido de ramas; "
                        "'malla' = estimado por la cuerda del rayo sobre la malla")


class CorridorAssessmentOut(BaseModel):
    """Qué hay dentro del corredor de abordaje, y qué se concluye.

    El veredicto tiene tres estados y sale de reglas explícitas sobre lo
    medido, no de una suma de pesos: la misma razón por la que el motor de
    tratamiento dejó de enseñar puntuaciones.
    """

    radius_mm: float = Field(..., description="Radio del corredor de trabajo supuesto")
    vessels_crossed: list[VesselCrossingOut] = Field(default_factory=list)
    nearest_branch_mm: float | None = Field(
        None, description="Distancia al origen de rama más próximo que NO se cruza")
    nearest_branch_calibre_mm: float = 0.0
    dense_tissue_mm: float = Field(
        0.0,
        description=(
            "Milímetros del recorrido por material denso que no es vasculatura "
            "—casi siempre hueso—. No se llama hueso porque el hueso no se "
            "separa del contraste por intensidad."
        ),
    )
    dense_tissue_measurable: bool = Field(
        True, description="False en un estudio sustraído: no hay tejido en la imagen")
    verdict: Literal["viable", "revisar", "no_viable"]
    verdict_reason: str = ""
    findings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class TrajectoryResult(BaseModel):
    entry: list[float]
    target: list[float]
    depth_mm: float = Field(..., description="Approach depth = |target − entry|")
    angle_deg: float = Field(..., description="Incidence angle vs the aneurysm principal axis")
    corridor: CorridorAssessmentOut | None = Field(
        None,
        description=(
            "Lo que el corredor atraviesa, medido contra la malla del paciente "
            "y el volumen. Null cuando todavía no hay malla segmentada: sin "
            "ella no hay contra qué cruzar la trayectoria."
        ),
    )


class SuggestCorridorsRequest(BaseModel):
    """Pedir al software por dónde entrar."""

    target: Position3D | None = Field(
        None,
        description=(
            "El aneurisma. Si no se da, se toma el cuello marcado en "
            "Morfometría y, en su defecto, el candidato detectado."
        ),
    )
    radius_mm: float = Field(5.0, gt=0.0, le=20.0,
                             description="Radio del corredor de trabajo")
    top: int = Field(3, ge=1, le=10)


class ProposedCorridorOut(BaseModel):
    """Una dirección de abordaje propuesta, con lo que se midió dentro."""

    entry: Position3D
    direction: list[float]
    depth_mm: float
    description: str = Field(
        "", description="La dirección dicha en anatomía: «anterior izquierda, 30° "
                        "por encima del plano axial»")
    entry_on_skin: bool = Field(
        False,
        description=(
            "False cuando la entrada es el borde del volumen reconstruido y no "
            "la piel. En una 3DRA el campo no llega al cuero cabelludo, así que "
            "lo que se propone es la DIRECCIÓN, no el punto de la craneotomía."
        ),
    )
    corridor: CorridorAssessmentOut


class SuggestCorridorsResult(BaseModel):
    """Lo que el software propone, y con qué sabe dónde está la cara."""

    proposals: list[ProposedCorridorOut] = Field(default_factory=list)
    target: Position3D
    axes_source: str = Field(
        "",
        description="dicom · dicom_sin_verificar · desconocida. Sin ejes no se "
                    "propone nada: no se podría garantizar que el corredor no "
                    "entre por la cara.",
    )
    axes_note: str = ""
    rules: list[str] = Field(
        default_factory=list,
        description="Los sectores descartados por no ser operables, dichos.",
    )
