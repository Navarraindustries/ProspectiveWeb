# -*- coding: utf-8 -*-
"""Segmentar y detectar CON y SIN techo del umbral, y enseñar las dos listas.

Por qué existe
--------------
La banda de XA es `[p99, p99.9]`, y ese techo superior quita lo más brillante
—que en una 3DRA con contraste es el centro de los vasos más llenos—. Los dos
casos anotados del proyecto piden lo CONTRARIO:

    examen 3DRA 384³   con techo: la lesión no aparece (la más cercana a 21,4 mm)
                       sin techo: sale, y es de los primeros — en la sesión del
                       usuario fue el cand-003, y midiéndolo con este módulo el
                       puesto 1, a 2,11 mm de la anotación
    case 3             con techo: la lesión en el puesto 3
                       sin techo: puesto 9, fuera de la lista de cinco

Así que la casilla «sin límite superior» no puede tener un valor por defecto.

Y NO se puede decidir sola. Se probó la regla evidente —quitar el techo cuando
está cortando el árbol— y no separa: el techo se lleva puentes entre piezas en
los dos casos casi por igual (88 % de lo que quita en case 3, 89 % en el otro).
Lo que de verdad decide es QUÉ hace destacar a cada lesión: en case 3 destaca
por calibre, y sin techo engordan todos los vasos densos y deja de sobresalir.
Eso depende de dónde está la lesión, que es justo lo que no se sabe antes.

De ahí este módulo: si no se puede elegir por el usuario ni por una regla, que
la máquina pruebe las dos y enseñe ambas listas. Cuesta el doble de cálculo y
le quita la decisión de encima a quien mira.

No toca la sesión: trabaja en memoria y no escribe malla ni estado. Elegir una
configuración es un paso aparte, y ése sí resegmenta de verdad.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import vtk

logger = logging.getLogger(__name__)

#: Dos candidatos de listas distintas a menos de esto son el MISMO sitio.
SAME_SITE_MM: float = 6.0


@dataclass
class CandidatoComparado:
    """Un sitio propuesto, y en cuál de las dos configuraciones aparece."""

    position: tuple[float, float, float]
    diameter_mm: float
    channels: list[str]
    #: Puesto en cada lista (1 = el mejor). None = no aparece en esa lista.
    rank_con_techo: int | None = None
    rank_sin_techo: int | None = None

    @property
    def en_ambas(self) -> bool:
        return self.rank_con_techo is not None and self.rank_sin_techo is not None


@dataclass
class ComparacionTecho:
    """El resultado de probarlo de las dos formas."""

    candidatos: list[CandidatoComparado] = field(default_factory=list)
    vertices_con_techo: int = 0
    vertices_sin_techo: int = 0
    n_con_techo: int = 0
    n_sin_techo: int = 0
    nota: str = ""


def _malla(volume, spacing, lower, upper, smoothing, cleanup, main_tree_only):
    """Una malla con los mismos pasos que usa el botón de segmentar."""
    from services.mesh_components import keep_main_tree
    from services.segmentation import (SegmentationPipeline,
                                       level_to_cleanup_mm3,
                                       level_to_smooth_iters)

    min_mm3, top_n, closing = level_to_cleanup_mm3(cleanup)
    pipe = SegmentationPipeline(
        threshold_hu=lower,
        threshold_max_hu=upper if upper > lower else 0.0,
        smooth_iterations=level_to_smooth_iters(smoothing),
        smooth_pass_band=0.06, target_reduction=0.70, gaussian_sigma=0.5,
        morpho_closing_mm=closing, min_component_mm3=min_mm3,
        keep_top_n=top_n, min_component_verts=0,
    )
    seg = pipe.run(volume, spacing)
    poly = seg.poly_data
    if main_tree_only:
        mt = keep_main_tree(poly)
        if mt.applied:
            poly = mt.poly
    return poly


def _candidatos(poly: vtk.vtkPolyData, modality: str, top: int):
    from routers.detect import _detector_for_modality
    from services.aneurysm_consensus import consensus, hit_diameter_mm

    if poly is None or poly.GetNumberOfPoints() == 0:
        return []
    hits = consensus(poly, _detector_for_modality(modality), top=top)
    return [
        (tuple(float(v) for v in h.position), float(hit_diameter_mm(h)), list(h.channels))
        for h in hits
    ]


def comparar_techo(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    modality: str,
    lower: float,
    upper: float,
    smoothing: int = 3,
    cleanup: int = 7,
    main_tree_only: bool = True,
    top: int = 5,
) -> ComparacionTecho:
    """Detecta con el techo puesto y quitado, y funde las dos listas.

    Los candidatos a menos de `SAME_SITE_MM` se consideran el mismo sitio y se
    presentan una vez, diciendo en qué puesto sale en cada configuración. Lo
    interesante de la comparación son justo los que NO salen en ambas.
    """
    if upper <= lower:
        return ComparacionTecho(
            nota=("No hay nada que comparar: la banda ya no tiene techo. "
                  "Desmarca «sin límite superior» para poder contrastar.")
        )

    poly_con = _malla(volume, spacing, lower, upper, smoothing, cleanup, main_tree_only)
    poly_sin = _malla(volume, spacing, lower, 0.0, smoothing, cleanup, main_tree_only)
    con = _candidatos(poly_con, modality, top)
    sin = _candidatos(poly_sin, modality, top)

    fundidos: list[CandidatoComparado] = []
    for rank, (pos, dia, ch) in enumerate(con, start=1):
        fundidos.append(CandidatoComparado(position=pos, diameter_mm=dia,
                                           channels=ch, rank_con_techo=rank))

    for rank, (pos, dia, ch) in enumerate(sin, start=1):
        p = np.asarray(pos)
        cerca = None
        for c in fundidos:
            if float(np.linalg.norm(p - np.asarray(c.position))) <= SAME_SITE_MM:
                cerca = c
                break
        if cerca is not None:
            cerca.rank_sin_techo = rank
            # Los canales de las dos configuraciones, sin repetir.
            cerca.channels = list(dict.fromkeys(cerca.channels + ch))
        else:
            fundidos.append(CandidatoComparado(position=pos, diameter_mm=dia,
                                               channels=ch, rank_sin_techo=rank))

    # Primero los que salen en las dos, luego por el mejor puesto que tengan.
    def orden(c: CandidatoComparado):
        mejor = min(r for r in (c.rank_con_techo, c.rank_sin_techo) if r is not None)
        return (0 if c.en_ambas else 1, mejor)

    fundidos.sort(key=orden)

    solo_sin = sum(1 for c in fundidos if c.rank_con_techo is None)
    solo_con = sum(1 for c in fundidos if c.rank_sin_techo is None)
    if solo_sin == 0 and solo_con == 0:
        nota = ("Las dos configuraciones proponen los mismos sitios. Aquí el "
                "techo no cambia lo que se detecta.")
    else:
        nota = (f"{solo_sin} sitio(s) solo aparecen SIN techo y {solo_con} solo "
                f"CON él. Mira esos: son los que te perderías eligiendo mal.")

    return ComparacionTecho(
        candidatos=fundidos,
        vertices_con_techo=poly_con.GetNumberOfPoints(),
        vertices_sin_techo=poly_sin.GetNumberOfPoints(),
        n_con_techo=len(con), n_sin_techo=len(sin), nota=nota,
    )
