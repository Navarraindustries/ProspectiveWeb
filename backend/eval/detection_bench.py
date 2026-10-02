# -*- coding: utf-8 -*-
"""Banco de pruebas de la detección (D4).

Mide, con métricas fijas, cómo de bien sale la lesión y cuántos falsos
positivos la acompañan, sobre Case 3 (el único estudio anotado) y seis vasos
sintéticos. Existe para que ningún ajuste del detector se mida solo contra
Case 3: con un único caso anotado cualquier umbral se sobreajusta, y los
sintéticos fijan los comportamientos que el diseño exige (un saco completo
pegado al borde es lesión, una isla suelta no, una Y sin saco no…).

Uso, desde ``backend/``::

    python -m eval.detection_bench                      # tabla
    python -m eval.detection_bench --no-vetoes --json eval/results/baseline.json
    python -m eval.detection_bench --only tubo_con_saco --only case3_native

La línea base (`eval/results/baseline.json`) se tomó antes de ningún veto y
está commiteada: los vetos posteriores no deben empeorar ninguna fila.
"""
from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

import vtk

from eval import synthetic
from eval.synthetic import Vec3

#: Dónde viven las sesiones del entorno de desarrollo. Variable de módulo para
#: que los tests puedan apuntarla a un directorio vacío.
SESSIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"

#: Un candidato «es» la lesión si su centro queda a menos de esto. 8 mm cubre
#: la dispersión entre canales (el centroide de una región de curvatura y el
#: pico de calibre del mismo saco no coinciden) sin llegar a la rama vecina.
LESION_HIT_MM = 8.0

#: Cuántos sitios pide el banco al consenso. La pantalla enseña 5, pero los
#: vetos se aplican ANTES del tope: hace falta margen para que, al descartar,
#: los aceptados sigan pudiendo llenar los 5 puestos.
BENCH_TOP = 30
#: Los que se enseñan: el tope de la pantalla cuenta aceptados.
SHOWN = 5

#: Lesión de Case 3 en coordenadas de malla (mm), confirmada por el usuario en
#: el tronco basilar. Ver `test_detector_case3.py` para su historia.
CASE3_LESION_MM: Vec3 = (62.1, 63.7, 62.9)

#: Por debajo de esto un `vessel_tree.vtp` no es una malla de Case 3 sino un
#: resto de algún test (las sesiones de fixtures se cuentan por miles).
_MIN_VTP_BYTES = 1_000_000


@dataclass
class BenchCase:
    name: str
    mesh: Callable[[], vtk.vtkPolyData] | Path
    lesion_mm: Vec3 | None
    modality: str = "XA"
    expect_rank_max: int | None = None     # None = sin lesión
    expect_fp_max: int = 1
    real: bool = False                      # Case 3: slow, se salta si falta


@dataclass
class BenchResult:
    name: str
    lesion_rank: int | None
    lesion_distance_mm: float | None
    false_positives: int
    rejected_true: int
    rejected_fp: int
    n_accepted: int
    n_rejected: int
    seconds: float


# ── Localizar Case 3 ─────────────────────────────────────────────────────── #

def _read_state(path: Path) -> dict[str, str]:
    """`state.txt` es `clave=valor` por línea. Se parsea a mano para no pasar
    por la API de sesiones, que trabaja con ids y no con carpetas."""
    out: dict[str, str] = {}
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            k, sep, v = line.partition("=")
            if sep:
                out[k.strip()] = v.strip()
    except OSError:
        pass
    return out


def find_case3_session(downsample_factor: int) -> Path | None:
    """La sesión de Case 3 a esa resolución, localizada por contenido.

    Nunca por id: la sesión de los tests antiguos desapareció y esos tests se
    saltaban en silencio. Se exige modalidad XA, el factor de submuestreo
    pedido y un `vessel_tree.vtp` de más de 1 MB; entre varias, la de malla
    más reciente. Se mira primero el tamaño del .vtp (un `stat`, barato) y
    solo entonces se lee `state.txt`: hay miles de sesiones de fixtures.
    """
    if not SESSIONS_DIR.is_dir():
        return None
    best: tuple[float, Path] | None = None
    for d in SESSIONS_DIR.iterdir():
        vtp = d / "meshes" / "vessel_tree.vtp"
        try:
            st = vtp.stat()
        except OSError:
            continue
        if st.st_size <= _MIN_VTP_BYTES:
            continue
        state = _read_state(d / "state.txt")
        if state.get("dicom.modality", "").upper() != "XA":
            continue
        if state.get("seg.downsample_factor") != str(downsample_factor):
            continue
        if best is None or st.st_mtime > best[0]:
            best = (st.st_mtime, d)
    return None if best is None else best[1]


# ── Casos ────────────────────────────────────────────────────────────────── #

def _con_lesion(gen: Callable[[], tuple[vtk.vtkPolyData, Vec3]]
                ) -> tuple[Callable[[], vtk.vtkPolyData], Vec3]:
    """El generador devuelve (malla, centro del saco); el caso guarda el
    centro y una función que solo construye la malla."""
    _, centro = gen()
    return (lambda: gen()[0]), tuple(float(v) for v in centro)


def synthetic_cases() -> list[BenchCase]:
    """Los seis sintéticos de `eval/synthetic.py` con sus expectativas:
    con saco, la lesión sale 1.ª; sin saco, como mucho un falso positivo."""
    casos: list[BenchCase] = []
    for name, gen in (("tubo_con_saco", synthetic.tubo_con_saco),
                      ("saco_en_borde", synthetic.saco_en_borde),
                      ("bifurcacion_con_saco_apical", synthetic.bifurcacion_con_saco_apical)):
        mesh, lesion = _con_lesion(gen)
        # El diseño solo exige que la lesión salga 1.ª: el resto de la lista
        # no tiene umbral propio (la comparación con la línea base, sí).
        casos.append(BenchCase(name, mesh, lesion, expect_rank_max=1,
                               expect_fp_max=SHOWN))
    for name, gen in (("bifurcacion_sin_saco", synthetic.bifurcacion_sin_saco),
                      ("tubo_curvo_sin_saco", synthetic.tubo_curvo_sin_saco),
                      ("tubo_mas_isla", synthetic.tubo_mas_isla)):
        casos.append(BenchCase(name, gen, None, expect_fp_max=1))
    return casos


#: Umbral de puesto de cada fila real. El diseño pide nativa ≤ 2 y media ≤ 3;
#: si la línea base no lo cumple, la fila se fija al valor medido y se anota en
#: el README («Banco de detección»): los vetos no deben empeorarlo.
_REAL_ROWS = (("case3_native", 1, 2), ("case3_half", 2, 3))


def real_cases() -> list[BenchCase]:
    """Case 3 a resolución nativa y a media, las que existan en disco.

    La media no se genera aquí: tarda minutos y necesita el volumen. Si
    alguien segmenta Case 3 con `downsample_factor=2`, entra sola.
    """
    casos: list[BenchCase] = []
    for name, factor, rank_max in _REAL_ROWS:
        s = find_case3_session(factor)
        if s is not None:
            casos.append(BenchCase(name, s / "meshes" / "vessel_tree.vtp",
                                   CASE3_LESION_MM, expect_rank_max=rank_max,
                                   real=True))
    return casos


# ── Ejecución ────────────────────────────────────────────────────────────── #

def _build_mesh(case: BenchCase) -> vtk.vtkPolyData:
    if isinstance(case.mesh, Path):
        from services.mesh_components import keep_main_tree
        from services.segmentation import read_vtp
        return keep_main_tree(read_vtp(case.mesh)).poly
    # Los sintéticos van tal cual: `tubo_mas_isla` existe precisamente para
    # que la isla llegue a la detección y la tenga que descartar un veto.
    return case.mesh()


def _veto_fn(vetoes: bool):
    """`candidate_vetoes.evaluate` si se piden vetos y el módulo existe.

    Hasta la Task 4 de D4 el módulo no existe y el banco mide sin vetos; el
    parámetro se acepta desde ya para que la línea base y las medidas
    posteriores salgan del mismo código.
    """
    if not vetoes:
        return None
    try:
        from services.candidate_vetoes import evaluate
    except ModuleNotFoundError as exc:
        # Solo la ausencia del propio módulo significa «sin vetos». Si falla
        # un import DENTRO de él, callarlo mediría sin vetos sin decirlo.
        if exc.name != "services.candidate_vetoes":
            raise
        return None
    return evaluate


def _dist(a, b) -> float:
    return math.dist(tuple(a), tuple(b))


def run_case(case: BenchCase, *, vetoes: bool = True) -> BenchResult:
    """Detecta, aplica los vetos (si hay), corta a 5 aceptados y mide.

    - `lesion_rank`: puesto 1-based del primer aceptado a < `LESION_HIT_MM`.
    - `lesion_distance_mm`: al candidato más cercano, aceptado o descartado.
    - `false_positives`: aceptados a ≥ `LESION_HIT_MM` (todos sin lesión).
    - `rejected_true`: 1 si un descartado era la lesión y ningún aceptado lo
      es — el fallo grave que el banco no tolera.
    - `rejected_fp`: los demás descartados.
    """
    from routers.detect import _detect_hits, _detector_for_modality

    t0 = time.perf_counter()
    poly = _build_mesh(case)
    hits, _ = _detect_hits(poly, case.modality,
                           _detector_for_modality(case.modality), top=BENCH_TOP)

    evaluate = _veto_fn(vetoes)
    accepted, rejected = [], []
    for h in hits:
        veto = None
        if evaluate is not None:
            from services.aneurysm_consensus import hit_patch
            patch, kind = hit_patch(poly, h)
            veto = evaluate(poly, h, patch, kind)
        (rejected if veto is not None else accepted).append(h)
    shown = accepted[:SHOWN]
    seconds = round(time.perf_counter() - t0, 2)

    if case.lesion_mm is None:
        return BenchResult(case.name, None, None, len(shown), 0, len(rejected),
                           len(shown), len(rejected), seconds)

    d_shown = [_dist(h.position, case.lesion_mm) for h in shown]
    d_rej = [_dist(h.position, case.lesion_mm) for h in rejected]
    rank = next((i for i, d in enumerate(d_shown, start=1) if d < LESION_HIT_MM), None)
    todas = d_shown + d_rej
    return BenchResult(
        name=case.name,
        lesion_rank=rank,
        lesion_distance_mm=round(min(todas), 2) if todas else None,
        false_positives=sum(d >= LESION_HIT_MM for d in d_shown),
        rejected_true=int(rank is None and any(d < LESION_HIT_MM for d in d_rej)),
        rejected_fp=sum(d >= LESION_HIT_MM for d in d_rej),
        n_accepted=len(shown),
        n_rejected=len(rejected),
        seconds=seconds,
    )


def run_bench(cases: Iterable[BenchCase], *, vetoes: bool = True) -> list[BenchResult]:
    return [run_case(c, vetoes=vetoes) for c in cases]


def to_json(results: list[BenchResult], *, vetoes: bool | None = None) -> dict:
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "vetoes": vetoes,
        "lesion_hit_mm": LESION_HIT_MM,
        "results": [asdict(r) for r in results],
    }


_COLS = ("name", "lesion_rank", "lesion_distance_mm", "false_positives",
         "rejected_true", "rejected_fp", "n_accepted", "n_rejected", "seconds")


def print_table(results: list[BenchResult]) -> None:
    filas = [["-" if getattr(r, c) is None else str(getattr(r, c)) for c in _COLS]
             for r in results]
    anchos = [max([len(c)] + [len(f[i]) for f in filas]) for i, c in enumerate(_COLS)]
    print("  ".join(c.ljust(a) for c, a in zip(_COLS, anchos)))
    for f in filas:
        print("  ".join(v.ljust(a) for v, a in zip(f, anchos)))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Banco de pruebas de la detección")
    ap.add_argument("--json", type=Path, help="escribe los resultados en este fichero")
    ap.add_argument("--no-vetoes", action="store_true", help="mide sin vetos (línea base)")
    ap.add_argument("--only", action="append", metavar="NAME",
                    help="solo este caso (repetible)")
    args = ap.parse_args(argv)

    cases = synthetic_cases() + real_cases()
    if args.only:
        cases = [c for c in cases if c.name in set(args.only)]
        if not cases:
            ap.error(f"ningún caso se llama {args.only}")
    # Lo que de verdad se aplicó: con el módulo de vetos ausente, sin vetos.
    applied = _veto_fn(not args.no_vetoes) is not None
    results = run_bench(cases, vetoes=not args.no_vetoes)
    print_table(results)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(to_json(results, vetoes=applied), indent=2,
                                        ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
