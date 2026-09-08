"""The clip you chose is the clip that gets made — end to end.

Reported from the application: a Sugita curved stayed as the chosen device even
after a NAVARRO was selected; fabricación then refused to personalise it
("no es NAVARRO"), and the workshop dossier printed the Sugita. Three separate
faults met in that one symptom, and each gets a test here:

1. **Another manufacturer's clip could be offered at all.** The family now draws
   all four shapes, so a clip nobody here can obtain is never proposed.
2. **The placed clip's id was not recorded**, only its display name, so the
   manufacturing step re-derived a piece from the measurements instead of using
   the one that was placed. Recommendation and decision could disagree in
   silence.
3. **The fenestrated path had no NAVARRO answer**, so a bifurcation case fell
   through to a commercial clip by construction.

A fourth surfaced later, in the endpoints that feed the model picker: they kept
serving the commercial reference table under ids nothing resolves, so the
picker offered eight unobtainable clips, preselected one, and placing it
substituted a generic 9 mm box in silence.
"""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_identity_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import pathlib

import pytest
from fastapi.testclient import TestClient

from main import app
from services import navarro
from services.clip_library import catalogue_with_library
from services.clips import CLIP_CATALOGUE
from services.database import Base, engine
from services.sessions import create_session, write_state

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)

_HAS_NAVARRO = bool(navarro.list_variants(root=navarro.DEFAULT_ROOT))
pytestmark = pytest.mark.skipif(not _HAS_NAVARRO, reason="biblioteca NAVARRO no instalada")


@pytest.fixture(autouse=True)
def _real_library():
    before = os.environ.get("NAVARRO_ROOT")
    os.environ["NAVARRO_ROOT"] = str(navarro.DEFAULT_ROOT)
    navarro.clear_cache()
    yield
    navarro.clear_cache()
    if before is None:
        os.environ.pop("NAVARRO_ROOT", None)
    else:
        os.environ["NAVARRO_ROOT"] = before


def _session(neck: float = 6.0, region: str = "ACM bifurcacion") -> str:
    sid = create_session()
    write_state(sid, "morpho.neck_mm", str(neck))
    write_state(sid, "morpho.ar", "1.5")
    write_state(sid, "morpho.dome_height_mm", str(neck * 1.5))
    write_state(sid, "morpho.max_diameter_mm", str(neck * 1.8))
    write_state(sid, "morpho.parent_artery_mm", "3.2")
    write_state(sid, "morpho.neck_source", "rim")
    write_state(sid, "morpho.neck_origin_x", "0")
    write_state(sid, "morpho.neck_origin_y", "0")
    write_state(sid, "morpho.neck_origin_z", "0")
    write_state(sid, "morpho.axis_z", "1")
    return sid


# ── 1. Nothing from another manufacturer is ever offered ──────────────────── #

class TestOnlyTheFamilyIsOffered:
    def test_the_catalogue_the_selector_scores_is_navarro_only(self):
        makers = {c.manufacturer for c in catalogue_with_library()}
        assert makers == {navarro.MANUFACTURER}, f"se cuela otro fabricante: {makers}"

    def test_the_reference_table_still_exists_for_its_real_job(self):
        # It is not deleted: the manufacturing spec derives its proportions and
        # its floors — the smallest spring anyone actually winds — from real
        # parts. Reference, never an offer.
        assert CLIP_CATALOGUE, "la tabla de referencia dimensional sigue haciendo falta"
        assert min(c.spring_length_mm for c in CLIP_CATALOGUE) > 0

    def test_no_recommendation_names_another_maker(self):
        sid = _session()
        body = client.get(f"/api/clips/selection/{sid}").json()
        for c in body["recommended"] + body["rejected"]:
            assert "NAVARRO" in c["clip_name"], c["clip_name"]


# ── 2. The placed clip is the clip that gets made ─────────────────────────── #

class TestTheChosenClipTravels:
    def _place(self, sid: str, clip_id: str):
        r = client.post("/api/clips/plan", json={
            "session_id": sid,
            "placements": [{"clip_id": clip_id,
                            "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                            "normal": [0.0, 0.0, 1.0], "rotation_deg": 0}],
        })
        assert r.status_code == 200, r.text
        return r

    def test_the_placement_records_which_design_it_was(self):
        # Only the display name used to be stored, so nothing downstream could
        # tell a T1 from a T4.
        from services.device_state import read_clips

        sid = _session()
        self._place(sid, "navarro:t2:0:13.0")
        placed = read_clips(sid)
        assert placed and placed[0]["clip_id"] == "navarro:t2:0:13.0"

    def test_manufacturing_describes_the_placed_piece_not_a_re_derivation(self):
        # The heart of the reported bug: choose one clip, get another in the
        # dossier. This case's measurements argue for a fenestrated clip; the
        # surgeon places a curved one, and fabricación must follow the surgeon.
        sid = _session()
        advised = client.get(f"/api/clip-orders/prefill/{sid}").json()

        self._place(sid, "navarro:t2:0:13.0")
        after = client.get(f"/api/clip-orders/prefill/{sid}").json()
        assert after["advised_series"] == "T2", "el clip colocado tiene que mandar"
        assert after["advised_jaw_mm"] == pytest.approx(13.0)
        before_pair = (advised["advised_series"], advised["advised_jaw_mm"])
        after_pair = (after["advised_series"], after["advised_jaw_mm"])
        assert before_pair != after_pair, (
            "el caso proponía otra cosa; ese desacuerdo es justo lo que se corrige")

    def test_the_dossier_names_the_placed_piece(self):
        sid = _session(region="ACM bifurcacion")
        self._place(sid, "navarro:t3:90:16.0")
        b = client.post(f"/api/clips/manufacture/{sid}").json()
        assert b["source"] == "navarro"
        assert "T3" in b["piece_label"] and "90" in b["piece_label"], b["piece_label"]

    def test_a_placed_clip_can_always_be_personalised(self):
        # "No dejaba personalizar porque no era navarro" — that state is gone:
        # everything placeable is a family design, so the STL always exists.
        sid = _session(region="ACM bifurcacion")
        self._place(sid, "navarro:t4:0:13.0:5.0")
        b = client.post(f"/api/clips/manufacture/{sid}").json()
        assert b["stl_url"], "un clip colocado siempre tiene pieza que fabricar"


# ── 3. The fenestrated path has a NAVARRO answer ──────────────────────────── #

class TestTheFenestratedPath:
    def test_a_bifurcation_case_is_answered_by_the_family(self):
        # At the service level, where the anatomical region can be stated: it
        # lives on the clinical case, not in session state, so the endpoint
        # fixture above cannot carry it.
        from services.clip_manufacture import resolve_perfect_clip
        from services.clip_selection import ClipCase, derive_manufacture_spec
        from services.clips import ClipShape

        case = ClipCase(neck_mm=6.0, ar=1.5, dome_height_mm=9.0,
                        region="ACM bifurcacion", parent_artery_mm=3.2,
                        neck_source="rim")
        spec = derive_manufacture_spec(case, [])
        assert spec.shape == ClipShape.FENESTRATED
        pc = resolve_perfect_clip(case, spec)
        assert pc.source == "navarro" and pc.navarro_series == "T4"
        assert not pc.commercial_name

    def test_any_case_reaching_the_order_form_can_order(self):
        sid = _session()
        pre = client.get(f"/api/clip-orders/prefill/{sid}").json()
        assert pre["can_order"] is True, pre["reason"]
        assert not pre["commercial_name"]

    def test_the_id_of_a_fenestrated_clip_carries_its_window(self):
        # A 10×3 and a 10×5 are different pieces; an id that forgets the window
        # cannot tell them apart, and the geometry would come back wrong.
        cid = navarro.clip_id("T4", 0.0, 10.0, 5.0)
        assert cid == "navarro:t4:0:10.0:5.0"
        assert navarro.parse_clip_id(cid) == ("T4", 0.0, 10.0, 5.0)
        mesh = navarro.mesh_for_id(cid)
        assert mesh.GetNumberOfPoints() > 5000

    def test_an_old_four_field_id_still_parses(self):
        # Orders signed before the window existed carry four fields.
        assert navarro.parse_clip_id("navarro:t1:0:7.0") == ("T1", 0.0, 7.0, 0.0)


# ── 4. What the picker offers is what the app can place ───────────────────── #

class TestThePickerOffersOnlyWhatCanBePlaced:
    """The dropdown feeds placement, so an id it offers has to resolve.

    `POST /clips/plan` does not reject an unknown id: it logs and places a
    default 9 mm box, which is why this was invisible. The condition that
    decides between the real geometry and that box is membership in
    `_catalogue_index`, so that is what these assert.
    """

    def _index(self):
        from routers.clips import _catalogue_index
        return _catalogue_index()

    def test_the_library_listing_is_the_family(self):
        makers = {item["manufacturer"] for item in client.get("/api/clips").json()}
        assert makers == {navarro.MANUFACTURER}, f"se cuela otro fabricante: {makers}"

    def test_every_listed_clip_can_actually_be_placed(self):
        index = self._index()
        orphans = [i["id"] for i in client.get("/api/clips").json() if i["id"] not in index]
        assert not orphans, f"ids que nadie resuelve: {orphans[:5]}"

    def test_every_recommended_clip_can_actually_be_placed(self):
        sid = _session()
        index = self._index()
        recs = client.get(f"/api/clips/recommendations/{sid}").json()
        assert recs, "la sesión tiene morfometría; debe haber recomendaciones"
        orphans = [r["clip_id"] for r in recs if r["clip_id"] not in index]
        assert not orphans, f"ids que nadie resuelve: {orphans[:5]}"

    def test_the_picker_and_the_panel_agree(self):
        # Two rankings is one too many: the panel explains the choice and the
        # picker makes it, and they used to be computed by different scorers over
        # different catalogues. Whatever the panel argues for has to be what the
        # picker preselects.
        sid = _session()
        panel = client.get(f"/api/clips/selection/{sid}?verify=false").json()
        picker = client.get(f"/api/clips/recommendations/{sid}").json()
        assert panel["recommended"], panel["summary"]
        assert [c["clip_id"] for c in panel["recommended"]] == [r["clip_id"] for r in picker]

    def test_placing_the_preselected_clip_keeps_its_identity(self):
        # The whole symptom in one assertion: what the picker hands over first is
        # what ends up in the plan, under the same id.
        sid = _session()
        first = client.get(f"/api/clips/recommendations/{sid}").json()[0]
        r = client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": first["clip_id"], "position": {"x": 0, "y": 0, "z": 0},
             "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        assert r.status_code == 200, r.text
        from services.device_state import read_clips
        assert [c["clip_id"] for c in read_clips(sid)] == [first["clip_id"]]
        assert first["clip_id"].startswith("navarro:")

    def test_an_unmeasurable_neck_still_leaves_the_step_usable(self):
        # Kept from the endpoint this replaced: on an open mesh the neck cannot
        # be measured, and answering with an empty picker blocked clip placement
        # entirely while the coil catalogue stayed available.
        sid = create_session()
        recs = client.get(f"/api/clips/recommendations/{sid}").json()
        assert recs, "sin morfometría el paso de clips no puede quedar bloqueado"
        assert all(r["clip_id"] in self._index() for r in recs)

    def test_and_says_that_ranking_is_not_about_this_case(self):
        # What the old fallback did not do: a general ordering that reads like a
        # case-specific one is worse than no ordering.
        sid = create_session()
        recs = client.get(f"/api/clips/recommendations/{sid}").json()
        assert all("orden general" in r["reason"] for r in recs), recs[0]["reason"]

    def test_a_measured_case_is_not_labelled_general(self):
        recs = client.get(f"/api/clips/recommendations/{_session()}").json()
        assert not any("orden general" in r["reason"] for r in recs)


# ── 5. What gets verified is what gets placed ─────────────────────────────── #

class TestVerificationMeasuresTheRealPiece:
    """The geometric check used to describe a different object than placement.

    Placement has always used the drawn mesh; verification swept boxes from the
    catalogue dimensions. And it read the bend off `shape`, the selector's coarse
    class, which the family outgrew the moment it started bending in 15° steps.
    """

    def _mesh(self, spec):
        from services.clip_fit import build_candidate_mesh
        from services.clip_selection import ClipCandidate
        return build_candidate_mesh(
            ClipCandidate(clip=spec, criteria=[], coverage_ratio=0.0, safety_margin_mm=0.0))

    def _angled(self, angle: float):
        return next(c for c in catalogue_with_library()
                    if c.bend_angle_deg == angle and c.blade_length_mm == 7.0)

    def test_each_drawn_bend_is_verified_as_itself(self):
        # 15 and 30 were both checked as a 45; 60 and 75 as a 90. Four of the six
        # angled variants were measured against a bend they do not have — on the
        # criterion where the bend is the entire point.
        spans = {a: self._mesh(self._angled(a)).GetBounds()[1]
                    - self._mesh(self._angled(a)).GetBounds()[0]
                 for a in (15.0, 30.0, 45.0, 60.0, 75.0, 90.0)}
        assert len(set(round(v, 2) for v in spans.values())) == 6, spans
        # And the more it bends the less it reaches: a monotonic check is worth
        # more here than six pinned numbers.
        ordered = [spans[a] for a in (15.0, 30.0, 45.0, 60.0, 75.0, 90.0)]
        assert ordered == sorted(ordered, reverse=True), spans

    def test_the_mesh_verified_is_the_mesh_placed(self):
        from services.navarro import mesh_for_id
        spec = self._angled(60.0)
        placed = mesh_for_id(spec.clip_id)
        checked = self._mesh(spec)
        assert checked.GetNumberOfPoints() == placed.GetNumberOfPoints()
        assert checked.GetBounds() == placed.GetBounds()

    def test_a_spec_with_no_drawn_geometry_still_gets_checked(self):
        # A hospital library entry has no mesh on disk. Falling through to the
        # approximation is right; skipping the check would not be.
        from services.clips import ClipShape, ClipSpec
        spec = ClipSpec("Clip del hospital", ClipShape.STRAIGHT, 9.0, 1.3, 1.0, 7.0, 120,
                        "Biblioteca")
        assert self._mesh(spec).GetNumberOfPoints() > 0


# ── 6. A custom jaw is a piece, not a picture ─────────────────────────────── #

class TestTheCustomJawCanBePlaced:
    """Dialling a length has to end in the plan, not in a preview window.

    `CustomJawOut` carried a mesh and an STL and no id, so the piece could be
    looked at and downloaded but never placed: never collision-checked, never
    recorded, and never seen by the order form — which went back to the length
    derived from morphometry. The same number typed twice, with nothing holding
    the two together.
    """

    def _build(self, sid, jaw=8.5, shape="straight", angle=0.0, window=0.0):
        q = f"jaw_mm={jaw}&angle_deg={angle}&shape={shape}&window_mm={window}"
        r = client.post(f"/api/clips/navarro/{sid}?{q}", json={})
        assert r.status_code == 200, r.text
        return r.json()

    def test_the_generated_piece_carries_an_id(self):
        built = self._build(_session())
        assert built["clip_id"].startswith("navarro:")
        assert built["clip_id"].endswith(":8.5"), built["clip_id"]

    def test_that_id_builds_the_very_mesh_that_was_previewed(self):
        from services.navarro import build_jaw, mesh_for_id

        built = self._build(_session(), jaw=11.5, shape="angled", angle=45.0)
        preview, _src, _exact = build_jaw(45.0, 11.5, shape="angled")
        again = mesh_for_id(built["clip_id"])
        assert again.GetNumberOfPoints() == preview.GetNumberOfPoints()
        assert again.GetBounds() == preview.GetBounds()

    def test_a_custom_jaw_can_be_placed_like_any_other_clip(self):
        from services.device_state import read_clips

        sid = _session()
        built = self._build(sid, jaw=8.5)
        r = client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": built["clip_id"], "position": {"x": 0, "y": 0, "z": 0},
             "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        assert r.status_code == 200, r.text
        assert [c["clip_id"] for c in read_clips(sid)] == [built["clip_id"]]

    def test_the_length_chosen_is_the_length_fabricación_offers(self):
        # El traspaso que faltaba. Marcar 8.5 en dispositivos y encontrarse otra
        # vez la medida sugerida en fabricación es cómo se separan las dos.
        sid = _session()
        built = self._build(sid, jaw=8.5)
        client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": built["clip_id"], "position": {"x": 0, "y": 0, "z": 0},
             "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        pre = client.get(f"/api/clip-orders/prefill/{sid}").json()
        assert pre["advised_jaw_mm"] == pytest.approx(8.5)

    def test_the_rehearsal_opens_a_custom_jaw_by_its_own_length(self):
        # El índice solo tiene las tallas dibujadas, así que el id es el único
        # sitio donde consta la longitud de una pieza a medida. Sin leerlo, el
        # ensayo caía a la PALANCA —la distancia bisagra-punta, otra cota— y
        # 8.5 mm lo separa todo: por mordaza abre 8.5 mm y la cifra es una
        # inferencia; por palanca son 11.4 mm, pasa del techo de 10, y la
        # aplicación lo habría presentado como un dato del diseñador.
        from services.clip_animation import blade_swing_deg, jaw_geometry
        from services.navarro import build_jaw

        sid = _session()
        built = self._build(sid, jaw=8.5)
        client.post("/api/clips/plan", json={"session_id": sid, "placements": [
            {"clip_id": built["clip_id"], "position": {"x": 0, "y": 0, "z": 0},
             "normal": [0, 0, 1], "rotation_deg": 0},
        ]})
        r = client.post(f"/api/clips/animation/{sid}", json={
            "session_id": sid, "placements": [
                {"clip_id": built["clip_id"], "position": {"x": 0, "y": 0, "z": 0},
                 "normal": [0, 0, 1], "rotation_deg": 0}]})
        assert r.status_code == 200, r.text

        poly, _src, _exact = build_jaw(0.0, 8.5, shape="straight")
        geom = jaw_geometry(poly)
        by_jaw = blade_swing_deg(geom, 8.5)
        by_lever = blade_swing_deg(geom, geom["lever_mm"])
        assert r.json()["swing_deg"] == pytest.approx(by_jaw, abs=0.05)
        assert r.json()["swing_deg"] != pytest.approx(by_lever, abs=0.05)
        assert r.json()["mechanics_assumed"] is True, (
            "8.5 mm no llega al techo: la apertura sigue siendo una inferencia")
