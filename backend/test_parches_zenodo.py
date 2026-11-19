"""scripts/parches_zenodo.py: recorte, etiquetas, pliegues y unión sobre datos sintéticos."""
import csv
import json

import numpy as np

from scripts.parches_zenodo import (
    AIRE_HU,
    CAMPOS,
    NOMBRE,
    TAMANO,
    filas_estudio,
    guardar_estudio,
    parches_de,
    pliegues,
    recortar,
    unir,
)


def _volumen():
    """Volumen (z, y, x) con espaciado anisótropo y una bola de 400 HU en un punto conocido."""
    sp = (0.6, 0.4, 0.4)
    shape = (60, 80, 80)
    zz, yy, xx = np.meshgrid(*(np.arange(n) * s for n, s in zip(shape, sp)), indexing="ij")
    centro = (16.0, 14.0, 18.0)  # x, y, z en mm (marco de la malla)
    d = np.sqrt((xx - centro[0]) ** 2 + (yy - centro[1]) ** 2 + (zz - centro[2]) ** 2)
    vol = np.where(d <= 3.0, 400.0, 0.0).astype(np.float32)
    return vol, sp, centro


def test_el_punto_queda_en_el_centro_del_cubo():
    vol, sp, c = _volumen()
    p, fuera = recortar(vol, sp, c, 0.5)
    assert p.shape == (TAMANO,) * 3 and p.dtype == np.int16
    assert fuera == 0.0
    # La bola (radio 3 mm = 6 vóxeles de 0,5) es simétrica respecto al centro del cubo.
    m = p > 200
    idx = np.argwhere(m).mean(axis=0)
    assert np.allclose(idx, (TAMANO - 1) / 2, atol=0.3)
    assert abs(m.sum() * 0.5 ** 3 - 4 / 3 * np.pi * 27) / (4 / 3 * np.pi * 27) < 0.15


def test_ejes_z_y_x_respetan_el_marco():
    vol, sp, c = _volumen()
    # Desplazar el punto 2 mm en x mueve la bola 4 vóxeles (de 0,5) en el último eje.
    p, _ = recortar(vol, sp, (c[0] + 2.0, c[1], c[2]), 0.5)
    idx = np.argwhere(p > 200).mean(axis=0)
    assert np.allclose(idx, ((TAMANO - 1) / 2, (TAMANO - 1) / 2, (TAMANO - 1) / 2 - 4), atol=0.3)


def test_fuera_del_volumen_es_aire():
    vol, sp, _ = _volumen()
    p, fuera = recortar(vol, sp, (0.0, 0.0, 0.0), 1.0)
    assert 0.8 < fuera < 0.95          # solo el octante positivo cae dentro
    assert p[0, 0, 0] == int(AIRE_HU)
    lejos, f2 = recortar(vol, sp, (500.0, 500.0, 500.0), 1.0)
    assert f2 == 1.0 and (lejos == int(AIRE_HU)).all()


def _registro():
    return {"meta": {"has_ia": True, "slice_thickness_mm": 0.6},
            "segment": {"spacing_mm": [0.6, 0.4, 0.4]},
            "lesions": [{"file": "an_x.stl", "position": [16.0, 14.0, 18.0], "diameter_mm": 3.0,
                         "size_class": "miliary"}],
            "long_list": [
                {"rank": 1, "position": [16.5, 14.0, 18.0], "diameter_mm": 4.0, "confidence": 1.0,
                 "channels": ["curvatura"], "ranks": {"curvatura": 1}, "region": {"radius_mm": 2.0}},
                # A 7 mm: el banco lo da por bueno (Ø 9), los artículos no (radio 1,5 + 2).
                {"rank": 2, "position": [23.0, 14.0, 18.0], "diameter_mm": 9.0, "confidence": 0.5,
                 "channels": ["calibre", "curvatura"]},
                {"rank": 3, "position": [5.0, 5.0, 5.0], "diameter_mm": 3.0, "confidence": 0.2},
            ]}


def test_etiquetas_con_las_dos_reglas():
    filas = filas_estudio("001", _registro())
    cand = [f for f in filas if f["tipo"] == "candidato"]
    assert [f["es_aneurisma_banco"] for f in cand] == [1, 1, 0]
    assert [f["es_aneurisma_articulos"] for f in cand] == [1, 0, 0]
    assert cand[1]["dist_lesion_mm"] == 7.0 and cand[1]["canales"] == "calibre+curvatura"
    les = [f for f in filas if f["tipo"] == "lesion"]
    assert len(les) == 1 and les[0]["lesion"] == "an_x.stl" and les[0]["rank"] == ""


def test_control_sin_lesiones():
    rec = {**_registro(), "lesions": [], "meta": {"has_ia": False}}
    filas = filas_estudio("002", rec)
    assert len(filas) == 3
    assert all(f["es_aneurisma_banco"] == 0 and f["dist_lesion_mm"] == "" for f in filas)


def test_pliegues_por_paciente_y_estratificados():
    estudios = {f"{i:03d}": i < 40 for i in range(100)}
    p = pliegues(estudios)
    assert p == pliegues(estudios)                       # reproducible
    for k in range(5):
        enfermos = sum(1 for s, v in estudios.items() if v and p[s] == k)
        controles = sum(1 for s, v in estudios.items() if not v and p[s] == k)
        assert enfermos == 8 and controles == 12


def test_unir_alinea_filas_y_parches(tmp_path):
    vol, sp, _ = _volumen()
    carpeta = tmp_path / "estudios"
    carpeta.mkdir()
    estudios = {}
    for sid, ia in (("001", True), ("002", False)):
        rec = _registro() if ia else {**_registro(), "lesions": [], "meta": {"has_ia": False}}
        estudios[sid] = rec
        filas = filas_estudio(sid, rec)
        guardar_estudio(carpeta / f"{sid}.npz", filas, parches_de(vol, sp, filas))
    resumen = unir(carpeta, tmp_path, estudios, log=lambda *_: None)
    z = np.load(tmp_path / f"{NOMBRE}.npz")
    with open(tmp_path / f"{NOMBRE}.csv", encoding="utf-8") as fh:
        filas = list(csv.DictReader(fh))
    assert list(filas[0]) == CAMPOS
    assert z["p050"].shape == z["p100"].shape == (len(filas), TAMANO, TAMANO, TAMANO)
    assert resumen["parches"] == 7 and resumen["lesiones"] == 1 and resumen["candidatos_aneurisma_articulos"] == 1
    # La fila de la lesión lleva en el centro la bola de 400 HU.
    i = next(i for i, f in enumerate(filas) if f["tipo"] == "lesion")
    assert z["p050"][i][11:13, 11:13, 11:13].min() > 300
    leeme = json.loads((tmp_path / "LEEME.json").read_text(encoding="utf-8"))
    assert leeme["resumen"]["estudios"] == 2 and "p050" in leeme["arrays"]
