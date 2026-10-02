"""UIATS (Etminan, Neurology 2015): dos sumas, a favor de tratar y de vigilar."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class UiatsRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Sesión donde registrarlo (llega al informe)")
    age_years: int = Field(..., ge=18, le=120, description="La escala excluye a menores de 18")
    risk_factors: list[str] = Field(default_factory=list)
    symptoms: list[str] = Field(default_factory=list)
    patient_other: list[str] = Field(default_factory=list)
    diameter_mm: float = Field(..., ge=0.0)
    morphology: list[str] = Field(default_factory=list)
    location: Literal["basilar_bifurcation", "vertebrobasilar", "acom_pcom", "other"] = "other"
    aneurysm_other: list[str] = Field(default_factory=list)
    life_expectancy: Optional[Literal["lt5", "5to10", "gt10"]] = Field(
        None, description="Solo si hay enfermedad crónica o maligna que la limite")
    comorbid: list[str] = Field(default_factory=list)
    complexity: Literal["high", "low"] = "low"


class UiatsItem(BaseModel):
    label: str
    points: int


class UiatsResult(BaseModel):
    repair: int = Field(..., description="Suma a favor de tratar")
    conservative: int = Field(..., description="Suma a favor de vigilar (incluye la constante de 5)")
    difference: int = Field(..., description="repair − conservative")
    recommendation: Literal["repair", "conservative", "not_definitive"]
    repair_items: list[UiatsItem]
    conservative_items: list[UiatsItem]
    notes: list[str]
    sources: list[str]
