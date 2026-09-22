# -*- coding: utf-8 -*-
"""Tres criterios en consenso, y un corte que no pide centro.

Consenso
--------
El detector de curvatura devolvía cinco candidatos sobre case 3 y los cinco
caían en la chapa de la parte inferior —bordes dentados, curvatura alta—
mientras que la lesión que el clínico confirma, en el tronco, no salía. No
destaca por curvatura: es **el punto de mayor calibre del árbol**, radio
2,33 mm contra una mediana de 0,57.

De ahí dos canales más —calibre local, y calibre contra el vecindario— y un
orden por reglas declaradas, sin pesos inventados, porque hay UN punto anotado
y cualquier fórmula ajustada a él sería sobreajuste con otro nombre.

Corte por plano
---------------
El recorte por caja y esfera obliga a acertar un centro a ojo. Para quitar la
chapa pegada bajo el árbol eso son varios intentos. Un plano no tiene centro:
una dirección y una altura.
"""
from __future__ import annotations

import math
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_cp_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pathlib

import numpy as np
import pytest
import vtk
from fastapi.testclient import TestClient

from main import app
from services.aneurysm_consensus import (CH_CALIBRE, CH_CURVATURE, CH_RATIO,
                                         PATCH_LOCATOR, PATCH_REGION,
                                         ConsensusHit, calibre_ratio,
                                         consensus, hit_confidence,
                                         hit_diameter_mm, hit_patch,
                                         local_calibre)
from services.aneurysm_detector import AneurysmDetector
from services.database import Base, engine
from services.mesh_crop import clip_plane
from services.segmentation import read_vtp, write_vtp
from services.sessions import create_session, session_subdir

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


def _limpia(poly):
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(poly); tri.Update()
    cl = vtk.vtkCleanPolyData(); cl.SetInputConnection(tri.GetOutputPort())
    cl.PointMergingOn(); cl.Update()
    return cl.GetOutput()


def _tubo(centro=(0, 0, 0), largo=60.0, radio=1.0, segmentos=60, res=20):
    pts = vtk.vtkPoints(); linea = vtk.vtkPolyLine()
    linea.GetPointIds().SetNumberOfIds(segmentos)
    for i in range(segmentos):
        t = i / (segmentos - 1)
        pts.InsertNextPoint(centro[0], centro[1] + (t - 0.5) * largo, centro[2])
        linea.GetPointIds().SetId(i, i)
    ca = vtk.vtkCellArray(); ca.InsertNextCell(linea)
    pd = vtk.vtkPolyData(); pd.SetPoints(pts); pd.SetLines(ca)
    tf = vtk.vtkTubeFilter(); tf.SetInputData(pd); tf.SetRadius(radio)
    tf.SetNumberOfSides(res); tf.CappingOn(); tf.Update()
    return _limpia(tf.GetOutput())


def _bola(centro, radio, res=26):
    s = vtk.vtkSphereSource(); s.SetCenter(*centro); s.SetRadius(radio)
    s.SetThetaResolution(res); s.SetPhiResolution(res); s.Update()
    return _limpia(s.GetOutput())


def _une(*polys):
    ap = vtk.vtkAppendPolyData()
    for p in polys:
        ap.AddInputData(p)
    ap.Update()
    return _limpia(ap.GetOutput())


@pytest.fixture(scope="module")
def vaso_con_saco():
    """Un vaso fino de 1 mm con un saco de 3 mm pegado a media altura."""
    return _une(_tubo(radio=1.0, largo=60.0), _bola((0.0, 5.0, 2.2), 3.0))


SACO = np.array([0.0, 5.0, 2.2])


# ── 1. El canal de calibre ve lo que la curvatura no ─────────────────────── #

class TestTheCalibreChannel:
    def test_it_measures_the_vessel_and_the_sac_differently(self, vaso_con_saco):
        pts, r = local_calibre(vaso_con_saco)
        cerca_saco = np.linalg.norm(pts - SACO, axis=1) < 3.5
        lejos = pts[:, 1] < -15.0
        assert r[cerca_saco].max() > 2.0, "el saco mide 3 mm de radio"
        assert np.median(r[lejos]) < 1.6, "el vaso mide 1 mm"

    def test_the_ratio_flags_what_is_fat_for_its_neighbourhood(self, vaso_con_saco):
        pts, r = local_calibre(vaso_con_saco)
        q = calibre_ratio(pts, r)
        cerca_saco = np.linalg.norm(pts - SACO, axis=1) < 3.5
        assert q[cerca_saco].max() > 1.5

    def test_a_uniform_tube_has_no_bulge(self):
        # Una arteria ancha es ancha en todas partes: cociente ~1. Es lo que
        # impide que el canal proponga la carótida entera como aneurisma.
        recto = _tubo(radio=2.5, largo=60.0)
        pts, r = local_calibre(recto)
        q = calibre_ratio(pts, r)
        medio = np.abs(pts[:, 1]) < 15.0
        assert float(np.percentile(q[medio], 95)) < 1.6


# ── 2. El consenso: cómo se ordena y qué promete ─────────────────────────── #

class TestTheConsensusOrdering:
    def _hit(self, pos, ranks):
        return ConsensusHit(position=pos, ranks=dict(ranks))

    def test_best_rank_wins_even_with_a_single_channel(self):
        # Deliberado: es una lista corta para recorrer, así que importa más no
        # perder la lesión que premiar el acuerdo. En case 3 la confirmada la
        # encuentra un solo canal.
        solo = self._hit((0, 0, 0), {CH_CALIBRE: 1})
        acuerdo = self._hit((50, 0, 0), {CH_CURVATURE: 3, CH_RATIO: 3})
        orden = sorted([acuerdo, solo],
                       key=lambda h: (h.best_rank, -len(h.ranks), h.rank_sum))
        assert orden[0] is solo

    def test_agreement_breaks_a_tie(self):
        uno = self._hit((0, 0, 0), {CH_CALIBRE: 2})
        dos = self._hit((50, 0, 0), {CH_CALIBRE: 2, CH_CURVATURE: 4})
        orden = sorted([uno, dos],
                       key=lambda h: (h.best_rank, -len(h.ranks), h.rank_sum))
        assert orden[0] is dos

    def test_it_finds_the_sac_in_a_synthetic_vessel(self, vaso_con_saco):
        det = AneurysmDetector(gauss_percentile=60.0,
                               mean_curv_gate_percentile=40.0,
                               min_radius_mm=0.8, max_radius_mm=20.0,
                               min_points=4, min_positive_gauss_frac=0.40,
                               min_sphericity=0.25, pre_smooth_iterations=10)
        hits = consensus(vaso_con_saco, det, top=5)
        assert hits
        d = [float(np.linalg.norm(np.asarray(h.position) - SACO)) for h in hits]
        assert min(d) < 5.0, f"el saco no está en la lista: {d}"

    def test_confidence_is_bounded_and_ordered(self):
        a = hit_confidence(self._hit((0, 0, 0), {CH_CALIBRE: 1}))
        b = hit_confidence(self._hit((0, 0, 0), {CH_CALIBRE: 4}))
        assert 0.0 <= b < a <= 1.0

    def test_the_diameter_of_a_geometric_hit_is_twice_its_radius(self):
        h = ConsensusHit(position=(0, 0, 0), ranks={CH_CALIBRE: 1}, radius_mm=2.5)
        assert hit_diameter_mm(h) == pytest.approx(5.0)


class TestWhatTheBlueRegionMeans:
    """El usuario preguntó qué denota el azul, y tenía razón en sospechar.

    Para un sitio geométrico no es la lesión: es una bola alrededor del punto,
    e incluye pared de vaso. Se etiqueta como tal en vez de dejar que aparente
    una segmentación del saco.
    """

    def test_a_curvature_hit_paints_the_region_it_detected(self, vaso_con_saco):
        det = AneurysmDetector(min_radius_mm=0.8, min_positive_gauss_frac=0.40,
                               min_sphericity=0.25, pre_smooth_iterations=10)
        hits = consensus(vaso_con_saco, det, top=5)
        curv = [h for h in hits if h.candidate is not None]
        if curv:
            _patch, kind = hit_patch(vaso_con_saco, curv[0])
            assert kind == PATCH_REGION

    def test_a_geometric_hit_paints_a_locator_and_says_so(self, vaso_con_saco):
        h = ConsensusHit(position=tuple(SACO), ranks={CH_CALIBRE: 1},
                         radius_mm=3.0)
        patch, kind = hit_patch(vaso_con_saco, h)
        assert kind == PATCH_LOCATOR
        assert patch.GetNumberOfPoints() > 0

    def test_the_locator_never_reaches_morphometry(self, vaso_con_saco):
        # Es lo que el usuario temía: que el azul cambiara las medidas. No
        # puede — sobre un parche abierto la morfometría se declara no fiable
        # y anula volumen, cuello e índices.
        from services.morphometrics import MorphometricAnalyzer

        h = ConsensusHit(position=tuple(SACO), ranks={CH_CALIBRE: 1},
                         radius_mm=3.0)
        patch, _ = hit_patch(vaso_con_saco, h)
        mr = MorphometricAnalyzer().analyze(patch)
        assert mr.reliable is False
        assert mr.volume_mm3 == 0.0 and mr.neck_diameter_mm == 0.0


# ── 3. Dónde los canales geométricos NO se ejecutan ──────────────────────── #

class TestItSkipsTheChannelsWhereTheyMeanNothing:
    def test_a_block_of_tissue_gets_curvature_only(self):
        # En angio-TC la malla es la cabeza entera: «lo más grueso» son 12,6 mm
        # de radio de cráneo, y además tardaba 52 s.
        bloque = _bola((0, 0, 0), 40.0, res=60)
        det = AneurysmDetector(min_radius_mm=0.8, min_positive_gauss_frac=0.40,
                               min_sphericity=0.25, pre_smooth_iterations=10)
        hits = consensus(bloque, det, top=5)
        for h in hits:
            assert h.channels == [CH_CURVATURE] or not h.channels


# ── 4. El corte por plano ────────────────────────────────────────────────── #

class TestThePlaneCut:
    def test_it_keeps_one_side(self):
        t = _tubo(radio=1.5, largo=60.0)
        arriba = clip_plane(t, (0, 0, 0), (0, 1, 0), invert=False)
        pts = np.asarray([arriba.GetPoint(i)
                          for i in range(arriba.GetNumberOfPoints())])
        assert pts.size and pts[:, 1].min() > -1.0

    def test_invert_keeps_the_other(self):
        t = _tubo(radio=1.5, largo=60.0)
        abajo = clip_plane(t, (0, 0, 0), (0, 1, 0), invert=True)
        pts = np.asarray([abajo.GetPoint(i)
                          for i in range(abajo.GetNumberOfPoints())])
        assert pts.size and pts[:, 1].max() < 1.0

    def test_an_empty_mesh_passes_through(self):
        assert clip_plane(vtk.vtkPolyData(), (0, 0, 0),
                          (0, 1, 0)).GetNumberOfPoints() == 0


# ── 5. Por los endpoints ─────────────────────────────────────────────────── #

def _sesion(poly) -> str:
    sid = create_session()
    write_vtp(poly, session_subdir(sid, "meshes") / "vessel_tree.vtp")
    return sid


class TestThroughTheApi:
    def test_bounds_give_the_slider_a_real_range(self):
        sid = _sesion(_tubo(radio=1.5, largo=60.0))
        r = client.get(f"/api/mesh-bounds/{sid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["min"]["y"] < -25 and d["max"]["y"] > 25
        assert d["vertices"] > 0

    def test_a_plane_cut_removes_the_bottom_and_can_be_undone(self):
        poly = _une(_tubo(radio=1.5, largo=60.0), _bola((0, -40, 0), 6.0))
        sid = _sesion(poly)
        antes = poly.GetNumberOfPoints()

        r = client.post(f"/api/mesh-plane-cut/{sid}", json={
            "axis": "y", "offset_mm": -25.0, "keep_positive": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["removed_vertices"] > 0
        assert d["vertices"] < antes
        assert d["undo_depth"] >= 1

        en_disco = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        pts = np.asarray([en_disco.GetPoint(i)
                          for i in range(en_disco.GetNumberOfPoints())])
        assert pts[:, 1].min() > -26.0, "la bola de abajo sigue ahí"

        u = client.post(f"/api/mesh-restore/{sid}", json={"scope": "undo"})
        assert u.status_code == 200 and u.json()["vertices"] == antes

    def test_a_cut_that_empties_the_mesh_is_refused(self):
        sid = _sesion(_tubo(radio=1.5, largo=60.0))
        r = client.post(f"/api/mesh-plane-cut/{sid}", json={
            "axis": "y", "offset_mm": 500.0, "keep_positive": True})
        assert r.status_code == 422
        assert "vacía" in r.json()["detail"]

    def test_a_custom_normal_needs_one(self):
        sid = _sesion(_tubo(radio=1.5, largo=60.0))
        r = client.post(f"/api/mesh-plane-cut/{sid}", json={
            "axis": "custom", "offset_mm": 0.0, "keep_positive": True})
        assert r.status_code == 422

    def test_without_a_mesh_it_says_so(self):
        sid = create_session()
        assert client.get(f"/api/mesh-bounds/{sid}").status_code == 409
        assert client.post(f"/api/mesh-plane-cut/{sid}", json={
            "axis": "y", "offset_mm": 0.0}).status_code == 409


# ── 6. El cuerpo del aneurisma sí existe, y ahora sale del backend ──────── #

class TestTheClosedSacTravels:
    """El saco cerrado se escribía al disco y no lo pintaba nadie.

    Es la ÚNICA malla de este flujo que delimita el cuerpo del aneurisma. La
    del candidato solo señala dónde mirar, y no hay forma de sacar el cuerpo
    automáticamente de los tres criterios: el calibre se derrama por el tronco
    (31 mm para una lesión de 5), el cociente no tiene corte natural, y la
    curvatura gaussiana no frena en un vaso porque un cilindro la tiene CERO
    — validado con sacos sintéticos de 4, 6 y 8 mm, que devolvían los tres la
    misma región de 27,5 mm.
    """

    def test_the_field_exists_and_is_empty_without_a_marked_neck(self):
        from models.detection import MorphometryResult
        campo = MorphometryResult.model_fields["sac_mesh_url"]
        assert campo.default == ""

    def test_the_description_says_why_it_cannot_be_automatic(self):
        from models.detection import MorphometryResult
        d = MorphometryResult.model_fields["sac_mesh_url"].description
        assert "cuello" in d
        assert "27,5 mm" in d, "la medida que descartó la vía automática"

    def test_the_candidate_patch_is_not_the_body_and_says_so(self):
        from models.detection import AneurysmCandidate
        d = AneurysmCandidate.model_fields["patch_kind"].description
        assert "DÓNDE mirar" in d and "no qué parte es la lesión" in d


# ── 7. Todo tiene que poder deshacerse, también lo que se pinta ─────────── #

class TestEverythingCanBeUndone:
    """El usuario lo pidió como principio, así que se comprueba como principio.

    El agujero que había: `morpho.sac_vtp_name` y el propio `aneurysm_sac.vtp`
    no estaban en la limpieza, así que «Limpiar candidatos y morfometría»
    borraba las medidas y dejaba el saco verde pintado en el visor — una
    medida borrada que se seguía viendo.
    """

    def test_clearing_forgets_the_isolated_sac(self):
        from routers.detect import _MORPHO_STATE_KEYS
        assert "morpho.sac_vtp_name" in _MORPHO_STATE_KEYS
        assert "morpho.rim_points" in _MORPHO_STATE_KEYS, (
            "los puntos del borde reaparecían al reanudar"
        )

    def test_clearing_deletes_the_sac_file_too(self):
        import routers.detect as det
        src = (pathlib.Path(det.__file__).read_text(encoding="utf-8"))
        assert 'sac = meshes_dir / "aneurysm_sac.vtp"' in src
        assert "sac.unlink()" in src, "la clave sin el fichero no basta"

    def test_clearing_forgets_the_new_candidate_keys(self):
        import routers.detect as det
        src = pathlib.Path(det.__file__).read_text(encoding="utf-8")
        assert '"channels", "patch_kind"' in src, (
            "los canales y el tipo de parche se quedaban de la corrida anterior"
        )

    def test_the_plane_cut_is_snapshotted_before_touching_the_mesh(self):
        poly = _une(_tubo(radio=1.5, largo=60.0), _bola((0, -40, 0), 6.0))
        sid = _sesion(poly)
        antes = poly.GetNumberOfPoints()
        client.post(f"/api/mesh-plane-cut/{sid}", json={
            "axis": "y", "offset_mm": -25.0, "keep_positive": True})
        r = client.post(f"/api/mesh-restore/{sid}", json={"scope": "undo"})
        assert r.status_code == 200 and r.json()["vertices"] == antes

