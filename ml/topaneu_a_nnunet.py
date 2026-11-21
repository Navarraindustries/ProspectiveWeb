"""Pasa TopAneu 2026 al formato de nnU-Net, con la misma forma que deja `rsna_a_nnunet.py`.

    python ml/topaneu_a_nnunet.py --topaneu DIR --salida DIR [--modalidad ct|mr] [--repetidos TSV]

TopAneu ya viene en NIfTI, en HU, orientado en LPS y recortado a la cabeza, así que
aquí no se toca la imagen: solo se guarda como int16 con el nombre que pide nnU-Net.
La etiqueta sale de `location_masks/` (una clase por ubicación del aneurisma): todo
lo que no es fondo pasa a 1, igual que en los datos de RSNA, donde la etiqueta es una
esfera. Aquí es la máscara real del saco.

Con `--repetidos` (dos columnas: caso de TopAneu y sujeto de otro dataset) esos casos
se marcan en el manifest para que no acaben en particiones distintas que su original.

Deja imagesTr/, labelsTr/ y manifest.csv con las mismas columnas que el de RSNA, para
poder juntar los dos al armar las particiones.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
import SimpleITK as sitk

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rsna_a_nnunet import CAMPOS, HU_HUESO, HU_MAX, HU_MIN  # noqa: E402

EXTRA = ["origen", "repetido_de", "volumen_etiqueta_mm3"]


def convertir(caso: str, topaneu: Path, salida: Path, modalidad: str) -> dict:
    img = sitk.ReadImage(str(topaneu / "images" / f"{caso}_0000.nii.gz"))
    mascara = sitk.ReadImage(str(topaneu / "location_masks" / f"{caso}.nii.gz"))
    if img.GetSize() != mascara.GetSize():
        raise ValueError(f"imagen {img.GetSize()} y máscara {mascara.GetSize()} de tamaño distinto")
    arr = sitk.GetArrayFromImage(img)
    if modalidad == "ct":
        arr = np.clip(np.rint(arr), HU_MIN, HU_MAX).astype(np.int16)
    etiqueta = (sitk.GetArrayFromImage(mascara) > 0).astype(np.uint8)

    for sub in ("imagesTr", "labelsTr"):
        (salida / sub).mkdir(parents=True, exist_ok=True)
    for datos, ruta in ((etiqueta, salida / "labelsTr" / f"{caso}.nii.gz"),
                        (arr, salida / "imagesTr" / f"{caso}_0000.nii.gz")):
        nuevo = sitk.GetImageFromArray(datos)
        nuevo.CopyInformation(img)
        sitk.WriteImage(nuevo, str(ruta), useCompression=True)

    ubicaciones = topaneu / "location_jsons" / f"{caso}.json"
    lista = json.loads(ubicaciones.read_text(encoding="utf-8")) if ubicaciones.exists() else []
    if isinstance(lista, dict):  # {"locations": [25, 41]}: una clase de ubicación por aneurisma
        lista = lista.get("locations", [])
    vox = float(np.prod(img.GetSpacing()))
    fila = {
        "caso": caso, "series_uid": caso, "paciente": "_".join(caso.split("_")[:4]),
        "modalidad": "CTA" if modalidad == "ct" else "MRA",
        "aneurisma": int(etiqueta.any()), "n_aneurismas": len(lista),
        "ubicaciones": "; ".join(str(x) for x in lista),
        "estado": "ok", "motivo": "", "cortes": img.GetSize()[2], "repetidos": 0,
        "forma": "x".join(str(n) for n in img.GetSize()),
        "espaciado_mm": "x".join(f"{s:.3f}" for s in img.GetSpacing()),
        "conversion_hu": "ninguna", "origen": "topaneu2026",
        "volumen_etiqueta_mm3": round(float(etiqueta.sum()) * vox, 1),
    }
    if modalidad == "ct":
        fila["hu_p995"] = int(np.percentile(arr[::4, ::4, ::4], 99.5))
        if fila["hu_p995"] < HU_HUESO:
            fila["motivo"] = "sin_hueso"
    return fila


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--topaneu", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--modalidad", choices=["ct", "mr"], default="ct")
    ap.add_argument("--repetidos", type=Path, help="TSV: caso de TopAneu y sujeto del dataset que ya lo tiene")
    args = ap.parse_args(argv)

    repetidos = {}
    if args.repetidos:
        with args.repetidos.open(encoding="utf-8") as f:
            repetidos = {r[0]: r[1] for r in csv.reader(f, delimiter="\t") if len(r) > 1 and r[0] != "caso_topaneu"}
    casos = sorted(p.name[:-len("_0000.nii.gz")] for p in (args.topaneu / "images").glob(f"*_{args.modalidad}_*_0000.nii.gz"))
    args.salida.mkdir(parents=True, exist_ok=True)
    ruta = args.salida / "manifest.csv"
    hechos = set()
    if ruta.exists():
        with ruta.open(newline="", encoding="utf-8") as f:
            hechos = {r["caso"] for r in csv.DictReader(f)}
    pendientes = [c for c in casos if c not in hechos]
    print(f"{len(casos)} casos de {args.modalidad} · {len(pendientes)} por convertir", flush=True)
    with ruta.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS + EXTRA)
        if not hechos:
            w.writeheader()
        for i, caso in enumerate(pendientes, 1):
            try:
                fila = convertir(caso, args.topaneu, args.salida, args.modalidad)
            except Exception as e:  # un caso malo no para la pasada
                fila = {"caso": caso, "estado": "error", "motivo": f"{type(e).__name__}: {e}", "origen": "topaneu2026"}
            fila["repetido_de"] = repetidos.get(caso, "")
            w.writerow({k: fila.get(k, "") for k in CAMPOS + EXTRA})
            f.flush()
            if i % 20 == 0 or i == len(pendientes):
                print(f"{i}/{len(pendientes)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
