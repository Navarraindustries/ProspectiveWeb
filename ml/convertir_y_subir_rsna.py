"""Convierte RSNA por tandas y sube cada tanda a S3, para un disco donde no cabe entero.

    python ml/convertir_y_subir_rsna.py --zip ZIP --salida DIR --s3 s3://bucket/prefijo/
        [--tanda 100] [--procesos 1] [--perfil prospective] [--modalidad CTA]

Las 1.808 angio-TC convertidas ocupan unos 83 GB. Por cada tanda de series:
  1. `rsna_a_nnunet.py` convierte la tanda a `--salida` (las ya hechas no se repiten);
  2. `aws s3 sync` sube imágenes, etiquetas, manifest.csv y dataset.json;
  3. si la subida terminó bien, se borran del disco las imágenes y etiquetas de la tanda.
El manifest y el dataset.json se quedan en el disco: son la memoria de qué está hecho.
Se puede cortar y relanzar; lo que quedó convertido sin subir se sube al empezar.
"""
from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def subir_y_borrar(salida: Path, s3: str, perfil: str) -> None:
    r = subprocess.run(["aws", "s3", "sync", str(salida), s3, "--only-show-errors", "--profile", perfil])
    if r.returncode != 0:
        raise SystemExit(f"la subida a {s3} falló (código {r.returncode}); no se borra nada")
    for sub in ("imagesTr", "labelsTr"):
        for f in (salida / sub).glob("*.nii.gz"):
            f.unlink()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--s3", required=True, help="destino, p. ej. s3://bucket/datos/cta-v1/Dataset101_AneurismaCTA/")
    ap.add_argument("--modalidad", default="CTA")
    ap.add_argument("--tanda", type=int, default=100)
    ap.add_argument("--procesos", type=int, default=1)
    ap.add_argument("--perfil", default="prospective")
    args = ap.parse_args(argv)

    with zipfile.ZipFile(args.zip) as zf, zf.open("train.csv") as f:
        uids = sorted(r["SeriesInstanceUID"] for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
                      if r["Modality"] == args.modalidad)
    manifest = args.salida / "manifest.csv"
    hechas = set()
    if manifest.exists():
        with manifest.open(newline="", encoding="utf-8") as f:
            hechas = {r["series_uid"] for r in csv.DictReader(f)}
        subir_y_borrar(args.salida, args.s3, args.perfil)  # lo que una tanda cortada dejó sin subir
    pendientes = [u for u in uids if u not in hechas]
    print(f"{len(uids)} series · {len(hechas)} ya convertidas · {len(pendientes)} por hacer", flush=True)

    for i in range(0, len(pendientes), args.tanda):
        tanda = pendientes[i:i + args.tanda]
        r = subprocess.run([sys.executable, str(AQUI / "rsna_a_nnunet.py"), "--zip", str(args.zip),
                            "--salida", str(args.salida), "--modalidad", args.modalidad,
                            "--procesos", str(args.procesos), "--series", ",".join(tanda)])
        if r.returncode != 0:
            raise SystemExit(f"la conversión falló (código {r.returncode})")
        subir_y_borrar(args.salida, args.s3, args.perfil)
        print(f"== subidas {min(i + args.tanda, len(pendientes))} de {len(pendientes)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
