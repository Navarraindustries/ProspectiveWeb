"""Calibre y cociente ya no se apagan porque la pieza mayor sea un bloque.

Medido el 2026-10-19 en los 132 estudios de Zenodo cuya malla no pasa la
prueba de árbol (`docs/Informe-Zenodo-Completa-2026-10-18.md`, §4.1): con los
canales encendidos, 13 lesiones de 73 entre los 5 (antes 5) y 79 candidatos en
hueso de 415 en controles (antes 112). La prueba de árbol de `mesh_components`
sigue mandando en «quedarse con el árbol», que en un bloque no limpia nada.
"""
from __future__ import annotations

import vtk

from services.aneurysm_consensus import MAX_VERTS_GEOMETRIC, _geometric_channels_apply
from services.mesh_components import (
    MAX_TREE_THICKNESS_MM,
    MAX_TREE_VOLUME_MM3,
    describe_components,
    keep_main_tree,
    looks_like_tree,
)


def _esfera(radius_mm: float, res: int = 24) -> vtk.vtkPolyData:
    s = vtk.vtkSphereSource()
    s.SetRadius(radius_mm); s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return s.GetOutput()


def _bloque_y_mota() -> vtk.vtkPolyData:
    """Una «cabeza» de 60 mm de radio (900 cm³, 40 mm de espesor) y una mota aparte."""
    mota = _esfera(1.0)
    t = vtk.vtkTransform(); t.Translate(100.0, 0.0, 0.0)
    tf = vtk.vtkTransformPolyDataFilter(); tf.SetTransform(t); tf.SetInputData(mota); tf.Update()
    ap = vtk.vtkAppendPolyData(); ap.AddInputData(_esfera(60.0)); ap.AddInputData(tf.GetOutput()); ap.Update()
    return ap.GetOutput()


def test_el_bloque_de_tc_no_apaga_los_canales():
    bloque = _bloque_y_mota()
    mayor = describe_components(bloque)[0]
    assert mayor.volume_mm3 > MAX_TREE_VOLUME_MM3 and mayor.thickness_mm > MAX_TREE_THICKNESS_MM
    assert looks_like_tree(mayor)[0] is False
    copia = _esfera(60.0)
    assert copia.GetNumberOfPoints() <= MAX_VERTS_GEOMETRIC
    assert _geometric_channels_apply(copia, tree_poly=bloque)


def test_quedarse_con_el_arbol_sigue_negandose_en_el_bloque():
    r = keep_main_tree(_bloque_y_mota())
    assert r.applied is False and "cm³" in r.warning


def test_una_pieza_mayor_diminuta_sigue_apagandolos():
    assert not _geometric_channels_apply(_esfera(3.0), tree_poly=_esfera(3.0))
