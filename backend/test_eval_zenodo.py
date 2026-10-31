"""Evaluación completa del dataset Zenodo 15697196 (`scripts/eval_zenodo.py`).

El dataset entero (172 estudios, 122 STL, `Metadata.csv`) no cabe en la app
por disco: cada estudio ingerido deja 1,8 GB. El evaluador recorre el MISMO
camino que el servidor (carga, umbrales, máscara tubular a la resolución que
el servidor elegiría, superficie, detección) pero fuera de él, guarda solo la
malla y mide, por lesión, puesto y motivo; y por control, los falsos
positivos y en qué tejido caen (HU alrededor del candidato).
"""
from __future__ import annotations

import numpy as np
import pytest

from scripts import eval_zenodo as ev

_CSV = (
    "ID;IA(0/1_?);Sex;Age, years;Artery;Saccular (0/1);Position;Type;Size;Neck, mm;"
    "Length, mm;Width, mm;Vobject, mm3;Rupture (0/1);Bleb (0/1);Thrombus (0/1);Vessel (0/1);"
    "Calcification (0/1);Images count;Slice Thickness, mm;Head+Neck (0/1);;\n"
    "001;0;F;87;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;643;0,5;1;;\n"
    "002;1_1;F;86;RMCA;1;lateral;NA;middle;NA;7,7;9,1;540,12;0;0;0;0;0;621;0,9;1;;\n"
    "008;1_2;F;66;LMCA;0;bifurcation;NA;large;NA;15,8;16,6;2200;0;0;0;0;0;311;1;1;;\n"
    "008;2_2;NA;NA;RPCA;0;lateral;blister-like;middle;NA;8,7;6,2;248,86;0;0;0;1;0;n/a;NA;NA;;\n"
)


@pytest.fixture
def meta(tmp_path):
    p = tmp_path / "Metadata.csv"
    p.write_bytes(_CSV.encode("cp1252"))
    return ev.parse_metadata(p)


# ── Metadata.csv ───────────────────────────────────────────────────────────── #

class TestMetadata:
    def test_un_estudio_por_fila_y_las_lesiones_colgadas_de_su_estudio(self, meta):
        assert sorted(meta) == ["001", "002", "008"]
        assert meta["001"].has_ia is False and meta["001"].lesions == []
        assert meta["001"].slice_thickness_mm == 0.5 and meta["001"].images_count == 643
        assert meta["002"].has_ia is True and len(meta["002"].lesions) == 1
        assert [l.index for l in meta["008"].lesions] == [1, 2]

    def test_la_coma_decimal_y_los_na_se_leen(self, meta):
        l = meta["002"].lesions[0]
        assert l.length_mm == 7.7 and l.width_mm == 9.1 and l.volume_mm3 == 540.12
        assert l.neck_mm is None and l.type is None and l.saccular is True
        assert l.size_class == "middle" and l.artery == "RMCA"
        b = meta["008"].lesions[1]
        assert b.type == "blister-like" and b.vessel is True and b.saccular is False
        # La fila secundaria no repite los datos del estudio: se heredan de la primera.
        assert meta["008"].sex == "F" and meta["008"].age == 66

    def test_el_stl_se_empareja_con_su_fila(self, meta):
        assert ev.stl_index("an_002.stl") == 1
        assert ev.stl_index("an_008_2.stl") == 2
        assert ev.lesion_for_stl(meta["008"], "an_008_2.stl").artery == "RPCA"
        assert ev.lesion_for_stl(meta["002"], "an_002.stl").artery == "RMCA"
        assert ev.lesion_for_stl(meta["002"], "an_002_7.stl") is None


# ── Medidas sobre volumen y malla ──────────────────────────────────────────── #

class TestMedidas:
    def test_hu_alrededor_del_punto_es_la_media_de_la_bola(self):
        vol = np.zeros((20, 20, 20), dtype=np.float32)     # (z, y, x)
        vol[10, 10, 10] = 1000.0
        sp = (1.0, 1.0, 1.0)
        # Malla: (x, y, z) = índice × espaciado.
        assert ev.hu_around(vol, sp, (10.0, 10.0, 10.0), 0.4) == 1000.0
        assert 0.0 < ev.hu_around(vol, sp, (10.0, 10.0, 10.0), 1.0) < 1000.0
        assert ev.hu_around(vol, sp, (500.0, 10.0, 10.0), 1.0) is None
        assert ev.hu_stats(vol, sp, (10.0, 10.0, 10.0), 1.0)[1] == 1000.0
        assert ev.tissue_label(900.0, 1500.0) == "bone"
        assert ev.tissue_label(250.0, 400.0) == "vessel"
        assert ev.tissue_label(-200.0, 120.0) == "other"

    def test_la_fraccion_de_superficie_recuperada(self):
        import vtk
        s = vtk.vtkSphereSource(); s.SetRadius(5.0); s.SetThetaResolution(40); s.SetPhiResolution(40); s.Update()
        mesh = s.GetOutput()
        on_sphere = np.array([[5.0, 0, 0], [0, 5.0, 0], [0, 0, 5.0], [-5.0, 0, 0]])
        assert ev.surface_recall(on_sphere, mesh, tol_mm=0.5) == 1.0
        far = np.array([[30.0, 0, 0], [0, 30.0, 0]])
        assert ev.surface_recall(np.vstack([on_sphere, far]), mesh, tol_mm=0.5) == pytest.approx(4 / 6)
        assert ev.surface_recall(np.zeros((0, 3)), mesh, tol_mm=0.5) is None

    def test_la_regla_de_reduccion_es_la_del_servidor(self):
        # 1171 cortes de 0,5 mm: el servidor divide por 5 cada eje, no por 2.
        assert ev.server_downsample_factor((1171, 512, 512)) == 5
        assert ev.server_downsample_factor((400, 512, 512)) == 2
        # Por debajo del tope de vóxeles (y del presupuesto de memoria) no se reduce.
        assert ev.server_downsample_factor((200, 256, 256)) == 1


# ── Resumen ────────────────────────────────────────────────────────────────── #

def _lesion(rank, size="middle", kind="saccular", reason=None, recall=1.0, **kw):
    row = {"rank": rank, "size_class": size, "kind": kind, "reason": reason,
           "surface_recall": recall, "channel_ranks": {"curvatura": rank} if rank else {}}
    row.update(kw)
    return row


class TestResumen:
    def test_cuenta_por_puesto_tamano_tipo_y_motivo(self):
        recs = {
            "002": {"status": "ok", "has_ia": True, "n_candidates": 5, "lesions": [_lesion(3)],
                    "candidates": [{"hu": 900.0}] * 5},
            "008": {"status": "ok", "has_ia": True, "n_candidates": 5,
                    "lesions": [_lesion(None, "large", reason="pgf"),
                                _lesion(12, "middle", "blister-like", recall=0.2)],
                    "candidates": [{"hu": 300.0}] * 5},
            "001": {"status": "ok", "has_ia": False, "n_candidates": 5,
                    "candidates": [{"hu": 1200.0}] * 4 + [{"hu": 250.0}]},
            "003": {"status": "error", "error": "boom"},
        }
        s = ev.summarize(recs)
        assert s["studies"] == 4 and s["errors"] == 1
        assert s["lesions"] == 3 and s["in_list"] == 2 and s["top5"] == 1 and s["top10"] == 1
        assert s["by_size"]["middle"] == {"n": 2, "top5": 1, "in_list": 2}
        assert s["by_size"]["large"] == {"n": 1, "top5": 0, "in_list": 0}
        assert s["by_kind"]["blister-like"] == {"n": 1, "top5": 0, "in_list": 1}
        assert s["reasons"] == {"pgf": 1}
        assert s["controls"] == 1 and s["controls_with_candidates"] == 1
        assert s["fp_per_control"] == 5.0
        # Candidatos en hueso: HU ≥ 700 alrededor del punto.
        assert s["candidates_total"] == 15 and s["candidates_bone"] == 9
        assert s["candidates_tissue"] == {"bone": 9, "vessel": 6}
        assert s["studies_with_lesion_in_top5"] == 1
