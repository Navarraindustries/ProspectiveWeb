"""ELAPSS — riesgo de CRECIMIENTO a 3 y 5 años de un aneurisma no roto.

Backes et al., Neurology 2017;88:1600-1606. Predice crecimiento, no rotura:
sirve para decidir cada cuánto repetir la imagen.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ElapssPopulation = Literal["other", "japan", "finland"]
ElapssLocation = Literal["ica_aca_acom", "mca", "pcom_posterior"]


class ElapssRequest(BaseModel):
    session_id: str | None = Field(
        None, description="Sesión donde registrarlo (llega al informe). Sin ella, cálculo suelto.")
    earlier_sah: bool = Field(False, description="HSA previa por OTRO aneurisma")
    location: ElapssLocation = Field("ica_aca_acom", description="Localización del aneurisma")
    age_years: int = Field(60, ge=0, le=120)
    population: ElapssPopulation = Field(
        "other", description="other = Norteamérica, China o Europa salvo Finlandia")
    size_mm: float = Field(..., ge=0.0, description="Ø máximo (mm), de la morfometría")
    irregular: bool = Field(False, description="Varios lóbulos, blebs o protrusiones de pared")


class ElapssResult(BaseModel):
    earlier_sah_pts: int
    location_pts: int
    age_pts: int
    population_pts: int
    size_pts: int
    shape_pts: int
    total_score: int
    score_band: str = Field(..., description="«<5», «5-9», «10-14», «15-19», «20-24», «≥25»")
    growth_3yr_pct: float
    growth_5yr_pct: float
    notes: list[str]
    sources: list[str]
