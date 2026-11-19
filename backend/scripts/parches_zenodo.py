"""Parches de 24³ vóxeles de los candidatos de los 172 de Zenodo (P7 del plan).

Material para entrenar el verificador de candidatos (O7/A2), al estilo de
Kuwabara 2023: el detector propone puntos y una red pequeña (ResNet-18) dice
si cada parche alrededor del punto es aneurisma o no. Aquí solo se recortan y
se etiquetan los parches; entrenar va en otra máquina.

No vuelve a segmentar ni a detectar: lee los JSON por estudio de una pasada de
`eval_zenodo.py` (los mismos `--runs` que `froc_zenodo.py`: la última carpeta
que tenga un estudio manda) y, de cada estudio, el DICOM nativo. Los volúmenes
que guardan las pasadas están reducidos (~1 mm); a esa escala un aneurisma de
3 mm son tres vóxeles, así que se recorta del DICOM entero.

Por cada punto se guardan dos parches de 24³ remuestreados a vóxel isótropo
(trilineal, fuera del volumen = −1024 HU):
  · 0,5 mm → 12 mm de lado, el detalle (lo que usa Kuwabara en TOF);
  · 1,0 mm → 24 mm de lado, el contexto (un saco grande no cabe en 12 mm).
El punto queda en el centro exacto del cubo (entre los vóxeles 11 y 12).

Puntos:
  · cada candidato de la lista larga del detector (40 por estudio), con las
    dos reglas de acierto de `froc_zenodo.py` (la del banco y la de los
    artículos), la distancia a la lesión más cercana y las variables del
    candidato;
  · cada lesión anotada, centrada en el centroide de su STL (`tipo=lesion`),
    para tener positivos también de las que el detector no encuentra.

Salida (`--out`):
  · `estudios/<id>.npz`: lo de cada estudio; se puede cortar y relanzar, los
    hechos no se repiten (salvo `--redo`);
  · al terminar (o con `--unir`): `parches_zenodo_24.npz` (`p050`, `p100`:
    int16 de forma (N, 24, 24, 24), ejes z, y, x del marco de la malla),
    `parches_zenodo_24.csv` (una fila por parche, misma posición que en los
    arrays) y `LEEME.json` (qué es cada columna, pliegues y recuentos).
  · Los pliegues (`pliegue` 0–4) van por PACIENTE y estratificados por
    enfermo/control: los parches de un estudio nunca se reparten entre
    entrenamiento y prueba.

Uso (desde backend/, con el venv):
    .venv/Scripts/python.exe scripts/parches_zenodo.py \\
        --runs data/zenodo_eval_dos_escalas_rapido data/zenodo_eval_craneo_flojo \\
        --out data/zenodo_parches
"""
from __future__ import annotations

import argparse
import csv
import gc
import io
import json
import math
import random
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.froc_zenodo import cargar, regla_estricta, regla_oficial

TAMANO = 24
ESCALAS_MM = (0.5, 1.0)
AIRE_HU = -1024.0
N_PLIEGUES = 5
SEMILLA_PLIEGUES = 7
NOMBRE = "parches_zenodo_24"
DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "Archivos DICOM"

COLUMNAS = [
    ("study", "estudio de Zenodo"),
    ("pliegue", "0–4, por paciente y estratificado por enfermo/control"),
    ("estudio_con_aneurisma", "1 si el estudio tiene alguna lesión anotada"),
    ("tipo", "candidato (lista larga del detector) o lesion (centroide del STL)"),
    ("rank", "puesto del candidato en la lista larga (1–40); vacío en tipo=lesion"),
    ("x_mm", "centro del parche, marco de la malla (índice × espaciado del DICOM)"),
    ("y_mm", ""), ("z_mm", ""),
    ("es_aneurisma_banco", "1 si el candidato es una lesión con la regla del banco: ≤ máx(5 mm, Ø del candidato)"),
    ("es_aneurisma_articulos", "1 si lo es con la de los artículos: ≤ máx(5 mm, radio de la lesión + 2 mm)"),
    ("dist_lesion_mm", "distancia a la lesión más cercana; vacío si el estudio no tiene"),
    ("lesion", "STL de la lesión más cercana (o la del parche si tipo=lesion)"),
    ("lesion_diametro_mm", "Ø de esa lesión (esfera equivalente del STL)"),
    ("lesion_tamano", "miliary / middle / large / giant (Metadata.csv)"),
    ("diametro_mm", "Ø del candidato (o de la lesión si tipo=lesion)"),
    ("confianza", "confianza del detector"),
    ("canales", "canales que lo proponen, separados por +"),
    ("puesto_curvatura", "puesto en cada canal"), ("puesto_calibre", ""), ("puesto_cociente", ""),
    ("en_borde", "1 si el detector lo marcó en el borde de la malla"),
    ("region_radio_mm", "variables de la región de curvatura del candidato"),
    ("region_pgf", ""), ("region_compacidad", ""), ("region_esfericidad", ""), ("region_puntuacion", ""),
    ("fuera_050", "fracción del parche de 0,5 mm que cae fuera del volumen (rellena con −1024)"),
    ("fuera_100", "lo mismo para el de 1,0 mm"),
    ("espaciado_nativo_mm", "mayor espaciado del DICOM (z, y, x)"),
    ("grosor_corte_mm", "Metadata.csv"),
]
CAMPOS = [c for c, _ in COLUMNAS]


# ── Recorte ────────────────────────────────────────────────────────────────── #

def desplazamientos(paso_mm: float, n: int = TAMANO) -> np.ndarray:
    """Posiciones (mm) de los vóxeles del parche respecto a su centro."""
    return (np.arange(n, dtype=np.float64) - (n - 1) / 2.0) * paso_mm


def recortar(volumen: np.ndarray, spacing_zyx, centro_xyz, paso_mm: float,
             n: int = TAMANO, origen_xyz=(0.0, 0.0, 0.0)) -> tuple[np.ndarray, float]:
    """Parche isótropo (n, n, n) en ejes z, y, x alrededor de un punto de malla.

    El volumen es (z, y, x) y el punto (x, y, z) está en el marco de la malla:
    índice × espaciado + *origen_xyz*, como en `services.hu_floor.hu_stats`.
    Trilineal; lo que cae fuera vale −1024. Devuelve (int16, fracción fuera).
    """
    from scipy.ndimage import map_coordinates

    sz, sy, sx = (float(v) for v in spacing_zyx)
    x, y, z = (float(p) - float(o) for p, o in zip(centro_xyz, origen_xyz))
    d = desplazamientos(paso_mm, n)
    iz = (z + d) / sz
    iy = (y + d) / sy
    ix = (x + d) / sx
    # Solo el trozo que hace falta: map_coordinates sobre el volumen entero
    # convertiría a float64 600×512×512 vóxeles por cada parche.
    lo = [max(0, int(math.floor(a.min())) - 1) for a in (iz, iy, ix)]
    hi = [min(s, int(math.ceil(a.max())) + 2) for a, s in zip((iz, iy, ix), volumen.shape)]
    fuera_z = (iz < 0) | (iz > volumen.shape[0] - 1)
    fuera_y = (iy < 0) | (iy > volumen.shape[1] - 1)
    fuera_x = (ix < 0) | (ix > volumen.shape[2] - 1)
    fuera = (fuera_z[:, None, None] | fuera_y[None, :, None] | fuera_x[None, None, :])
    frac = float(fuera.mean())
    if any(h - l < 2 for l, h in zip(lo, hi)):
        return np.full((n, n, n), int(AIRE_HU), dtype=np.int16), 1.0
    sub = np.asarray(volumen[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]], dtype=np.float32)
    zz, yy, xx = np.meshgrid(iz - lo[0], iy - lo[1], ix - lo[2], indexing="ij")
    vals = map_coordinates(sub, [zz, yy, xx], order=1, mode="constant", cval=AIRE_HU)
    vals[fuera] = AIRE_HU
    return np.clip(np.rint(vals), -32768, 32767).astype(np.int16), frac


# ── Etiquetas y filas ──────────────────────────────────────────────────────── #

def _f(v, nd=3):
    return "" if v is None else round(float(v), nd)


def lesion_mas_cercana(punto, lesiones: list[dict]) -> tuple[int | None, float | None]:
    if not lesiones:
        return None, None
    ds = [math.dist(punto, l["position"]) for l in lesiones]
    i = int(np.argmin(ds))
    return i, ds[i]


def filas_estudio(sid: str, rec: dict) -> list[dict]:
    """Una fila por punto (candidatos de la lista larga + lesiones), sin parches aún."""
    lesiones = rec.get("lesions") or []
    meta = rec.get("meta") or {}
    seg = rec.get("segment") or {}
    comun = {"study": sid, "estudio_con_aneurisma": int(bool(meta.get("has_ia"))),
             "espaciado_nativo_mm": _f(max(seg.get("spacing_mm") or [0]) or None),
             "grosor_corte_mm": _f(meta.get("slice_thickness_mm"))}
    filas = []
    for c in rec.get("long_list") or rec.get("candidates") or []:
        pos = [float(v) for v in c["position"]]
        i, d = lesion_mas_cercana(pos, lesiones)
        l = lesiones[i] if i is not None else None
        ranks = c.get("ranks") or {}
        reg = c.get("region") or {}
        filas.append({**comun, "tipo": "candidato", "rank": int(c["rank"]),
                      "x_mm": round(pos[0], 3), "y_mm": round(pos[1], 3), "z_mm": round(pos[2], 3),
                      "es_aneurisma_banco": int(any(regla_oficial(x, c) for x in lesiones)),
                      "es_aneurisma_articulos": int(any(regla_estricta(x, c) for x in lesiones)),
                      "dist_lesion_mm": _f(d, 2), "lesion": l["file"] if l else "",
                      "lesion_diametro_mm": _f(l["diameter_mm"] if l else None, 2),
                      "lesion_tamano": (l.get("size_class") or "") if l else "",
                      "diametro_mm": _f(c.get("diameter_mm"), 2), "confianza": _f(c.get("confidence")),
                      "canales": "+".join(c.get("channels") or []),
                      "puesto_curvatura": ranks.get("curvatura", ""), "puesto_calibre": ranks.get("calibre", ""),
                      "puesto_cociente": ranks.get("cociente", ""),
                      "en_borde": int(bool(c.get("on_border"))),
                      "region_radio_mm": _f(reg.get("radius_mm")), "region_pgf": _f(reg.get("pgf")),
                      "region_compacidad": _f(reg.get("compactness")),
                      "region_esfericidad": _f(reg.get("sphericity")),
                      "region_puntuacion": _f(reg.get("score"))})
    for l in lesiones:
        pos = [float(v) for v in l["position"]]
        filas.append({**comun, "tipo": "lesion", "rank": "",
                      "x_mm": round(pos[0], 3), "y_mm": round(pos[1], 3), "z_mm": round(pos[2], 3),
                      "es_aneurisma_banco": 1, "es_aneurisma_articulos": 1, "dist_lesion_mm": 0.0,
                      "lesion": l["file"], "lesion_diametro_mm": _f(l["diameter_mm"], 2),
                      "lesion_tamano": l.get("size_class") or "", "diametro_mm": _f(l["diameter_mm"], 2)})
    return filas


def pliegues(con_aneurisma: dict[str, bool], k: int = N_PLIEGUES,
             semilla: int = SEMILLA_PLIEGUES) -> dict[str, int]:
    """Pliegue de cada estudio: enfermos y controles barajados y repartidos por turno."""
    rng = random.Random(semilla)
    out: dict[str, int] = {}
    for grupo in (True, False):
        ids = sorted(s for s, v in con_aneurisma.items() if bool(v) == grupo)
        rng.shuffle(ids)
        for j, s in enumerate(ids):
            out[s] = j % k
    return out


# ── Por estudio ────────────────────────────────────────────────────────────── #

def parches_de(volumen, spacing_zyx, filas: list[dict]) -> dict[str, np.ndarray]:
    """Recorta las dos escalas de cada fila (rellena `fuera_*` en la fila)."""
    arrays = {}
    for paso in ESCALAS_MM:
        clave = f"p{int(round(paso * 100)):03d}"
        cubo = np.empty((len(filas), TAMANO, TAMANO, TAMANO), dtype=np.int16)
        for i, f in enumerate(filas):
            cubo[i], frac = recortar(volumen, spacing_zyx, (f["x_mm"], f["y_mm"], f["z_mm"]), paso)
            f[f"fuera_{clave[1:]}"] = round(frac, 4)
        arrays[clave] = cubo
    return arrays


def guardar_estudio(ruta: Path, filas: list[dict], arrays: dict[str, np.ndarray]) -> None:
    tmp = ruta.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, filas=np.array(json.dumps(filas, ensure_ascii=False)), **arrays)
    tmp.replace(ruta)


def cargar_estudio(ruta: Path) -> tuple[list[dict], dict[str, np.ndarray]]:
    with np.load(ruta) as z:
        filas = json.loads(str(z["filas"]))
        arrays = {k: z[k] for k in z.files if k != "filas"}
    return filas, arrays


def procesar(sid: str, rec: dict, dataset: Path, carpeta: Path, log=print) -> int:
    from scripts.eval_zenodo import load_study

    t0 = time.perf_counter()
    filas = filas_estudio(sid, rec)
    dcm, _ = load_study(dataset, sid)
    arrays = parches_de(dcm.volume, dcm.spacing, filas)
    shape, spacing = dcm.volume.shape, dcm.spacing
    del dcm
    guardar_estudio(carpeta / f"{sid}.npz", filas, arrays)
    n_pos = sum(f["es_aneurisma_banco"] for f in filas if f["tipo"] == "candidato")
    log(f"[{sid}] {len(filas)} parches ({n_pos} candidatos acertados) · {tuple(shape)} "
        f"a {tuple(round(float(s), 3) for s in spacing)} mm · {time.perf_counter() - t0:.1f} s")
    return len(filas)


# ── Unir ───────────────────────────────────────────────────────────────────── #

def unir(carpeta: Path, out: Path, estudios: dict[str, dict], log=print) -> dict:
    """Junta los estudios hechos en un npz, un CSV y el LEEME."""
    hechos = sorted(p.stem for p in (carpeta).glob("[0-9]*.npz") if not p.name.endswith(".tmp.npz"))
    plg = pliegues({s: bool((estudios.get(s) or {}).get("meta", {}).get("has_ia")) for s in hechos})
    todas: list[dict] = []
    trozos: dict[str, list[np.ndarray]] = {}
    for sid in hechos:
        filas, arrays = cargar_estudio(carpeta / f"{sid}.npz")
        for f in filas:
            f["pliegue"] = plg[sid]
        todas.extend(filas)
        for k, a in arrays.items():
            trozos.setdefault(k, []).append(a)
    arrays = {k: np.concatenate(v) if v else np.empty((0, TAMANO, TAMANO, TAMANO), np.int16)
              for k, v in trozos.items()}
    np.savez_compressed(out / f"{NOMBRE}.npz", **arrays)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CAMPOS, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for f in todas:
        w.writerow({c: f.get(c, "") for c in CAMPOS})
    (out / f"{NOMBRE}.csv").write_text(buf.getvalue(), encoding="utf-8")

    cand = [f for f in todas if f["tipo"] == "candidato"]
    resumen = {
        "estudios": len(hechos),
        "estudios_con_aneurisma": sum(1 for s in hechos if (estudios.get(s) or {}).get("meta", {}).get("has_ia")),
        "parches": len(todas),
        "candidatos": len(cand),
        "candidatos_aneurisma_banco": sum(f["es_aneurisma_banco"] for f in cand),
        "candidatos_aneurisma_articulos": sum(f["es_aneurisma_articulos"] for f in cand),
        "lesiones": sum(1 for f in todas if f["tipo"] == "lesion"),
        "por_pliegue": {str(k): {"estudios": sum(1 for s in hechos if plg[s] == k),
                                 "candidatos_aneurisma_banco": sum(f["es_aneurisma_banco"] for f in cand
                                                                   if f["pliegue"] == k)}
                        for k in range(N_PLIEGUES)},
    }
    leeme = {
        "que_es": "Parches de 24³ vóxeles de los candidatos del detector de Prospective sobre los 172 "
                  "estudios de angio-TC de Zenodo 15697196 (CC-BY), para entrenar un verificador de "
                  "candidatos (Kuwabara 2023). Generado por backend/scripts/parches_zenodo.py.",
        "arrays": {f"p{int(round(p * 100)):03d}": f"int16 (N, 24, 24, 24), HU, vóxel isótropo de {p} mm "
                   f"({p * TAMANO:g} mm de lado), ejes z, y, x; trilineal; fuera del volumen = −1024"
                   for p in ESCALAS_MM},
        "filas": "la fila i del CSV es el parche i de cada array",
        "columnas": {c: d for c, d in COLUMNAS if d},
        "pliegues": f"{N_PLIEGUES} por paciente, estratificados por enfermo/control, semilla {SEMILLA_PLIEGUES}",
        "aviso": "Para medir el verificador como reordenador de la lista, evaluar solo filas tipo=candidato; "
                 "las filas tipo=lesion son positivos extra para entrenar. Como etiqueta, mejor "
                 "es_aneurisma_articulos: con la regla del banco un candidato grande a 8 mm de un saco "
                 "cuenta como acierto aunque el saco quede en el borde del cubo o fuera de él. "
                 "Con la de los artículos los sacos gigantes aportan muchos candidatos positivos (hasta 15 "
                 "por lesión): pesar por lesión, no por parche, o los gigantes dominan el entrenamiento.",
        "resumen": resumen,
    }
    (out / "LEEME.json").write_text(json.dumps(leeme, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"unidos {len(hechos)} estudios: {len(todas)} parches → {out / (NOMBRE + '.npz')}")
    return resumen


# ── Main ───────────────────────────────────────────────────────────────────── #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=Path, nargs="+", required=True)
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--studies", nargs="*")
    ap.add_argument("--limit", type=int, default=0, help="parar tras N estudios nuevos")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--unir", action="store_true", help="solo juntar lo ya hecho")
    a = ap.parse_args(argv)

    estudios = {s: r for s, r in cargar(a.runs).items() if r.get("status", "ok") == "ok"}
    carpeta = a.out / "estudios"
    carpeta.mkdir(parents=True, exist_ok=True)
    ids = sorted(a.studies or estudios)
    if not a.unir:
        # Un estudio que falla queda anotado y no se reintenta en el relanzamiento (sí con --redo).
        ruta_fallos = carpeta / "fallos.json"
        fallos = {} if a.redo or not ruta_fallos.exists() else json.loads(ruta_fallos.read_text(encoding="utf-8"))
        hechos = 0
        for sid in ids:
            if sid not in estudios:
                print(f"[{sid}] sin registro en las pasadas")
                continue
            if sid in fallos or ((carpeta / f"{sid}.npz").exists() and not a.redo):
                continue
            try:
                procesar(sid, estudios[sid], a.dataset, carpeta)
            except Exception as e:  # un estudio malo no para la pasada
                print(f"[{sid}] FALLO: {type(e).__name__}: {e}")
                fallos[sid] = f"{type(e).__name__}: {e}"
                ruta_fallos.write_text(json.dumps(fallos, ensure_ascii=False, indent=2), encoding="utf-8")
            gc.collect()
            hechos += 1
            if a.limit and hechos >= a.limit:
                break
        pendientes = [s for s in ids if s in estudios and s not in fallos
                      and not (carpeta / f"{s}.npz").exists()]
        if pendientes and not a.studies:
            print(f"quedan {len(pendientes)} estudios; relanzar para seguir")
            return 3
    unir(carpeta, a.out, estudios)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
