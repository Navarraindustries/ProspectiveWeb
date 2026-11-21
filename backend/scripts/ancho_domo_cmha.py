"""P17: ¿con qué definición del ancho del domo coincide el Dmax de CMHA?

    python scripts/ancho_domo_cmha.py --cmha DIR [--salida ancho_domo_definiciones.csv] [--cortes 60]

Acompaña a `morfometria_cmha.py`. Por cada saco de CMHA se toma el borde abierto del
STL como cuello del experto, se corta el saco por planos paralelos a ese cuello (desde
el punto más bajo hasta el más alto) y en cada corte se miden varias definiciones de
«ancho», todas sobre la envolvente convexa del corte. De cada una queda el máximo
entre cortes, que se compara con el Dmax de CMHA:

    feret_max      mayor anchura en cualquier dirección (el ancho del domo de P17 hasta el 21-11)
    feret_min      menor anchura
    dir_cuello     anchura en la dirección de la cuerda más larga del cuello
    perp_cuello    anchura en la dirección perpendicular a esa
    d_area         diámetro equivalente del área, 2·√(A/π)
    d_hidraulico   diámetro hidráulico, 4·A/P (el ancho del domo de la app desde el 21-11)
    d_perimetro    P/π

Resultado del 21-11-2026 con los 105 sacos: coincide el diámetro hidráulico (cociente
mediano 1,000; 83 de 105 dentro del 10 %; r 0,96), y la anchura del cuello NW de CMHA
es también 4·NS/NC. En 21 sacos el Dmax de CMHA es más de un 10 % mayor que cualquier
corte del STL paralelo al cuello; ni cortar todo el saco ni otra orientación lo explica.
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np
import vtk
from scipy.spatial import ConvexHull, QhullError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vtkmodules.util import numpy_support as ns  # noqa: E402

from scripts.morfometria_cmha import borde_mayor, leer_cmha, leer_stl, medir_lazo  # noqa: E402

MEDIDAS = ["feret_max", "feret_min", "dir_cuello", "perp_cuello", "d_area", "d_hidraulico", "d_perimetro"]
_ANGULOS = np.linspace(0.0, np.pi, 180, endpoint=False)
_DIRECCIONES = np.column_stack([np.cos(_ANGULOS), np.sin(_ANGULOS)])


def base_del_plano(normal: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Dos vectores unitarios y perpendiculares dentro del plano de esa normal."""
    u = np.cross(normal, [1.0, 0.0, 0.0])
    if np.linalg.norm(u) < 1e-3:
        u = np.cross(normal, [0.0, 1.0, 0.0])
    u /= np.linalg.norm(u)
    return u, np.cross(normal, u)


def cuerda_mayor(q: np.ndarray) -> tuple[np.ndarray, float]:
    """Dirección unitaria y longitud de la mayor distancia entre dos puntos de `q` ((N, 2))."""
    d = np.linalg.norm(q[:, None] - q[None], axis=2)
    i, j = np.unravel_index(int(d.argmax()), d.shape)
    return (q[j] - q[i]) / d[i, j], float(d[i, j])


def medir_corte(q: np.ndarray, direccion: np.ndarray) -> dict[str, float] | None:
    """Las medidas de `MEDIDAS` de un corte, dado por sus puntos en el plano ((N, 2))."""
    if len(q) < 3:
        return None
    try:
        envolvente = ConvexHull(q)
    except QhullError:  # puntos alineados
        return None
    p = q[envolvente.vertices]
    anchuras = np.ptp(p @ _DIRECCIONES.T, axis=0)
    area, perimetro = float(envolvente.volume), float(envolvente.area)  # en 2D: volume = área, area = perímetro
    perpendicular = np.array([-direccion[1], direccion[0]])
    return {"feret_max": float(anchuras.max()), "feret_min": float(anchuras.min()),
            "dir_cuello": float(np.ptp(p @ direccion)), "perp_cuello": float(np.ptp(p @ perpendicular)),
            "d_area": 2.0 * math.sqrt(area / math.pi), "d_hidraulico": 4.0 * area / perimetro,
            "d_perimetro": perimetro / math.pi}


def medir_saco(saco: vtk.vtkPolyData, cortes: int = 60) -> dict[str, float]:
    """El máximo entre cortes de cada medida, más lo que se lee del cuello."""
    pts = ns.vtk_to_numpy(saco.GetPoints().GetData()).astype(np.float64)
    lazo = borde_mayor(saco)
    if len(lazo) < 3:
        raise ValueError("el saco no tiene borde abierto: no hay cuello que leer")
    cuello = medir_lazo(lazo, pts.mean(axis=0))
    origen, normal = cuello["origen"], cuello["normal"]
    u, v = base_del_plano(normal)
    direccion, cuerda = cuerda_mayor(np.column_stack([(lazo - origen) @ u, (lazo - origen) @ v]))

    alturas = (pts - origen) @ normal
    plano, cortador = vtk.vtkPlane(), vtk.vtkCutter()
    plano.SetNormal(*normal)
    cortador.SetInputData(saco)
    cortador.SetCutFunction(plano)
    maximos = dict.fromkeys(MEDIDAS, 0.0)
    for k in range(cortes):
        plano.SetOrigin(*(origen + (alturas.min() + np.ptp(alturas) * (k + 0.5) / cortes) * normal))
        cortador.Update()
        salida = cortador.GetOutput()
        if salida.GetNumberOfPoints() < 3:
            continue
        c = ns.vtk_to_numpy(salida.GetPoints().GetData()).astype(np.float64) - origen
        m = medir_corte(np.column_stack([c @ u, c @ v]), direccion)
        if m:
            maximos = {nombre: max(maximos[nombre], m[nombre]) for nombre in MEDIDAS}
    return {**maximos, "cuello_cuerda": cuerda, "cuello_d_area": cuello["d_eq"],
            "cuello_d_hidraulico": 4.0 * cuello["area"] / cuello["perimetro"],
            "bajo_el_plano_mm": max(0.0, -float(alturas.min())), "altura": float(alturas.max())}


def _comparar(nombre: str, nuestras: list[float], suyas: list[float]) -> None:
    a, b = np.asarray(nuestras), np.asarray(suyas)
    q = a / b
    print(f"{nombre:34} {np.median(q):8.3f} {np.percentile(q, 10):6.2f} {np.percentile(q, 90):6.2f} "
          f"{int((np.abs(q - 1) <= 0.10).sum()):6d} {np.corrcoef(a, b)[0, 1]:6.2f}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cmha", type=Path, required=True, help="carpeta con patients/ y «statistical results»/")
    ap.add_argument("--salida", type=Path, default=None)
    ap.add_argument("--cortes", type=int, default=60)
    a = ap.parse_args(argv)
    salida = a.salida or a.cmha / "o2" / "ancho_domo_definiciones.csv"
    salida.parent.mkdir(parents=True, exist_ok=True)

    expertos = leer_cmha(a.cmha / "statistical results" / "morphological_aneurysm_artery.csv")
    filas = []
    for caso in sorted(expertos):
        ruta = a.cmha / "patients" / caso.split("_")[0] / f"3D_aneurysm_{caso}.stl"
        try:
            m = medir_saco(leer_stl(ruta), a.cortes)
        except Exception as e:  # un saco malo no para la pasada
            print(f"[{caso}] FALLO: {type(e).__name__}: {e}", flush=True)
            continue
        e = expertos[caso]
        filas.append({"caso": caso, **{k: round(v, 4) for k, v in m.items()},
                      **{f"cmha_{k}": e[k] for k in ("Dmax", "NW", "NS", "NC", "BF", "H", "L1", "L2")}})
    if not filas:
        print("ningún saco medido")
        return 1
    with salida.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)

    col = lambda k: [f[k] for f in filas]  # noqa: E731
    print(f"{len(filas)} sacos · {sum(f['bajo_el_plano_mm'] > 0.2 for f in filas)} con puntos a más de 0,2 mm "
          f"por debajo del plano del cuello\n")
    print(f"{'nuestra / de CMHA':34} {'mediana':>8} {'p10':>6} {'p90':>6} {'±10 %':>6} {'r':>6}")
    for nombre in MEDIDAS:
        _comparar(f"{nombre} / Dmax", col(nombre), col("cmha_Dmax"))
    for nombre in ("cuello_cuerda", "cuello_d_area", "cuello_d_hidraulico"):
        _comparar(f"{nombre} / NW", col(nombre), col("cmha_NW"))
    print(f"\n→ {salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
