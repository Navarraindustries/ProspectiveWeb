"""Experimento tras la pasada completa: calibre y cociente encendidos en los
estudios cuya pieza mayor NO pasa la prueba de árbol.

En `zenodo_eval_full_p3` 132 de 172 estudios (126 de cabeza y cuello) no pasan
`looks_like_tree` (124 por volumen > 100 cm³, 8 por espesor > 3 mm) y se
detectan solo con curvatura: de sus 73 lesiones, 15 en lista y 5 entre 5,
frente a 28 y 18 de 49 en los 40 estudios «árbol». Antes de tocar el tope hay
que saber si encender los dos canales cambia los puestos en esos estudios o si
la causa es otra (el cuello entero compitiendo, la copia decimada a 40 000).

Mismo camino que `eval_zenodo.py`, sobre las mallas y volúmenes ya guardados
(`--meshes-from`), con los dos topes de `services.mesh_components` sin efecto
SOLO en este proceso. Nada cambia en producción. Los estudios con lesión van
primero, por si hay que cortar.

Resultado (2026-10-19, 132/132, informe §4.1): entre los 5 de 5 a 13 lesiones de 73,
en lista de 15 a 24, hueso en controles de 112 a 79 de 415. Aplicado: `consensus`
ya no apaga calibre y cociente por volumen ni espesor de la pieza mayor, así que
este script hoy reproduce la regla de producción sobre las mallas guardadas.

Uso (desde backend/):
    .venv/Scripts/python.exe scripts/exp_tree_gate.py --limit 6
    .venv/Scripts/python.exe scripts/exp_tree_gate.py --summary
    .venv/Scripts/python.exe scripts/zenodo_lesiones.py --out data/zenodo_eval_full_p3_tree
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import eval_zenodo

import services.mesh_components as mc

REF = Path(__file__).resolve().parents[1] / "data" / "zenodo_eval_full_p3"
OUT = REF.parent / "zenodo_eval_full_p3_tree"


def non_tree_studies(ref: Path) -> list[str]:
    """Estudios de la pasada de referencia que no pasan la prueba de árbol,
    los que tienen lesión primero y dentro de cada grupo por identificador."""
    rows: list[tuple[bool, str]] = []
    for p in sorted(ref.glob("*.json")):
        if p.name == "summary.json":
            continue
        r = json.loads(p.read_text(encoding="utf-8"))
        info = r.get("segment", {}).get("components_info") or {}
        if r.get("status") == "ok" and not info.get("looks_like_tree", True):
            rows.append((not r.get("has_ia"), r["study"]))
    return [s for _, s in sorted(rows)]


def disable_tree_gate() -> None:
    """Los dos topes que apagan calibre y cociente, sin efecto en este proceso."""
    mc.MAX_TREE_VOLUME_MM3 = float("inf")
    mc.MAX_TREE_THICKNESS_MM = float("inf")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--summary" in args:
        return eval_zenodo.main(["--summary", "--out", str(OUT)])
    disable_tree_gate()
    sids = non_tree_studies(REF)
    print(f"{len(sids)} estudios sin árbol en {REF.name}; topes de árbol sin efecto")
    return eval_zenodo.main(["--out", str(OUT), "--meshes-from", str(REF), "--no-reuse",
                             "--studies", *sids, *args])


if __name__ == "__main__":
    sys.exit(main())
