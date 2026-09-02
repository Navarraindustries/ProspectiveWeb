"""The pictures the server draws: of the clip, and of the plan with it in place.

Until now a report carried one image and it came from the browser — whatever the
viewer happened to be showing. Two reports of the same case looked different and
a report generated from a resumed session had no picture at all.

What these pin down:

1. **Named viewpoints render, headless.** No display on a server, so the render
   window is offscreen; a viewpoint that fails is dropped, never fatal.
2. **The device is IN the picture and not cropped.** The first version framed the
   camera on the sac alone and cut the clip off — the clip is several times
   larger than the aneurysm it closes, which is the whole point of showing it.
3. **The pictures reach both PDFs**: the dossiers a workshop quotes from, and
   the surgical report.
"""
from __future__ import annotations

import io
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_render_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from pathlib import Path

import numpy as np
import pytest
import vtk

from services.clip_dossier import render_dossier
from services.report_generator import ReportData, ReportGenerator, _render_plan_views
from services import scene_render
from services.scene_render import (DEVICE_RGB, VIEWS, render_clip_views,
                                   render_plan_views, render_views, union_bounds)
from services.segmentation import write_vtp
from services.sessions import create_session, session_subdir

PLAN_VIEWS = ["anterior", "izquierda", "superior", "oblicua"]


# ── helpers ───────────────────────────────────────────────────────────────── #

def _sphere(radius=4.0, center=(0.0, 0.0, 0.0)):
    s = vtk.vtkSphereSource()
    s.SetRadius(radius)
    s.SetCenter(*center)
    s.SetThetaResolution(24)
    s.SetPhiResolution(24)
    s.Update()
    return s.GetOutput()


def _bar(length=30.0, center=(0.0, 0.0, 0.0)):
    """A long thin box standing in for a clip: much larger than the sac."""
    c = vtk.vtkCubeSource()
    c.SetXLength(length)
    c.SetYLength(1.6)
    c.SetZLength(1.2)
    c.SetCenter(*center)
    c.Update()
    return c.GetOutput()


def _vessel(radius=3.0, height=60.0):
    """A parent artery, not a sphere around everything.

    Shape matters here: a sphere large enough to hold the scene puts the camera
    inside it, so every view looks through 0.35-opacity vessel and the colours
    that separate the layers wash together — which is not what a vascular tree
    does to a clip on its surface.
    """
    c = vtk.vtkCylinderSource()
    c.SetRadius(radius)
    c.SetHeight(height)
    c.SetResolution(32)
    c.Update()
    return c.GetOutput()


def _pixels(png: bytes) -> np.ndarray:
    from PIL import Image as PILImage

    return np.asarray(PILImage.open(io.BytesIO(png)).convert("RGB")).astype(int)


def _gold_mask(px: np.ndarray) -> np.ndarray:
    """Where the device colour landed, tolerant of shading.

    Gold is the only layer whose red runs well ahead of its blue: the vessel is
    neutral grey (r≈g≈b) and the sac is blue (b>r), so the ordering separates
    them without pinning an exact RGB that lighting would never reproduce.
    """
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (r > b + 40) & (g > b + 20) & (r > 60)


# ── 1. The renderer ───────────────────────────────────────────────────────── #

class TestTheRendererWorksHeadless:
    def test_every_named_view_comes_back_as_a_png(self):
        out = render_views([(_sphere(), DEVICE_RGB, 1.0)], list(VIEWS), width=200, height=160)
        assert set(out) == set(VIEWS)
        for name, data in out.items():
            assert data[:8] == b"\x89PNG\r\n\x1a\n", f"la vista {name} no es un PNG"
            assert len(data) > 500

    def test_an_unknown_view_is_skipped_and_the_rest_survive(self):
        out = render_views([(_sphere(), DEVICE_RGB, 1.0)],
                           ["anterior", "no-existe", "superior"], width=160, height=120)
        assert set(out) == {"anterior", "superior"}

    def test_nothing_to_draw_returns_nothing(self):
        assert render_views([]) == {}
        assert render_views([(vtk.vtkPolyData(), DEVICE_RGB, 1.0)]) == {}

    def test_the_same_scene_gives_the_same_picture(self):
        # The point of fixed viewpoints: a follow-up is comparable to a baseline.
        args = ([(_sphere(), DEVICE_RGB, 1.0)], ["oblicua"])
        assert render_views(*args, width=200, height=160)["oblicua"] == \
               render_views(*args, width=200, height=160)["oblicua"]


# ── 1b. Sharpness ─────────────────────────────────────────────────────────── #

class TestTheFramesAreNotJagged:
    """The offscreen window runs with MSAA off — some drivers fail outright with
    it on — so every edge came out a hard staircase, which a PDF viewer smears
    into the blur the user saw. Drawing at 2x and averaging down is the
    antialiasing, and it works on any driver."""

    def _render(self, size):
        return render_views([(_sphere(), DEVICE_RGB, 1.0)], ["oblicua"],
                            width=size[0], height=size[1])["oblicua"]

    def test_the_frame_comes_back_at_the_size_that_was_asked_for(self):
        # Supersampling is internal: a caller asking for 300x240 gets 300x240.
        px = _pixels(self._render((300, 240)))
        assert px.shape[:2] == (240, 300)

    def test_edges_carry_intermediate_tones(self, monkeypatch):
        # An aliased edge jumps from background to object in one pixel. Averaging
        # four samples per pixel puts real values in between, and those extra
        # tones are what "sharp" looks like on paper.
        smooth = len(np.unique(_pixels(self._render((300, 240))).reshape(-1, 3), axis=0))
        monkeypatch.setattr(scene_render, "SUPERSAMPLE", 1)
        jagged = len(np.unique(_pixels(self._render((300, 240))).reshape(-1, 3), axis=0))
        assert smooth > jagged * 1.2, (
            f"el supermuestreo no está suavizando nada ({smooth} vs {jagged} tonos)")


# ── 2. Framing: the device is in the picture ──────────────────────────────── #

class TestTheDeviceIsInFrame:
    def test_the_bounds_enclose_every_mesh(self):
        b = union_bounds([_sphere(radius=2.0), _bar(length=30.0)])
        assert b[0] <= -15.0 and b[1] >= 15.0, "el clip queda fuera de los límites"

    def test_empty_meshes_do_not_widen_the_bounds(self):
        assert union_bounds([_sphere(radius=2.0), vtk.vtkPolyData()]) == \
               union_bounds([_sphere(radius=2.0)])

    def test_nothing_to_enclose_is_none(self):
        assert union_bounds([]) is None
        assert union_bounds([None, vtk.vtkPolyData()]) is None

    def test_the_placed_device_is_visible_in_every_view(self):
        out = render_plan_views(vessel=_vessel(), dome=_sphere(radius=4.0),
                                devices=[(_bar(), DEVICE_RGB)], width=300, height=240)
        assert set(out) == set(PLAN_VIEWS)
        for name, png in out.items():
            assert _gold_mask(_pixels(png)).sum() > 100, f"el clip no se ve en {name}"

    def test_the_device_is_not_cropped_by_the_frame(self):
        # The regression: framing on the sac alone cut the clip off at the edges.
        out = render_plan_views(dome=_sphere(radius=4.0), devices=[(_bar(), DEVICE_RGB)],
                                width=300, height=240)
        for name, png in out.items():
            m = _gold_mask(_pixels(png))
            edge = m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any()
            assert not edge, f"el clip toca el borde en {name}: está recortado"

    def test_framing_on_the_sac_alone_would_have_cropped_it(self):
        # Proves the previous test is testing something: with the old framing the
        # clip runs off the picture.
        dome, bar = _sphere(radius=4.0), _bar()
        old = render_views([(dome, (0.3, 0.55, 0.75), 0.55), (bar, DEVICE_RGB, 1.0)],
                           ["anterior"], width=300, height=240, focus_poly=dome)
        m = _gold_mask(_pixels(old["anterior"]))
        assert m[:, 0].any() or m[:, -1].any(), "el encuadre antiguo ya no recorta"

    def test_a_plan_with_no_device_still_renders(self):
        out = render_plan_views(vessel=_vessel(), dome=_sphere(radius=4.0),
                                width=200, height=160)
        assert set(out) == set(PLAN_VIEWS)


# ── 3. The clip on its own, for the workshop ──────────────────────────────── #

class TestTheClipViews:
    def test_three_views_of_the_piece(self):
        out = render_clip_views(_bar(), width=200, height=160)
        assert set(out) == {"superior", "anterior", "oblicua"}

    def test_the_piece_fills_the_frame(self):
        png = render_clip_views(_bar(), ["oblicua"], width=200, height=160)["oblicua"]
        px = _pixels(png)
        assert _gold_mask(px).sum() > 0.02 * px.shape[0] * px.shape[1], \
            "la pieza sale demasiado pequeña para juzgar su forma"


# ── 4. The pictures reach the dossiers ────────────────────────────────────── #

def _dossier(kind: str) -> dict:
    return {
        "kind": kind,
        "title": "Clip de prueba",
        "part_no": "PR-TEST-0001",
        "label": "NAVARRO recto 7 mm",
        "dimensions": [["Longitud de mordaza", "7.00 mm", "±0.10 mm"]],
        "verification": ["VERIFICAR EN LA PIEZA: medir la pieza terminada."],
        "confidentiality": "Documento sin datos de paciente.",
    }


def _pdf_images(path) -> int:
    import pymupdf

    return sum(len(p.get_images(full=True)) for p in pymupdf.open(str(path)))


def _pdf_text(path) -> str:
    import pymupdf

    return "\n".join(p.get_text() for p in pymupdf.open(str(path)))


@pytest.fixture(scope="module")
def views():
    return render_clip_views(_bar(), width=320, height=240)


class TestTheDossiersCarryThePictures:
    @pytest.mark.parametrize("kind", ["internal", "external"])
    def test_both_copies_show_the_piece(self, tmp_path, views, kind):
        out = render_dossier(_dossier(kind), tmp_path / f"{kind}.pdf", images=views)
        assert _pdf_images(out) == len(views) == 3
        text = _pdf_text(out)
        assert "La pieza" in text
        for name in views:
            assert name in text, f"la vista {name} no está etiquetada"

    def test_without_pictures_the_dossier_still_builds(self, tmp_path):
        out = render_dossier(_dossier("external"), tmp_path / "sin.pdf")
        assert _pdf_images(out) == 0
        assert "Longitud de mordaza" in _pdf_text(out)


# ── 5. The pictures reach the report ──────────────────────────────────────── #

def _session_with_meshes(*, device=True) -> str:
    sid = create_session()
    meshes = Path(session_subdir(sid, "meshes"))
    write_vtp(_vessel(), meshes / "vessel_tree.vtp")
    write_vtp(_sphere(radius=4.0), meshes / "aneurysm_sac.vtp")
    if device:
        write_vtp(_bar(), meshes / "clips_placed.vtp")
    return sid


class TestTheReportCarriesThePlan:
    def test_the_session_meshes_become_four_views(self):
        assert set(_render_plan_views(_session_with_meshes())) == set(PLAN_VIEWS)

    def test_a_session_with_no_meshes_renders_nothing(self):
        assert _render_plan_views(create_session()) == {}

    def test_the_placed_clip_appears_in_the_rendered_plan(self):
        with_dev = _render_plan_views(_session_with_meshes(device=True))
        without = _render_plan_views(_session_with_meshes(device=False))
        assert _gold_mask(_pixels(with_dev["anterior"])).sum() > 100
        assert _gold_mask(_pixels(without["anterior"])).sum() == 0

    def test_the_section_is_in_the_pdf(self, tmp_path):
        views = render_plan_views(dome=_sphere(radius=4.0),
                                  devices=[(_bar(), DEVICE_RGB)], width=320, height=240)
        out = ReportGenerator(ReportData(plan_views=views)).generate(tmp_path / "informe.pdf")
        text = _pdf_text(out)
        assert "Plan quirúrgico en 3D" in text
        for name in PLAN_VIEWS:
            assert f"Vista {name}" in text
        # The caption is not decoration: these are diagrams of the segmentation
        # and a reader must not take them for radiological images.
        assert "no imágenes radiológicas" in text
        assert _pdf_images(out) == 4

    def test_a_plan_with_no_device_says_so_instead_of_looking_like_a_plan(self, tmp_path):
        # Generar el informe ANTES de colocar el clip daba cuatro imágenes de una
        # vasculatura sin dispositivo, y se leían como si el plan no llevara
        # ninguno. Lo que faltaba no era el render: era decirlo.
        views = render_plan_views(dome=_sphere(radius=4.0), width=200, height=160)
        out = ReportGenerator(ReportData(plan_views=views)).generate(tmp_path / "sin.pdf")
        text = _pdf_text(out)
        assert "Sin dispositivo colocado" in text
        assert "volver a generar el informe" in text

    def test_a_plan_with_a_device_does_not_carry_that_warning(self, tmp_path):
        from services.report_generator import ClipEntry

        views = render_plan_views(dome=_sphere(radius=4.0),
                                  devices=[(_bar(), DEVICE_RGB)], width=200, height=160)
        data = ReportData(plan_views=views, clips=[ClipEntry(
            index=1, name="NAVARRO™ T1 Recto 7.0 mm", position_mm=(0.0, 0.0, 0.0),
            orientation_deg=(0.0, 0.0, 0.0))])
        assert "Sin dispositivo colocado" not in _pdf_text(
            ReportGenerator(data).generate(tmp_path / "con.pdf"))

    def test_a_report_without_views_omits_the_section(self, tmp_path):
        out = ReportGenerator(ReportData()).generate(tmp_path / "vacio.pdf")
        assert "Plan quirúrgico en 3D" not in _pdf_text(out)
