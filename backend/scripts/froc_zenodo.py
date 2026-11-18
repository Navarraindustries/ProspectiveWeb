"""Curva FROC y especificidad por paciente sobre los registros de `eval_zenodo.py`.

No vuelve a correr nada: lee los JSON por estudio que ya dejó una pasada
(`data/zenodo_eval_*/<id>.json`) y cuenta, para cada corte K de la lista
ordenada del detector (1…40), cuántas lesiones están entre los K primeros y
cuántos de esos K candidatos no son ninguna lesión (falsos positivos).

Dos reglas para decir que un candidato «es» una lesión:
  · la oficial del banco (`bench_detector.match_rank`): a ≤ max(5 mm, el
    diámetro del CANDIDATO) — con ella salen las cifras de los informes;
  · la estricta: a ≤ max(5 mm, el radio de la LESIÓN + 2 mm), como en los
    artículos (Kuwabara 2023, Vach 2024), donde manda la anotación y no el
    tamaño del candidato. Un candidato grande no se lleva una lesión vecina.

Por paciente: un estudio con aneurisma es verdadero positivo si alguna de sus
lesiones está entre los K; un control es verdadero negativo si no hay ningún
candidato entre los K. Como el detector siempre devuelve una lista, la
especificidad por paciente es 0 en cualquier K ≥ 1; además se mide si alguna
variable del candidato separa aciertos de falsos positivos (AUC), que es lo que
haría falta para un umbral por paciente.

Los intervalos son bootstrap por paciente (las lesiones de un mismo estudio
van juntas), 2 000 réplicas, percentiles 2,5–97,5.

Uso (desde backend/):
    .venv/Scripts/python.exe scripts/froc_zenodo.py \\
        --runs data/zenodo_eval_dos_escalas_rapido data/zenodo_eval_craneo_flojo \\
        --json data/froc_zenodo.json
Con varias carpetas, cada estudio se lee de la ÚLTIMA que lo tenga (así se
compone la referencia oficial: dos escalas + los 13 de cráneo flojo).
"""
from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

MIN_MATCH_MM = 5.0          # el mismo suelo que scripts/bench_detector.py
MARGEN_LESION_MM = 2.0
K_MAX = 40
CORTES = (1, 2, 3, 5, 10, 20, 40)
TAMANOS = (("< 5 mm", 0.0, 5.0), ("5–10 mm", 5.0, 10.0), ("≥ 10 mm", 10.0, math.inf))


def regla_oficial(lesion: dict, cand: dict) -> bool:
    return math.dist(lesion["position"], cand["position"]) <= max(MIN_MATCH_MM, float(cand["diameter_mm"]))


def regla_estricta(lesion: dict, cand: dict) -> bool:
    lim = max(MIN_MATCH_MM, float(lesion["diameter_mm"]) / 2.0 + MARGEN_LESION_MM)
    return math.dist(lesion["position"], cand["position"]) <= lim


REGLAS = {"oficial": regla_oficial, "estricta": regla_estricta}


def cargar(carpetas: list[Path]) -> dict[str, dict]:
    estudios: dict[str, dict] = {}
    for carpeta in carpetas:
        for p in sorted(carpeta.glob("[0-9]*.json")):
            estudios[p.stem] = json.loads(p.read_text(encoding="utf-8"))
    return estudios


def preparar(estudios: dict[str, dict], regla) -> list[dict]:
    """Por estudio: para cada candidato de la lista larga, qué lesiones toca."""
    filas = []
    for sid, d in sorted(estudios.items()):
        lesiones = d.get("lesions") or []
        lista = d.get("long_list") or d.get("candidates") or []
        cands = [{"rank": int(c["rank"]),
                  "toca": [i for i, l in enumerate(lesiones) if regla(l, c)],
                  "diametro": float(c["diameter_mm"]),
                  "confianza": float(c.get("confidence") or 0.0),
                  "canales": len(c.get("channels") or [])} for c in lista]
        filas.append({"study": sid, "ia": bool(d["meta"]["has_ia"]),
                      "lesiones": [float(l["diameter_mm"]) for l in lesiones], "cands": cands})
    return filas


def contar(filas: list[dict], k: int) -> dict:
    les = tp = fp = pac = n_ia = n_ctl = neg = 0
    por_tam = {t[0]: [0, 0] for t in TAMANOS}
    for f in filas:
        top = [c for c in f["cands"] if c["rank"] <= k]
        vistas = {i for c in top for i in c["toca"]}
        les += len(f["lesiones"])
        tp += len(vistas)
        fp += sum(1 for c in top if not c["toca"])
        if f["ia"]:
            n_ia += 1
            pac += bool(vistas)
        else:
            n_ctl += 1
            neg += not top
        for i, diam in enumerate(f["lesiones"]):
            nombre = next(t[0] for t in TAMANOS if t[1] <= diam < t[2])
            por_tam[nombre][1] += 1
            por_tam[nombre][0] += i in vistas
    return {"k": k, "lesiones": tp, "n_lesiones": les, "sens_lesion": tp / les if les else 0.0,
            "fp_por_estudio": fp / len(filas), "pacientes": pac, "n_ia": n_ia,
            "sens_paciente": pac / n_ia if n_ia else 0.0,
            "espec_paciente": neg / n_ctl if n_ctl else 0.0, "por_tamano": por_tam}


def bootstrap(filas: list[dict], k: int, reps: int, semilla: int = 18) -> dict:
    rnd = random.Random(semilla)
    sens, fpe = [], []
    for _ in range(reps):
        muestra = [rnd.choice(filas) for _ in filas]
        c = contar(muestra, k)
        sens.append(c["sens_lesion"])
        fpe.append(c["fp_por_estudio"])
    sens.sort()
    fpe.sort()
    lo, hi = int(0.025 * reps), int(0.975 * reps) - 1
    return {"sens_lesion": [sens[lo], sens[hi]], "fp_por_estudio": [fpe[lo], fpe[hi]]}


def auc(pos: list[float], neg: list[float]) -> float | None:
    if not pos or not neg:
        return None
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def separacion(filas: list[dict], k: int = 5) -> dict:
    """¿Alguna variable del candidato separa aciertos de FP, o enfermos de controles?"""
    out = {}
    for var in ("diametro", "confianza", "canales"):
        tp = [c[var] for f in filas for c in f["cands"] if c["rank"] <= k and c["toca"]]
        fp = [c[var] for f in filas for c in f["cands"] if c["rank"] <= k and not c["toca"]]
        enf = [max(c[var] for c in f["cands"] if c["rank"] <= k) for f in filas if f["ia"]]
        ctl = [max(c[var] for c in f["cands"] if c["rank"] <= k) for f in filas if not f["ia"]]
        out[var] = {"auc_candidato": auc(tp, fp), "auc_paciente": auc(enf, ctl)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=Path, nargs="+", required=True)
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument("--bootstrap", type=int, default=2000)
    args = ap.parse_args()

    estudios = cargar(args.runs)
    resultado: dict = {"estudios": len(estudios), "reglas": {}}
    for nombre, regla in REGLAS.items():
        filas = preparar(estudios, regla)
        curva = [contar(filas, k) for k in range(0, K_MAX + 1)]
        ic = {k: bootstrap(filas, k, args.bootstrap) for k in CORTES} if args.bootstrap else {}
        sep = separacion(filas)
        resultado["reglas"][nombre] = {"curva": curva, "ic95": ic, "separacion": sep}

        c0 = curva[1]
        print(f"\n== Regla {nombre} · {len(filas)} estudios, {c0['n_ia']} con aneurisma "
              f"({c0['n_lesiones']} lesiones), {len(filas) - c0['n_ia']} controles")
        print(" K  lesiones          FP/estudio        pacientes  espec.  < 5 / 5–10 / ≥ 10")
        for k in CORTES:
            c = curva[k]
            s = ic.get(k, {}).get("sens_lesion", [math.nan, math.nan])
            f_ = ic.get(k, {}).get("fp_por_estudio", [math.nan, math.nan])
            t = " / ".join(f"{a}/{b}" for a, b in c["por_tamano"].values())
            print(f"{k:2d}  {c['lesiones']:3d} ({100 * c['sens_lesion']:.0f} %, {100 * s[0]:.0f}–{100 * s[1]:.0f})"
                  f"  {c['fp_por_estudio']:5.2f} ({f_[0]:.2f}–{f_[1]:.2f})"
                  f"  {c['pacientes']:3d}/{c['n_ia']}    {c['espec_paciente']:.2f}    {t}")
        print("AUC (aciertos frente a FP · enfermos frente a controles), entre los 5:")
        for var, v in sep.items():
            print(f"  {var:10s} {v['auc_candidato']:.2f} · {v['auc_paciente']:.2f}")

    if args.json:
        args.json.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n→ {args.json}")


if __name__ == "__main__":
    main()
