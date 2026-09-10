# -*- coding: utf-8 -*-
"""Detectar dónde nace un vaso fino de uno grueso, midiendo en vez de suponiendo.

El detector anterior buscaba bifurcaciones por anomalía de valencia, sobre la
premisa escrita en su docstring de que «branching points have significantly
higher vertex valence than straight vessel segments». Aquí se mide esa premisa y
se mide el reemplazo, sobre el mismo árbol sintético con tres ramas de posición y
calibre conocidos.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_branch_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import vtk
from vtk.util.numpy_support import numpy_to_vtk

from services.branch_origins import scan_branch_origins

#: Verdad del terreno del árbol de prueba.
TRUNK_RADIUS = 1.8
BRANCH_RADIUS = 0.6
JUNCTIONS_X = (-6.0, 3.0, 8.0)


@pytest.fixture(scope="module")
def tree() -> vtk.vtkPolyData:
    """Tronco recto con tres ramas finas, como UNA superficie conectada.

    Marching cubes sobre una unión implícita, no tubos pegados: así las uniones
    son bifurcaciones topológicas de verdad y no superficies que se atraviesan.
    """
    n, ext = 140, 22.0
    g = np.linspace(-ext, ext, n)
    X, Y, Z = np.meshgrid(g, g, g, indexing="ij")

    def seg(p1, p2):
        a, b = np.array(p1, float), np.array(p2, float)
        d = b - a
        t = (((X - a[0]) * d[0] + (Y - a[1]) * d[1] + (Z - a[2]) * d[2]) / (d @ d)).clip(0, 1)
        return np.sqrt((X - (a[0] + t * d[0])) ** 2
                       + (Y - (a[1] + t * d[1])) ** 2
                       + (Z - (a[2] + t * d[2])) ** 2)

    f = np.minimum.reduce([
        seg((-20, 0, 0), (20, 0, 0)) - TRUNK_RADIUS,
        seg((-6, 0, 0), (-6, 8, 0)) - BRANCH_RADIUS,
        seg((3, 0, 0), (3, -8, 0)) - BRANCH_RADIUS,
        seg((8, 0, 0), (8, 7, 0)) - BRANCH_RADIUS,
    ])
    sp = 2 * ext / (n - 1)
    img = vtk.vtkImageData()
    img.SetDimensions(n, n, n)
    img.SetOrigin(-ext, -ext, -ext)
    img.SetSpacing(sp, sp, sp)
    arr = numpy_to_vtk(f.ravel(order="F").astype(np.float32))
    arr.SetName("f")
    img.GetPointData().SetScalars(arr)
    mc = vtk.vtkMarchingCubes()
    mc.SetInputData(img)
    mc.SetValue(0, 0.0)
    mc.Update()
    return mc.GetOutput()


# ── 1. Por qué el detector anterior no podía funcionar ────────────────────── #

class TestTheValencePremiseDoesNotHold:
    def test_valence_is_uniform_on_a_triangulated_surface(self, tree):
        from services.perforator_risk import _compute_vertex_valences

        v = _compute_vertex_valences(tree, tree.GetNumberOfPoints())
        # En una malla manifold cada vértice tiene ~6 triángulos esté donde esté.
        assert np.median(v) == pytest.approx(6.0, abs=0.5)
        assert np.std(v) < 1.0, "la valencia describe la triangulación, no la forma"

    def test_flagging_by_valence_is_worse_than_chance(self, tree):
        # La medida que motivó reemplazarlo: un vértice marcado tenía MENOS
        # probabilidad que uno al azar de estar en una unión real.
        from services.perforator_risk import _compute_vertex_valences

        pts = np.array([tree.GetPoint(i) for i in range(tree.GetNumberOfPoints())])
        v = _compute_vertex_valences(tree, len(pts))
        z = (v - np.median(v)) / (np.std(v) + 1e-6)

        unions = np.array([[x, 0, 0] for x in JUNCTIONS_X], float)
        near = np.min(np.linalg.norm(pts[:, None, :] - unions[None, :, :], axis=2), axis=1) < 3.0
        flagged = z >= 1.5

        assert flagged.any(), "la premisa del test: el umbral marca algo"
        enrichment = near[flagged].mean() / near.mean()
        assert enrichment < 1.0, f"enriquecimiento {enrichment:.2f}: no hay señal"


# ── 2. El reemplazo encuentra las ramas que hay ───────────────────────────── #

class TestTheCalibreScanFindsTheRealBranches:
    def test_it_finds_every_branch_and_no_more(self, tree):
        scan = scan_branch_origins(tree)
        assert len(scan.origins) == len(JUNCTIONS_X)

    def test_each_one_lands_on_its_junction(self, tree):
        # Lo que el detector anterior no conseguía: estar donde está la unión.
        found = sorted(o.position[0] for o in scan_branch_origins(tree).origins)
        for got, want in zip(found, sorted(JUNCTIONS_X)):
            assert got == pytest.approx(want, abs=1.0), f"{got} vs {want}"

    def test_the_calibre_is_measured_not_assumed(self, tree):
        # El router anterior rellenaba `radius_mm` con una constante de 0.4 mm
        # para todos los candidatos, y el campo del API decía «estimated vessel
        # radius». Ahora sale de la malla.
        scan = scan_branch_origins(tree)
        for o in scan.origins:
            assert o.calibre_mm == pytest.approx(2 * BRANCH_RADIUS, abs=0.35)
            assert o.parent_calibre_mm == pytest.approx(2 * TRUNK_RADIUS, abs=0.6)
            assert o.calibre_ratio > 2.0

    def test_a_plain_tube_has_no_branches(self, tree):
        # Un vaso sin ramas no puede producir ninguna: si las produce, lo que se
        # está midiendo es ruido.
        line = vtk.vtkLineSource()
        line.SetPoint1(-20, 0, 0)
        line.SetPoint2(20, 0, 0)
        line.SetResolution(80)
        line.Update()
        tube = vtk.vtkTubeFilter()
        tube.SetInputData(line.GetOutput())
        tube.SetRadius(TRUNK_RADIUS)
        tube.SetNumberOfSides(32)
        tube.CappingOn()
        tube.Update()
        assert scan_branch_origins(tube.GetOutput()).origins == []

    def test_a_vessel_that_merely_narrows_is_not_a_branch(self, tree):
        # Un cono se estrecha hasta el calibre de una rama sin serlo. Es lo que
        # descarta el cociente con la madre.
        cone = vtk.vtkConeSource()
        cone.SetRadius(TRUNK_RADIUS)
        cone.SetHeight(30)
        cone.SetResolution(48)
        cone.CappingOn()
        cone.Update()
        assert scan_branch_origins(cone.GetOutput()).origins == []


# ── 3. Lo que el barrido admite sobre sí mismo ────────────────────────────── #

class TestTheScanStatesItsOwnLimits:
    def test_it_reports_the_calibre_it_cannot_resolve(self, tree):
        # Una perforante verdadera mide 0.1-0.5 mm: por debajo del suelo. Que el
        # suelo viaje con el resultado es lo que impide leer una lista vacía como
        # «no hay perforantes».
        scan = scan_branch_origins(tree, voxel_mm=0.5)
        assert scan.calibre_floor_mm == pytest.approx(1.0)
        assert all(o.calibre_mm >= scan.calibre_floor_mm - 1e-6 for o in scan.origins)

    def test_a_coarser_voxel_raises_the_floor(self, tree):
        assert scan_branch_origins(tree, voxel_mm=0.8).calibre_floor_mm > \
               scan_branch_origins(tree, voxel_mm=0.4).calibre_floor_mm

    def test_an_empty_mesh_is_not_an_error(self):
        scan = scan_branch_origins(vtk.vtkPolyData())
        assert scan.origins == [] and scan.mesh_points == 0


# ── 4. El barrido sobrevive al recorte de ROI ─────────────────────────────── #

class TestTheScanSurvivesCropping:
    """La razón de barrer al segmentar y no después.

    Recortar a una caja o una esfera SOBRESCRIBE `vessel_tree.vtp` —la propia
    descripción del endpoint dice «re-run segmentation to restore»— así que las
    ramas de fuera del ROI dejan de existir para cualquier análisis posterior.
    Barrer antes y congelar las coordenadas de mundo es lo que permite seguir
    viendo dónde estaban sobre la malla ya recortada.
    """

    def _crop(self, poly: vtk.vtkPolyData, half: float) -> vtk.vtkPolyData:
        box = vtk.vtkBox()
        box.SetBounds(-half, half, -half, half, -half, half)
        clip = vtk.vtkClipPolyData()
        clip.SetInputData(poly)
        clip.SetClipFunction(box)
        clip.InsideOutOn()
        clip.Update()
        return clip.GetOutput()

    def test_cropping_really_does_lose_branches(self, tree):
        # La premisa, medida: no es una precaución teórica. La unión de x=-6
        # queda fuera de una caja de ±5 y ya no hay forma de encontrarla.
        entero = scan_branch_origins(tree)
        recortado = scan_branch_origins(self._crop(tree, 5.0))
        assert len(entero.origins) == 3
        assert any(abs(o.position[0] + 6.0) < 1.0 for o in entero.origins)
        assert not any(abs(o.position[0] + 6.0) < 1.0 for o in recortado.origins)

    def test_the_cut_rim_is_not_mistaken_for_a_branch(self, tree):
        # El recorte no sólo pierde ramas: deja un aro abierto que se lee fino y
        # pegado a algo grueso. Sin excluirlo, inventaba un origen en x=-4.3.
        recortado = scan_branch_origins(self._crop(tree, 5.0))
        for o in recortado.origins:
            cerca = min(abs(o.position[0] - x) for x in JUNCTIONS_X)
            assert cerca < 1.5, f"origen inventado en x={o.position[0]:.2f}"

    def test_the_frozen_scan_still_knows_where_they_were(self, tree):
        from services.branch_origins import freeze_scan, thaw_scan
        from services.sessions import create_session

        sid = create_session()
        antes = scan_branch_origins(tree)
        freeze_scan(sid, antes)

        despues = thaw_scan(sid)
        assert despues is not None
        assert len(despues.origins) == len(antes.origins)
        for a, b in zip(antes.origins, despues.origins):
            assert b.position == pytest.approx(a.position)
            assert b.calibre_mm == pytest.approx(a.calibre_mm)

    def test_the_floor_travels_with_it(self, tree):
        from services.branch_origins import freeze_scan, thaw_scan
        from services.sessions import create_session

        sid = create_session()
        antes = scan_branch_origins(tree, voxel_mm=0.8)
        freeze_scan(sid, antes)
        assert thaw_scan(sid).calibre_floor_mm == pytest.approx(antes.calibre_floor_mm)

    def test_no_frozen_scan_is_not_an_error(self):
        from services.branch_origins import thaw_scan
        from services.sessions import create_session

        assert thaw_scan(create_session()) is None
