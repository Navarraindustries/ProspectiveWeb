"""Zenodo: parecido de nuestra malla con el saco que marcó el experto (Dice y HD95).

Por qué así. Cada STL de Zenodo es SOLO el saco, cerrado. Nuestra malla es
todo el árbol de vasos, y el cuello no lo pone la segmentación sino el usuario
(services/sac_isolation), así que no hay un «saco nuestro» que comparar uno a
uno. Se compara la pared: los dos se pasan a vóxeles en una caja alrededor del
saco, y

  · recubrimiento = parte del saco del experto que nuestra malla rellena
    (no depende del cuello);
  · Dice en una banda de r mm alrededor del saco: nuestra malla se recorta a
    ≤ r mm del saco del experto. Lo que entra de la arteria madre en esa banda
    cuenta EN CONTRA, así que la cifra es prudente; se da con 1 y 2 mm para que
    se vea cuánto pesa;
  · HD95 simétrico entre las dos paredes: del experto a la nuestra entera, y de
    la nuestra (solo la pared real a ≤ 2 mm del saco, sin las caras del
    recorte) a la del experto;
  · desvío medio de la pared: signo + = nuestra pared queda por fuera de la del
    experto (sobresegmenta), − = por dentro.

Las mallas son las de la receta actual de la app (`zenodo_seg_v3`, una por
estudio, con su marco en el JSON); no se vuelve a segmentar.

Uso (desde backend/), por tandas, que VTK no suelta memoria entre estudios:
    .venv/Scripts/python.exe scripts/dice_zenodo.py --seg data/zenodo_seg_v3 \
        --out data/zenodo_dice_v3 --limit 20
    .venv/Scripts/python.exe scripts/dice_zenodo.py --out data/zenodo_dice_v3 --summary
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "Archivos DICOM"
#: Bandas (mm) en las que se recorta nuestra malla para el Dice.
BANDAS_MM = (1.0, 2.0)
#: Banda de nuestra pared que entra en el HD95 (mm).
BANDA_HD_MM = 2.0
#: Margen de la caja alrededor del saco (mm): más que la banda mayor.
MARGEN_MM = 3.0
#: Pared del experto a más de esto dentro de nuestra luz = la tapa de la boca.
BOCA_HONDA_MM = 0.5
#: La boca ajustada a un plano: desvío cuadrático medio máximo (mm).
BOCA_PLANA_MM = 0.5
#: Profundidad dentro del saco del experto a partir de la cual un vacío es hueco (mm).
HUECO_MM = 1.5


# ── Vóxeles ────────────────────────────────────────────────────────────────── #

def espaciado_para(extension_mm: float) -> float:
    """Unos 100 vóxeles a lo largo del saco, entre 0,1 y 0,25 mm."""
    return float(min(0.25, max(0.1, extension_mm / 100.0)))


def a_voxeles(poly, origen, espaciado: float, dims) -> np.ndarray:
    """Máscara (z, y, x) del interior de una superficie cerrada en la rejilla dada."""
    import vtk
    from vtkmodules.util import numpy_support as ns

    img = vtk.vtkImageData()
    img.SetOrigin(*[float(v) for v in origen])
    img.SetSpacing(espaciado, espaciado, espaciado)
    img.SetDimensions(*[int(d) for d in dims])
    img.AllocateScalars(vtk.VTK_UNSIGNED_CHAR, 1)
    img.GetPointData().GetScalars().Fill(1)

    st = vtk.vtkPolyDataToImageStencil()
    st.SetInputData(poly)
    st.SetOutputOrigin(img.GetOrigin())
    st.SetOutputSpacing(img.GetSpacing())
    st.SetOutputWholeExtent(img.GetExtent())
    st.Update()

    cut = vtk.vtkImageStencil()
    cut.SetInputData(img)
    cut.SetStencilConnection(st.GetOutputPort())
    cut.ReverseStencilOff()
    cut.SetBackgroundValue(0)
    cut.Update()
    arr = ns.vtk_to_numpy(cut.GetOutput().GetPointData().GetScalars())
    nx, ny, nz = (int(d) for d in dims)
    return arr.reshape(nz, ny, nx).astype(bool)


def _superficie(m: np.ndarray) -> np.ndarray:
    from scipy import ndimage
    if not m.any():
        return m.copy()
    return m & ~ndimage.binary_erosion(m, border_value=0)


def _edt(m: np.ndarray, espaciado: float) -> np.ndarray:
    """Distancia (mm) de cada vóxel al vóxel marcado más cercano."""
    from scipy import ndimage
    if not m.any():
        return np.full(m.shape, np.inf)
    return ndimage.distance_transform_edt(~m, sampling=espaciado)


def dice(a: np.ndarray, b: np.ndarray) -> float:
    s = int(a.sum()) + int(b.sum())
    return 2.0 * int((a & b).sum()) / s if s else 1.0


def boca_del_saco(gt: np.ndarray, nuestra: np.ndarray, espaciado: float,
                  hondo_mm: float = BOCA_HONDA_MM) -> np.ndarray:
    """La parte de la pared del experto que cae en el fondo de nuestra luz.

    El STL cierra el saco con una tapa que cruza la luz del vaso portador: esa
    parte de su pared queda dentro de nuestra malla, lejos de nuestra pared. La
    pared de verdad del saco, en cambio, cae cerca de la nuestra.
    """
    from scipy import ndimage
    sup_gt = _superficie(gt)
    if not sup_gt.any() or not nuestra.any():
        return np.zeros_like(gt)
    hondo = ndimage.distance_transform_edt(nuestra, sampling=espaciado)
    return sup_gt & (hondo > hondo_mm)


def lado_de_la_madre(gt: np.ndarray, nuestra: np.ndarray, espaciado: float,
                     hondo_mm: float = BOCA_HONDA_MM, min_voxeles: int = 10,
                     plano_max_mm: float = BOCA_PLANA_MM) -> np.ndarray:
    """Lo que queda al otro lado del plano de la boca: la arteria madre.

    Es lo que hace el usuario en la app (services/sac_isolation): pone un plano
    de cuello y el saco es lo que queda del lado del domo. Aquí el plano se
    ajusta a la boca del saco del experto (`boca_del_saco`), con la normal
    hacia su centro. Lo que sobra de nuestra malla por encima del plano sigue
    contando como sobresegmentación; lo de debajo es el vaso portador.
    Sin boca (nuestra malla no rellena el cuello) no se quita nada.
    """
    from scipy import ndimage
    boca = boca_del_saco(gt, nuestra, espaciado, hondo_mm)
    if int(boca.sum()) < min_voxeles:
        return np.zeros_like(gt)
    # La tapa del cuello es UNA pieza plana; manchas sueltas por la pared
    # (nuestra pared un poco por fuera) no son boca.
    lab, n_lab = ndimage.label(boca, structure=np.ones((3, 3, 3)))
    if n_lab > 1:
        lab_mayor = 1 + int(np.argmax(ndimage.sum(boca, lab, range(1, n_lab + 1))))
        boca = lab == lab_mayor
    if int(boca.sum()) < min_voxeles:
        return np.zeros_like(gt)
    pb = np.argwhere(boca).astype(np.float64)
    c = pb.mean(0)
    _, sv, vt = np.linalg.svd(pb - c, full_matrices=False)
    n = vt[2]
    if sv[2] / math.sqrt(len(pb)) * espaciado > plano_max_mm:
        return np.zeros_like(gt)            # no es una tapa plana: sin plano
    if (np.argwhere(gt).mean(0) - c) @ n < 0:
        n = -n
    zz, yy, xx = np.indices(gt.shape, dtype=np.float32)
    lado = (zz - c[0]) * n[0] + (yy - c[1]) * n[1] + (xx - c[2]) * n[2]
    return (lado < 0) & ~gt


def comparar(gt: np.ndarray, nuestra: np.ndarray, espaciado: float,
             bandas=BANDAS_MM, banda_hd: float = BANDA_HD_MM) -> dict:
    """Todas las cifras de una lesión a partir de las dos máscaras en la misma rejilla."""
    dist_gt = _edt(gt, espaciado)                 # 0 dentro del saco del experto
    madre = lado_de_la_madre(gt, nuestra, espaciado)
    out: dict = {"gt_mm3": float(gt.sum()) * espaciado ** 3,
                 "recubrimiento": float((gt & nuestra).sum() / gt.sum()) if gt.any() else None}
    # Hueco interior: saco del experto que nuestra malla deja vacío lejos de
    # su pared (más de HUECO_MM dentro). Una pared desplazada no llega ahí; un
    # saco hueco, sí.
    if gt.any():
        from scipy import ndimage
        hondo_gt = ndimage.distance_transform_edt(gt, sampling=espaciado)
        out["hueco_interior"] = float((gt & ~nuestra & (hondo_gt > HUECO_MM)).sum() / gt.sum())
    out["plano_boca"] = bool(madre.any())
    for r in bandas:
        recorte = nuestra & (dist_gt <= r)
        out[f"dice_{r:g}mm"] = dice(gt, recorte)
        out[f"precision_{r:g}mm"] = float((gt & recorte).sum() / recorte.sum()) if recorte.any() else None
        sin = recorte & ~madre
        out[f"dice_sin_madre_{r:g}mm"] = dice(gt, sin)

    sup_gt = _superficie(gt)
    sup_n = _superficie(nuestra)
    if not sup_n.any() or not sup_gt.any():
        out.update({"hd95_mm": None, "hd95_gt_a_nuestra_mm": None, "hd95_nuestra_a_gt_mm": None,
                    "assd_mm": None, "desvio_mm": None})
        return out
    d_a_n = _edt(sup_n, espaciado)[sup_gt]        # pared del experto → la nuestra
    cerca = sup_n & (dist_gt <= banda_hd + 1e-6) & ~madre
    d_a_gt = _edt(sup_gt, espaciado)[cerca] if cerca.any() else np.array([np.inf])
    h1 = float(np.percentile(d_a_n, 95))
    h2 = float(np.percentile(d_a_gt, 95))
    # Desvío con signo de la pared del experto respecto de la nuestra: si su
    # pared cae dentro de nuestra máscara, la nuestra está por fuera (+).
    dentro = nuestra[sup_gt]
    signo = np.where(dentro, 1.0, -1.0)
    out.update({
        "hd95_mm": max(h1, h2),
        "hd95_gt_a_nuestra_mm": h1,
        "hd95_nuestra_a_gt_mm": h2,
        "assd_mm": float((d_a_n.sum() + d_a_gt.sum()) / (len(d_a_n) + len(d_a_gt))),
        "desvio_mm": float(np.mean(signo * d_a_n)),
    })
    return out


# ── Una lesión, un estudio ─────────────────────────────────────────────────── #

def _leer_stl(path: Path):
    import vtk
    r = vtk.vtkSTLReader()
    r.SetFileName(str(path))
    r.Update()
    return r.GetOutput()


def stl_a_malla(poly, origen, direccion):
    """El STL (coordenadas de paciente) en coordenadas de la malla: D^T (p − o)."""
    import vtk
    from vtkmodules.util import numpy_support as ns
    pts = ns.vtk_to_numpy(poly.GetPoints().GetData()).astype(np.float64)
    D = np.asarray(direccion, dtype=np.float64).reshape(3, 3)
    nuevos = (pts - np.asarray(origen, dtype=np.float64)) @ D
    out = vtk.vtkPolyData()
    out.DeepCopy(poly)
    p = vtk.vtkPoints()
    p.SetData(ns.numpy_to_vtk(np.ascontiguousarray(nuevos), deep=True))
    out.SetPoints(p)
    return out


def evaluar_lesion(stl_malla, malla) -> dict:
    """Cifras de una lesión: el STL ya en coordenadas de la malla."""
    b = np.asarray(stl_malla.GetBounds(), dtype=np.float64).reshape(3, 2)
    ext = float((b[:, 1] - b[:, 0]).max())
    esp = espaciado_para(ext)
    origen = b[:, 0] - MARGEN_MM
    dims = np.ceil((b[:, 1] - b[:, 0] + 2 * MARGEN_MM) / esp).astype(int) + 1
    gt = a_voxeles(stl_malla, origen, esp, dims)
    nuestra = a_voxeles(malla, origen, esp, dims)
    r = comparar(gt, nuestra, esp)
    r.update({"espaciado_mm": esp, "extension_mm": round(ext, 2)})
    return r


def evaluar_estudio(sid: str, seg: Path, dataset: Path) -> dict:
    from services.segmentation import read_vtp

    rec = json.loads((seg / f"{sid}.json").read_text(encoding="utf-8"))
    out = {"study": sid, "status": rec.get("status"), "lesions": []}
    les = rec.get("lesions") or []
    if not les:
        return out
    malla_p = seg / "meshes" / f"{sid}.vtp"
    if rec.get("status") != "ok" or not malla_p.exists():
        out["status"] = "sin malla"
        return out
    malla = read_vtp(str(malla_p))
    fr = rec["frame"]
    for l in les:
        t = time.perf_counter()
        stl = stl_a_malla(_leer_stl(dataset / "Annotations" / l["file"]), fr["origin_mm"], fr["direction"])
        r = evaluar_lesion(stl, malla)
        r.update({k: l.get(k) for k in ("file", "diameter_mm", "size_class", "artery", "thrombus",
                                        "calcification", "surface_recall")})
        r["segundos"] = round(time.perf_counter() - t, 2)
        out["lesions"].append(r)
    return out


# ── Resumen ────────────────────────────────────────────────────────────────── #

def _med(v):
    v = [x for x in v if x is not None and math.isfinite(x)]
    if not v:
        return None
    q = np.percentile(v, [25, 50, 75])
    return {"n": len(v), "mediana": round(float(q[1]), 3), "p25": round(float(q[0]), 3),
            "p75": round(float(q[2]), 3), "media": round(float(np.mean(v)), 3),
            "de": round(float(np.std(v)), 3)}


def tam(d: float) -> str:
    return "<5" if d < 5 else ("5-10" if d < 10 else ">=10")


CAMPOS = ("recubrimiento", "hueco_interior", "dice_1mm", "dice_2mm", "dice_sin_madre_1mm", "dice_sin_madre_2mm",
          "precision_1mm", "hd95_mm",
          "hd95_gt_a_nuestra_mm", "hd95_nuestra_a_gt_mm", "assd_mm", "desvio_mm")


def resumir(lesiones: list[dict]) -> dict:
    grupos = {"todas": lesiones}
    for t in ("<5", "5-10", ">=10"):
        grupos[f"tam {t}"] = [l for l in lesiones if tam(l["diameter_mm"]) == t]
    grupos["con trombo"] = [l for l in lesiones if l.get("thrombus")]
    grupos["sin trombo"] = [l for l in lesiones if l.get("thrombus") is False]
    res = {}
    for g, ls in grupos.items():
        res[g] = {"n": len(ls), "sin_pared": sum(1 for l in ls if l.get("hd95_mm") is None),
                  "huecos": sum(1 for l in ls if (l.get("hueco_interior") or 0) > 0.02),
                  "sin_plano": sum(1 for l in ls if not l.get("plano_boca"))}
        for c in CAMPOS:
            res[g][c] = _med([l.get(c) for l in ls])
    return res


def cargar(out: Path) -> list[dict]:
    les = []
    for p in sorted(out.glob("[0-9]*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for l in d.get("lesions") or []:
            les.append({"study": d["study"], **l})
    return les


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seg", type=Path, default=Path("data/zenodo_seg_v3"),
                    help="carpeta con <id>.json y meshes/<id>.vtp")
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--studies", nargs="*")
    ap.add_argument("--limit", type=int, default=0, help="como mucho tantos estudios nuevos en esta tanda")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args(argv)
    a.out.mkdir(parents=True, exist_ok=True)

    if not a.summary:
        sids = a.studies or sorted(p.stem for p in a.seg.glob("[0-9]*.json"))
        hechos = 0
        for sid in sids:
            dst = a.out / f"{sid}.json"
            if dst.exists() and not a.redo:
                continue
            rec = json.loads((a.seg / f"{sid}.json").read_text(encoding="utf-8"))
            if not rec.get("lesions"):
                continue                       # control: no hay saco que comparar
            t = time.perf_counter()
            try:
                r = evaluar_estudio(sid, a.seg, a.dataset)
            except Exception as exc:  # noqa: BLE001 — un estudio roto no para la tanda
                r = {"study": sid, "status": f"error: {exc}", "lesions": []}
            dst.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
            ls = r["lesions"]
            print(f"{sid}: {len(ls)} lesiones, {time.perf_counter() - t:.1f} s · " + " · ".join(
                f"Ø{l['diameter_mm']:.1f} rec {l['recubrimiento']:.2f} D1 {l['dice_1mm']:.2f} "
                f"D1sm {l['dice_sin_madre_1mm']:.2f} D2sm {l['dice_sin_madre_2mm']:.2f} hueco {l['hueco_interior']:.2f} "
                f"HD95 {l['hd95_mm'] if l['hd95_mm'] is None else round(l['hd95_mm'], 2)}" for l in ls),
                flush=True)
            hechos += 1
            if a.limit and hechos >= a.limit:
                break

    les = cargar(a.out)
    res = resumir(les)
    (a.out / "resumen.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    for g, v in res.items():
        def f(c):
            m = v[c]
            return "—" if m is None else f"{m['mediana']:.2f} ({m['p25']:.2f}–{m['p75']:.2f})"
        print(f"{g:11s} n={v['n']:3d} · rec {f('recubrimiento')} · Dice1 {f('dice_1mm')} · "
              f"Dice2 {f('dice_2mm')} · sin madre {f('dice_sin_madre_1mm')} / {f('dice_sin_madre_2mm')} · "
              f"HD95 {f('hd95_mm')} · experto→nuestra {f('hd95_gt_a_nuestra_mm')} · desvío {f('desvio_mm')} · sin pared {v['sin_pared']} · huecos {v['huecos']} · sin plano {v['sin_plano']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
