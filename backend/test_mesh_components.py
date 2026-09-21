# -*- coding: utf-8 -*-
"""Quitar el hueso de la malla por conectividad, no por brillo.

El usuario ve «ruido» alrededor del árbol y pide quitarlo. Medido sobre case 3,
lo que hay no es ruido:

    pieza          vértices   volumen     extensión
    #1 (árbol)       12 776   4 314 mm³    149 mm
    #2 (lámina)       2 230     281 mm³     70 mm
    #3 … #10       464–1 641  248–2 948    25–44 mm

La más pequeña son 228 mm³ y el filtro por tamaño corta por debajo de 5: no las
alcanza. Y el umbral tampoco puede, porque el 99 % del hueso cae dentro del
rango de intensidad del propio árbol — el mejor umbral global posible conserva
el 61 % del árbol y aún deja el 4,9 % del hueso.

Lo que sí funciona es que no se tocan. De ahí estos dos tests: la regla, y el
guardarraíl que impide aplicarla donde no vale (angio-TC, donde el contraste
toca el hueso y la cabeza entera es una sola pieza de más de un litro).
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_comp_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import math

import numpy as np
import pytest
import vtk

from services.mesh_components import (MAX_TREE_THICKNESS_MM,
                                      MAX_TREE_VOLUME_MM3, describe_components,
                                      keep_main_tree, looks_like_tree,
                                      remove_component_at)


# ── Utilidades: mallas sintéticas con forma conocida ─────────────────────── #

def _limpia(poly) -> vtk.vtkPolyData:
    """Fusiona los puntos duplicados.

    Las fuentes de VTK emiten las tapas del cilindro y los polos de la esfera
    con puntos propios, asi que sin esto una primitiva sale como VARIAS piezas
    conexas y el fixture mide otra cosa que la que dice medir.
    """
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(poly); tri.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(tri.GetOutputPort())
    cl.PointMergingOn()
    cl.Update()
    return cl.GetOutput()


def _append(*polys) -> vtk.vtkPolyData:
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    cl = vtk.vtkCleanPolyData()
    cl.SetInputConnection(ap.GetOutputPort())
    cl.Update()
    return cl.GetOutput()


def _tubo(centro=(0, 0, 0), largo=60.0, radio=1.2, res=24, segmentos=60):
    """Un tubo largo y curvo: la forma de un vaso, no un cilindro de juguete.

    Con vtkCylinderSource el tubo salia con 80 puntos, MENOS que las esferas
    que representan el hueso, asi que el fixture no reproducia la situacion
    real —donde el arbol tiene 12 776 puntos y los bloques 464-2 230— y «el
    mayor» habria sido una mota.
    """
    pts = vtk.vtkPoints()
    linea = vtk.vtkPolyLine()
    linea.GetPointIds().SetNumberOfIds(segmentos)
    for i in range(segmentos):
        t = i / (segmentos - 1)
        pts.InsertNextPoint(centro[0] + math.sin(t * 3.0) * 6.0,
                            centro[1] + (t - 0.5) * largo,
                            centro[2] + math.cos(t * 2.0) * 4.0)
        linea.GetPointIds().SetId(i, i)
    celdas = vtk.vtkCellArray()
    celdas.InsertNextCell(linea)
    pd = vtk.vtkPolyData()
    pd.SetPoints(pts)
    pd.SetLines(celdas)

    tf = vtk.vtkTubeFilter()
    tf.SetInputData(pd)
    tf.SetRadius(radio)
    tf.SetNumberOfSides(res)
    tf.CappingOn()
    tf.Update()
    return _limpia(tf.GetOutput())


def _bloque(centro=(0, 0, 0), lado=60.0):
    """Un cubo macizo: la forma de un bloque de tejido."""
    b = vtk.vtkCubeSource()
    b.SetCenter(*centro)
    b.SetXLength(lado); b.SetYLength(lado); b.SetZLength(lado)
    b.Update()
    return _limpia(b.GetOutput())


def _mota(centro=(0, 0, 0), radio=3.0):
    s = vtk.vtkSphereSource()
    s.SetCenter(*centro); s.SetRadius(radio)
    s.SetThetaResolution(10); s.SetPhiResolution(10)
    s.Update()
    return _limpia(s.GetOutput())


def _bloque_denso(centro=(0, 0, 0), radio=40.0):
    """Un bloque grande Y con muchos puntos: la cabeza entera de una angio-TC.

    El cubo de vtkCubeSource tiene OCHO puntos, asi que al mezclarlo con una
    esfera «el mayor» salia siendo la esfera y el test comprobaba otra cosa.
    Medido en TC real: 70 901 puntos y 1 220 000 mm3.
    """
    s = vtk.vtkSphereSource()
    s.SetCenter(*centro); s.SetRadius(radio)
    s.SetThetaResolution(60); s.SetPhiResolution(60)
    s.Update()
    return _limpia(s.GetOutput())


@pytest.fixture
def arbol_con_ruido():
    """Un tubo largo (el árbol) y tres esferas lejanas (el hueso)."""
    return _append(_tubo(largo=80.0, radio=1.5),
                   _mota((40, 40, 40), 5.0),
                   _mota((-40, 35, -20), 4.0),
                   _mota((30, -45, 25), 6.0))


# ── 1. Contar y describir las piezas ──────────────────────────────────────── #

class TestItSeesThePiecesForWhatTheyAre:
    def test_it_finds_every_piece(self, arbol_con_ruido):
        comps = describe_components(arbol_con_ruido)
        assert len(comps) == 4

    def test_the_largest_comes_first(self, arbol_con_ruido):
        comps = describe_components(arbol_con_ruido)
        assert comps[0].n_points == max(c.n_points for c in comps)
        assert [c.index for c in comps] == [0, 1, 2, 3]

    def test_a_tube_is_thin_and_long_and_a_blob_is_not(self, arbol_con_ruido):
        comps = describe_components(arbol_con_ruido)
        tubo, blobs = comps[0], comps[1:]
        assert tubo.extent_mm > 60, "el tubo es largo"
        assert tubo.sphericity < 0.5, "un tubo no es una esfera"
        assert all(b.sphericity > tubo.sphericity for b in blobs)

    def test_an_empty_mesh_describes_nothing(self):
        assert describe_components(vtk.vtkPolyData()) == []


# ── 2. La regla: quedarse con el árbol ────────────────────────────────────── #

class TestKeepingTheMainTree:
    def test_it_keeps_the_tree_and_drops_the_rest(self, arbol_con_ruido):
        r = keep_main_tree(arbol_con_ruido)
        assert r.applied
        assert len(r.removed) == 3
        assert r.n_after < r.n_before
        assert len(describe_components(r.poly)) == 1

    def test_a_single_piece_is_left_alone(self):
        solo = _tubo(largo=60.0)
        r = keep_main_tree(solo)
        assert not r.applied and r.warning == ""
        assert r.n_after == r.n_before

    def test_it_is_idempotent(self, arbol_con_ruido):
        una = keep_main_tree(arbol_con_ruido)
        otra = keep_main_tree(una.poly)
        assert otra.n_after == una.n_after


# ── 3. El guardarraíl: dónde NO vale, y que lo diga ──────────────────────── #

class TestItRefusesWhereTheRuleDoesNotHold:
    """En angio-TC el contraste toca el hueso y la cabeza entera es una pieza.

    Medido: BETANCO 1 220 000 mm³ y CAMACHO 795 000 mm³ en el componente mayor.
    Quedarse con él no quita nada, así que aplicarlo daría la falsa impresión
    de haber limpiado.
    """

    def test_a_block_of_tissue_is_not_a_tree(self):
        # Un cubo de 60 mm son 216 000 mm³, del orden de lo medido en TC.
        bloque = _bloque(lado=60.0)
        info = describe_components(bloque)[0]
        assert info.volume_mm3 > MAX_TREE_VOLUME_MM3
        ok, motivo = looks_like_tree(info)
        assert not ok
        assert "cm³" in motivo and "semillas" in motivo

    def test_a_thick_lump_is_not_a_tree_either(self):
        # Por debajo del techo de volumen, pero macizo.
        gordo = _mota((0, 0, 0), radio=25.0)      # ~65 000 mm³, espesor ~8 mm
        info = describe_components(gordo)[0]
        assert info.volume_mm3 < MAX_TREE_VOLUME_MM3
        assert info.thickness_mm > MAX_TREE_THICKNESS_MM
        ok, motivo = looks_like_tree(info)
        assert not ok and "espesor" in motivo

    def test_refusing_changes_nothing_and_explains(self):
        sucio = _append(_bloque_denso(radio=40.0), _mota((90, 90, 90), 5.0))
        r = keep_main_tree(sucio)
        assert not r.applied, "no debe recortar donde la regla no vale"
        assert r.n_after == r.n_before
        assert r.warning, "un botón que no hace nada tiene que decir por qué"

    def test_a_real_tube_passes_the_guard(self):
        ok, motivo = looks_like_tree(describe_components(_tubo(largo=80.0))[0])
        assert ok and motivo == ""


# ── 4. El borrador de un clic ─────────────────────────────────────────────── #

class TestTheOneClickEraser:
    def test_it_removes_the_piece_under_the_point(self, arbol_con_ruido):
        antes = describe_components(arbol_con_ruido)
        objetivo = next(c for c in antes if c.extent_mm < 20)
        out, removed, warn = remove_component_at(
            arbol_con_ruido, objetivo.centroid, max_distance_mm=20.0)
        assert warn == "" and removed is not None
        assert removed.n_points == objetivo.n_points
        assert len(describe_components(out)) == len(antes) - 1

    def test_it_leaves_the_other_pieces_alone(self, arbol_con_ruido):
        antes = describe_components(arbol_con_ruido)
        objetivo = antes[-1]
        out, _removed, _w = remove_component_at(
            arbol_con_ruido, objetivo.centroid, max_distance_mm=20.0)
        quedan = describe_components(out)
        assert len(quedan) == 3, "borrar una no puede llevarse las demás"

    def test_a_click_in_empty_space_removes_nothing(self, arbol_con_ruido):
        out, removed, warn = remove_component_at(arbol_con_ruido, (500, 500, 500))
        assert removed is None
        assert out.GetNumberOfPoints() == arbol_con_ruido.GetNumberOfPoints()
        assert "mm de la malla" in warn

    def test_it_refuses_to_empty_a_single_piece_mesh(self):
        solo = _tubo(largo=60.0)
        centro = describe_components(solo)[0].centroid
        out, removed, warn = remove_component_at(solo, centro, max_distance_mm=50.0)
        assert removed is None
        assert out.GetNumberOfPoints() == solo.GetNumberOfPoints()
        assert "una sola pieza" in warn

    def test_the_tree_itself_can_be_deleted_if_that_is_what_was_clicked(
            self, arbol_con_ruido):
        # No se protege al mayor: el usuario puede estar limpiando al revés, y
        # adivinar su intención sería peor que obedecer. Para eso hay deshacer.
        tree = describe_components(arbol_con_ruido)[0]
        out, removed, warn = remove_component_at(
            arbol_con_ruido, tree.centroid, max_distance_mm=20.0)
        assert warn == "" and removed is not None
        assert removed.n_points == tree.n_points
        assert len(describe_components(out)) == 3


# ── 5. Por los endpoints, que es como lo usa la aplicación ───────────────── #

from fastapi.testclient import TestClient            # noqa: E402

from main import app                                  # noqa: E402
from services.database import Base, engine            # noqa: E402
from services.segmentation import read_vtp, write_vtp  # noqa: E402
from services.sessions import create_session, read_state, session_subdir  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _sesion_con_malla(poly) -> str:
    sid = create_session()
    write_vtp(poly, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


class TestThroughTheApi:
    def test_listing_says_how_many_pieces_and_whether_the_biggest_is_a_tree(self):
        sid = _sesion_con_malla(_append(_tubo(largo=80.0, radio=1.5),
                                        _mota((40, 40, 40), 5.0)))
        r = client.get(f"/api/mesh-components/{sid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 2
        assert d["largest_is_tree"] is True and d["warning"] == ""
        assert d["components"][0]["n_points"] > d["components"][1]["n_points"]

    def test_the_listing_refuses_to_call_a_block_a_tree(self):
        sid = _sesion_con_malla(_append(_bloque_denso(radio=40.0),
                                        _mota((90, 90, 90), 5.0)))
        d = client.get(f"/api/mesh-components/{sid}").json()
        assert d["largest_is_tree"] is False
        assert "cm³" in d["warning"]

    def test_deleting_a_piece_rewrites_the_mesh_and_can_be_undone(self):
        malla = _append(_tubo(largo=80.0, radio=1.5), _mota((40, 40, 40), 5.0))
        sid = _sesion_con_malla(malla)
        antes = describe_components(malla)
        objetivo = antes[-1]

        r = client.post(f"/api/mesh-component-delete/{sid}", json={
            "point": {"x": objetivo.centroid[0], "y": objetivo.centroid[1],
                      "z": objetivo.centroid[2]},
            "max_distance_mm": 20.0,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["removed"] is not None
        assert d["components_left"] == 1
        assert d["vertices"] < malla.GetNumberOfPoints()
        assert d["undo_depth"] >= 1, "tiene que poder deshacerse"

        # Y la malla del disco es la recortada, no la de antes.
        en_disco = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert en_disco.GetNumberOfPoints() == d["vertices"]
        assert read_state(sid, "seg.n_vertices", "") == str(d["vertices"])

        # Deshacer la devuelve entera.
        u = client.post(f"/api/mesh-restore/{sid}", json={"scope": "undo"})
        assert u.status_code == 200, u.text
        assert u.json()["vertices"] == malla.GetNumberOfPoints()

    def test_a_missed_click_changes_nothing_and_spends_no_undo(self):
        malla = _append(_tubo(largo=80.0, radio=1.5), _mota((40, 40, 40), 5.0))
        sid = _sesion_con_malla(malla)
        antes_undo = client.post(f"/api/mesh-component-delete/{sid}", json={
            "point": {"x": 900.0, "y": 900.0, "z": 900.0},
        })
        assert antes_undo.status_code == 200
        d = antes_undo.json()
        assert d["removed"] is None and d["warning"]
        assert d["vertices"] == malla.GetNumberOfPoints()
        assert d["undo_depth"] == 0, "un clic fallido no gasta un paso de deshacer"

    def test_without_a_mesh_it_says_so_instead_of_crashing(self):
        sid = create_session()
        assert client.get(f"/api/mesh-components/{sid}").status_code == 409
        assert client.post(f"/api/mesh-component-delete/{sid}", json={
            "point": {"x": 0.0, "y": 0.0, "z": 0.0}}).status_code == 409

    def test_an_unknown_session_is_a_404(self):
        assert client.get("/api/mesh-components/no-existe").status_code == 404

