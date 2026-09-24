# -*- coding: utf-8 -*-
"""Probar la banda CON y SIN techo, y no perder lo medido sobre la malla vieja.

Dos cosas que salieron de la misma sesión en el navegador.

1. La casilla «sin límite superior» decide si la lesión aparece o no, y no
   puede tener un valor por defecto: los dos casos anotados del proyecto piden
   lo contrario. Tampoco se puede decidir sola —se midió la regla evidente,
   «quitar el techo cuando corta el árbol», y no separa: se lleva puentes en
   los dos casos casi por igual—. Así que se prueban las dos y se enseñan
   juntas. Medido después sobre el examen real (sesión d0d22a4b, verdad
   terreno en 72,71 / 69,56 / 82,28): con techo la lesión NO sale; sin techo
   es el puesto 1, a 2,11 mm. La lista fundida la marca como «solo sin techo»,
   que es exactamente para lo que se hizo.

2. Resegmentar no invalidaba nada. El usuario quitó el techo, volvió a
   Detección y siguió viendo los cinco candidatos de la malla anterior, con
   sus .vtp de cinco minutos antes; la conclusión razonable —y equivocada—
   fue «no detecta el aneurisma».
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_techo_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from services import mpr as mprmod
from services.ceiling_compare import (SAME_SITE_MM, CandidatoComparado,
                                      comparar_techo)
from services.sessions import create_session, read_state, session_subdir, write_state

client = TestClient(app, raise_server_exceptions=True)


def _volumen_con_nucleo() -> np.ndarray:
    """Un vaso brillante con el centro MUY denso, que es lo que el techo quita."""
    v = np.zeros((36, 36, 36), dtype=np.float32)
    v[8:28, 16:22, 16:22] = 1200.0      # el vaso
    v[16:20, 17:21, 17:21] = 5000.0     # el núcleo de contraste
    return v


def _sesion_con_volumen(vol: np.ndarray) -> str:
    sid = create_session()
    npy, meta = mprmod._cache_paths(sid)
    np.save(npy, vol)
    meta.write_text(json.dumps({
        "shape": list(vol.shape), "spacing": [1, 1, 1],
        "wc": 600, "ww": 4000, "modality": "XA",
    }))
    mprmod._downsampled_volume.cache_clear()
    write_state(sid, "dicom.modality", "XA")
    return sid


# ── La fusión de las dos listas ───────────────────────────────────────────── #
#
# Se sustituyen las dos piezas caras —mallar y detectar— para poder afirmar
# algo exacto sobre el criterio de fusión sin pagar dos segmentaciones. Lo que
# se prueba aquí es el único código propio del módulo: qué se considera el
# mismo sitio, en qué orden se presenta y qué se le dice al usuario.

def _stub(monkeypatch, con, sin):
    """`con` y `sin` son listas de (posición, diámetro, canales)."""
    import vtk
    monkeypatch.setattr("services.ceiling_compare._malla",
                        lambda *a, **k: vtk.vtkPolyData())
    llamadas = {"n": 0}

    def _cand(poly, modality, top):
        llamadas["n"] += 1
        return con if llamadas["n"] == 1 else sin

    monkeypatch.setattr("services.ceiling_compare._candidatos", _cand)
    return llamadas


class TestFusion:

    def test_un_sitio_cercano_en_ambas_listas_sale_una_sola_vez(self, monkeypatch):
        _stub(monkeypatch,
              con=[((10.0, 10.0, 10.0), 5.0, ["curv"])],
              sin=[((10.0, 10.0, 12.0), 5.2, ["radio"])])   # a 2 mm: el mismo
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, 900.0)

        assert len(r.candidatos) == 1
        c = r.candidatos[0]
        assert c.en_ambas and c.rank_con_techo == 1 and c.rank_sin_techo == 1
        # Los canales de las dos configuraciones, sin repetir.
        assert c.channels == ["curv", "radio"]

    def test_dos_sitios_lejanos_no_se_confunden(self, monkeypatch):
        lejos = SAME_SITE_MM + 1.0
        _stub(monkeypatch,
              con=[((0.0, 0.0, 0.0), 5.0, [])],
              sin=[((0.0, 0.0, lejos), 5.0, [])])
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, 900.0)

        assert len(r.candidatos) == 2
        assert not any(c.en_ambas for c in r.candidatos)
        assert {c.rank_con_techo for c in r.candidatos} == {1, None}
        assert {c.rank_sin_techo for c in r.candidatos} == {1, None}

    def test_el_que_sale_en_las_dos_va_primero_aunque_puntue_peor(self, monkeypatch):
        """Un sitio que las dos configuraciones ven merece más atención que el
        primero de una sola, que es justo el que puede ser un artefacto."""
        _stub(monkeypatch,
              con=[((0.0, 0.0, 0.0), 9.0, []),        # solo con techo, puesto 1
                   ((50.0, 0.0, 0.0), 4.0, [])],      # en ambas, puesto 2
              sin=[((50.0, 0.0, 0.0), 4.1, [])])
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, 900.0)

        assert r.candidatos[0].en_ambas
        assert r.candidatos[0].position[0] == pytest.approx(50.0)
        assert r.candidatos[1].rank_con_techo == 1 and r.candidatos[1].rank_sin_techo is None

    def test_la_nota_cuenta_cuantos_se_perderia_eligiendo_mal(self, monkeypatch):
        _stub(monkeypatch,
              con=[((0.0, 0.0, 0.0), 5.0, [])],
              sin=[((40.0, 0.0, 0.0), 5.0, []), ((80.0, 0.0, 0.0), 5.0, [])])
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, 900.0)

        assert "2 sitio(s) solo aparecen SIN techo" in r.nota
        assert "1 solo CON" in r.nota

    def test_si_coinciden_lo_dice_en_vez_de_alarmar(self, monkeypatch):
        _stub(monkeypatch,
              con=[((0.0, 0.0, 0.0), 5.0, [])],
              sin=[((0.0, 1.0, 0.0), 5.0, [])])
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, 900.0)

        assert "mismos sitios" in r.nota
        assert r.n_con_techo == 1 and r.n_sin_techo == 1


class TestSinTechoNoHayNadaQueComparar:

    @pytest.mark.parametrize("upper", [0.0, 100.0, 50.0])
    def test_no_segmenta_siquiera(self, monkeypatch, upper):
        """Con la casilla ya marcada las dos ramas serían idénticas: gastar dos
        segmentaciones en eso son minutos tirados."""
        def _prohibido(*a, **k):
            raise AssertionError("no debe mallar si no hay techo que contrastar")

        monkeypatch.setattr("services.ceiling_compare._malla", _prohibido)
        r = comparar_techo(np.zeros((4, 4, 4)), (1, 1, 1), "XA", 100.0, upper)

        assert r.candidatos == []
        assert "sin límite superior" in r.nota


class TestSobreUnVolumenDeVerdad:
    """Sin stubs: las dos mallas se construyen y son distintas."""

    def test_las_dos_configuraciones_dan_mallas_distintas(self):
        r = comparar_techo(_volumen_con_nucleo(), (1.0, 1.0, 1.0), "XA",
                           600.0, 2000.0, smoothing=0, cleanup=0)

        assert r.vertices_con_techo > 0 and r.vertices_sin_techo > 0
        # El techo deja el núcleo fuera, así que la malla con techo lleva la
        # pared interior del hueco: más vértices que la maciza.
        assert r.vertices_con_techo != r.vertices_sin_techo
        assert r.nota


class TestElEndpoint:

    def test_sesion_inexistente(self):
        r = client.post("/api/segment/compare-ceiling/no-existe",
                        json={"lower": 600, "upper": 2000})
        assert r.status_code == 404

    def test_sin_volumen_pide_subir_el_dicom(self):
        sid = create_session()
        r = client.post(f"/api/segment/compare-ceiling/{sid}",
                        json={"lower": 600, "upper": 2000})
        assert r.status_code == 409
        assert "DICOM" in r.json()["detail"]

    def test_devuelve_las_dos_listas_y_no_toca_la_malla_de_la_sesion(self):
        sid = _sesion_con_volumen(_volumen_con_nucleo())
        meshes = session_subdir(sid, "meshes")
        (meshes / "vessel_tree.vtp").write_text("la malla de antes")
        write_state(sid, "detect.n_candidates", "5")

        r = client.post(f"/api/segment/compare-ceiling/{sid}",
                        json={"lower": 600, "upper": 2000,
                              "smoothing": 0, "cleanup": 0})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["vertices_con_techo"] > 0 and body["vertices_sin_techo"] > 0
        for c in body["candidates"]:
            assert c["rank_con_techo"] is not None or c["rank_sin_techo"] is not None

        # Comparar es MIRAR: elegir una configuración es otro paso, y es el que
        # resegmenta. Si esto pisara la malla, el usuario perdería su trabajo
        # por pulsar un botón que promete no cambiar nada.
        assert (meshes / "vessel_tree.vtp").read_text() == "la malla de antes"
        assert read_state(sid, "detect.n_candidates") == "5"


# ── Resegmentar invalida lo medido sobre la malla anterior ────────────────── #

class _DicomFalso:
    """Lo justo que `_run_segmentation_sync` le pide a una serie cargada."""

    def __init__(self, volume: np.ndarray):
        self.volume = volume
        self.spacing = (1.0, 1.0, 1.0)
        self.modality = "XA"
        self.window_center = 600.0
        self.window_width = 4000.0


class TestResegmentarLimpiaLaDeteccion:

    def test_los_candidatos_de_la_malla_vieja_no_sobreviven(self, monkeypatch):
        import routers.segment as segmod

        sid = create_session()
        meshes = session_subdir(sid, "meshes")
        (meshes / "aneurysm_cand_001.vtp").write_text("candidato viejo")
        (meshes / "aneurysm_cand_002.vtp").write_text("candidato viejo")
        write_state(sid, "detect.n_candidates", "2")
        write_state(sid, "detect.cand_001.diameter_mm", "6.4")
        write_state(sid, "detect.best_vtp_name", "aneurysm_cand_001.vtp")

        monkeypatch.setattr(segmod, "load_series",
                            lambda *a, **k: _DicomFalso(_volumen_con_nucleo()))
        segmod._run_segmentation_sync(
            session_id=sid, series_id="x", dicom_dir=meshes, meshes_dir=meshes,
            lower=600.0, upper=0.0, smooth_iters=0, min_mm3=0.0, top_n=0,
            closing_mm=0.0,
        )

        assert list(meshes.glob("aneurysm_cand_*.vtp")) == []
        assert read_state(sid, "detect.n_candidates") == "0"
        assert read_state(sid, "detect.cand_001.diameter_mm") == ""
        assert read_state(sid, "detect.best_vtp_name") == ""
        # Y la malla nueva sí está.
        assert (meshes / "vessel_tree.vtp").exists()
