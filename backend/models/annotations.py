"""Anotaciones persistentes: reglas, ángulos, regiones y marcadores de la sesión.

Los puntos van en mm, en el espacio del paciente, como el resto de la API. El
cliente las mide con las mismas fórmulas que el informe (frontend
`vtk/annotations.ts`, backend `services/annotations.py`); aquí solo se guarda
la forma, sin medidas, para que no haya dos cifras que puedan discrepar.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from models.detection import Position3D

# Cuántos puntos tiene cada tipo. Una región es un polígono: tres como mínimo.
_PUNTOS = {"regla": 2, "angulo": 3, "marcador": 1}


class AnnotationPlane(BaseModel):
    plane: Literal["axial", "coronal", "sagital"]
    index: int = Field(..., ge=0, description="Corte del plano en el que se dibujó")


class Annotation(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    kind: Literal["regla", "angulo", "region", "marcador"]
    points: list[Position3D]
    plane: AnnotationPlane | None = Field(
        default=None, description="Corte en el que se dibujó; obligatorio en una región")
    label: str = Field(..., max_length=40)
    note: str = Field(default="", max_length=500)
    visible: bool = True
    created_at: str = Field(default="", description="ISO 8601; lo pone el servidor si llega vacío")
    created_by: str = Field(default="", description="Usuario; lo pone el servidor si llega vacío")

    @model_validator(mode="after")
    def _forma_por_tipo(self) -> "Annotation":
        n = len(self.points)
        if self.kind == "region":
            # El área de una región se mide en su corte: sin plano no hay área.
            if n < 3:
                raise ValueError("Una región necesita al menos 3 puntos.")
            if self.plane is None:
                raise ValueError("Una región necesita el plano en el que se dibujó.")
        elif n != _PUNTOS[self.kind]:
            raise ValueError(f"Un(a) {self.kind} tiene {_PUNTOS[self.kind]} punto(s), no {n}.")
        return self


class AnnotationsIn(BaseModel):
    # Se manda la lista entera en cada cambio; el tope evita que una sesión
    # se convierta en un vertedero de miles de marcas.
    annotations: list[Annotation] = Field(..., max_length=200)


class AnnotationsResult(BaseModel):
    annotations: list[Annotation]
