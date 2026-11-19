"""Lo que corre dentro del trabajo de SageMaker: preprocesa y entrena nnU-Net (ResEnc M).

    python entrenar.py --modo benchmark|preprocesar|entrenar [--pliegue 0] [--dataset 101]

Carpetas que pone SageMaker:
    /opt/ml/input/data/train         canal «train»: la carpeta DatasetNNN_Nombre en formato nnU-Net
    /opt/ml/input/data/preprocesado  canal opcional: el preprocesado que dejó un trabajo anterior
    /opt/ml/checkpoints              se copia sola a S3 mientras corre: preprocesado y resultados
    /opt/ml/model                    lo que queda aquí vuelve a S3 como model.tar.gz

Modos:
    benchmark    preprocesa y corre la prueba de 5 épocas de nnU-Net; mide los segundos por época
    preprocesar  planifica y preprocesa una vez; el resultado queda en checkpoints/preprocesado
    entrenar     entrena un pliegue; si hay un checkpoint (trabajo spot interrumpido) continúa

Los resultados van a /opt/ml/checkpoints para que un trabajo spot interrumpido pueda seguir.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

PLANES = "nnUNetResEncUNetMPlans"
CONFIG = "3d_fullres"
CHECKPOINTS = Path("/opt/ml/checkpoints")


def correr(*cmd: str) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def carpeta_dataset(raiz: Path, numero: int) -> Path:
    hallados = sorted(raiz.glob(f"Dataset{numero:03d}_*"))
    if len(hallados) != 1:
        raise SystemExit(f"esperaba una carpeta Dataset{numero:03d}_* en {raiz} y hay {len(hallados)}")
    return hallados[0]


def preprocesar(numero: int, nucleos: int) -> None:
    correr("nnUNetv2_plan_and_preprocess", "-d", str(numero), "-pl", "nnUNetPlannerResEncM", "-c", CONFIG,
           "--verify_dataset_integrity", "-np", str(nucleos))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modo", choices=["benchmark", "preprocesar", "entrenar"], required=True)
    ap.add_argument("--pliegue", default="0")
    ap.add_argument("--dataset", type=int, default=101)
    args = ap.parse_args(argv)

    crudo = Path(os.environ.get("SM_CHANNEL_TRAIN", "/opt/ml/input/data/train"))
    canal_pre = Path("/opt/ml/input/data/preprocesado")
    modelo = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
    nucleos = max(1, (os.cpu_count() or 8) - 2)
    preprocesado = canal_pre if canal_pre.is_dir() else CHECKPOINTS / "preprocesado"
    resultados = CHECKPOINTS / "resultados"
    for d in (preprocesado, resultados, modelo):
        d.mkdir(parents=True, exist_ok=True)
    os.environ.update(nnUNet_raw=str(crudo), nnUNet_preprocessed=str(preprocesado),
                      nnUNet_results=str(resultados), nnUNet_n_proc_DA=str(nucleos))

    nombre = carpeta_dataset(crudo, args.dataset).name
    if not (preprocesado / nombre / f"{PLANES}.json").exists():
        preprocesar(args.dataset, nucleos)
    # Particiones fijas por paciente, si vienen con los datos; sin ellas nnU-Net las sortea.
    particiones = crudo / nombre / "splits_final.json"
    if particiones.exists():
        shutil.copy(particiones, preprocesado / nombre / "splits_final.json")
    if args.modo == "preprocesar":
        shutil.copy(preprocesado / nombre / f"{PLANES}.json", modelo)
        return 0

    entrenador = "nnUNetTrainerBenchmark_5epochs" if args.modo == "benchmark" else "nnUNetTrainer"
    salida = resultados / nombre / f"{entrenador}__{PLANES}__{CONFIG}" / f"fold_{args.pliegue}"
    cmd = ["nnUNetv2_train", str(args.dataset), CONFIG, args.pliegue, "-p", PLANES, "-tr", entrenador]
    if (salida / "checkpoint_latest.pth").exists():
        cmd.append("--c")
    correr(*cmd)

    # A model.tar.gz va lo que hace falta para predecir y para leer cómo fue: no los parciales.
    destino = modelo / salida.name
    destino.mkdir(parents=True, exist_ok=True)
    for f in salida.iterdir():
        if f.is_file() and f.name != "checkpoint_latest.pth":
            shutil.copy(f, destino)
    for f in ("plans.json", "dataset.json", "dataset_fingerprint.json"):
        if (salida.parent / f).exists():
            shutil.copy(salida.parent / f, modelo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
