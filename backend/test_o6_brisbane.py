"""O6: las piezas de los dos scripts de Royal Brisbane, con volúmenes sintéticos."""
import numpy as np
import pytest
import SimpleITK as sitk

from scripts.o6_n4_brisbane import cubierto, mascara_en
from scripts.o6_seguimiento_brisbane import malla_a_paciente, meses


def _angio_con_vaso():
    vol = np.full((20, 30, 40), 50.0, dtype=np.float32)
    vol[8:12, 5:9, 2:10] = 400.0  # un «vaso» en una esquina: invertir cualquier eje lo saca de sitio
    return vol


def test_la_mascara_con_los_ejes_invertidos_se_recoloca(tmp_path):
    vol = _angio_con_vaso()
    img = sitk.GetImageFromArray(vol)
    experto = (vol > 200).astype(np.uint8)
    girada = sitk.GetImageFromArray(np.flip(experto, (1, 2)).copy())  # mismo tamaño, x e y al revés
    sitk.WriteImage(girada, str(tmp_path / "m.nii"))
    mascara, como, brillo = mascara_en(img, vol, tmp_path / "m.nii")
    assert como == "array -y -x" and brillo == pytest.approx(8.0)
    assert np.array_equal(mascara, experto.astype(bool))


def test_una_mascara_vacia_o_fuera_del_vaso_se_rechaza(tmp_path):
    vol = np.full((20, 30, 40), 50.0, dtype=np.float32)
    img = sitk.GetImageFromArray(vol)
    m = np.zeros(vol.shape, dtype=np.uint8)
    sitk.WriteImage(sitk.GetImageFromArray(m), str(tmp_path / "vacia.nii"))
    with pytest.raises(ValueError, match="vacía"):
        mascara_en(img, vol, tmp_path / "vacia.nii")
    m[5:8, 5:8, 5:8] = 1
    sitk.WriteImage(sitk.GetImageFromArray(m), str(tmp_path / "fuera.nii"))
    with pytest.raises(ValueError, match="no cae sobre un vaso"):
        mascara_en(img, vol, tmp_path / "fuera.nii")


def test_cubierto_con_la_mascara_de_la_malla_recortada_y_a_otro_espaciado():
    experto = np.zeros((20, 30, 40), dtype=bool)
    experto[8:12, 10:14, 10:20] = True
    espaciado = (1.0, 0.5, 0.5)  # z, y, x
    # Máscara de la malla: recorte que empieza en z=6, y=8, x=8 (en mm: 6, 4, 4) y cubre media lesión en x.
    mask = np.zeros((10, 12, 20), dtype=np.uint8)
    mask[2:6, 2:6, 2:7] = 1
    sm = {"mask": mask, "spacing": espaciado, "shift_xyz": (4.0, 4.0, 6.0)}
    assert cubierto(experto, espaciado, sm) == pytest.approx(0.5)
    assert np.isnan(cubierto(np.zeros_like(experto), espaciado, sm))


def test_meses_entre_sesiones_tambien_con_dia_y_mes_cambiados():
    assert meses("ses-20160406", "ses-20160620") == pytest.approx(2.5, abs=0.1)
    assert meses("ses-20170831", "ses-20181404") == pytest.approx(7.4, abs=0.1)  # 14 de abril


def test_malla_a_paciente_usa_origen_y_direccion():
    img = sitk.Image(4, 4, 4, sitk.sitkUInt8)
    img.SetOrigin((10.0, 20.0, 30.0))
    img.SetDirection((-1, 0, 0, 0, -1, 0, 0, 0, 1))
    assert (malla_a_paciente(img) @ np.array([1.0, 2.0, 3.0, 1.0]))[:3] == pytest.approx([9.0, 18.0, 33.0])
