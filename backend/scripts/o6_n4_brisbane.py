"""O6: ¿mejora la corrección N4 (P9) la malla de las angio-RM de Royal Brisbane?

    python scripts/o6_n4_brisbane.py --brisbane DIR --salida DIR [--sesiones sub-039_ses-20180929 ...] [--limite N]

Royal Brisbane (OpenNeuro ds005096, CC0) trae, de una sesión por paciente, la máscara
del experto «aneurisma con arteria madre» y la del aneurisma solo, del mismo tamaño
que la angio-RM pero no siempre con su orientación (ver `mascara_en`). Cada sesión se segmenta dos veces con la receta de la app
(`routers.segment.segment_tubular`, umbral automático): tal cual y con la corrección
de campo N4 del Preprocesado (`services.preprocess.n4_correct`). Se mide cuánto de la
máscara del experto queda dentro de la máscara de la que sale la malla.

Para saber si la lesión está en una zona oscura se anota la ganancia de N4 en ella:
el cociente corregido / original dentro de la máscara del experto (> 1 = N4 la aclara).

Deja `<salida>/o6_n4_brisbane.csv` (una fila por sesión; se puede cortar y relanzar)
y `resumen_o6_n4.json`.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CAMPOS = ["sesion", "forma", "espaciado_mm", "vox_arteria", "vox_saco", "alineacion", "brillo_rel_lesion", "ganancia_n4_lesion",
          "umbral", "umbral_n4", "arteria_cubierta", "arteria_cubierta_n4", "saco_cubierto", "saco_cubierto_n4",
          "malla_cm3", "malla_cm3_n4", "piezas", "piezas_n4", "factor", "segundos", "segundos_n4", "segundos_solo_n4",
          "error"]


def emparejar(raiz: Path) -> list[dict]:
    """Sesiones con máscara del experto y una angio-RM de su mismo tamaño."""
    import SimpleITK as sitk

    def tamano(ruta: Path):
        r = sitk.ImageFileReader()
        r.SetFileName(str(ruta))
        r.ReadImageInformation()
        return r.GetSize()

    vistas, pares = set(), []
    for arteria in sorted((raiz / "derivatives").rglob("*with-Parent-Artery*.nii")):
        if arteria.name in vistas or "duplicate" in arteria.name:
            continue
        vistas.add(arteria.name)
        sub, ses = arteria.name.split("_")[:2]
        angios = [a for a in sorted((raiz / sub / ses / "anat").glob("*angio.nii.gz")) if tamano(a) == tamano(arteria)]
        if len(angios) != 1:
            continue
        # La del saco solo: mismo prefijo (Aneurysm, Aneurysm1…), carpeta hermana.
        clave = arteria.name.split("Segmentation_")[-1].split("-with")[0]
        sacos = [s for s in arteria.parent.parent.rglob("*.nii")
                 if "with-Parent" not in s.name and s.name.split("Segmentation_")[-1].split(".")[0].split("-Only")[0] == clave]
        nombre = f"{sub}_{ses}" + ("" if clave == "Aneurysm" else f"_{clave}")
        pares.append({"sesion": nombre, "angio": angios[0], "arteria": arteria, "saco": sacos[0] if sacos else None})
    return pares


BRILLO_MIN = 2.0  # la arteria del experto, frente a la mediana del volumen


def mascara_en(img, vol: np.ndarray, ruta: Path) -> tuple[np.ndarray, str, float]:
    """La máscara del experto sobre la rejilla de la angio-RM: ((Z, Y, X) bool, cómo se alineó, brillo).

    Las máscaras tienen el tamaño de la angio pero no siempre su orientación. Se prueba
    por posición en el paciente (cabeceras) y con cada inversión de ejes del array, y
    se queda la que deja la máscara sobre lo más brillante: es una arteria. El brillo
    que se devuelve es la mediana dentro de la máscara entre la mediana del volumen.
    """
    import itertools

    import SimpleITK as sitk

    m = sitk.ReadImage(str(ruta))
    crudo = sitk.GetArrayFromImage(m) > 0
    candidatas = {"cabeceras": sitk.GetArrayFromImage(
        sitk.Resample(m, img, sitk.Transform(), sitk.sitkNearestNeighbor, 0)) > 0}
    if crudo.shape == vol.shape:
        for ejes in itertools.chain.from_iterable(itertools.combinations(range(3), n) for n in range(4)):
            candidatas["array" + ("".join(" -" + "zyx"[e] for e in ejes))] = np.flip(crudo, ejes) if ejes else crudo
    if not crudo.any():
        raise ValueError("la máscara del experto está vacía")
    fondo = max(1e-6, float(np.median(vol[::3, ::3, ::3])))
    # Se elige por el percentil 90: un saco grande o con trombo es oscuro por dentro y
    # baja la mediana (sub-009, sub-011), pero su arteria sigue siendo lo más brillante.
    alto = {k: float(np.percentile(vol[c], 90)) / fondo if c.any() else 0.0 for k, c in candidatas.items()}
    mejor = max(alto, key=alto.get)
    if alto[mejor] < BRILLO_MIN:
        raise ValueError(f"la máscara no cae sobre un vaso con ninguna orientación (brillo {alto[mejor]:.2f})")
    return candidatas[mejor], mejor, float(np.median(vol[candidatas[mejor]])) / fondo


def cubierto(experto: np.ndarray, espaciado, sm: dict) -> float:
    """Fracción de los vóxeles del experto que caen dentro de la máscara de la malla."""
    idx = np.argwhere(experto)
    if len(idx) == 0:
        return float("nan")
    mm = idx * np.asarray(espaciado, dtype=float)                       # (z, y, x) en mm del volumen
    sx, sy, sz = sm["shift_xyz"]
    j = np.rint((mm - np.array([sz, sy, sx])) / np.asarray(sm["spacing"], dtype=float)).astype(int)
    forma = np.array(sm["mask"].shape)
    dentro = np.all((j >= 0) & (j < forma), axis=1)
    acierto = np.zeros(len(idx), dtype=bool)
    acierto[dentro] = sm["mask"][j[dentro, 0], j[dentro, 1], j[dentro, 2]] > 0
    return float(acierto.mean())


def medir(par: dict) -> dict:
    import SimpleITK as sitk
    import vtk

    from routers.segment import segment_tubular
    from services.dicom_loader import DicomLoadResult
    from services.preprocess import n4_correct

    img = sitk.ReadImage(str(par["angio"]))
    vol = sitk.GetArrayFromImage(img).astype(np.float32)
    espaciado = tuple(float(s) for s in img.GetSpacing()[::-1])
    arteria, alineacion, brillo = mascara_en(img, vol, par["arteria"])
    saco = mascara_en(img, vol, par["saco"])[0] if par["saco"] else np.zeros_like(arteria)
    fila = {"sesion": par["sesion"], "forma": "x".join(str(n) for n in vol.shape),
            "espaciado_mm": "x".join(f"{s:.2f}" for s in espaciado),
            "vox_arteria": int(arteria.sum()), "vox_saco": int(saco.sum()),
            "alineacion": alineacion, "brillo_rel_lesion": round(brillo, 2)}

    t0 = time.perf_counter()
    corregido = n4_correct(vol, espaciado)
    fila["segundos_solo_n4"] = round(time.perf_counter() - t0, 1)
    if arteria.any():
        fila["ganancia_n4_lesion"] = round(float(np.median(corregido[arteria]) / max(1e-6, np.median(vol[arteria]))), 3)

    for sufijo, v in (("", vol), ("_n4", corregido)):
        p1, p99 = np.percentile(v[::4, ::4, ::4], [1, 99])
        dcm = DicomLoadResult(volume=v, spacing=espaciado, origin=(0.0, 0.0, 0.0), modality="MR", series_uid="",
                              series_description="", patient_name="", patient_id="", study_date="",
                              window_center=float((p1 + p99) / 2), window_width=float(max(1.0, p99 - p1)),
                              n_slices=v.shape[0], is_projection=False, projection_warning=None)
        t0 = time.perf_counter()
        malla, info = segment_tubular(dcm, lower=None, upper=0.0, memory_guard=False, keep_mask=True)
        fila["segundos" + sufijo] = round(time.perf_counter() - t0, 1)
        m = vtk.vtkMassProperties()
        m.SetInputData(malla)
        m.Update()
        fila["umbral" + sufijo] = round(info["thresholds"]["lower"], 1)
        fila["arteria_cubierta" + sufijo] = round(cubierto(arteria, espaciado, info["surface_mask"]), 4)
        fila["saco_cubierto" + sufijo] = round(cubierto(saco, espaciado, info["surface_mask"]), 4)
        fila["malla_cm3" + sufijo] = round(abs(m.GetVolume()) / 1000.0, 2)
        fila["piezas" + sufijo] = info["components"]
        fila["factor"] = info["downsample_factor"]
        del malla, info, dcm
    return fila


def resumir(filas: list[dict]) -> dict:
    ok = [f for f in filas if not f.get("error")]
    def col(k):
        return np.array([float(f[k]) for f in ok if f.get(k) not in ("", None, "nan")], dtype=float)
    res = {"sesiones": len(filas), "medidas": len(ok)}
    for k in ("arteria_cubierta", "saco_cubierto", "malla_cm3", "piezas"):
        a, b = col(k), col(k + "_n4")
        if len(a) and len(a) == len(b):
            res[k] = {"sin_n4_mediana": float(np.median(a)), "con_n4_mediana": float(np.median(b)),
                      "sin_n4_media": float(a.mean()), "con_n4_media": float(b.mean()),
                      "mejoran": int((b > a + 0.02 * np.maximum(1, a.max() > 1)).sum()) if "cubiert" in k else None,
                      "empeoran": int((b < a - 0.02).sum()) if "cubiert" in k else None}
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brisbane", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--sesiones", nargs="*")
    ap.add_argument("--limite", type=int, default=0)
    a = ap.parse_args(argv)
    a.salida.mkdir(parents=True, exist_ok=True)
    ruta = a.salida / "o6_n4_brisbane.csv"

    pares = emparejar(a.brisbane)
    if a.sesiones:
        pares = [p for p in pares if p["sesion"] in a.sesiones]
    if a.limite:
        pares = pares[:a.limite]
    filas = []
    if ruta.exists():
        with ruta.open(newline="", encoding="utf-8") as f:
            filas = [r for r in csv.DictReader(f) if not r.get("error")]  # los errores se reintentan
    hechas = {f["sesion"] for f in filas}
    print(f"{len(pares)} sesiones con máscara · {len(hechas)} ya medidas", flush=True)
    for i, par in enumerate(pares, 1):
        if par["sesion"] in hechas:
            continue
        try:
            fila = medir(par)
        except Exception as e:  # una sesión mala no para la pasada
            fila = {"sesion": par["sesion"], "error": f"{type(e).__name__}: {e}"[:300]}
        filas.append(fila)
        with ruta.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CAMPOS)
            w.writeheader()
            w.writerows({k: r.get(k, "") for k in CAMPOS} for r in filas)
        print(f"[{i}/{len(pares)}] {fila['sesion']}: " + (fila.get("error") or
              f"arteria {fila['arteria_cubierta']:.2f} → {fila['arteria_cubierta_n4']:.2f} · saco "
              f"{fila['saco_cubierto']:.2f} → {fila['saco_cubierto_n4']:.2f} · ganancia {fila.get('ganancia_n4_lesion')}"
              f" · {fila['segundos']:.0f}+{fila['segundos_n4']:.0f} s"), flush=True)
    (a.salida / "resumen_o6_n4.json").write_text(json.dumps(resumir(filas), ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
