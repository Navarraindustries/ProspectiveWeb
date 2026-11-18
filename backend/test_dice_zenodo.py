"""scripts/dice_zenodo.py: cifras de parecido de pared sobre máscaras sintéticas."""
import json

import numpy as np
import pytest

from scripts import dice_zenodo as dz

ESP = 0.2


def _bola(shape, centro, r_mm):
    z, y, x = np.indices(shape)
    c = np.asarray(centro)
    return ((z - c[0]) ** 2 + (y - c[1]) ** 2 + (x - c[2]) ** 2) * ESP ** 2 <= r_mm ** 2


def _saco_con_madre(shape=(80, 80, 80)):
    """Saco esférico de 3 mm de radio apoyado en un vaso recto de 1,5 mm de radio.

    El experto marca solo el saco por encima del plano z = 30; nuestra máscara
    es el saco entero más el vaso portador (z alrededor de 27), como la malla
    de la app, que es todo el árbol.
    """
    saco = _bola(shape, (40, 40, 40), 3.0)
    gt = saco.copy()
    gt[:30] = False                                   # el experto corta en el cuello
    z, y, x = np.indices(shape)
    vaso = ((z - 27) ** 2 + (y - 40) ** 2) * ESP ** 2 <= 1.5 ** 2
    return gt, saco | vaso


def test_mascaras_iguales_dan_dice_1_y_hd95_0():
    gt = _bola((60, 60, 60), (30, 30, 30), 3.0)
    r = dz.comparar(gt, gt.copy(), ESP)
    assert r["recubrimiento"] == 1.0
    assert r["dice_1mm"] == pytest.approx(1.0)
    assert r["hd95_mm"] == pytest.approx(0.0)
    assert r["hueco_interior"] == 0.0
    assert r["desvio_mm"] == pytest.approx(0.0)


def test_una_pared_por_fuera_da_desvio_positivo_y_por_dentro_negativo():
    gt = _bola((60, 60, 60), (30, 30, 30), 3.0)
    gorda = dz.comparar(gt, _bola((60, 60, 60), (30, 30, 30), 3.4), ESP)
    flaca = dz.comparar(gt, _bola((60, 60, 60), (30, 30, 30), 2.6), ESP)
    assert gorda["desvio_mm"] == pytest.approx(0.4, abs=0.1)
    assert flaca["desvio_mm"] == pytest.approx(-0.4, abs=0.1)
    assert gorda["recubrimiento"] == 1.0 and flaca["recubrimiento"] < 0.8
    # Una pared desplazada 0,4 mm no es un hueco.
    assert gorda["hueco_interior"] == 0.0 and flaca["hueco_interior"] == 0.0


def test_un_saco_hueco_se_cuenta_como_hueco_interior():
    gt = _bola((80, 80, 80), (40, 40, 40), 6.0)
    hueca = gt & ~_bola((80, 80, 80), (40, 40, 40), 3.0)      # corteza de 3 mm
    r = dz.comparar(gt, hueca, ESP)
    assert r["hueco_interior"] == pytest.approx((3 / 6) ** 3, abs=0.03)
    assert r["recubrimiento"] == pytest.approx(1 - (3 / 6) ** 3, abs=0.03)


def test_el_plano_de_la_boca_quita_la_arteria_madre_y_no_el_saco():
    gt, nuestra = _saco_con_madre()
    madre = dz.lado_de_la_madre(gt, nuestra, ESP)
    assert madre.any()
    assert not (madre & gt).any()                         # nunca quita saco del experto
    # Todo lo que queda por debajo del cuello es madre; por encima, nada.
    assert (nuestra & ~gt)[:29][~madre[:29]].sum() == 0
    assert not madre[31:].any()
    r = dz.comparar(gt, nuestra, ESP)
    assert r["plano_boca"] is True
    assert r["dice_sin_madre_1mm"] > r["dice_1mm"]
    assert r["dice_sin_madre_1mm"] > 0.97


def test_sin_boca_plana_no_hay_plano():
    gt = _bola((60, 60, 60), (30, 30, 30), 3.0)
    assert not dz.lado_de_la_madre(gt, gt.copy(), ESP).any()          # sin boca
    assert not dz.lado_de_la_madre(gt, np.zeros_like(gt), ESP).any()  # sin malla


def test_sin_nuestra_malla_no_hay_pared_y_el_dice_es_0():
    gt = _bola((40, 40, 40), (20, 20, 20), 2.0)
    r = dz.comparar(gt, np.zeros_like(gt), ESP)
    assert r["dice_1mm"] == 0.0 and r["recubrimiento"] == 0.0
    assert r["hd95_mm"] is None


def test_a_voxeles_rellena_una_esfera_cerrada():
    import vtk
    s = vtk.vtkSphereSource()
    s.SetRadius(3.0)
    s.SetThetaResolution(64)
    s.SetPhiResolution(64)
    s.Update()
    esp = 0.2
    origen = np.array([-4.0, -4.0, -4.0])
    dims = np.array([41, 41, 41])
    m = dz.a_voxeles(s.GetOutput(), origen, esp, dims)
    vol = m.sum() * esp ** 3
    assert vol == pytest.approx(4 / 3 * np.pi * 27, rel=0.05)
    r = dz.evaluar_lesion(s.GetOutput(), s.GetOutput())
    assert r["dice_1mm"] == pytest.approx(1.0) and r["recubrimiento"] == pytest.approx(1.0)


def test_resumen_por_tamano_y_huecos(tmp_path):
    for sid, les in (("001", [{"diameter_mm": 3.0, "recubrimiento": 0.9, "dice_1mm": 0.6,
                               "hueco_interior": 0.0, "plano_boca": True, "hd95_mm": 1.0}]),
                     ("002", [{"diameter_mm": 20.0, "recubrimiento": 0.7, "dice_1mm": 0.8,
                               "hueco_interior": 0.3, "plano_boca": False, "hd95_mm": None}])):
        (tmp_path / f"{sid}.json").write_text(json.dumps({"study": sid, "lesions": les}), encoding="utf-8")
    les = dz.cargar(tmp_path)
    res = dz.resumir(les)
    assert res["todas"]["n"] == 2 and res["todas"]["huecos"] == 1
    assert res["todas"]["sin_pared"] == 1 and res["todas"]["sin_plano"] == 1
    assert res["tam <5"]["dice_1mm"]["mediana"] == 0.6
    assert res["tam >=10"]["recubrimiento"]["mediana"] == 0.7
