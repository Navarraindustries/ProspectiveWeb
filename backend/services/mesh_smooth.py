"""Copia suavizada de una malla, solo para VERLA (17-11).

Las mallas de marching cubes tienen aristas y pequeñas aletas que de lejos no
molestan, pero en el recorrido por dentro del vaso, con la cámara a un
milímetro de la pared, se ven como picos (lo notó el usuario en case 3, por
fuera y por dentro). Esta copia pasa un filtro de seno enventanado (Taubin
sin encogimiento) y recalcula las normales por vértice.

Medido en case 3 (104 k vértices): 40 iteraciones con banda de paso 0,02
mueven la superficie 0,14 mm de mediana (p95 0,34 mm); 60 iteraciones con
0,005 ya convierten las ramas finas en hilos. Por eso solo se VE: medidas,
detección, línea central y clips siguen leyendo la malla original.
"""
from __future__ import annotations

from pathlib import Path

import vtk

from services.segmentation import read_vtp, write_vtp

ITERACIONES = 40
BANDA_DE_PASO = 0.02
SUFIJO = ".suave.vtp"


def suavizar(poly: vtk.vtkPolyData) -> vtk.vtkPolyData:
    f = vtk.vtkWindowedSincPolyDataFilter()
    f.SetInputData(poly)
    f.SetNumberOfIterations(ITERACIONES)
    f.SetPassBand(BANDA_DE_PASO)
    f.BoundarySmoothingOff()
    f.FeatureEdgeSmoothingOff()
    f.NonManifoldSmoothingOn()
    f.NormalizeCoordinatesOn()
    f.Update()
    n = vtk.vtkPolyDataNormals()
    n.SetInputData(f.GetOutput())
    n.ComputePointNormalsOn()
    n.ComputeCellNormalsOff()
    n.SplittingOff()
    n.ConsistencyOn()
    n.AutoOrientNormalsOff()
    n.Update()
    out = vtk.vtkPolyData()
    out.DeepCopy(n.GetOutput())
    return out


def copia_suave(src: Path) -> Path:
    """`<nombre>.suave.vtp` junto a `src`, rehecha si `src` es más nueva."""
    dst = src.with_name(src.stem + SUFIJO)
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        write_vtp(suavizar(read_vtp(src)), dst)
    return dst
