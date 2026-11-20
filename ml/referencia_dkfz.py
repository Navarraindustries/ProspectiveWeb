"""Corre el detector del 7.º puesto de Kaggle RSNA 2025 (DKFZ) y saca DÓNDE ve cada aneurisma.

    python ml/referencia_dkfz.py --estudios DIR/Studies --ids 002 015 --modelo CARPETA_DEL_MODELO
        --salida puntos.csv [--anotaciones DIR/Annotations]

Su `inference.py` solo deja el máximo de probabilidad por ubicación arterial. Aquí se
guarda además el punto de ese máximo, en coordenadas del paciente (LPS, mm), que es lo
que hace falta para compararlo con el detector de Prospective por distancia. Hay que
correrlo con el entorno de su repositorio (https://github.com/MIC-DKFZ/
kaggle-rsna-intracranial-aneurysm-detection-2025-solution), que trae su nnU-Net.

Del vóxel del mapa al paciente se deshace, en orden: el remuestreo de nnU-Net, su
recorte a lo no nulo si lo hubo, el recorte de 200 × 160 × 160 mm del propio detector
y la geometría del DICOM. Con `--anotaciones` (los STL de Zenodo, en las mismas coordenadas
del paciente) añade la distancia del punto al centro de la lesión más cercana.

El modelo está entrenado con RSNA (uso no comercial): sirve de referencia, no de producto.
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np


def centro_stl(ruta: Path) -> tuple[np.ndarray, float]:
    """Centro (media de los vértices) y radio (distancia máxima a él) de un STL, de texto o binario."""
    datos = ruta.read_bytes()
    if datos[:5] == b"solid" and b"facet" in datos[:1000]:  # los de Zenodo son de texto
        v = np.array([linea.split()[1:4] for linea in datos.decode("ascii", "ignore").splitlines()
                      if linea.lstrip().startswith("vertex")], dtype=np.float64)
    else:
        n = int(np.frombuffer(datos, dtype="<u4", count=1, offset=80)[0])
        tri = np.frombuffer(datos, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]),
                            count=n, offset=84)
        v = tri["v"].reshape(-1, 3).astype(np.float64)
    c = v.mean(axis=0)
    return c, float(np.linalg.norm(v - c, axis=1).max())


def a_indice_original(idx_pre, forma_pre, forma_recorte, inicio_no_nulo, inicio_cabeza) -> np.ndarray:
    """Índice (z, y, x) del mapa preprocesado → índice (z, y, x) del volumen DICOM completo."""
    idx = (np.asarray(idx_pre, dtype=float) + 0.5) * np.asarray(forma_recorte) / np.asarray(forma_pre) - 0.5
    return idx + np.asarray(inicio_no_nulo) + np.asarray(inicio_cabeza)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--estudios", type=Path, required=True, help="carpeta con una subcarpeta de .dcm por estudio")
    ap.add_argument("--ids", nargs="+", required=True)
    ap.add_argument("--modelo", type=Path, required=True)
    ap.add_argument("--checkpoint", default="checkpoint_epoch_1500.pth")
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--anotaciones", type=Path, help="carpeta con an_<id>[_n].stl")
    args = ap.parse_args(argv)

    import SimpleITK as sitk
    import torch
    from nnunetv2.dataset_conversion.kaggle_2025_rsna.official_data_to_nnunet import get_bbox, process_series
    from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor

    predictor = nnUNetPredictor(tile_step_size=0.5, use_gaussian=True, use_mirroring=False,
                                device=torch.device("cpu"), verbose=False, allow_tqdm=False)
    predictor.initialize_from_trained_model_folder(str(args.modelo), ["all"], checkpoint_name=args.checkpoint)
    preprocesador = predictor.configuration_manager.preprocessor_class()
    clases = list(predictor.dataset_json["labels"].keys())[1:] + ["Aneurysm Present"]

    campos = ["estudio", "clase", "prob", "x_mm", "y_mm", "z_mm", "lesion_mas_cercana", "dist_mm",
              "radio_lesion_mm", "minutos", "direccion"]
    hechos = set()
    if args.salida.exists():
        with args.salida.open(newline="", encoding="utf-8") as f:
            hechos = {r["estudio"] for r in csv.DictReader(f)}
    with args.salida.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        if not hechos:
            w.writeheader()
        for sid in args.ids:
            if sid in hechos:
                continue
            t0 = time.perf_counter()
            imagen = process_series(args.estudios / sid)
            vol = sitk.GetArrayFromImage(imagen)
            espaciado = np.flip(np.array(imagen.GetSpacing()))
            caja = get_bbox(vol, espaciado)
            recorte = vol[caja[0]:caja[1], caja[2]:caja[3], caja[4]:caja[5]]
            del vol
            datos, _, prop = preprocesador.run_case_npy(
                np.array([recorte]), None,
                {"spacing": espaciado, "direction": imagen.GetDirection(), "origin": imagen.GetOrigin()},
                predictor.plans_manager, predictor.configuration_manager, predictor.dataset_json)
            probs = torch.sigmoid(predictor.predict_logits_from_preprocessed_data(torch.from_numpy(datos)).cpu()).numpy()

            # Su nnU-Net no recorta a lo no nulo; el oficial sí, y deja la caja en las propiedades.
            no_nulo = [c[0] for c in prop.get("bbox_used_for_cropping", [(0, 0)] * 3)]
            lesiones = []
            if args.anotaciones:
                lesiones = [(p.stem, *centro_stl(p)) for p in sorted(args.anotaciones.glob(f"an_{sid}*.stl"))]
            for c, nombre in enumerate(clases):
                idx_pre = np.unravel_index(int(probs[c].argmax()), probs[c].shape)
                idx = a_indice_original(idx_pre, probs[c].shape, prop["shape_after_cropping_and_before_resampling"],
                                        no_nulo, caja[0::2])
                punto = np.array(imagen.TransformContinuousIndexToPhysicalPoint(tuple(float(i) for i in idx[::-1])))
                fila = {"estudio": sid, "clase": nombre, "prob": f"{probs[c].max():.4f}",
                        "x_mm": f"{punto[0]:.1f}", "y_mm": f"{punto[1]:.1f}", "z_mm": f"{punto[2]:.1f}",
                        "minutos": f"{(time.perf_counter() - t0) / 60:.1f}",
                        "direccion": " ".join(f"{d:.0f}" for d in imagen.GetDirection())}
                if lesiones:
                    nom, centro, radio = min(lesiones, key=lambda l: np.linalg.norm(punto - l[1]))
                    fila.update(lesion_mas_cercana=nom, dist_mm=f"{np.linalg.norm(punto - centro):.1f}",
                                radio_lesion_mm=f"{radio:.1f}")
                w.writerow(fila)
            f.flush()
            print(f"[{sid}] {(time.perf_counter() - t0) / 60:.1f} min · aneurisma {probs[-1].max():.2f}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
