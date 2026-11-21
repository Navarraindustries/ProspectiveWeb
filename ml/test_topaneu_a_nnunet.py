"""`topaneu_a_nnunet.py` con un TopAneu sintético de dos casos diminutos."""
import csv
import json

import numpy as np
import pytest
import SimpleITK as sitk

import topaneu_a_nnunet as t


def _escribir(ruta, arr, espaciado=(0.5, 0.5, 0.6), origen=(1.0, 2.0, 3.0)):
    img = sitk.GetImageFromArray(arr)
    img.SetSpacing(espaciado)
    img.SetOrigin(origen)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    sitk.WriteImage(img, str(ruta))


def _caso(raiz, nombre, clases=(25,), **mascara):
    imagen = np.full((12, 16, 16), -1000.0, dtype=np.float32)
    imagen[2:10, 4:12, 4:12] = 40.4
    imagen[0, :, :] = 5000.0  # fuera del rango de HU que se guarda
    etiqueta = np.zeros((12, 16, 16), dtype=np.uint8)
    for k, clase in enumerate(clases):
        etiqueta[3 + 3 * k:5 + 3 * k, 6:9, 6:9] = clase
    _escribir(raiz / "images" / f"{nombre}_0000.nii.gz", imagen)
    _escribir(raiz / "location_masks" / f"{nombre}.nii.gz", etiqueta, **mascara)
    (raiz / "location_jsons").mkdir(exist_ok=True)
    (raiz / "location_jsons" / f"{nombre}.json").write_text(json.dumps({"locations": list(clases)}))


def _manifest(salida):
    with (salida / "manifest.csv").open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_la_mascara_por_ubicacion_pasa_a_una_clase(tmp_path):
    _caso(tmp_path / "ta", "topaneu_center4_ct_062_1", clases=(25, 41))
    fila = t.convertir("topaneu_center4_ct_062_1", tmp_path / "ta", tmp_path / "out", "ct")
    etiqueta = sitk.ReadImage(str(tmp_path / "out" / "labelsTr" / "topaneu_center4_ct_062_1.nii.gz"))
    imagen = sitk.ReadImage(str(tmp_path / "out" / "imagesTr" / "topaneu_center4_ct_062_1_0000.nii.gz"))
    assert set(np.unique(sitk.GetArrayFromImage(etiqueta))) == {0, 1}
    assert imagen.GetPixelIDTypeAsString() == "16-bit signed integer"
    assert sitk.GetArrayFromImage(imagen).max() == t.HU_MAX
    assert imagen.GetSpacing() == pytest.approx((0.5, 0.5, 0.6)) and imagen.GetOrigin() == pytest.approx((1, 2, 3))
    assert (fila["n_aneurismas"], fila["ubicaciones"], fila["aneurisma"]) == (2, "25; 41", 1)
    assert fila["paciente"] == "topaneu_center4_ct_062"  # los estudios repetidos de un paciente van juntos
    assert fila["volumen_etiqueta_mm3"] == pytest.approx(2 * 2 * 3 * 3 * 0.5 * 0.5 * 0.6, abs=0.1)


def test_mascara_en_otra_rejilla_no_se_convierte(tmp_path):
    _caso(tmp_path / "ta", "topaneu_center2_ct_105", origen=(9.0, 2.0, 3.0))
    with pytest.raises(ValueError, match="geometría"):
        t.convertir("topaneu_center2_ct_105", tmp_path / "ta", tmp_path / "out", "ct")


def test_los_errores_se_reintentan_y_los_repetidos_se_marcan(tmp_path):
    ta, out = tmp_path / "ta", tmp_path / "out"
    _caso(ta, "topaneu_center5_mr_450")
    _caso(ta, "topaneu_center5_mr_451", origen=(9.0, 2.0, 3.0))  # falla
    rep = tmp_path / "rep.tsv"
    rep.write_text("caso_topaneu\tsujeto_ds003949\ntopaneu_center5_mr_450\tsub-450\n")
    args = ["--topaneu", str(ta), "--salida", str(out), "--modalidad", "mr", "--repetidos", str(rep)]
    t.main(args)
    filas = {f["caso"]: f for f in _manifest(out)}
    assert filas["topaneu_center5_mr_450"]["repetido_de"] == "sub-450"
    assert filas["topaneu_center5_mr_451"]["estado"] == "error"

    _caso(ta, "topaneu_center5_mr_451")  # arreglado el origen
    t.main(args)
    filas = _manifest(out)
    assert sorted(f["caso"] for f in filas) == ["topaneu_center5_mr_450", "topaneu_center5_mr_451"]
    assert {f["estado"] for f in filas} == {"ok"}
