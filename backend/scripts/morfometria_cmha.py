"""O2: la morfometría de Prospective frente a las medidas de expertos de CMHA.

    python scripts/morfometria_cmha.py --cmha DIR [--salida DIR] [--casos AHMU1218001 ...]

CMHA (Song et al. 2024, figshare 26965450, CC BY 4.0) trae 105 aneurismas de ACM con
el saco recortado por expertos (`patients/<id>/3D_aneurysm_<id>[_n].stl`) y 26 medidas
(`statistical results/morphological_aneurysm_artery.csv`). El STL del saco viene
ABIERTO por el cuello: su borde es el cuello que marcó el experto.

Por cada saco:
  1. se toma el borde abierto como cuello: plano ajustado, perímetro, área y diámetro
     equivalente (el del área, que es el que usa la app con un cuello marcado);
  2. se tapa el hueco para tener una malla cerrada, que es lo que mide la morfometría;
  3. se corre `MorphometricAnalyzer` dos veces: con ese cuello («con cuello», como
     cuando el usuario lo marca) y sin él («automático», buscando el cuello sola).
Y se compara cada medida con la de CMHA: mediana del cociente nuestro/suyo, diferencia
relativa mediana y correlación.

Las definiciones no son siempre las mismas; el resumen lo dice en cada fila. En
particular el SR de CMHA es H entre la media de D, D1 y D2, y el de Prospective
(Dhar 2008) es el diámetro máximo entre el diámetro de la arteria madre: aquí se
calculan los dos con sus diámetros de arteria, para separar la definición de la medida.

Deja `<salida>/morfometria_cmha.csv` (una fila por aneurisma) y `resumen_o2.json`.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import vtk

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vtkmodules.util import numpy_support as ns  # noqa: E402

# Columnas de CMHA (el CSV trae saltos de línea y espacios dentro de los nombres).
COL = {
    "D": "Parent artery diameter(D)", "D1": "The thicker branch diameter (D_1)",
    "D2": "The smaller branch diameter (D_2)", "NW": "Neck width (NW)",
    "H": "Aneurysm perpendicular height (H)", "L1": "Maximum length of the aneurysm(L_1)",
    "L2": "Maximum width of the aneurysm (L_2)", "NC": "Neck circumference (NC)",
    "NS": "Neck cross-sectional area (NS)", "Dmax": "D_max", "BF": "BottleneckFactor",
    "V": "Aneurysm volume (V)", "A": "AneurysmSurfaceArea", "EI": "EllipticityIndex",
    "NSI": "NonSphericityIndex", "UI": "UndulationIndex", "AR": "The ratio of H to NW(AR)",
    "SR": "The ratio of H to the average of D1, D2, and D3.(SR)",
}

# (nombre, columna nuestra, columna de CMHA, nota sobre la definición)
PARES = [
    ("Volumen (mm³)", "volumen", "V", "malla tapada por el cuello"),
    ("Área del saco (mm²)", "area_saco", "A", "sin la tapa del cuello"),
    ("Diámetro máximo (mm)", "d_max", "Dmax", "nuestro: mayor distancia entre dos puntos; su Dmax: 4·A/P paralelo al cuello"),
    ("Ancho del domo frente a Dmax (mm)", "ancho_domo", "Dmax", "los dos: mayor 4·A/P de los cortes paralelos al cuello (P17)"),
    ("Diámetro máximo frente a L1 (mm)", "d_max", "L1", "L1: longitud máxima del aneurisma"),
    ("Cuello: diámetro (mm)", "cuello_d_eq", "NW", "nuestro: equivalente del área; NW: anchura"),
    ("Cuello: perímetro (mm)", "cuello_perimetro", "NC", ""),
    ("Cuello: área (mm²)", "cuello_area", "NS", ""),
    ("Altura (mm)", "altura", "H", "nuestra: máxima sobre el plano del cuello"),
    ("AR", "ar", "AR", "altura / cuello"),
    ("Bottleneck", "bf", "BF", ""),
    ("Ondulación (UI)", "ui", "UI", ""),
    ("Elipticidad (EI)", "ei", "EI", "Raghavan 2005 sobre la envolvente, sin el disco del cuello (P17)"),
    ("No esfericidad (NSI)", "nsi", "NSI", "Raghavan 2005, área sin el disco del cuello (P17)"),
    ("SR con su definición", "sr_cmha", "SR", "nuestra H / media de sus D, D1 y D2"),
    ("SR de Prospective", "sr_dhar", "SR", "nuestro Dmáx / su D: otra definición, no deben coincidir"),
    ("Automático: cuello (mm)", "auto_cuello", "NW", "sin cuello marcado"),
    ("Automático: altura (mm)", "auto_altura", "H", "sin cuello marcado"),
    ("Automático: AR", "auto_ar", "AR", "sin cuello marcado"),
]


def leer_stl(ruta: Path) -> vtk.vtkPolyData:
    r = vtk.vtkSTLReader()
    r.SetFileName(str(ruta))
    r.Update()
    c = vtk.vtkCleanPolyData()
    c.SetInputData(r.GetOutput())
    c.Update()
    return c.GetOutput()


def lazos_abiertos(poly: vtk.vtkPolyData) -> list[np.ndarray]:
    """Los bordes abiertos de la malla, cada uno como sus puntos en orden ((N, 3))."""
    fe = vtk.vtkFeatureEdges()
    fe.SetInputData(poly)
    fe.BoundaryEdgesOn()
    fe.FeatureEdgesOff()
    fe.ManifoldEdgesOff()
    fe.NonManifoldEdgesOff()
    fe.Update()
    tiras = vtk.vtkStripper()
    tiras.SetInputConnection(fe.GetOutputPort())
    tiras.JoinContiguousSegmentsOn()
    tiras.Update()
    salida = tiras.GetOutput()
    if salida.GetNumberOfPoints() == 0:
        return []
    pts = ns.vtk_to_numpy(salida.GetPoints().GetData()).astype(np.float64)
    lazos = []
    ids = vtk.vtkIdList()
    salida.GetLines().InitTraversal()
    while salida.GetLines().GetNextCell(ids):
        lazo = pts[[ids.GetId(i) for i in range(ids.GetNumberOfIds())]]
        if len(lazo) > 1 and np.allclose(lazo[0], lazo[-1]):
            lazo = lazo[:-1]
        if len(lazo) >= 3:
            lazos.append(lazo)
    return lazos


def borde_mayor(poly: vtk.vtkPolyData) -> np.ndarray:
    """Puntos, en orden, del borde abierto más largo de la malla ((N, 3); vacío si es cerrada)."""
    lazos = lazos_abiertos(poly)
    if not lazos:
        return np.empty((0, 3))
    return max(lazos, key=lambda l: float(np.linalg.norm(l - np.roll(l, -1, axis=0), axis=1).sum()))


def medir_lazo(lazo: np.ndarray, hacia: np.ndarray) -> dict:
    """Plano, perímetro y área de un lazo cerrado; la normal apunta hacia `hacia` (el domo)."""
    origen = lazo.mean(axis=0)
    _u, _s, vh = np.linalg.svd(lazo - origen, full_matrices=False)
    normal = vh[-1] / np.linalg.norm(vh[-1])
    if (hacia - origen) @ normal < 0:
        normal = -normal
    q = np.column_stack([(lazo - origen) @ vh[0], (lazo - origen) @ vh[1]])
    area = 0.5 * abs(float(np.sum(q[:, 0] * np.roll(q[:, 1], -1) - np.roll(q[:, 0], -1) * q[:, 1])))
    perimetro = float(np.linalg.norm(lazo - np.roll(lazo, -1, axis=0), axis=1).sum())
    return {"origen": origen, "normal": normal, "perimetro": perimetro, "area": area,
            "d_eq": 2.0 * math.sqrt(area / math.pi)}


def tapar(poly: vtk.vtkPolyData) -> vtk.vtkPolyData:
    """La malla con cada borde abierto tapado por un abanico de triángulos desde su centro.

    `vtkFillHolesFilter` deja aristas sueltas en 18 de los 105 sacos de CMHA; el abanico
    cierra siempre, y para un cuello casi plano da la misma tapa.
    """
    puntos, celdas = vtk.vtkPoints(), vtk.vtkCellArray()
    for lazo in lazos_abiertos(poly):
        centro = puntos.InsertNextPoint(*lazo.mean(axis=0))
        ids = [puntos.InsertNextPoint(*q) for q in lazo]
        for i in range(len(ids)):
            celdas.InsertNextCell(3, [centro, ids[i], ids[(i + 1) % len(ids)]])
    tapas = vtk.vtkPolyData()
    tapas.SetPoints(puntos)
    tapas.SetPolys(celdas)
    junto = vtk.vtkAppendPolyData()
    junto.AddInputData(poly)
    junto.AddInputData(tapas)
    limpio = vtk.vtkCleanPolyData()
    limpio.SetInputConnection(junto.GetOutputPort())
    n = vtk.vtkPolyDataNormals()
    n.SetInputConnection(limpio.GetOutputPort())
    n.ConsistencyOn()
    n.AutoOrientNormalsOn()
    n.SplittingOff()
    n.Update()
    return n.GetOutput()


def area_y_volumen(poly: vtk.vtkPolyData) -> tuple[float, float]:
    m = vtk.vtkMassProperties()
    m.SetInputData(poly)
    m.Update()
    return float(m.GetSurfaceArea()), abs(float(m.GetVolume()))


def medir_saco(ruta: Path) -> dict:
    from services.morphometrics import MorphometricAnalyzer

    saco = leer_stl(ruta)
    pts = ns.vtk_to_numpy(saco.GetPoints().GetData()).astype(np.float64)
    lazo = borde_mayor(saco)
    if len(lazo) < 3:
        raise ValueError("el saco no tiene borde abierto: no hay cuello que leer")
    cuello = medir_lazo(lazo, pts.mean(axis=0))
    area_saco, _ = area_y_volumen(saco)
    cerrado = tapar(saco)

    an = MorphometricAnalyzer()
    con = an.analyze(cerrado, neck_plane=(cuello["origen"], cuello["normal"], cuello["d_eq"]))
    auto = an.analyze(cerrado)
    return {
        "volumen": con.volume_mm3, "area_saco": area_saco, "d_max": con.max_diameter_mm,
        "ancho_domo": con.dome_width_mm,
        "cuello_d_eq": cuello["d_eq"], "cuello_perimetro": cuello["perimetro"], "cuello_area": cuello["area"],
        "altura": con.dome_height_mm, "ar": con.aspect_ratio, "bf": con.bottleneck_factor,
        "ui": con.undulation_index, "ei": con.ellipticity_index, "nsi": con.non_sphericity_idx,
        "fiable": int(con.reliable), "cerrada": int(con.watertight),
        "auto_cuello": auto.neck_diameter_mm, "auto_altura": auto.dome_height_mm,
        "auto_ar": auto.aspect_ratio, "auto_fiable": int(auto.reliable),
    }


def leer_cmha(ruta: Path) -> dict[str, dict[str, float]]:
    texto = ruta.read_bytes().decode("utf-8-sig", "replace").replace("\r\n", "\n").replace("\r", "\n")
    filas = list(csv.reader(io.StringIO(texto)))
    cabecera = [" ".join(c.split()) for c in filas[0]]
    indice = {clave: cabecera.index(" ".join(nombre.split())) for clave, nombre in COL.items()}
    tabla = {}
    for f in filas[1:]:
        if f and f[0].startswith("AHMU"):
            try:
                tabla[f[0].strip()] = {k: float(f[i]) for k, i in indice.items()}
            except ValueError:
                continue
    return tabla


def comparar(nuestras: list[float], suyas: list[float]) -> dict:
    a, b = np.asarray(nuestras, dtype=float), np.asarray(suyas, dtype=float)
    ok = np.isfinite(a) & np.isfinite(b) & (a > 0) & (b > 0)
    a, b = a[ok], b[ok]
    if len(a) < 3:
        return {"n": int(len(a))}
    rel = np.abs(a - b) / b
    return {"n": int(len(a)), "mediana_nuestra": float(np.median(a)), "mediana_cmha": float(np.median(b)),
            "cociente_mediano": float(np.median(a / b)), "dif_relativa_mediana": float(np.median(rel)),
            "dentro_del_10": int((rel <= 0.10).sum()), "r": float(np.corrcoef(a, b)[0, 1])}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cmha", type=Path, required=True, help="carpeta con patients/ y «statistical results»/")
    ap.add_argument("--salida", type=Path, default=None)
    ap.add_argument("--casos", nargs="*", help="solo estos (p. ej. AHMU1218001 AHMU1218050_1)")
    a = ap.parse_args(argv)
    salida = a.salida or a.cmha / "o2"
    salida.mkdir(parents=True, exist_ok=True)

    expertos = leer_cmha(a.cmha / "statistical results" / "morphological_aneurysm_artery.csv")
    filas, fallos = [], {}
    for caso in sorted(a.casos or expertos):
        paciente = caso.split("_")[0]
        ruta = a.cmha / "patients" / paciente / f"3D_aneurysm_{caso}.stl"
        try:
            m = medir_saco(ruta)
        except Exception as e:  # un saco malo no para la pasada
            fallos[caso] = f"{type(e).__name__}: {e}"
            print(f"[{caso}] FALLO: {fallos[caso]}", flush=True)
            continue
        e = expertos[caso]
        m["sr_cmha"] = m["altura"] / ((e["D"] + e["D1"] + e["D2"]) / 3.0)
        m["sr_dhar"] = m["d_max"] / e["D"] if e["D"] > 0 else 0.0
        filas.append({"caso": caso, **{k: round(v, 4) for k, v in m.items()},
                      **{f"cmha_{k}": v for k, v in e.items()}})

    if filas:
        with (salida / "morfometria_cmha.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(filas[0]))
            w.writeheader()
            w.writerows(filas)
    resumen = {"aneurismas": len(filas), "fallos": fallos,
               "fiables_con_cuello": sum(f["fiable"] for f in filas),
               "fiables_automatico": sum(f["auto_fiable"] for f in filas), "medidas": {}}
    print(f"\n{len(filas)} aneurismas medidos · {len(fallos)} fallos · fiables con cuello "
          f"{resumen['fiables_con_cuello']} · fiables en automático {resumen['fiables_automatico']}\n")
    print(f"{'medida':34s} {'n':>4s} {'nuestra':>9s} {'CMHA':>9s} {'cociente':>9s} {'dif. rel.':>9s} {'≤10 %':>6s} {'r':>6s}")
    for nombre, nuestra, suya, nota in PARES:
        c = comparar([f[nuestra] for f in filas], [f[f"cmha_{suya}"] for f in filas])
        resumen["medidas"][nombre] = {**c, "nota": nota}
        if c.get("n", 0) >= 3:
            print(f"{nombre:34s} {c['n']:4d} {c['mediana_nuestra']:9.3f} {c['mediana_cmha']:9.3f} "
                  f"{c['cociente_mediano']:9.3f} {100 * c['dif_relativa_mediana']:8.1f}% {c['dentro_del_10']:6d} {c['r']:6.2f}")
    (salida / "resumen_o2.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n→ {salida / 'resumen_o2.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
