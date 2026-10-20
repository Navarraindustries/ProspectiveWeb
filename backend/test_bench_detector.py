"""Banco de medida del detector sobre las lesiones anotadas (`scripts/bench_detector.py`).

Con 46 lesiones con verdad (dataset Zenodo 15697196) un cambio en el detector
deja de ser una opinión: el banco pasa el detector por cada malla guardada y
dice, por lesión, en qué puesto queda en la lista y en cada canal, y si no
queda, qué puerta rechazó la región de curvatura más cercana. Para eso el
detector gana una traza opcional por región (`trace_regions`), que no cambia
nada de lo que devuelve.
"""
from __future__ import annotations

import numpy as np
import pytest

from scripts import bench_detector as bd
from services.aneurysm_consensus import CH_CURVATURE, ConsensusHit
from services.aneurysm_detector import AneurysmDetector, RegionTrace
from test_consensus_and_plane import SACO, _bola, _tubo, _une

_DET = {"gauss_percentile": 60.0, "mean_curv_gate_percentile": 40.0,
        "min_radius_mm": 0.8, "max_radius_mm": 20.0, "min_points": 4,
        "min_positive_gauss_frac": 0.40, "min_sphericity": 0.25, "pre_smooth_iterations": 10}


@pytest.fixture(scope="module")
def vaso_con_saco():
    return _une(_tubo(radio=1.0, largo=60.0), _bola((0.0, 5.0, 2.2), 3.0))


# ── La traza del detector ──────────────────────────────────────────────────── #

class TestTrazaDelDetector:
    def test_sin_pedirla_no_hay_traza_y_el_resultado_es_el_mismo(self, vaso_con_saco):
        a = AneurysmDetector(**_DET).detect(vaso_con_saco)
        det = AneurysmDetector(**_DET); det.trace_regions = True
        b = det.detect(vaso_con_saco)
        assert a.regions == []
        assert [c.centroid for c in a.candidates] == [c.centroid for c in b.candidates]
        assert [c.score for c in a.candidates] == [c.score for c in b.candidates]

    def test_la_traza_cubre_todas_las_regiones_y_cuadra_con_los_contadores(self, vaso_con_saco):
        det = AneurysmDetector(**_DET); det.trace_regions = True
        r = det.detect(vaso_con_saco)
        assert len(r.regions) == r.n_regions_total
        puertas = {}
        for t in r.regions:
            puertas[t.gate] = puertas.get(t.gate, 0) + 1
        assert puertas.get("points", 0) == r.n_failed_points
        assert puertas.get("size", 0) == r.n_failed_size
        assert puertas.get("mean_curv", 0) == r.n_failed_mean_curv
        assert puertas.get("pgf", 0) == r.n_failed_pgf
        assert puertas.get("compactness", 0) == r.n_failed_compact
        assert puertas.get("sphericity", 0) == r.n_failed_sphericity
        assert puertas.get("merged", 0) == r.n_merged
        assert puertas.get("ok", 0) == len(r.candidates)

    def test_las_regiones_que_pasan_llevan_su_puesto_y_las_demas_su_puerta(self, vaso_con_saco):
        det = AneurysmDetector(**_DET); det.trace_regions = True
        r = det.detect(vaso_con_saco)
        puertas = {"ok", "points", "size", "mean_curv", "pgf", "compactness", "sphericity",
                   "merged", "cap"}
        assert r.regions and all(t.gate in puertas for t in r.regions)
        for t in r.regions:
            if t.gate == "ok":
                assert t.rank is not None and r.candidates[t.rank - 1].centroid == t.centroid
                assert t.score == r.candidates[t.rank - 1].score
            else:
                assert t.rank is None
        # Las métricas están rellenas también en las rechazadas, para poder
        # reajustar las puertas sobre ellas. En este vaso sintético la región
        # del saco la tira la curvatura media (el saco lo encuentra el calibre).
        cerca = min(r.regions, key=lambda t: np.linalg.norm(np.asarray(t.centroid) - SACO))
        assert np.linalg.norm(np.asarray(cerca.centroid) - SACO) < 4.0
        assert cerca.gate == "mean_curv" and cerca.rank is None
        assert cerca.radius_mm > 0 and 0.0 <= cerca.positive_gauss_frac <= 1.0
        assert 0.0 <= cerca.sphericity <= 1.0 and cerca.n_points >= 4

    def test_una_region_rechazada_por_tamano_lo_dice(self):
        det = AneurysmDetector(**{**_DET, "max_radius_mm": 1.0})   # el saco de 3 mm es «grande»
        det.trace_regions = True
        r = det.detect(_une(_tubo(radio=1.0, largo=60.0), _bola((0.0, 5.0, 2.2), 3.0)))
        cerca = min(r.regions, key=lambda t: np.linalg.norm(np.asarray(t.centroid) - SACO))
        assert cerca.gate == "size" and cerca.rank is None
        assert cerca.radius_mm > 1.0


# ── Reglas puras del banco ─────────────────────────────────────────────────── #

def _hit(pos, ranks, radius=3.0):
    return ConsensusHit(position=tuple(float(v) for v in pos), ranks=ranks, radius_mm=radius)


class TestReglasDelBanco:
    def test_el_puesto_es_el_del_primer_candidato_que_cae_en_su_radio(self):
        hits = [_hit((100, 0, 0), {CH_CURVATURE: 1}), _hit((3, 0, 0), {CH_CURVATURE: 2}, radius=1.0)]
        rank, hit = bd.match_rank((0.0, 0.0, 0.0), hits)
        assert rank == 2 and hit is hits[1]          # 3 mm ≤ max(5, 2·1)
        assert bd.match_rank((0.0, 0.0, 0.0), [_hit((6, 0, 0), {CH_CURVATURE: 1}, 1.0)]) == (None, None)

    def test_la_region_mas_cercana_dentro_del_diametro_explica_el_fallo(self):
        regs = [RegionTrace(centroid=(0, 0, 0), n_points=10, gate="pgf"),
                RegionTrace(centroid=(30, 0, 0), n_points=10, gate="ok", rank=1)]
        assert bd.nearest_region((2.0, 0.0, 0.0), regs).gate == "pgf"
        assert bd.failure_reason((2.0, 0.0, 0.0), 8.0, regs) == "pgf"
        # Más lejos que el diámetro de la lesión: la curvatura ni vio la zona.
        assert bd.failure_reason((2.0, 0.0, 0.0), 8.0, [regs[1]]) == "sin_region"
        assert bd.failure_reason((2.0, 0.0, 0.0), 8.0, []) == "sin_region"

    def test_el_resumen_cuenta_puestos_canales_y_motivos(self):
        rows = [
            {"rank": 1, "channel_ranks": {"curvatura": 1, "calibre": 3}, "reason": None},
            {"rank": 7, "channel_ranks": {"curvatura": 7}, "reason": None},
            {"rank": None, "channel_ranks": {}, "reason": "pgf"},
            {"rank": None, "channel_ranks": {}, "reason": "sin_region"},
            {"rank": None, "channel_ranks": {}, "reason": "pgf"},
        ]
        s = bd.summarize(rows)
        assert s["lesions"] == 5 and s["in_list"] == 2 and s["top5"] == 1 and s["top10"] == 2
        assert s["by_channel"] == {"curvatura": 2, "calibre": 1}
        assert s["reasons"] == {"pgf": 2, "sin_region": 1}


# ── Cargar los casos del informe de la ingesta ─────────────────────────────── #

class TestCargaDeCasos:
    def test_toma_la_malla_guardada_y_las_lesiones_en_coordenadas_de_malla(self, tmp_path):
        (tmp_path / "session_saves" / "s1" / "meshes").mkdir(parents=True)
        (tmp_path / "session_saves" / "s1" / "meshes" / "vessel_tree.vtp").write_bytes(b"")
        (tmp_path / "sessions" / "s2" / "meshes").mkdir(parents=True)
        (tmp_path / "sessions" / "s2" / "meshes" / "vessel_tree.vtp").write_bytes(b"")
        report = {
            "002": {"status": "ok", "session_id": "s1", "modality": "CT", "n_annotations": 2,
                    "annotations": [{"file": "an_002_1.stl", "diameter_mm": 10.0},
                                    {"file": "an_002_2.stl", "diameter_mm": 4.0}],
                    "lesions_mesh_mm": [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]},
            "003": {"status": "ok", "session_id": "s2", "modality": "CT", "n_annotations": 0,
                    "annotations": [], "lesions_mesh_mm": []},
            "004": {"status": "error", "error": "x"},
            "005": {"status": "ok", "session_id": "nada", "modality": "CT", "n_annotations": 1,
                    "annotations": [{"file": "an_005.stl", "diameter_mm": 5.0}],
                    "lesions_mesh_mm": [[0, 0, 0]]},
        }
        cases = bd.load_cases(report, tmp_path)
        assert [c.study for c in cases] == ["002"]       # sin lesión o sin malla: fuera
        c = cases[0]
        assert c.mesh_path == tmp_path / "session_saves" / "s1" / "meshes" / "vessel_tree.vtp"
        assert [l.diameter_mm for l in c.lesions] == [10.0, 4.0]
        assert c.lesions[1].position == (4.0, 5.0, 6.0) and c.lesions[1].file == "an_002_2.stl"
        assert bd.load_cases(report, tmp_path, studies=["003"]) == []


# ── Una malla entera por el banco ──────────────────────────────────────────── #

class TestBancoSobreUnaMalla:
    def test_encuentra_el_saco_y_explica_la_lesion_inventada(self, vaso_con_saco):
        lesiones = [bd.Lesion(position=tuple(SACO), diameter_mm=6.0, file="saco"),
                    bd.Lesion(position=(20.0, -25.0, 20.0), diameter_mm=4.0, file="falsa")]
        out = bd.bench_mesh(vaso_con_saco, lesiones, detector=AneurysmDetector(**_DET), top=10)
        assert out["mesh"]["vertices"] == vaso_con_saco.GetNumberOfPoints()
        saco, falsa = out["lesions"]
        assert saco["file"] == "saco" and saco["rank"] is not None and saco["rank"] <= 5
        assert saco["channel_ranks"] and saco["reason"] is None
        assert saco["region"] is not None and saco["region_dist_mm"] < 4.0
        assert falsa["rank"] is None and falsa["reason"]
        assert falsa["nearest_hit_mm"] > 5.0
        assert out["seconds"] >= 0

    def test_el_recorte_oraculo_reduce_la_malla_alrededor_de_la_lesion(self, vaso_con_saco):
        lesiones = [bd.Lesion(position=tuple(SACO), diameter_mm=6.0, file="saco")]
        out = bd.bench_mesh(vaso_con_saco, lesiones, detector=AneurysmDetector(**_DET), roi_mm=8.0)
        assert out["mesh"]["vertices"] < vaso_con_saco.GetNumberOfPoints()
        assert out["mesh"]["roi_mm"] == 8.0


# ── Guardar y leer ─────────────────────────────────────────────────────────── #

def test_los_ajustes_del_detector_se_pasan_como_clave_igual_valor():
    det = bd.build_detector("CT", ["min_positive_gauss_frac=0.3", "min_points=12"])
    assert det.min_positive_gauss_frac == 0.3 and det.min_points == 12
    with pytest.raises(ValueError):
        bd.build_detector("CT", ["no_existe=1"])
