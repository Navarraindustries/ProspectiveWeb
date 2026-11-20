"""Arma las particiones fijas de nnU-Net a partir del manifest de la conversión.

    python ml/particiones.py --manifest DIR/manifest.csv --salida DIR/splits_final.json
        [--pliegues 5] [--semilla 7] [--max-espaciado-mm 2.0] [--con-sin-hueso]

Entran las series convertidas («ok») que además:
  - no tienen ningún espaciado mayor de `--max-espaciado-mm`: con cortes de 3 a 5 mm
    un aneurisma pequeño no se ve y la etiqueta enseña ruido;
  - no son angio-TC con el hueso sustraído (aviso «sin_hueso»), distintas de las que
    recibe Prospective; `--con-sin-hueso` las deja entrar.
Las que quedan fuera no aparecen en ninguna partición, así que nnU-Net no las usa.

Los pliegues se reparten por paciente (todas las series de un paciente van juntas) y
con la misma proporción de estudios con aneurisma en cada uno. Con la misma semilla
sale siempre el mismo reparto, para que los experimentos sean comparables.
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import random
import sys
from pathlib import Path


def entra(fila: dict, max_espaciado_mm: float, con_sin_hueso: bool) -> bool:
    if fila["estado"] != "ok":
        return False
    if max(float(x) for x in fila["espaciado_mm"].split("x")) > max_espaciado_mm:
        return False
    return con_sin_hueso or "sin_hueso" not in fila["motivo"]


def repartir(filas: list[dict], pliegues: int, semilla: int) -> list[list[str]]:
    """Casos de cada pliegue, por paciente y estratificado por «tiene aneurisma»."""
    por_paciente = collections.defaultdict(list)
    for f in filas:
        por_paciente[f["paciente"] or f["caso"]].append(f)
    rng = random.Random(semilla)
    grupos: list[list[str]] = [[] for _ in range(pliegues)]
    for positivo in (True, False):
        pacientes = sorted(p for p, fs in por_paciente.items()
                           if any(f["aneurisma"] == "1" for f in fs) == positivo)
        rng.shuffle(pacientes)
        for i, p in enumerate(pacientes):
            grupos[i % pliegues].extend(f["caso"] for f in por_paciente[p])
    return [sorted(g) for g in grupos]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--pliegues", type=int, default=5)
    ap.add_argument("--semilla", type=int, default=7)
    ap.add_argument("--max-espaciado-mm", type=float, default=2.0)
    ap.add_argument("--con-sin-hueso", action="store_true")
    args = ap.parse_args(argv)

    with args.manifest.open(newline="", encoding="utf-8") as f:
        todas = list(csv.DictReader(f))
    filas = [f for f in todas if entra(f, args.max_espaciado_mm, args.con_sin_hueso)]
    grupos = repartir(filas, args.pliegues, args.semilla)
    particiones = [{"train": sorted(c for j, g in enumerate(grupos) if j != i for c in g), "val": g}
                   for i, g in enumerate(grupos)]
    args.salida.write_text(json.dumps(particiones, indent=1) + "\n", encoding="utf-8")

    positivos = {f["caso"] for f in filas if f["aneurisma"] == "1"}
    print(f"{len(todas)} series en el manifest · {len(filas)} entran ({len(positivos)} con aneurisma)")
    for i, g in enumerate(grupos):
        print(f"  pliegue {i}: {len(g)} de validación, {sum(c in positivos for c in g)} con aneurisma")
    return 0


if __name__ == "__main__":
    sys.exit(main())
