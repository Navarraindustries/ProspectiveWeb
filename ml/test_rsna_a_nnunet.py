"""Pruebas de las piezas de geometría e intensidad de `rsna_a_nnunet.py`, con datos sintéticos."""
import numpy as np
import pytest

from rsna_a_nnunet import Excluida, elegir_hu, esfera, ordenar_cortes, recorte_cabeza

NORMAL = np.array([0.0, 0.0, 1.0])


def _posiciones(zs):
    return np.array([[0.0, 0.0, z] for z in zs])


def test_ordena_por_posicion_y_quita_repetidos():
    zs = [3.0, 1.0, 2.0, 2.0] + [float(z) for z in range(4, 30)]
    conservar, dz, repetidos = ordenar_cortes(_posiciones(zs), NORMAL)
    assert [zs[i] for i in conservar] == [float(z) for z in range(1, 30)]
    assert dz == pytest.approx(1.0)
    assert repetidos == 1


def test_excluye_si_falta_un_corte():
    zs = [float(z) for z in range(30) if z != 12]
    with pytest.raises(Excluida, match="espaciado_irregular"):
        ordenar_cortes(_posiciones(zs), NORMAL)


def test_excluye_gantry_inclinado():
    pos = np.array([[0.0, 0.3 * z, float(z)] for z in range(30)])
    with pytest.raises(Excluida, match="gantry_inclinado"):
        ordenar_cortes(pos, NORMAL)


def test_excluye_series_cortas():
    with pytest.raises(Excluida, match="pocos_cortes"):
        ordenar_cortes(_posiciones(range(5)), NORMAL)


def _cabeza_hu():
    vol = np.full((40, 64, 64), -1000, dtype=np.int16)
    vol[:, 16:48, 16:48] = 40
    return vol


def test_hu_ya_convertidas_ignoran_la_etiqueta():
    # Píxeles ya en HU pero con RescaleIntercept = -1024: aplicarla dejaría el aire en -2024.
    assert elegir_hu(_cabeza_hu(), 1, -1024)[0] == "ninguna"


def test_hu_crudas_usan_la_etiqueta():
    nombre, m, b = elegir_hu(_cabeza_hu() + 1024, 1, -1024)
    assert (nombre, m, b) == ("etiquetas", 1.0, -1024.0)


def test_hu_crudas_sin_etiqueta_restan_1024():
    assert elegir_hu(_cabeza_hu() + 1024, None, None)[0] == "-1024"


def test_hu_con_campo_cenido_y_casi_sin_aire():
    # Cabeza que llena el campo, hueso alrededor y relleno de -2048 fuera del círculo:
    # restar 1024 dejaría el cerebro en la ventana del aire.
    vol = np.full((40, 64, 64), 40, dtype=np.int16)
    vol[:, :4, :] = np.linspace(300, 1800, 64, dtype=np.int16)  # el hueso no forma pico
    vol[:, :, :2] = -2048
    assert elegir_hu(vol, None, None)[0] == "ninguna"
    assert elegir_hu(vol, 1, -1024)[0] == "ninguna"


def test_hu_indeterminado_si_no_hay_aire_ni_tejido():
    with pytest.raises(Excluida, match="hu_indeterminado"):
        elegir_hu(np.full((40, 64, 64), 500, dtype=np.int16), None, None)


def test_recorte_se_queda_con_la_parte_alta():
    # 400 mm de alto: «cuello» estrecho abajo y «cabeza» ancha en los 150 mm de arriba.
    vol = np.full((400, 100, 100), -1000, dtype=np.int16)
    vol[:240, 40:60, 40:60] = 40
    vol[240:390, 20:80, 25:75] = 40
    z0, z1, y0, y1, x0, x1 = recorte_cabeza(vol, (2.0, 2.0, 1.0), alto_mm=180)
    assert z1 == pytest.approx(395, abs=4) and z1 - z0 == 180
    assert (y0, y1) == pytest.approx((17, 83), abs=3)
    assert (x0, x1) == pytest.approx((22, 78), abs=3)


def test_recorte_ignora_objetos_sueltos():
    vol = np.full((100, 100, 100), -1000, dtype=np.int16)
    vol[10:80, 30:70, 30:70] = 40
    vol[95:99, 5:9, 5:9] = 40  # un trozo de reposacabezas por encima
    z0, z1, *_ = recorte_cabeza(vol, (2.0, 2.0, 2.0), alto_mm=400)
    assert z1 <= 86


def test_esfera_respeta_el_espaciado_y_los_bordes():
    forma, espaciado = (40, 60, 60), (0.5, 0.5, 2.0)
    donde, dentro = esfera(forma, espaciado, (30.0, 30.0, 20.0), radio_mm=4.0)
    vol = np.zeros(forma, dtype=np.uint8)
    vol[donde][dentro] = 1
    assert vol.sum() * 0.5 * 0.5 * 2.0 == pytest.approx(4 / 3 * np.pi * 4**3, rel=0.15)
    assert vol[20, 30, 30] == 1 and vol[20, 30, 39] == 0 and vol[23, 30, 30] == 0
    # Pegada a una esquina no se sale del volumen.
    donde, dentro = esfera(forma, espaciado, (0.0, 0.0, 0.0), radio_mm=4.0)
    assert dentro.any() and all(s.start == 0 for s in donde)
