"""Convierte las series de RSNA Intracranial Aneurysm Detection al formato de nnU-Net.

    python ml/rsna_a_nnunet.py --zip ZIP --salida DIR [--modalidad CTA] [--limite N]
        [--semilla S] [--series UID,UID] [--radio-mm 4] [--alto-mm 180] [--procesos 2]

Lee cada serie DICOM directamente del ZIP de Kaggle (no hay que descomprimir los
311 GB) y escribe en `--salida`:

    imagesTr/<caso>_0000.nii.gz   volumen (int16), orientación LPS; en angio-TC, en HU y recortado a la cabeza
    labelsTr/<caso>.nii.gz        0 = fondo, 1 = esfera de `--radio-mm` en cada punto de aneurisma
    manifest.csv                  una fila por serie: convertida o excluida, y por qué
    dataset.json                  el que pide nnU-Net, rehecho al final de cada tanda

Lo que hace con cada serie, y por qué:

1. Ordena los cortes por su posición a lo largo de la normal del plano (no por
   nombre ni InstanceNumber) y quita posiciones repetidas.
2. Excluye, con su motivo en el manifest, las series que no forman un volumen
   regular: orientación o tamaño distinto entre cortes, espaciado irregular
   (faltan cortes), gantry inclinado, multiframe o menos de `MIN_CORTES` cortes.
3. Pasa a HU. Muchas series de RSNA ya traen HU en los píxeles aunque conserven
   RescaleIntercept = -1024; aplicar la etiqueta a ciegas deja el aire en -2048.
   Se elige la conversión (ninguna, la de las etiquetas o -1024) que deja el pico
   de tejido blando cerca de 40 HU.
4. Recorta a la cabeza: `--alto-mm` desde el vértex y la caja del cuerpo en el
   plano. Muchas angio-TC incluyen cuello y tórax.
5. Pasa cada punto de `train_localizers.csv` (x = columna, y = fila sobre un
   corte) a coordenadas del paciente y pinta una esfera. Si el punto queda fuera
   del recorte la serie se excluye; si no hay contraste cerca se anota.
6. Anota, sin excluir, las series sin hueso (angio-TC con el hueso sustraído).

Con `--modalidad MRA` no hay paso 3 ni 4: la intensidad de la RM no tiene unidades y
el estudio ya cubre solo la cabeza. Parte de las angio-RM vienen en un solo DICOM
multiframe; ahí el punto trae además el n.º de cuadro (`f`). En vez de las HU, se anota
si el punto cae lejos de un vaso brillante.

Volver a lanzarlo continúa donde se quedó: las series que ya están en el
manifest no se repiten. nnU-Net normaliza y remuestrea por su cuenta, así que
aquí no se toca ni la intensidad ni la resolución.
"""
from __future__ import annotations

import argparse
import ast
import collections
import csv
import hashlib
import io
import json
import multiprocessing
import random
import sys
import zipfile
from pathlib import Path

import numpy as np
import pydicom
import SimpleITK as sitk
from scipy import ndimage

MIN_CORTES = 20
TOL_ESPACIADO = 0.10  # fracción de la mediana que puede desviarse un salto entre cortes
COS_INCLINACION = 0.99985  # 1 grado entre la normal y la dirección real de apilado
HU_MIN, HU_MAX = -1024, 3071
PICO_BLANDO = (-110, 190)  # dónde tiene que caer el pico de tejido blando si la escala es HU
HU_CUERPO = -500
HU_CONTRASTE = 100  # por debajo de esto, cerca del punto no hay vaso con contraste
HU_HUESO = 300  # si el percentil 99,5 no llega, la serie no tiene hueso (angio-TC sustraída)
BRILLO_VASO = 0.5  # en RM: el punto debe llegar a esta fracción del percentil 99,5 del volumen
RADIO_CONTROL_MM = 3.0

CAMPOS = [
    "caso", "series_uid", "paciente", "modalidad", "aneurisma", "n_aneurismas", "ubicaciones",
    "estado", "motivo", "cortes", "repetidos", "forma", "espaciado_mm", "fabricante",
    "conversion_hu", "hu_p995", "recorte", "hu_max_en_punto", "edad", "sexo", "descripcion",
    "brillo_rel_en_punto",
]


class Excluida(Exception):
    """La serie no se convierte; el mensaje es el motivo que va al manifest."""


def id_caso(series_uid: str) -> str:
    return "rsna_" + hashlib.sha1(series_uid.encode()).hexdigest()[:10]


def ordenar_cortes(posiciones: np.ndarray, normal: np.ndarray):
    """Orden de los cortes a lo largo de la normal, sin repetidos, y su separación.

    Devuelve (índices que se conservan en orden, separación en mm, n.º de repetidos).
    """
    d = posiciones @ normal
    orden = np.argsort(d, kind="stable")
    conservar = [orden[0]]
    for i in orden[1:]:
        if d[i] - d[conservar[-1]] > 1e-3:
            conservar.append(i)
    conservar = np.array(conservar)
    if len(conservar) < MIN_CORTES:
        raise Excluida(f"pocos_cortes ({len(conservar)})")
    saltos = np.diff(d[conservar])
    dz = float(np.median(saltos))
    peor = float(np.abs(saltos - dz).max())
    if peor > TOL_ESPACIADO * dz:
        raise Excluida(f"espaciado_irregular (mediana {dz:.3f} mm, desvío {peor:.3f} mm)")
    apilado = posiciones[conservar[-1]] - posiciones[conservar[0]]
    if apilado @ normal / np.linalg.norm(apilado) < COS_INCLINACION:
        raise Excluida("gantry_inclinado")
    return conservar, dz, len(orden) - len(conservar)


def elegir_hu(vol: np.ndarray, pendiente, ordenada):
    """La conversión (nombre, pendiente, ordenada) que deja el tejido blando donde toca en HU."""
    paso = max(1, vol.shape[0] // 20)
    muestra = vol[::paso, ::4, ::4].astype(np.float32)
    candidatas = [("ninguna", 1.0, 0.0)]
    if pendiente is not None and (float(pendiente), float(ordenada or 0)) != (1.0, 0.0):
        candidatas.append(("etiquetas", float(pendiente), float(ordenada or 0)))
    candidatas.append(("-1024", 1.0, -1024.0))
    # El aire no sirve de referencia: con un campo de visión ceñido a la cabeza casi no
    # hay. El tejido blando sí está siempre, y es el pico más alto de la escala (hueso
    # y contraste se reparten en un rango ancho y no forman pico).
    for nombre, m, b in candidatas:
        pico = _pico_tejido_blando(muestra * m + b)
        if pico is not None and PICO_BLANDO[0] <= pico <= PICO_BLANDO[1]:
            return nombre, m, b
    raise Excluida("hu_indeterminado")


def _pico_tejido_blando(v: np.ndarray, ancho: int = 16, minimo: float = 0.03):
    """Centro del pico de mayor valor que reúne al menos `minimo` de los vóxeles en 3 bins."""
    v = v[(v > -4096) & (v < 8192)]
    if v.size == 0:
        return None
    cuentas = np.bincount(((v + 4096) // ancho).astype(np.int64), minlength=(8192 + 4096) // ancho)
    suave = np.convolve(cuentas, np.ones(3), mode="same") / v.size
    altos = np.flatnonzero(suave >= minimo)
    if altos.size == 0:
        return None
    # El tramo contiguo más alto de la escala, y dentro de él su máximo.
    inicio = altos[np.flatnonzero(np.diff(altos) > 1)[-1] + 1] if (np.diff(altos) > 1).any() else altos[0]
    tramo = np.arange(inicio, altos[-1] + 1)
    return float(tramo[np.argmax(suave[tramo])] * ancho - 4096 + ancho / 2)


def recorte_cabeza(arr: np.ndarray, espaciado, alto_mm: float, margen_mm: float = 5.0):
    """Caja (z0, z1, y0, y1, x0, x1) de la cabeza en un volumen LPS [z, y, x], z hacia arriba."""
    sx, sy, sz = espaciado
    kz = max(1, int(round(4.0 / sz)))
    kxy = max(1, int(round(2.0 / sx)))
    grueso = arr[::kz, ::kxy, ::kxy] > HU_CUERPO
    etiquetas, n = ndimage.label(grueso)
    if n == 0:
        raise Excluida("sin_cuerpo")
    cuerpo = etiquetas == 1 + int(np.argmax(ndimage.sum(grueso, etiquetas, range(1, n + 1))))
    zs = np.flatnonzero(cuerpo.any(axis=(1, 2)))
    z1 = min(arr.shape[0], (zs[-1] + 1) * kz + int(round(margen_mm / sz)))
    z0 = max(0, z1 - int(round(alto_mm / sz)))
    plano = cuerpo[z0 // kz:].any(axis=0)
    ys, xs = np.flatnonzero(plano.any(axis=1)), np.flatnonzero(plano.any(axis=0))
    my, mx = int(round(margen_mm / sy)), int(round(margen_mm / sx))
    y0, y1 = max(0, ys[0] * kxy - my), min(arr.shape[1], (ys[-1] + 1) * kxy + my)
    x0, x1 = max(0, xs[0] * kxy - mx), min(arr.shape[2], (xs[-1] + 1) * kxy + mx)
    return z0, z1, y0, y1, x0, x1


def esfera(forma, espaciado, centro_idx, radio_mm: float) -> tuple[tuple[slice, ...], np.ndarray]:
    """Trozo del volumen [z, y, x] que toca la esfera y su máscara dentro de ese trozo."""
    sx, sy, sz = espaciado
    cx, cy, cz = centro_idx
    cortes, ejes = [], []
    for c, s, n in ((cz, sz, forma[0]), (cy, sy, forma[1]), (cx, sx, forma[2])):
        a, b = max(0, int(np.floor(c - radio_mm / s))), min(n, int(np.ceil(c + radio_mm / s)) + 1)
        cortes.append(slice(a, b))
        ejes.append((np.arange(a, b) - c) * s)
    zz, yy, xx = np.meshgrid(*ejes, indexing="ij")
    return tuple(cortes), zz**2 + yy**2 + xx**2 <= radio_mm**2


def _grupo(ds, cuadro: int, secuencia: str):
    """Un grupo funcional de un DICOM multiframe: el del cuadro si lo trae, o el compartido."""
    por_cuadro = ds.PerFrameFunctionalGroupsSequence[cuadro]
    if secuencia in por_cuadro:
        return por_cuadro[secuencia][0]
    return ds.SharedFunctionalGroupsSequence[0][secuencia][0]


def leer_serie(zf: zipfile.ZipFile, nombres: list[str]):
    """Volumen crudo [corte, fila, columna] ordenado, su geometría y la posición de cada corte.

    Una serie es una carpeta de DICOM de un corte cada uno o, en parte de las angio-RM,
    un solo DICOM multiframe con todos los cortes dentro.
    """
    multiframe = False
    if len(nombres) == 1:
        ds = pydicom.dcmread(io.BytesIO(zf.read(nombres[0])))
        multiframe = int(ds.get("NumberOfFrames", 1)) > 1
        if not multiframe:
            raise Excluida("pocos_cortes (1)")
        if "PerFrameFunctionalGroupsSequence" not in ds:
            raise Excluida("sin_geometria")
        n = int(ds.NumberOfFrames)
        try:
            iop = np.array(_grupo(ds, 0, "PlaneOrientationSequence").ImageOrientationPatient, dtype=float)
            pixel = [float(v) for v in _grupo(ds, 0, "PixelMeasuresSequence").PixelSpacing]
            posiciones = np.array([_grupo(ds, k, "PlanePositionSequence").ImagePositionPatient for k in range(n)],
                                  dtype=float)
        except (KeyError, AttributeError, IndexError):
            raise Excluida("sin_geometria") from None
        ref, pixeles, claves = ds, ds.pixel_array, list(range(n))
    else:
        if len(nombres) < MIN_CORTES:
            raise Excluida(f"pocos_cortes ({len(nombres)})")
        cortes = []
        for nombre in nombres:
            ds = pydicom.dcmread(io.BytesIO(zf.read(nombre)))
            if int(ds.get("NumberOfFrames", 1)) > 1:
                raise Excluida("multiframe_entre_cortes")
            if "ImagePositionPatient" not in ds or "ImageOrientationPatient" not in ds:
                raise Excluida("sin_geometria")
            cortes.append(ds)
        ref = cortes[0]
        iop = np.array(ref.ImageOrientationPatient, dtype=float)
        for ds in cortes:
            if (ds.Rows, ds.Columns) != (ref.Rows, ref.Columns):
                raise Excluida("tamano_distinto_entre_cortes")
            if np.abs(np.array(ds.ImageOrientationPatient, dtype=float) - iop).max() > 1e-3:
                raise Excluida("orientacion_distinta_entre_cortes")
            if list(ds.PixelSpacing) != list(ref.PixelSpacing):
                raise Excluida("pixel_distinto_entre_cortes")
        pixel = [float(v) for v in ref.PixelSpacing]
        posiciones = np.array([ds.ImagePositionPatient for ds in cortes], dtype=float)
        pixeles, claves = None, [str(ds.SOPInstanceUID) for ds in cortes]

    dir_fila, dir_col = iop[:3], iop[3:]
    normal = np.cross(dir_fila, dir_col)
    conservar, dz, repetidos = ordenar_cortes(posiciones, normal)
    if multiframe:
        vol = np.ascontiguousarray(pixeles[conservar])
    else:
        vol = np.stack([cortes[k].pixel_array for k in conservar])
    geo = {
        "dir_fila": dir_fila, "dir_col": dir_col, "normal": normal,
        "sx": pixel[1], "sy": pixel[0], "dz": dz, "origen": posiciones[conservar[0]],
        # Posición de cada corte: por SOPInstanceUID, o por n.º de cuadro en un multiframe.
        "pos_corte": {clave: posiciones[k] for k, clave in enumerate(claves)}, "multiframe": multiframe,
        "pendiente": ref.get("RescaleSlope"), "ordenada": ref.get("RescaleIntercept"),
        "paciente": str(ref.get("PatientID", "")), "fabricante": str(ref.get("Manufacturer", "")),
        "descripcion": str(ref.get("SeriesDescription", "")),
        "repetidos": repetidos, "cortes": len(claves),
    }
    return vol, geo


def convertir(zf: zipfile.ZipFile, nombres: list[str], puntos: list[dict], salida: Path, caso: str,
              radio_mm: float, alto_mm: float, modalidad: str = "CTA") -> dict:
    """Convierte una serie y devuelve los campos del manifest que dependen de la imagen."""
    vol, geo = leer_serie(zf, nombres)
    info = {"paciente": geo["paciente"], "fabricante": geo["fabricante"], "descripcion": geo["descripcion"],
            "cortes": geo["cortes"], "repetidos": geo["repetidos"]}
    try:
        if modalidad == "CTA":
            vol = vol.astype(np.int16, copy=False)
            nombre_hu, m, b = elegir_hu(vol, geo["pendiente"], geo["ordenada"])
            if (m, b) != (1.0, 0.0):
                vol = (vol.astype(np.float32) * m + b).round()
            vol = np.clip(vol, HU_MIN, HU_MAX).astype(np.int16)
            info["conversion_hu"] = nombre_hu
        else:
            # En RM la intensidad no tiene unidades: se deja tal cual y nnU-Net normaliza cada imagen.
            vol = vol.astype(np.int16 if vol.min() >= -32768 and vol.max() <= 32767 else np.float32)

        img = sitk.GetImageFromArray(vol)
        del vol
        img.SetSpacing((geo["sx"], geo["sy"], geo["dz"]))
        img.SetOrigin(tuple(geo["origen"]))
        img.SetDirection(np.column_stack([geo["dir_fila"], geo["dir_col"], geo["normal"]]).ravel().tolist())
        img = sitk.DICOMOrient(img, "LPS")
        arr = sitk.GetArrayViewFromImage(img)
        if modalidad == "CTA":  # la angio-RM ya cubre solo la cabeza
            z0, z1, y0, y1, x0, x1 = recorte_cabeza(arr, img.GetSpacing(), alto_mm)
            img = img[x0:x1, y0:y1, z0:z1]
            arr = sitk.GetArrayViewFromImage(img)
            info["recorte"] = f"z{z0}:{z1} y{y0}:{y1} x{x0}:{x1}"
            info["hu_p995"] = int(np.percentile(arr[::4, ::4, ::4], 99.5))
        info["forma"] = "x".join(str(n) for n in img.GetSize())
        info["espaciado_mm"] = "x".join(f"{s:.3f}" for s in img.GetSpacing())
        brillo_vaso = float(np.percentile(arr[::4, ::4, ::4], 99.5))

        etiqueta = np.zeros(arr.shape, dtype=np.uint8)
        en_puntos = []
        for p in puntos:
            clave = p["cuadro"] if geo["multiframe"] else p["sop"]
            if clave not in geo["pos_corte"]:
                raise Excluida("punto_en_corte_inexistente")
            fisico = geo["pos_corte"][clave] + p["x"] * geo["sx"] * geo["dir_fila"] + p["y"] * geo["sy"] * geo["dir_col"]
            idx = img.TransformPhysicalPointToContinuousIndex(tuple(fisico))
            if any(not -0.5 <= i <= n - 0.5 for i, n in zip(idx, img.GetSize())):
                raise Excluida("punto_fuera_del_recorte" if modalidad == "CTA" else "punto_fuera_del_volumen")
            donde, dentro = esfera(arr.shape, img.GetSpacing(), idx, radio_mm)
            etiqueta[donde][dentro] = 1
            donde, dentro = esfera(arr.shape, img.GetSpacing(), idx, RADIO_CONTROL_MM)
            en_puntos.append(float(arr[donde][dentro].max()))
        if en_puntos:
            if modalidad == "CTA":
                info["hu_max_en_punto"] = int(min(en_puntos))
            elif brillo_vaso > 0:
                info["brillo_rel_en_punto"] = round(min(en_puntos) / brillo_vaso, 2)
    except Excluida as e:
        e.info = info
        raise

    for sub in ("imagesTr", "labelsTr"):
        (salida / sub).mkdir(parents=True, exist_ok=True)
    img_etiqueta = sitk.GetImageFromArray(etiqueta)
    img_etiqueta.CopyInformation(img)
    # Primero la etiqueta: si el proceso muere a medias no queda una imagen sin etiqueta.
    sitk.WriteImage(img_etiqueta, str(salida / "labelsTr" / f"{caso}.nii.gz"), useCompression=True)
    sitk.WriteImage(img, str(salida / "imagesTr" / f"{caso}_0000.nii.gz"), useCompression=True)
    return info


_ZIP: zipfile.ZipFile | None = None


def _abrir_zip(ruta: str):
    global _ZIP
    _ZIP = zipfile.ZipFile(ruta)


def _tarea(t: dict) -> dict:
    fila = dict(t["fila"])
    try:
        fila.update(convertir(_ZIP, t["nombres"], t["puntos"], Path(t["salida"]), fila["caso"],
                              t["radio_mm"], t["alto_mm"], fila["modalidad"]))
        fila["estado"] = "ok"
        # Avisos: la serie se convierte, pero queda marcada para decidir si entra a entrenar.
        avisos = []
        if fila.get("hu_max_en_punto", HU_CONTRASTE) < HU_CONTRASTE:
            avisos.append("punto_sin_contraste_cerca")
        if fila.get("brillo_rel_en_punto", BRILLO_VASO) < BRILLO_VASO:
            avisos.append("punto_sin_vaso_brillante_cerca")
        if fila.get("hu_p995", HU_HUESO) < HU_HUESO:
            avisos.append("sin_hueso")
        fila["motivo"] = "; ".join(avisos)
    except Excluida as e:
        fila.update(getattr(e, "info", {}))
        fila.update(estado="excluida", motivo=str(e))
    except Exception as e:  # una serie rota no tumba la tanda; queda anotada
        fila.update(estado="error", motivo=f"{type(e).__name__}: {e}")
    return fila


def leer_manifest(ruta: Path) -> list[dict]:
    if not ruta.exists():
        return []
    with ruta.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def escribir_dataset_json(salida: Path, modalidad: str):
    ok = [f for f in leer_manifest(salida / "manifest.csv") if f["estado"] == "ok"]
    canal = "CT" if modalidad == "CTA" else modalidad
    (salida / "dataset.json").write_text(json.dumps({
        "channel_names": {"0": canal},
        "labels": {"background": 0, "aneurysm": 1},
        "numTraining": len(ok),
        "file_ending": ".nii.gz",
    }, indent=2) + "\n", encoding="utf-8")


def elegir_series(filas: list[dict], limite: int | None, semilla: int) -> list[dict]:
    """Todas, o `limite` series con la misma proporción de positivas que el total."""
    if not limite or limite >= len(filas):
        return filas
    rng = random.Random(semilla)
    pos = [f for f in filas if f["Aneurysm Present"] == "1"]
    neg = [f for f in filas if f["Aneurysm Present"] != "1"]
    n_pos = round(limite * len(pos) / len(filas))
    return rng.sample(pos, n_pos) + rng.sample(neg, limite - n_pos)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--modalidad", default="CTA")
    ap.add_argument("--limite", type=int, help="n.º de series, con la proporción de positivas del total")
    ap.add_argument("--semilla", type=int, default=0)
    ap.add_argument("--series", default="", help="SeriesInstanceUID separados por comas")
    ap.add_argument("--radio-mm", type=float, default=4.0)
    ap.add_argument("--alto-mm", type=float, default=180.0)
    ap.add_argument("--procesos", type=int, default=2)
    args = ap.parse_args(argv)

    zf = zipfile.ZipFile(args.zip)
    with zf.open("train.csv") as f:
        series = [r for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")) if r["Modality"] == args.modalidad]
    puntos = collections.defaultdict(list)
    with zf.open("train_localizers.csv") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
            xy = ast.literal_eval(r["coordinates"])
            puntos[r["SeriesInstanceUID"]].append(
                {"sop": r["SOPInstanceUID"], "x": float(xy["x"]), "y": float(xy["y"]),
                 "cuadro": int(xy["f"]) if "f" in xy else None, "ubicacion": r["location"]})
    if args.series:
        pedidas = set(args.series.split(","))
        series = [r for r in series if r["SeriesInstanceUID"] in pedidas]
    series = elegir_series(series, args.limite, args.semilla)

    args.salida.mkdir(parents=True, exist_ok=True)
    ruta_manifest = args.salida / "manifest.csv"
    hechas = {f["series_uid"] for f in leer_manifest(ruta_manifest)}
    series = [r for r in series if r["SeriesInstanceUID"] not in hechas]
    print(f"{len(series)} series por convertir ({len(hechas)} ya en el manifest)", flush=True)
    if not series:
        escribir_dataset_json(args.salida, args.modalidad)
        return 0

    ficheros = collections.defaultdict(list)
    pendientes = {r["SeriesInstanceUID"] for r in series}
    for nombre in zf.namelist():
        partes = nombre.split("/")
        if len(partes) == 3 and partes[0] == "series" and partes[1] in pendientes:
            ficheros[partes[1]].append(nombre)
    zf.close()

    tareas = []
    for r in series:
        uid = r["SeriesInstanceUID"]
        tareas.append({
            "nombres": ficheros[uid], "puntos": puntos[uid], "salida": str(args.salida),
            "radio_mm": args.radio_mm, "alto_mm": args.alto_mm,
            "fila": {"caso": id_caso(uid), "series_uid": uid, "modalidad": r["Modality"],
                     "aneurisma": r["Aneurysm Present"], "n_aneurismas": len(puntos[uid]),
                     "ubicaciones": "; ".join(p["ubicacion"] for p in puntos[uid]),
                     "edad": r["PatientAge"], "sexo": r["PatientSex"]},
        })

    nuevo = not ruta_manifest.exists()
    resumen = collections.Counter()
    with ruta_manifest.open("a", newline="", encoding="utf-8") as f, \
            multiprocessing.Pool(args.procesos, _abrir_zip, (str(args.zip),)) as pool:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        if nuevo:
            w.writeheader()
        for n, fila in enumerate(pool.imap_unordered(_tarea, tareas), 1):
            w.writerow({k: fila.get(k, "") for k in CAMPOS})
            f.flush()
            resumen[(fila["estado"], fila.get("motivo", "").split(" (")[0])] += 1
            print(f"[{n}/{len(tareas)}] {fila['caso']} {fila['estado']} {fila.get('motivo', '')}", flush=True)

    escribir_dataset_json(args.salida, args.modalidad)
    print("\nResumen de esta tanda:")
    for (estado, motivo), n in sorted(resumen.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5d}  {estado}  {motivo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
