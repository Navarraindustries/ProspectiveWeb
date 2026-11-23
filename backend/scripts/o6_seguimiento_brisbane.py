"""O6: el mapa de cambios de Prospective entre las sesiones de angio-RM de Royal Brisbane.

    python scripts/o6_seguimiento_brisbane.py --brisbane DIR --salida DIR [--pacientes sub-000 ...]

Royal Brisbane (OpenNeuro ds005096, CC0) sigue a 24 pacientes en varias sesiones y su
hoja «Interval Surveillance Summary» dice qué pasó en cada uno (sin cambio, aumento de
diámetro, saco hijo, tratamiento…). Solo una sesión por paciente trae la máscara del
experto, así que aquí:

  1. el centro de la lesión se toma de esa máscara y se lleva a las demás sesiones con
     un registro rígido de las dos angio-RM (información mutua, SimpleITK);
  2. cada sesión se segmenta como en la app: corrección N4 (P9) y `segment_tubular`
     con el umbral automático;
  3. cada par de sesiones consecutivas, y la primera con la última, se compara con
     `services.followup.compare`, igual que la pantalla de seguimiento (sin saco
     marcado: solo los vasos).

Necesita `openpyxl` para leer la hoja de los clínicos (no está en los requisitos de la
app: `pip install openpyxl`).

Deja `<salida>/o6_seguimiento.csv` (una fila por par; se puede cortar y relanzar) y
`resumen_o6_seguimiento.json`, que cruza el resultado con la hoja de los clínicos.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.o6_n4_brisbane import emparejar, mascara_en  # noqa: E402

CAMPOS = ["paciente", "referencia", "anterior", "actual", "par", "meses", "crecimiento_p98_mm", "encogimiento_p98_mm",
          "superficie_crecida_pct", "ruido_mm", "residuo_mm", "giro_grados", "avisos", "error"]
HOJA = "Interval Surveillance Summary"
CLASES = ["sin_cambio", "aumento_diametro", "saco_hijo", "tratamiento", "recurrencia", "aneurisma_nuevo"]


def leer_hoja(raiz: Path) -> dict[str, list[str]]:
    """Paciente → lo que anotaron los clínicos (una o más de `CLASES`)."""
    import openpyxl

    libro = openpyxl.load_workbook(next(raiz.glob("*.xlsx")), read_only=True, data_only=True)
    filas = list(libro[HOJA].iter_rows(values_only=True))
    return {str(f[0]).strip(): [c for c, v in zip(CLASES, f[1:7]) if v not in (None, "")]
            for f in filas[1:] if f and str(f[0] or "").startswith("sub-")}


def cargar(ruta: Path):
    import SimpleITK as sitk

    return sitk.ReadImage(str(ruta), sitk.sitkFloat32)


def registrar(fija, movil):
    """Transformación rígida que lleva un punto del paciente de `fija` al de `movil`."""
    import SimpleITK as sitk

    def reducir(img):
        f = [max(1, int(round(1.5 / s))) for s in img.GetSpacing()]
        return sitk.Shrink(img, f)

    a, b = reducir(fija), reducir(movil)
    inicial = sitk.CenteredTransformInitializer(a, b, sitk.Euler3DTransform(),
                                                sitk.CenteredTransformInitializerFilter.MOMENTS)
    r = sitk.ImageRegistrationMethod()
    r.SetMetricAsMattesMutualInformation(numberOfHistogramBins=48)
    r.SetMetricSamplingStrategy(r.RANDOM)
    r.SetMetricSamplingPercentage(0.2, 7)
    r.SetInterpolator(sitk.sitkLinear)
    r.SetOptimizerAsRegularStepGradientDescent(learningRate=1.0, minStep=1e-3, numberOfIterations=200,
                                               relaxationFactor=0.6)
    r.SetOptimizerScalesFromPhysicalShift()
    r.SetShrinkFactorsPerLevel([4, 2, 1])
    r.SetSmoothingSigmasPerLevel([2, 1, 0])
    r.SetInitialTransform(inicial, inPlace=False)
    return r.Execute(a, b)


def malla_a_paciente(img) -> np.ndarray:
    """Afín 4×4: mm de la malla (índice × espaciado; x, y, z) → paciente (LPS)."""
    m = np.eye(4)
    m[:3, :3] = np.array(img.GetDirection()).reshape(3, 3)
    m[:3, 3] = img.GetOrigin()
    return m


def segmentar(img):
    """La malla de la app para esa angio-RM, con N4 (marco: índice × espaciado)."""
    import SimpleITK as sitk

    from routers.segment import segment_tubular
    from services.dicom_loader import DicomLoadResult
    from services.preprocess import n4_correct

    espaciado = tuple(float(s) for s in img.GetSpacing()[::-1])
    vol = n4_correct(sitk.GetArrayFromImage(img), espaciado)
    p1, p99 = np.percentile(vol[::4, ::4, ::4], [1, 99])
    dcm = DicomLoadResult(volume=vol, spacing=espaciado, origin=(0.0, 0.0, 0.0), modality="MR", series_uid="",
                          series_description="", patient_name="", patient_id="", study_date="",
                          window_center=float((p1 + p99) / 2), window_width=float(max(1.0, p99 - p1)),
                          n_slices=vol.shape[0], is_projection=False, projection_warning=None)
    malla, _info = segment_tubular(dcm, lower=None, upper=0.0, memory_guard=False)
    return malla


def meses(a: str, b: str) -> float:
    """Meses entre dos sesiones `ses-AAAAMMDD` (algunas traen el día y el mes cambiados)."""
    def fecha(s):
        y, m, d = int(s[4:8]), int(s[8:10]), int(s[10:12])
        if m > 12:
            m, d = d, m
        return y * 12 + m + d / 30.0
    return round(fecha(b) - fecha(a), 1)


def medir_paciente(raiz: Path, paciente: str, par_ref: dict, salida: Path) -> list[dict]:
    import SimpleITK as sitk

    from services import followup

    sesiones = sorted(p.name for p in (raiz / paciente).glob("ses-*") if list((p / "anat").glob("*angio.nii.gz")))
    ref = par_ref["angio"].parent.parent.name
    img_ref = cargar(par_ref["angio"])
    mascara = None
    for clave in ("saco", "arteria"):  # el saco si lo hay; si no, el saco con su arteria
        if par_ref[clave] is not None and mascara is None:
            try:
                mascara = mascara_en(img_ref, sitk.GetArrayFromImage(img_ref), par_ref[clave])[0]
            except ValueError:
                mascara = None
    if mascara is None:
        raise ValueError("ninguna máscara del experto cae sobre un vaso")
    centro_idx = np.argwhere(mascara).mean(axis=0)[::-1]
    lesion_ref = np.array(img_ref.TransformContinuousIndexToPhysicalPoint([float(v) for v in centro_idx]))

    datos = {}
    for ses in sesiones:
        angios = sorted((raiz / paciente / ses / "anat").glob("*angio.nii.gz"))
        ruta = par_ref["angio"] if ses == ref else angios[0]
        img = img_ref if ses == ref else cargar(ruta)
        lesion = lesion_ref if ses == ref else np.array(registrar(img_ref, img).TransformPoint(lesion_ref.tolist()))
        a_pac = malla_a_paciente(img)
        datos[ses] = {"malla": segmentar(img), "a_paciente": a_pac,
                      "lesion": (np.linalg.inv(a_pac) @ np.append(lesion, 1.0))[:3], "voxel": float(max(img.GetSpacing()))}
        print(f"  {paciente} {ses}: malla de {datos[ses]['malla'].GetNumberOfPoints()} puntos", flush=True)

    pares = [(a, b, "consecutivas") for a, b in zip(sesiones, sesiones[1:])]
    if len(sesiones) > 2:
        pares.append((sesiones[0], sesiones[-1], "primera_ultima"))
    filas = []
    for ant, act, tipo in pares:
        fila = {"paciente": paciente, "referencia": ref, "anterior": ant, "actual": act, "par": tipo,
                "meses": meses(ant, act)}
        carpeta = salida / "mapas" / f"{paciente}_{ant}_{act}"
        carpeta.mkdir(parents=True, exist_ok=True)
        try:
            p, c = datos[ant], datos[act]
            r = followup.compare(c["malla"], p["malla"], c["a_paciente"], p["a_paciente"], c["lesion"], p["lesion"],
                                 carpeta, voxel_mm=max(p["voxel"], c["voxel"]))
            fila.update(crecimiento_p98_mm=round(r.max_growth_mm, 2), encogimiento_p98_mm=round(r.max_shrink_mm, 2),
                        superficie_crecida_pct=round(r.grew_area_pct, 1), ruido_mm=round(r.noise_mm, 2),
                        residuo_mm=round(r.residual_median_mm, 2), giro_grados=round(r.rotation_deg, 1),
                        avisos=" | ".join(r.warnings)[:400])
        except Exception as e:  # un par malo no para la pasada
            fila["error"] = f"{type(e).__name__}: {e}"[:300]
        shutil.rmtree(carpeta, ignore_errors=True)  # los mapas no se guardan: ocupan y se rehacen
        filas.append(fila)
    return filas


def resumir(filas: list[dict], hoja: dict[str, list[str]]) -> dict:
    res = {"pares": len(filas), "con_error": sum(bool(f.get("error")) for f in filas), "por_clase": {}}
    for clase in CLASES:
        pacs = [p for p, cs in hoja.items() if clase in cs]
        ok = [f for f in filas if f["paciente"] in pacs and not f.get("error") and f.get("crecimiento_p98_mm") not in ("", None)]
        if not ok:
            continue
        crec = np.array([float(f["crecimiento_p98_mm"]) for f in ok])
        ruido = np.array([float(f["ruido_mm"]) for f in ok])
        res["por_clase"][clase] = {
            "pacientes": len({f["paciente"] for f in ok}), "pares": len(ok),
            "crecimiento_p98_mm_mediana": float(np.median(crec)), "ruido_mm_mediana": float(np.median(ruido)),
            "pares_con_crecimiento_sobre_el_ruido": int((crec > ruido).sum()),
            "superficie_crecida_pct_mediana": float(np.median([float(f["superficie_crecida_pct"]) for f in ok])),
            "pares_con_aviso": sum(bool(f.get("avisos")) for f in ok)}
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brisbane", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--pacientes", nargs="*")
    a = ap.parse_args(argv)
    a.salida.mkdir(parents=True, exist_ok=True)
    ruta = a.salida / "o6_seguimiento.csv"

    hoja = leer_hoja(a.brisbane)
    con_mascara = {}
    for par in emparejar(a.brisbane):
        con_mascara.setdefault(par["sesion"][:7], par)  # la primera lesión de cada paciente
    filas = []
    if ruta.exists():
        with ruta.open(newline="", encoding="utf-8") as f:
            filas = list(csv.DictReader(f))
    hechos = {f["paciente"] for f in filas}
    pacientes = [p for p in sorted(hoja) if not a.pacientes or p in a.pacientes]
    print(f"{len(pacientes)} pacientes con seguimiento · {len(hechos)} ya hechos", flush=True)
    for paciente in pacientes:
        if paciente in hechos:
            continue
        try:
            if paciente not in con_mascara:
                raise ValueError("sin máscara del experto emparejada con su angio-RM")
            nuevas = medir_paciente(a.brisbane, paciente, con_mascara[paciente], a.salida)
        except Exception as e:
            nuevas = [{"paciente": paciente, "error": f"{type(e).__name__}: {e}"[:300]}]
        filas.extend(nuevas)
        with ruta.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CAMPOS)
            w.writeheader()
            w.writerows({k: r.get(k, "") for k in CAMPOS} for r in filas)
        for r in nuevas:
            print(f"[{paciente}] {r.get('anterior', '')} → {r.get('actual', '')}: " + (r.get("error") or
                  f"crece {r['crecimiento_p98_mm']} mm (ruido {r['ruido_mm']}, residuo {r['residuo_mm']}) "
                  f"{'AVISO' if r.get('avisos') else ''}"), flush=True)
    (a.salida / "resumen_o6_seguimiento.json").write_text(
        json.dumps({"hoja": hoja, **resumir(filas, hoja)}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
