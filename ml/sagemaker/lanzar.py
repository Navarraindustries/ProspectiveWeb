"""Lanza un trabajo de entrenamiento de SageMaker con un techo de costo explícito.

    python ml/sagemaker/lanzar.py --modo benchmark --datos s3://bucket/datos/cta-piloto/ \\
        --rol arn:aws:iam::...:role/... --instancia ml.g6e.4xlarge --max-horas 2 --techo-usd 10 [--lanzar]

Sin `--lanzar` solo enseña la petición y el costo máximo: no crea ni sube nada.
El costo máximo es `--max-horas` × tarifa bajo demanda de la instancia (más el disco);
SageMaker corta el trabajo al llegar a `--max-horas`. Si ese máximo supera `--techo-usd`,
no se lanza: el techo es la cifra aprobada para ese trabajo.

No usa el SDK de SageMaker: el contenedor oficial de PyTorch arranca con un pequeño
programa que baja este código de S3, instala `requirements.txt` y corre `entrenar.py`.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import tarfile
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
IMAGEN = "763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-training:2.10.0-gpu-py313-cu130-ubuntu22.04-sagemaker-v2.8"
# USD por hora de entrenamiento bajo demanda en us-east-1 (lista de precios de AWS del 11-11-2026).
TARIFAS = {"ml.g4dn.2xlarge": 0.94, "ml.g4dn.4xlarge": 1.505, "ml.g5.2xlarge": 1.515, "ml.g6.4xlarge": 1.654,
           "ml.g5.4xlarge": 2.03, "ml.g6e.2xlarge": 2.80, "ml.g6e.4xlarge": 3.76}
DISCO_USD_GB_MES = 0.14
#: S3 estándar en us-east-1: lo que queda guardado (checkpoints, modelo,
#: preprocesado) se sigue pagando después del trabajo. Se cuenta un mes.
S3_USD_GB_MES = 0.023
FECHA_TARIFAS = "11-11-2026"

ARRANQUE = """
import boto3, subprocess, sys, tarfile
b, k = sys.argv[1].removeprefix('s3://').split('/', 1)
boto3.client('s3').download_file(b, k, '/tmp/codigo.tar.gz')
tarfile.open('/tmp/codigo.tar.gz').extractall('/opt/ml/code', filter='data')
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-r', '/opt/ml/code/requirements.txt'], check=True)
sys.exit(subprocess.run([sys.executable, '/opt/ml/code/entrenar.py', *sys.argv[2:]]).returncode)
"""


def costo_maximo(instancia: str, horas: float, disco_gb: int, s3_gb: float = 0.0,
                 tarifa_hora: float | None = None) -> float:
    """Cómputo y disco del trabajo, más un mes de lo que deja en S3. El techo
    es por trabajo: varios trabajos suman sus techos, y eso lo controla quien
    los aprueba (el presupuesto de la cuenta en AWS Budgets)."""
    hora = tarifa_hora if tarifa_hora is not None else TARIFAS[instancia]
    return horas * hora + disco_gb * DISCO_USD_GB_MES / 730 * horas + s3_gb * S3_USD_GB_MES


def _positivo(texto: str) -> float:
    v = float(texto)
    if not v > 0:
        raise argparse.ArgumentTypeError("tiene que ser mayor que 0")
    return v


def peticion(a, nombre: str, bucket: str, codigo_s3: str) -> dict:
    canales = [("train", a.datos)] + ([("preprocesado", a.preprocesado)] if a.preprocesado else [])
    p = {
        "TrainingJobName": nombre,
        "RoleArn": a.rol,
        "AlgorithmSpecification": {
            "TrainingImage": IMAGEN, "TrainingInputMode": "File",
            "ContainerEntrypoint": ["python3", "-c", ARRANQUE],
            "ContainerArguments": [codigo_s3, "--modo", a.modo, "--pliegue", str(a.pliegue)],
        },
        "InputDataConfig": [{"ChannelName": c, "DataSource": {"S3DataSource": {
            "S3DataType": "S3Prefix", "S3Uri": uri, "S3DataDistributionType": "FullyReplicated"}}}
            for c, uri in canales],
        "OutputDataConfig": {"S3OutputPath": f"s3://{bucket}/modelos/"},
        "CheckpointConfig": {"S3Uri": f"s3://{bucket}/checkpoints/{a.checkpoints or nombre}/",
                             "LocalPath": "/opt/ml/checkpoints"},
        "ResourceConfig": {"InstanceType": a.instancia, "InstanceCount": 1, "VolumeSizeInGB": a.disco_gb},
        "StoppingCondition": {"MaxRuntimeInSeconds": int(a.max_horas * 3600)},
        "Tags": [{"Key": "proyecto", "Value": "prospective-ml"}, {"Key": "tarea", "Value": a.tarea}],
    }
    if a.spot:
        p["EnableManagedSpotTraining"] = True
        # Con spot el trabajo puede esperar capacidad; se le da el doble de reloj, no de cómputo.
        p["StoppingCondition"]["MaxWaitTimeInSeconds"] = int(a.max_horas * 3600 * 2)
    return p


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modo", choices=["benchmark", "preprocesar", "entrenar"], required=True)
    ap.add_argument("--pliegue", default="0")
    ap.add_argument("--datos", required=True, help="s3://… con la carpeta DatasetNNN_Nombre dentro")
    ap.add_argument("--preprocesado", help="s3://… del preprocesado de un trabajo anterior")
    ap.add_argument("--checkpoints", help="nombre de un trabajo anterior, para continuar sus checkpoints")
    ap.add_argument("--rol", required=True, help="ARN del rol de ejecución de SageMaker")
    ap.add_argument("--instancia", choices=sorted(TARIFAS), default="ml.g6e.4xlarge")
    # Mayores que 0: con 0 horas el costo salía 0 y pasaba cualquier techo.
    ap.add_argument("--max-horas", type=_positivo, required=True)
    ap.add_argument("--techo-usd", type=_positivo, required=True, help="gasto aprobado para este trabajo")
    ap.add_argument("--disco-gb", type=lambda s: int(_positivo(s)), default=200)
    ap.add_argument("--s3-gb", type=float, default=50.0,
                    help="lo que dejará en S3 (checkpoints, modelo); se cuenta un mes")
    ap.add_argument("--tarifa-usd-h", type=_positivo,
                    help=f"precio por hora actual de la instancia, si cambió desde el {FECHA_TARIFAS}")
    ap.add_argument("--spot", action="store_true")
    ap.add_argument("--tarea", default="A4", help="ID de la tarea del plan de trabajo")
    ap.add_argument("--perfil", default="prospective")
    ap.add_argument("--lanzar", action="store_true", help="crear el trabajo de verdad")
    a = ap.parse_args(argv)

    bucket = a.datos.removeprefix("s3://").split("/", 1)[0]
    nombre = f"prospective-{a.tarea.lower()}-{a.modo}-{time.strftime('%Y%m%d-%H%M%S')}"
    codigo_s3 = f"s3://{bucket}/codigo/{nombre}/codigo.tar.gz"
    p = peticion(a, nombre, bucket, codigo_s3)
    maximo = costo_maximo(a.instancia, a.max_horas, a.disco_gb, a.s3_gb, a.tarifa_usd_h)
    print(json.dumps(p, indent=2, ensure_ascii=False))
    print(f"\nCosto máximo: {maximo:.2f} USD ({a.max_horas} h de {a.instancia} bajo demanda, disco y {a.s3_gb:g} GB un mes en S3 incluidos)"
          + (" · con spot se paga menos, nunca más" if a.spot else ""))
    if a.tarifa_usd_h is None:
        print(f"Tarifa de la lista del {FECHA_TARIFAS}: compruébala en la consola de AWS o pasa --tarifa-usd-h.")
    if maximo > a.techo_usd:
        print(f"NO SE LANZA: supera el techo aprobado de {a.techo_usd:.2f} USD. Baja --max-horas o aprueba más.")
        return 2
    if not a.lanzar:
        print("Simulación: no se creó nada. Añade --lanzar para crearlo.")
        return 0

    import boto3
    sesion = boto3.Session(profile_name=a.perfil, region_name="us-east-1")
    paquete = io.BytesIO()
    with tarfile.open(fileobj=paquete, mode="w:gz") as tar:
        for f in ("entrenar.py", "requirements.txt"):
            tar.add(AQUI / f, arcname=f)
    sesion.client("s3").put_object(Bucket=bucket, Key=codigo_s3.split("/", 3)[3], Body=paquete.getvalue())
    sesion.client("sagemaker").create_training_job(**p)
    print(f"Lanzado: {nombre}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
