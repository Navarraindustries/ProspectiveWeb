# -*- coding: utf-8 -*-
"""Cómo queda el aneurisma después de clipar.

Qué se preguntó y qué se contesta
---------------------------------
Dirección preguntó si se puede simular cómo se deforma el saco al quedar
constreñido en la mordaza. Se puede programar, pero no se puede sostener: una
deformación de la pared necesita su GROSOR, sus propiedades mecánicas y la
presión intraluminal, y ninguna de las tres se mide en la imagen — la pared de
un aneurisma tiene 0,05–0,5 mm y el vóxel de este proyecto 0,32. Además no hay
con qué validar el resultado. Sería el mismo callejón del score tipo Alvarado
que ya se descartó: sale un vídeo convincente y nadie puede afirmar que es
cierto.

Lo que sí se puede afirmar, y es la pregunta clínica de verdad, es **cuánto
aneurisma queda**. Al cerrarse las hojas, lo que queda del lado del domo sale de
la circulación y lo que queda del lado de la arteria sigue dentro. Eso es pura
geometría sobre dos objetos que ya existen —el saco aislado y el clip colocado
en su pose— y se puede medir:

- el volumen que el clip deja FUERA de la circulación;
- el **muñón** que queda dentro, que es lo que de verdad importa;
- la anchura de ese muñón en el plano del cuello;
- y el desenlace en las tres categorías con las que se habla de un clipaje:
  oclusión completa, resto de cuello, o aneurisma residual.

La única deformación que este proyecto puede afirmar ya está medida en otro
sitio: el cuello redondo queda aplastado y su línea de cierre mide el perímetro
partido por dos (`services.clips.jaw_requirement`). Eso no es una suposición, es
conservación del perímetro.

Lo que esto NO es
-----------------
No es un modelo mecánico. No dice cómo se abomba la pared entre las hojas, ni si
el cuello se desgarra, ni cuánta fuerza hace falta. Dice qué parte del saco
queda a cada lado de la línea de cierre, que es lo que decide si el domo se
sigue rellenando.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import vtk

logger = logging.getLogger(__name__)

#: Por debajo de esto el muñón es ruido de malla, no un resto.
NEGLIGIBLE_MM3: float = 5.0

#: Un muñón por encima de esta fracción del saco es un aneurisma residual, no
#: un resto de cuello. Es un corte de presentación, no un umbral clínico
#: validado: se dice cuál es y los dos números están en pantalla al lado.
RESIDUAL_FRACTION: float = 0.15

Outcome = Literal["completa", "resto_de_cuello", "residual", "sin_saco"]


@dataclass
class OcclusionResult:
    """Lo que queda del aneurisma con el clip puesto."""

    outcome: Outcome
    sac_volume_mm3: float = 0.0
    excluded_mm3: float = 0.0
    remnant_mm3: float = 0.0
    remnant_width_mm: float = 0.0
    summary: str = ""
    cautions: list[str] = field(default_factory=list)
    #: Malla del muñón, para pintarlo. None cuando no queda nada.
    remnant_poly: "vtk.vtkPolyData | None" = None

    @property
    def remnant_fraction(self) -> float:
        return (self.remnant_mm3 / self.sac_volume_mm3) if self.sac_volume_mm3 > 0 else 0.0


def _volume_mm3(poly: vtk.vtkPolyData) -> float:
    """Volumen encerrado. Requiere una malla cerrada; si no, devuelve 0."""
    if poly is None or poly.GetNumberOfPoints() < 4:
        return 0.0
    mp = vtk.vtkMassProperties()
    mp.SetInputData(poly)
    mp.Update()
    return float(mp.GetVolume())


def _cut_and_cap(poly: vtk.vtkPolyData, origin, normal) -> vtk.vtkPolyData:
    """La mitad de `poly` del lado +normal, cerrada con una tapa.

    Sin tapar, el trozo es una superficie abierta y su volumen no significa
    nada — que es justo el número que se quiere dar.
    """
    plane = vtk.vtkPlane()
    plane.SetOrigin(*[float(v) for v in origin])
    plane.SetNormal(*[float(v) for v in normal])

    cl = vtk.vtkClipPolyData()
    cl.SetInputData(poly)
    cl.SetClipFunction(plane)
    cl.SetInsideOut(False)
    cl.Update()
    trozo = cl.GetOutput()
    if trozo.GetNumberOfPoints() == 0:
        return trozo

    relleno = vtk.vtkFillHolesFilter()
    relleno.SetInputData(trozo)
    relleno.SetHoleSize(1e6)
    relleno.Update()
    salida = relleno.GetOutput()

    # `vtkFillHolesFilter` deja las normales de la tapa sin coherencia, y
    # `vtkMassProperties` con normales incoherentes da un volumen que puede
    # salir negativo. Se recalculan antes de medir.
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputData(salida)
    nrm.ConsistencyOn()
    nrm.AutoOrientNormalsOn()
    nrm.SplittingOff()
    nrm.Update()
    return nrm.GetOutput()


def _width_at_plane(poly: vtk.vtkPolyData, origin, normal) -> float:
    """Anchura máxima de `poly` cortado por el plano del cuello."""
    if poly is None or poly.GetNumberOfPoints() < 3:
        return 0.0
    plane = vtk.vtkPlane()
    plane.SetOrigin(*[float(v) for v in origin])
    plane.SetNormal(*[float(v) for v in normal])
    cutter = vtk.vtkCutter()
    cutter.SetInputData(poly)
    cutter.SetCutFunction(plane)
    cutter.Update()
    corte = cutter.GetOutput()
    if corte.GetNumberOfPoints() < 2:
        return 0.0
    pts = np.asarray([corte.GetPoint(i) for i in range(corte.GetNumberOfPoints())])
    # La mayor distancia entre dos puntos del contorno.
    d = 0.0
    for i in range(len(pts)):
        dist = np.linalg.norm(pts - pts[i], axis=1)
        d = max(d, float(dist.max()))
    return d


def occlusion_after_clip(
    sac_poly: vtk.vtkPolyData | None,
    closing_origin,
    closing_normal,
    *,
    neck_origin=None,
    neck_axis=None,
) -> OcclusionResult:
    """Qué parte del saco queda fuera de la circulación, y qué parte no.

    `closing_normal` apunta hacia el DOMO: lo que queda de ese lado es lo que el
    clip excluye, y el resto es el muñón que sigue comunicado con la arteria.
    """
    if sac_poly is None or sac_poly.GetNumberOfPoints() < 20:
        return OcclusionResult(
            outcome="sin_saco",
            summary=("No hay un saco aislado con el que medir. Marca el plano "
                     "del cuello en Morfometría: sin el saco cerrado no se "
                     "puede decir cuánto aneurisma queda."),
        )

    n = np.asarray(closing_normal, dtype=float)
    ln = float(np.linalg.norm(n))
    if ln < 1e-9:
        return OcclusionResult(outcome="sin_saco",
                               summary="La línea de cierre del clip no es válida.")
    n = n / ln

    total = _volume_mm3(sac_poly)
    excluido = _cut_and_cap(sac_poly, closing_origin, n)
    munon = _cut_and_cap(sac_poly, closing_origin, -n)
    v_excluido = _volume_mm3(excluido)
    v_munon = _volume_mm3(munon)

    ancho = 0.0
    if neck_origin is not None and neck_axis is not None:
        ancho = _width_at_plane(munon, neck_origin, neck_axis)

    res = OcclusionResult(
        sac_volume_mm3=round(total, 1),
        excluded_mm3=round(v_excluido, 1),
        remnant_mm3=round(v_munon, 1),
        remnant_width_mm=round(ancho, 2),
        remnant_poly=munon if v_munon > NEGLIGIBLE_MM3 else None,
        outcome="completa",
    )

    if v_munon <= NEGLIGIBLE_MM3:
        res.outcome = "completa"
        res.summary = (
            f"La línea de cierre deja el saco entero fuera de la circulación "
            f"({v_excluido:.0f} mm³ de {total:.0f}). No queda muñón medible."
        )
    elif res.remnant_fraction <= RESIDUAL_FRACTION:
        res.outcome = "resto_de_cuello"
        res.summary = (
            f"Queda un resto de cuello de {v_munon:.0f} mm³ "
            f"({res.remnant_fraction * 100:.0f} % del saco)"
            + (f", de {ancho:.1f} mm de ancho en el plano del cuello." if ancho else ".")
        )
    else:
        res.outcome = "residual"
        res.summary = (
            f"Queda aneurisma residual: {v_munon:.0f} mm³, el "
            f"{res.remnant_fraction * 100:.0f} % del saco, comunicado con la "
            f"arteria. La línea de cierre no cruza el cuello por donde debería."
        )

    res.cautions = [
        "Esto es geometría, no mecánica: dice qué parte del saco queda a cada "
        "lado de la línea de cierre. No modela cómo cede la pared, ni si el "
        "cuello se desgarra, ni la fuerza que hace falta.",
        "La pared no se puede deformar con este dato: su grosor es de "
        "0,05–0,5 mm, el vóxel de 0,32, y no hay con qué validar el resultado. "
        "La única deformación que sí se afirma es que el cuello redondo queda "
        "aplastado, y esa sale de conservar el perímetro.",
        f"El corte entre «resto de cuello» y «residual» está en el "
        f"{RESIDUAL_FRACTION * 100:.0f} % del saco: es una convención de "
        f"presentación de este software, no un umbral clínico validado.",
    ]
    return res
