"""O3 de principio a fin: máscara de cerebro de los 172 con TotalSegmentator y medición.

Para el PC de la oficina. Por cada estudio de `<dicom>/Studies/<id>`:
  1. lee la serie más larga con SimpleITK (la misma que usa la evaluación) y
     la escribe como NIfTI temporal — así TotalSegmentator no tiene que
     adivinar qué serie usar si la carpeta trae varias;
  2. llama a `TotalSegmentator -i <nifti> -o <salida>/<id> --fast --roi_subset brain`;
  3. borra el NIfTI temporal y sigue. Los hechos no se repiten (se puede
     cortar y relanzar); los que fallan quedan en `<salida>/fallos.json`.
Al final, si se dan `--runs`, lanza `scripts/cerebro_zenodo.py` y deja
`<salida>/resultado_o3.json`, que es lo que hay que traer de vuelta.

Uso (desde la raíz del repositorio):
    python backend/scripts/o3_mascaras.py --dicom "D:/Zenodo/Archivos DICOM" --salida D:/mascaras \\
        --runs kit_oficina/candidatos/zenodo_eval_dos_escalas_rapido kit_oficina/candidatos/zenodo_eval_craneo_flojo
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def serie_mas_larga(carpeta: Path) -> list[str]:
    import SimpleITK as sitk
    r = sitk.ImageSeriesReader()
    ids = r.GetGDCMSeriesIDs(str(carpeta)) or []
    if not ids:
        raise ValueError("sin series DICOM legibles")
    return max((list(r.GetGDCMSeriesFileNames(str(carpeta), s)) for s in ids), key=len)


def a_nifti(carpeta: Path, destino: Path) -> Path:
    import SimpleITK as sitk
    r = sitk.ImageSeriesReader()
    r.SetFileNames(serie_mas_larga(carpeta))
    sitk.WriteImage(r.Execute(), str(destino))
    return destino


def procesar(sid: str, dicom: Path, salida: Path, comando: list[str], log=print) -> None:
    t0 = time.perf_counter()
    tmp = salida / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    nifti = a_nifti(dicom / "Studies" / sid, tmp / f"{sid}.nii.gz")
    destino = salida / sid
    try:
        r = subprocess.run([*comando, "-i", str(nifti), "-o", str(destino), "--fast", "--roi_subset", "brain"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout or "").strip()[-400:] or f"código {r.returncode}")
        if not (destino / "brain.nii.gz").exists():
            raise RuntimeError("TotalSegmentator terminó sin brain.nii.gz")
    finally:
        nifti.unlink(missing_ok=True)
    log(f"[{sid}] máscara en {time.perf_counter() - t0:.0f} s", flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dicom", type=Path, required=True, help="carpeta «Archivos DICOM» (con Studies/)")
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--runs", type=Path, nargs="*", default=[], help="carpetas de JSON de candidatos (del kit)")
    ap.add_argument("--estudios", nargs="*", help="solo estos")
    ap.add_argument("--comando", default="TotalSegmentator", help="ejecutable de TotalSegmentator")
    ap.add_argument("--reintentar", action="store_true", help="volver a intentar los que fallaron")
    a = ap.parse_args(argv)

    comando = a.comando.split()
    if shutil.which(comando[0]) is None and not Path(comando[0]).exists():
        print(f"no encuentro «{comando[0]}»: ¿está instalado TotalSegmentator en este entorno?")
        return 2
    a.salida.mkdir(parents=True, exist_ok=True)
    ruta_fallos = a.salida / "fallos.json"
    fallos = {} if a.reintentar or not ruta_fallos.exists() else json.loads(ruta_fallos.read_text(encoding="utf-8"))
    ids = sorted(a.estudios or [p.name for p in (a.dicom / "Studies").iterdir() if p.is_dir()])
    pendientes = [s for s in ids if s not in fallos and not (a.salida / s / "brain.nii.gz").exists()]
    print(f"{len(ids)} estudios · {len(ids) - len(pendientes)} ya hechos o fallidos · {len(pendientes)} por hacer",
          flush=True)
    t0 = time.perf_counter()
    for j, sid in enumerate(pendientes, start=1):
        try:
            procesar(sid, a.dicom, a.salida, comando)
        except Exception as e:  # un estudio malo no para la pasada
            print(f"[{sid}] FALLO: {type(e).__name__}: {e}", flush=True)
            fallos[sid] = f"{type(e).__name__}: {e}"
            ruta_fallos.write_text(json.dumps(fallos, ensure_ascii=False, indent=2), encoding="utf-8")
        resto = (time.perf_counter() - t0) / j * (len(pendientes) - j)
        print(f"    {j}/{len(pendientes)} · quedan unos {resto / 60:.0f} min", flush=True)
    shutil.rmtree(a.salida / "_tmp", ignore_errors=True)
    if fallos:
        print(f"{len(fallos)} estudios fallaron (ver {ruta_fallos})")
    if a.runs:
        from scripts.cerebro_zenodo import main as medir
        return medir(["--runs", *map(str, a.runs), "--mascaras", str(a.salida),
                      "--json", str(a.salida / "resultado_o3.json")])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
