"""Does the recommendation still discriminate, now the catalogue is one family?

The selector was designed to choose among 42 clips from four makers with
genuinely different geometry. Pointed at 66 variants of ONE family — same body,
same alloy, same uncharacterised force band — it stopped separating anything:
measured across nine cases, the top two candidates scored *identically* in eight
of them, the whole top five sat within 0–7 points of each other, and a deep dome
and a plain neck came back with the same five clips.

Three causes, three tests apiece:

1. **A criterion that is constant cannot rank, it can only dilute.** The closing
   force scored 0.60 on all 66.
2. **The list had no shape variety.** Six T3 angled 7 mm differing only in bend,
   while the straight, curved and fenestrated never appeared — when «straight,
   curved, angled or fenestrated» is the actual decision.
3. **A warning that scores zero is indistinguishable from a failure.** Hidden
   while the force added a flat 0.60 to everything.
"""
from __future__ import annotations

import os
import pathlib
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_discrim_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")
os.environ["NAVARRO_ROOT"] = str(
    pathlib.Path(__file__).resolve().parent.parent / "NAVARRO™ - Variantes"
)

import pytest

from services import navarro
from services.clip_library import catalogue_with_library
from services.clip_selection import (ClipCase, evaluate_clip, select_clips,
                                     suggest_custom_jaw)

_HAS_NAVARRO = bool(navarro.list_variants(root=navarro.DEFAULT_ROOT))
pytestmark = pytest.mark.skipif(not _HAS_NAVARRO, reason="biblioteca NAVARRO no instalada")


def _case(neck=6.0, ar=1.5, region="") -> ClipCase:
    return ClipCase(neck_mm=neck, ar=ar, dome_height_mm=neck * ar,
                    max_diameter_mm=neck * 1.8, region=region,
                    parent_artery_mm=3.2 if region else 0.0, neck_source="rim")


# ── 1. A constant criterion stops voting ──────────────────────────────────── #

class TestAConstantCriterionDoesNotRank:
    def test_the_force_is_the_same_for_every_candidate(self):
        # The premise. If this ever stops being true — because the manufacturer
        # characterised the spring — the weighting below should come back.
        scores = {round(k.score, 3)
                  for spec in catalogue_with_library()
                  for k in evaluate_clip(spec, _case()).criteria if k.key == "force"}
        assert len(scores) == 1, "la fuerza ya discrimina; revisar si debe volver a votar"

    def test_so_it_carries_no_weight(self):
        force = next(k for k in evaluate_clip(catalogue_with_library()[0], _case()).criteria
                     if k.key == "force")
        assert force.weight == 0.0

    def test_but_it_is_still_shown_and_can_still_disqualify(self):
        # Not hidden: the caveat is real and stays on screen, and a band that
        # could not hold the neck still fails the clip outright.
        cand = evaluate_clip(catalogue_with_library()[0], _case())
        assert any(k.key == "force" for k in cand.criteria)
        huge = select_clips(_case(neck=40.0))
        assert huge.outcome == "manufacture", "un cuello imposible sigue sin candidatos"


# ── 2. The list answers the question that is being asked ──────────────────── #

class TestTheListShowsTheRealChoice:
    def test_every_shape_that_fits_appears(self):
        rec = select_clips(_case()).recommended
        shapes = {c.clip.shape for c in rec}
        assert len(shapes) >= 4, f"solo {len(shapes)} formas distintas en la lista: {shapes}"

    def test_no_shape_floods_the_list(self):
        # Three T3 variants differing only in bend are three ways of saying the
        # same thing on a list of six.
        rec = select_clips(_case()).recommended
        from collections import Counter
        worst = Counter(c.clip.shape for c in rec).most_common(1)[0][1]
        assert worst <= 2, "una sola forma ocupa más de dos plazas"

    def test_the_neck_still_drives_the_size(self):
        # The one thing that always worked has to keep working.
        jaws = [select_clips(_case(neck=n)).recommended[0].clip.blade_length_mm
                for n in (6.0, 12.0, 18.0)]
        assert jaws == sorted(jaws) and jaws[0] < jaws[-1], jaws


# ── 3. Ties are disclosed instead of broken silently ──────────────────────── #

class TestTiesAreSaidOutLoud:
    def test_a_tie_at_the_top_is_reported(self):
        # With most of what used to separate clips now identical across the
        # family, ties are structural. Presenting an arbitrary tie-break as «the
        # best» would invent a preference the case does not support.
        sel = select_clips(_case())
        top = sel.recommended[0].score
        tied = [c for c in sel.recommended if abs(c.score - top) < 0.05]
        if len(tied) < 2:
            pytest.skip("este caso no empata")
        assert any("empatan" in k for k in sel.caveats), sel.caveats

    def test_a_clear_winner_is_not_announced_as_a_tie(self):
        sel = select_clips(_case(neck=12.0, region="ACM bifurcacion"))
        top = sel.recommended[0].score
        tied = [c for c in sel.recommended if abs(c.score - top) < 0.05]
        if len(tied) >= 2:
            pytest.skip("este caso sí empata")
        assert not any("empatan" in k for k in sel.caveats)


# ── 4. A warning is not a failure ─────────────────────────────────────────── #

class TestAWarningNeverScoresZero:
    def test_a_poor_but_usable_fit_keeps_a_score(self):
        # A 3 mm neck against a family whose shortest jaw is 7 mm: poor, and the
        # criterion says so with a warning — not a failure. It used to score
        # 0.00, which is what a failed criterion scores, so «poor» and
        # «impossible» were indistinguishable and the whole list read as broken.
        sel = select_clips(_case(neck=3.0, ar=1.2))
        assert sel.recommended, "un ajuste pobre sigue siendo una opción que mostrar"
        assert sel.recommended[0].score > 0.0

    def test_zero_still_means_disqualified(self):
        rec = select_clips(_case()).recommended
        assert all(c.score > 0.0 for c in rec)

    def test_the_exact_piece_is_offered_when_nothing_fits_well(self):
        # The better answer for a 3 mm neck is a jaw made to that size, and it
        # is offered alongside rather than instead of the list.
        sel = select_clips(_case(neck=3.0, ar=1.2))
        assert sel.manufacture is not None
        assert sel.manufacture.blade_length_mm < 7.0


# ── 5. The measured improvement, kept ─────────────────────────────────────── #

class TestTheRankingActuallySeparates:
    CASES = [_case(6.0), _case(12.0), _case(18.0), _case(6.0, ar=3.2),
             _case(6.0, region="ACM bifurcacion"), _case(5.0, region="pericallosa")]

    def test_the_list_spreads_instead_of_flatlining(self):
        # Before: the top five sat within 0–7 points. A ranking where everything
        # scores the same is not a ranking.
        spreads = []
        for case in self.CASES:
            rec = select_clips(case).recommended
            if len(rec) >= 5:
                spreads.append(rec[0].score - rec[4].score)
        assert spreads, "no hay listas suficientemente largas para medir"
        assert max(spreads) >= 8.0, f"la lista sigue plana: {spreads}"

    def test_different_cases_get_different_lists(self):
        # Before: a deep dome and a plain neck returned the same five clips.
        a = [c.clip.clip_id for c in select_clips(_case(6.0)).recommended[:5]]
        b = [c.clip.clip_id for c in select_clips(_case(18.0)).recommended[:5]]
        assert len(set(a) & set(b)) <= 1, "cuellos muy distintos dan casi la misma lista"


# ── 6. A jaw made to size, in every series that can take one ──────────────── #

class TestTheCustomJawWorksForEverySeriesThatStretches:
    """«Does the custom jaw work for the three families?» — measured, not assumed.

    The geometry always did. The two paths that EXPOSE it did not: the
    suggestion derived only a BEND from the winning candidate and never a shape,
    so a fenestrated case was offered a straight jaw of the right length — the
    wrong piece at the right size — and the endpoint that builds the preview had
    no shape or window parameter at all.
    """

    @pytest.mark.parametrize("shape,angle,window", [
        ("straight", 0.0, 0.0), ("angled", 45.0, 0.0),
        ("angled", 90.0, 0.0), ("fenestrated", 0.0, 5.0),
    ])
    @pytest.mark.parametrize("jaw", [8.5, 11.5, 20.5])
    def test_the_piece_comes_out_the_length_that_was_asked_for(self, shape, angle, window, jaw):
        mesh, _src, exact = navarro.build_jaw(angle, jaw, shape=shape, window_mm=window)
        assert not exact, "esta talla no está dibujada; se está estirando"
        pts = mesh.GetPoints()
        tip = max(-pts.GetPoint(i)[0] for i in range(pts.GetNumberOfPoints()))
        assert tip * 2 == pytest.approx(jaw, abs=0.05)

    def test_the_curved_series_is_the_only_one_that_refuses(self):
        curved = [v for v in navarro.list_variants() if v.shape == navarro.CURVED]
        rest = [v for v in navarro.list_variants() if v.shape != navarro.CURVED]
        assert curved and rest
        assert all(not v.can_resize for v in curved)
        assert all(v.can_resize for v in rest)

    def test_a_fenestrated_case_is_offered_a_fenestrated_custom_jaw(self):
        # The one that used to come back straight.
        case = _case(neck=4.0, region="ACM bifurcacion")
        cj = select_clips(case).custom_jaw
        assert cj is not None, "una mordaza exacta sigue siendo una opción real"
        assert cj.shape == "fenestrated"
        assert cj.window_mm > 0, "un fenestrado a medida sin ventana no es un fenestrado"

    def test_the_offer_is_named_after_the_piece_it_is(self):
        # El rótulo se deducía solo del ángulo, así que una mordaza fenestrada a
        # medida salía como «NAVARRO™ T4 Recto»: el propio objeto decía
        # `shape=fenestrated` dos campos más arriba y el rótulo lo contradecía.
        cj = select_clips(_case(neck=4.0, region="ACM bifurcacion")).custom_jaw
        assert cj is not None and cj.shape == "fenestrated"
        assert "Fenestrado" in cj.label, cj.label
        assert "Recto" not in cj.label
        assert f"{cj.window_mm:.0f} mm" in cj.label, "la ventana es parte del nombre"

    def test_every_series_names_itself_the_same_way_everywhere(self):
        # Cinco copias de la misma regla se habían separado justo donde importa:
        # las que solo tenían el ángulo llamaban «Recto» a un curvo y a un
        # fenestrado, porque un acodado de cero es lo único que comparten.
        from services.navarro import shape_label
        assert shape_label("curved") == "Curvo"
        assert shape_label("straight") == "Recto"
        assert shape_label("angled", 60.0) == "Angulado 60°"
        assert shape_label("fenestrated", 0.0, 5.0) == "Fenestrado ventana 5 mm"
        # Un curvo no tiene acodado, y un fenestrado tampoco: el ángulo no puede
        # arrastrarlos a «Recto».
        assert shape_label("curved", 0.0) != "Recto"
        assert shape_label("fenestrated", 0.0, 3.0) != "Recto"

    def test_a_shape_the_family_cannot_draw_falls_to_the_nearest_one_and_says_so(self):
        # La carótida paraclinoidea es de las localizaciones más frecuentes, y su
        # tabla puntúa la BAYONETA la primera. La familia no la dibuja, y el
        # mapeo caía por defecto a RECTA: la peor de las cuatro, porque la
        # bayoneta existe justo para apartar el mango de la línea de visión en un
        # campo profundo, que es lo que una recta no hace.
        from services.clip_selection import _preferred_shape
        from services.clips import ClipShape

        # Sin arteria madre declarada: con ella, el caso pide fenestrado antes de
        # llegar a la tabla de la región, y la premisa de esta prueba se cae.
        case = ClipCase(neck_mm=4.0, ar=1.3, dome_height_mm=5.2, max_diameter_mm=7.2,
                        region="carotida paraclinoidea", parent_artery_mm=0.0,
                        neck_source="rim")
        assert _preferred_shape(case) == ClipShape.BAYONET, "la premisa: el caso pide bayoneta"

        cj = suggest_custom_jaw(case, None)
        assert cj is not None
        assert cj.shape == "angled", f"cayó en {cj.shape}"
        assert cj.angle_deg > 0
        assert "bayoneta" in cj.reason.lower(), "sustituir en silencio es el fallo, no el arreglo"

    def test_the_family_still_refuses_to_pretend_it_makes_a_bayonet(self):
        # Una cosa es ofrecer la más parecida diciéndolo, y otra fabricar. La
        # especificación de fabricación sigue negándose, que es lo correcto.
        from services.clip_manufacture import resolve_perfect_clip
        from services.clip_selection import derive_manufacture_spec

        case = ClipCase(neck_mm=5.0, ar=2.4, dome_height_mm=12.0, max_diameter_mm=9.0,
                        region="carotida paraclinoidea", parent_artery_mm=0.0,
                        neck_source="rim")
        pc = resolve_perfect_clip(case, derive_manufacture_spec(case, []))
        assert any("bayoneta" in n.lower() for n in pc.notes), pc.notes

    def test_the_offer_does_not_vanish_when_a_curved_clip_wins(self):
        # Curved clips win ties often now, and their jaw cannot be stretched —
        # which silently removed the custom-size offer from almost every case.
        # «Can I have this exact length» is answered by the series that stretch.
        case = _case(neck=4.0)
        sel = select_clips(case)
        assert sel.recommended
        assert sel.custom_jaw is not None
        assert sel.custom_jaw.shape != "curved"
        assert sel.custom_jaw.resizable


# ── 7. The opening is a second dimension, and it warns ────────────────────── #

class TestTheOpeningIsJudgedAgainstTheNeck:
    """The jaw LENGTH spans the neck; the OPENING goes around it.

    The applier caps the opening at 10 mm whatever the blade, so a 22 mm jaw
    parts no further than a 10 mm one. The selector ranked on `coverage`, `reach`
    and `force` — none of which looks at this axis — so a 15 mm neck was handed a
    19 mm jaw, correct on every criterion it had, whose tips never part beyond
    10 mm. Nothing said so.
    """

    def _opening(self, neck: float):
        sel = select_clips(_case(neck=neck))
        top = sel.recommended[0]
        return next(k for k in top.criteria if k.key == "opening"), top

    def test_a_neck_wider_than_the_opening_is_flagged(self):
        crit, _top = self._opening(15.0)
        assert crit.verdict == "warn", crit.detail
        assert "10.0 mm" in crit.detail and "15.0 mm" in crit.detail

    def test_a_neck_the_clip_clears_is_not_flagged(self):
        crit, _top = self._opening(6.0)
        assert crit.verdict == "ok", crit.detail

    def test_it_warns_and_does_not_vote(self):
        # Cuánta holgura sobre el cuello basta es un juicio clínico que nadie ha
        # firmado aquí; ponderar un umbral sin validar reordenaría la lista sobre
        # una opinión. Se dice, y no se puntúa.
        crit, top = self._opening(15.0)
        assert crit.weight == 0.0
        assert top.score > 0.0, "un aviso no es un suspenso"

    def test_the_warning_does_not_move_the_ranking(self):
        # Mismo caso con y sin el criterio: el orden tiene que ser idéntico.
        from services.clip_selection import evaluate_clip
        from services.clip_library import catalogue_with_library

        case = _case(neck=15.0)
        for spec in catalogue_with_library()[:12]:
            cand = evaluate_clip(spec, case)
            crits = [k for k in cand.criteria if k.key != "opening"]
            voting = [k for k in crits if k.weight > 0]
            total = sum(k.weight for k in voting) or 1.0
            without = 100.0 * sum(k.score * k.weight for k in voting) / total
            expected = 0.0 if any(k.verdict == "fail" for k in cand.criteria) else round(without, 1)
            assert cand.score == pytest.approx(expected, abs=0.05), spec.name

    def test_it_says_whether_the_figure_is_specified_or_inferred(self):
        # Por encima del techo la apertura es un dato del diseñador; por debajo
        # sigue siendo una inferencia de clips comerciales, y no es lo mismo.
        wide, _ = self._opening(15.0)
        narrow, _ = self._opening(5.0)
        assert "aplicador limita" in wide.detail
        assert "estimada" in narrow.detail
