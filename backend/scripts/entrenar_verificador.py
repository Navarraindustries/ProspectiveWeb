"""Entrenar el verificador de candidatos con los parches de la P7 (O7/A2, Kuwabara 2023).

Para el PC de la oficina o AWS. Solo necesita `torch` y `numpy` (los trae
TotalSegmentator) y la carpeta de `scripts/parches_zenodo.py`
(`parches_zenodo_24.npz` + `.csv`). No toca la base de datos ni el DICOM.

Qué hace:
  · una ResNet-18 3D pequeña (bloques 2-2-2-2, 16→128 canales) que mira los
    dos cubos de cada candidato a la vez (0,5 mm y 1,0 mm como dos canales) y
    da una puntuación de «aneurisma»;
  · validación cruzada por paciente con los 5 pliegues del CSV: cada
    candidato se puntúa con el modelo que NO lo vio (puntuación fuera de
    pliegue), así la cifra final es honesta;
  · entrena con los candidatos y los parches de lesión (`tipo=lesion`), con
    giros de 90°, volteos y desplazamientos de ±2 vóxeles; cada lesión pesa lo
    mismo (un saco gigante con 15 candidatos no cuenta 15 veces) y los
    positivos salen en ~1 de cada 4 muestras;
  · evalúa solo los candidatos (lo que vería el usuario): AUC y, sobre todo,
    qué pasa con la lista si se reordena por la puntuación o si se quitan los
    candidatos por debajo de un umbral (lesiones encontradas y FP por estudio
    entre los K primeros, como `froc_zenodo.py`).

Salida (`--salida`): `pliegue_<k>.pt` y `pliegue_<k>.csv` (se puede cortar y
relanzar: los pliegues hechos no se repiten), `puntuaciones.csv` (todas las
puntuaciones fuera de pliegue), `resumen.json` (lo que hay que traer de
vuelta) y, con `--final`, `verificador_final.pt` entrenado con todo.

Uso:
    python backend/scripts/entrenar_verificador.py --datos kit/parches --salida resultados_o7
    python backend/scripts/entrenar_verificador.py --datos kit/parches --salida prueba --epocas 1 --limite 20
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

NOMBRE = "parches_zenodo_24"
HU_MIN, HU_MAX = -200.0, 800.0
CORTES = (1, 3, 5, 10)
FRACCION_POSITIVOS = 0.25
FUERA_MAX = 0.25


# ── Datos ──────────────────────────────────────────────────────────────────── #

def leer_filas(carpeta: Path) -> list[dict]:
    with open(carpeta / f"{NOMBRE}.csv", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def etiqueta(fila: dict, regla: str) -> int:
    return int(fila[f"es_aneurisma_{regla}"] or 0)


def normalizar(cubos: np.ndarray) -> np.ndarray:
    """HU → aprox. [−1, 1] (recorte a [−200, 800])."""
    x = np.clip(cubos.astype(np.float32), HU_MIN, HU_MAX)
    return ((x - (HU_MIN + HU_MAX) / 2) / ((HU_MAX - HU_MIN) / 2)).astype(np.float16)


def cargar(carpeta: Path, limite: int = 0) -> tuple[list[dict], np.ndarray]:
    """Filas del CSV y los parches como (N, 2, 24, 24, 24) float16 normalizados."""
    filas = leer_filas(carpeta)
    with np.load(carpeta / f"{NOMBRE}.npz") as z:
        p050, p100 = z["p050"], z["p100"]
    if len(p050) != len(filas):
        raise ValueError(f"el CSV tiene {len(filas)} filas y el npz {len(p050)} parches")
    idx = np.arange(len(filas))
    if limite:
        # Prueba rápida: los primeros N estudios de cada pliegue.
        por_pliegue: dict[str, list[str]] = defaultdict(list)
        for f in filas:
            if f["study"] not in por_pliegue[f["pliegue"]]:
                por_pliegue[f["pliegue"]].append(f["study"])
        elegidos = {s for v in por_pliegue.values() for s in v[:limite]}
        idx = np.array([i for i, f in enumerate(filas) if f["study"] in elegidos])
    x = np.stack([normalizar(p050[idx]), normalizar(p100[idx])], axis=1)
    return [filas[i] for i in idx], x


def pesos_muestreo(filas: list[dict], regla: str) -> np.ndarray:
    """Cada lesión pesa lo mismo; los positivos suman FRACCION_POSITIVOS del total."""
    pos = [i for i, f in enumerate(filas) if etiqueta(f, regla)]
    neg = [i for i, f in enumerate(filas) if not etiqueta(f, regla)]
    w = np.zeros(len(filas), dtype=np.float64)
    if neg:
        w[neg] = (1.0 - FRACCION_POSITIVOS) / len(neg)
    if pos:
        grupos: dict[tuple, list[int]] = defaultdict(list)
        for i in pos:
            grupos[(filas[i]["study"], filas[i]["lesion"])].append(i)
        for ids in grupos.values():
            w[ids] = FRACCION_POSITIVOS / len(grupos) / len(ids)
    return w / w.sum()


# ── Métricas (solo numpy) ──────────────────────────────────────────────────── #

def auc(y: np.ndarray, s: np.ndarray) -> float | None:
    y = np.asarray(y).astype(bool)
    if y.all() or not y.any():
        return None
    orden = np.argsort(s, kind="mergesort")
    rangos = np.empty(len(s))
    rangos[orden] = np.arange(1, len(s) + 1)
    # empates: rango medio
    s_ord = np.asarray(s)[orden]
    i = 0
    while i < len(s_ord):
        j = i
        while j + 1 < len(s_ord) and s_ord[j + 1] == s_ord[i]:
            j += 1
        if j > i:
            rangos[orden[i:j + 1]] = (i + j + 2) / 2.0
        i = j + 1
    n1, n0 = y.sum(), (~y).sum()
    return float((rangos[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def lista(filas: list[dict], regla: str, clave=None, umbral: float | None = None) -> dict:
    """Lesiones y FP/estudio entre los K primeros de cada estudio.

    *clave*: cómo se ordena (por defecto el puesto del detector). *umbral*:
    quitar antes los candidatos con puntuación por debajo. Una lesión cuenta
    si algún candidato positivo entre los K la tiene como lesión más cercana.
    """
    por_estudio: dict[str, list[dict]] = defaultdict(list)
    for f in filas:
        por_estudio[f["study"]].append(f)
    pasa = (lambda f: True) if umbral is None else (lambda f: f["score"] >= umbral)
    orden = clave or (lambda f: int(f["rank"]))
    out: dict = {}
    for k in CORTES:
        vistas, fp = set(), 0
        for sid, fs in por_estudio.items():
            for f in sorted(filter(pasa, fs), key=orden)[:k]:
                if etiqueta(f, regla):
                    vistas.add((sid, f["lesion"]))
                else:
                    fp += 1
        out[str(k)] = {"lesiones": len(vistas), "fp_por_estudio": round(fp / max(1, len(por_estudio)), 3)}
    controles = [fs for fs in por_estudio.values() if fs[0]["estudio_con_aneurisma"] == "0"]
    out["n_controles"] = len(controles)
    out["controles_sin_ningun_candidato"] = sum(1 for fs in controles if not any(map(pasa, fs)))
    out["n_lesiones_alcanzables"] = len({(f["study"], f["lesion"]) for f in filas if etiqueta(f, regla)})
    return out


def evaluar(filas: list[dict], regla: str) -> dict:
    """Las cifras que hay que traer: AUC, lista reordenada y umbrales."""
    y = np.array([etiqueta(f, regla) for f in filas])
    s = np.array([f["score"] for f in filas])
    res = {"candidatos": len(filas), "positivos": int(y.sum()), "auc": auc(y, s),
           "auc_por_pliegue": {}, "detector": lista(filas, regla),
           "reordenada": lista(filas, regla, clave=lambda f: -f["score"]), "umbrales": []}
    for p in sorted({f["pliegue"] for f in filas}):
        sel = [f for f in filas if f["pliegue"] == p]
        res["auc_por_pliegue"][p] = auc(np.array([etiqueta(f, regla) for f in sel]),
                                        np.array([f["score"] for f in sel]))
    # Umbrales que conservan el 100 / 95 / 90 / 80 % de las lesiones alcanzables (entre los 40).
    mejores: dict[tuple, float] = {}
    for f in filas:
        if etiqueta(f, regla):
            c = (f["study"], f["lesion"])
            mejores[c] = max(mejores.get(c, -math.inf), f["score"])
    vals = sorted(mejores.values(), reverse=True)
    for frac in (1.0, 0.95, 0.9, 0.8):
        if not vals:
            break
        t = vals[max(0, math.ceil(frac * len(vals)) - 1)]
        res["umbrales"].append({"conserva": frac, "umbral": round(float(t), 4),
                                "reordenada": lista(filas, regla, clave=lambda f: -f["score"], umbral=t),
                                "detector": lista(filas, regla, umbral=t)})
    return res


# ── Modelo ─────────────────────────────────────────────────────────────────── #

def construir_modelo(canales=(16, 32, 64, 128)):
    import torch.nn as nn

    class Bloque(nn.Module):
        def __init__(self, cin, cout, paso):
            super().__init__()
            self.a = nn.Sequential(nn.Conv3d(cin, cout, 3, paso, 1, bias=False), nn.BatchNorm3d(cout),
                                   nn.ReLU(inplace=True), nn.Conv3d(cout, cout, 3, 1, 1, bias=False),
                                   nn.BatchNorm3d(cout))
            self.atajo = (nn.Identity() if paso == 1 and cin == cout else
                          nn.Sequential(nn.Conv3d(cin, cout, 1, paso, bias=False), nn.BatchNorm3d(cout)))
            self.relu = nn.ReLU(inplace=True)

        def forward(self, x):
            return self.relu(self.a(x) + self.atajo(x))

    capas = [nn.Conv3d(2, canales[0], 3, 1, 1, bias=False), nn.BatchNorm3d(canales[0]), nn.ReLU(inplace=True)]
    cin = canales[0]
    for j, c in enumerate(canales):
        # 24 → 12 → 6 → 3 → 3: reducir ya en el primer bloque. Con el primero a
        # 24³ cada paso de 64 cubos costaba ~8 veces más y una CPU no llegaba.
        paso = 2 if j < 3 else 1
        capas += [Bloque(cin, c, paso), Bloque(c, c, 1)]
        cin = c
    capas += [nn.AdaptiveAvgPool3d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(cin, 1)]
    return nn.Sequential(*capas)


def aumentar(x, gen):
    """Volteos, permutación de ejes (giros de 90°) y desplazamiento de ±2 vóxeles."""
    import torch
    for eje in (2, 3, 4):
        if torch.rand(1, generator=gen).item() < 0.5:
            x = x.flip(eje)
    perm = torch.randperm(3, generator=gen).tolist()
    x = x.permute(0, 1, *[p + 2 for p in perm])
    d = torch.randint(-2, 3, (3,), generator=gen).tolist()
    x = torch.nn.functional.pad(x, (2, 2, 2, 2, 2, 2), mode="replicate")
    n = x.shape[-1] - 4
    return x[..., 2 + d[0]:2 + d[0] + n, 2 + d[1]:2 + d[1] + n, 2 + d[2]:2 + d[2] + n].contiguous()


def puntuar(modelo, x: np.ndarray, dispositivo, lote: int = 256) -> np.ndarray:
    """Media de la probabilidad sobre la imagen y sus 3 volteos."""
    import torch
    modelo.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(x), lote):
            b = torch.from_numpy(x[i:i + lote].astype(np.float32)).to(dispositivo)
            s = sum(torch.sigmoid(modelo(b.flip(e) if e else b)) for e in (None, 2, 3, 4)) / 4
            out.append(s.squeeze(1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros(0)


def entrenar(x: np.ndarray, y: np.ndarray, w: np.ndarray, epocas: int, lote: int, dispositivo,
             semilla: int, log=print):
    import torch
    torch.manual_seed(semilla)
    gen = torch.Generator().manual_seed(semilla)
    rng = np.random.default_rng(semilla)
    modelo = construir_modelo().to(dispositivo)
    opt = torch.optim.AdamW(modelo.parameters(), lr=2e-3, weight_decay=1e-4)
    pasos = max(1, len(x) // lote)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=epocas * pasos)
    perdida = torch.nn.BCEWithLogitsLoss()
    for ep in range(epocas):
        modelo.train()
        t0, total = time.perf_counter(), 0.0
        for _ in range(pasos):
            idx = rng.choice(len(x), size=lote, p=w)
            b = aumentar(torch.from_numpy(x[idx].astype(np.float32)), gen).to(dispositivo)
            t = torch.from_numpy(y[idx].astype(np.float32)).to(dispositivo)
            opt.zero_grad()
            l = perdida(modelo(b).squeeze(1), t)
            l.backward()
            opt.step()
            sched.step()
            total += l.item()
        log(f"    época {ep + 1}/{epocas}: pérdida {total / pasos:.4f} · {time.perf_counter() - t0:.0f} s", flush=True)
    return modelo


# ── Main ───────────────────────────────────────────────────────────────────── #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", type=Path, required=True, help="carpeta con parches_zenodo_24.npz y .csv")
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--regla", choices=["articulos", "banco"], default="articulos")
    ap.add_argument("--epocas", type=int, default=30)
    ap.add_argument("--lote", type=int, default=64)
    ap.add_argument("--pliegues", type=int, nargs="*", default=[0, 1, 2, 3, 4])
    ap.add_argument("--dispositivo", default="auto", help="auto, cpu o cuda")
    ap.add_argument("--hilos", type=int, default=0, help="hilos de CPU para torch (0 = los que haya)")
    ap.add_argument("--limite", type=int, default=0, help="prueba: solo N estudios por pliegue")
    ap.add_argument("--semilla", type=int, default=24)
    ap.add_argument("--final", action="store_true", help="al final, entrenar con todo y guardar el modelo")
    a = ap.parse_args(argv)

    import torch
    if a.hilos:
        torch.set_num_threads(a.hilos)
    disp = torch.device("cuda" if a.dispositivo == "auto" and torch.cuda.is_available()
                        else ("cpu" if a.dispositivo == "auto" else a.dispositivo))
    a.salida.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    filas, x = cargar(a.datos, a.limite)
    y = np.array([etiqueta(f, a.regla) for f in filas], dtype=np.int64)
    print(f"{len(filas)} parches de {len({f['study'] for f in filas})} estudios · {int(y.sum())} positivos "
          f"(regla {a.regla}) · {disp} · torch {torch.__version__}", flush=True)

    for k in a.pliegues:
        ruta_csv = a.salida / f"pliegue_{k}.csv"
        if ruta_csv.exists():
            print(f"pliegue {k}: ya hecho", flush=True)
            continue
        tr = np.array([i for i, f in enumerate(filas) if f["pliegue"] != str(k)
                       and float(f.get("fuera_100") or 0) <= FUERA_MAX])
        va = np.array([i for i, f in enumerate(filas) if f["pliegue"] == str(k) and f["tipo"] == "candidato"])
        if not len(tr) or not len(va):
            print(f"pliegue {k}: sin datos, se salta", flush=True)
            continue
        print(f"pliegue {k}: entrena con {len(tr)} ({int(y[tr].sum())} positivos), valida con {len(va)} candidatos",
              flush=True)
        modelo = entrenar(x[tr], y[tr], pesos_muestreo([filas[i] for i in tr], a.regla), a.epocas, a.lote,
                          disp, a.semilla + k)
        s = puntuar(modelo, x[va], disp)
        torch.save(modelo.state_dict(), a.salida / f"pliegue_{k}.pt")
        with open(ruta_csv, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["indice", "score"])
            for i, sc in zip(va, s):
                w.writerow([int(i), f"{float(sc):.6f}"])
        print(f"pliegue {k}: AUC {auc(y[va], s)}", flush=True)

    # Juntar las puntuaciones fuera de pliegue.
    puntuadas = []
    for k in a.pliegues:
        ruta_csv = a.salida / f"pliegue_{k}.csv"
        if not ruta_csv.exists():
            continue
        with open(ruta_csv, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                f = dict(filas[int(r["indice"])])
                f["score"] = float(r["score"])
                puntuadas.append(f)
    if not puntuadas:
        print("ninguna puntuación")
        return 1
    campos = ["study", "pliegue", "rank", "estudio_con_aneurisma", f"es_aneurisma_{a.regla}", "lesion",
              "lesion_diametro_mm", "diametro_mm", "score"]
    with open(a.salida / "puntuaciones.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        w.writerows(puntuadas)
    res = {"regla": a.regla, "epocas": a.epocas, "limite": a.limite, "dispositivo": str(disp),
           "torch": torch.__version__, "minutos": round((time.perf_counter() - t0) / 60, 1),
           **evaluar(puntuadas, a.regla)}
    (a.salida / "resumen.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nAUC fuera de pliegue: {res['auc']}")
    print(" K   detector (lesiones · FP/est)   reordenada (lesiones · FP/est)")
    for k in CORTES:
        d, r = res["detector"][str(k)], res["reordenada"][str(k)]
        print(f"{k:2d}   {d['lesiones']:4d} · {d['fp_por_estudio']:5.2f}             {r['lesiones']:4d} · {r['fp_por_estudio']:5.2f}")
    for u in res["umbrales"]:
        r = u["reordenada"]
        print(f"umbral que conserva el {100 * u['conserva']:.0f} % ({u['umbral']}): entre 5, {r['5']['lesiones']} lesiones "
              f"a {r['5']['fp_por_estudio']} FP/est; controles sin ningún candidato {r['controles_sin_ningun_candidato']}"
              f" de {r['n_controles']}")
    print(f"\n→ {a.salida / 'resumen.json'} (esto es lo que hay que traer)")

    if a.final:
        tr = np.array([i for i, f in enumerate(filas) if float(f.get("fuera_100") or 0) <= FUERA_MAX])
        print(f"modelo final con {len(tr)} parches", flush=True)
        modelo = entrenar(x[tr], y[tr], pesos_muestreo([filas[i] for i in tr], a.regla), a.epocas, a.lote,
                          disp, a.semilla + 99)
        torch.save(modelo.state_dict(), a.salida / "verificador_final.pt")
        print(f"→ {a.salida / 'verificador_final.pt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
