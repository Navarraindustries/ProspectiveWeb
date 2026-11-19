"""La zona del cuello con todo el detalle (P6 del plan, Haegler 2026).

En Haegler 2026 las perforantes peri-aneurismáticas se veían en el modelo
impreso, delineado a mano, y se perdían en el holograma. Aquí se midió qué
borra las ramas finas junto al cuello (ver SIGMA_ZONA_FINA_VOX en
services.segmentation): no la decimación, sino el desenfoque previo a marching
cubes, que las parte en trozos que luego quita la limpieza de islas.

El cuello no se conoce al segmentar: lo fija la morfometría (o, en su defecto,
el candidato elegido). Por eso la segmentación guarda la máscara de la que
salió la malla (`vessel_mask.npz`, bits empaquetados: unos pocos MB) y, cuando
ya hay cuello, la malla se rehace desde esa máscara con la zona fina. Fuera de
la zona sale la misma malla que antes, con los mismos filtros.

Lo que NO hace: una perforante de 0,1–0,5 mm no llega a la máscara en una
angio-TC (ni casi nunca en 3DRA), y esto no la inventa. Recupera lo que la
máscara SÍ tenía y la superficie borraba.
"""
from __future__ import annotations

import io
import json
import logging
import os
from pathlib import Path
from typing import Callable

import numpy as np

logger = logging.getLogger(__name__)

NOMBRE = "vessel_mask.npz"

#: Radio por defecto de la zona fina. Las zonas de riesgo de las ramas del
#: cuello llegan a 8 mm (routers/perforators._ZONE_RADII); 10 mm las cubre con
#: la rampa de transición fuera.
RADIO_CUELLO_MM = 10.0
RADIO_MIN_MM, RADIO_MAX_MM = 4.0, 20.0

#: Fuera de la zona solo se conserva lo nuevo que queda a esta distancia de
#: algún vértice de la malla de trabajo (ver `ajustar_a_la_actual`): la arista
#: de la malla decimada ronda 0,5–0,8 mm, y la decimación desvía < 0,6 mm.
TOLERANCIA_EDICION_MM = 1.5


def guardar(meshes_dir: Path, sm: dict, huella: str, main_tree: bool = False) -> Path:
    """Escribe la máscara de `segment_tubular(keep_mask=True)` junto a la malla.

    `huella` es `mesh_fingerprint` de la malla que salió de ella: si la malla
    de trabajo deja de tenerla, es que se editó. `main_tree`: la segmentación
    se quedó con la pieza mayor (keep_main_tree), y la malla rehecha también.
    """
    mask = np.asarray(sm["mask"], dtype=bool)
    meta = {
        "shape": [int(v) for v in mask.shape],
        "spacing": [float(v) for v in sm["spacing"]],
        "shift_xyz": [float(v) for v in sm["shift_xyz"]],
        "surface_kw": dict(sm.get("surface_kw") or {}),
        "refine": sm.get("refine"),
        "huella": huella,
        "main_tree": bool(main_tree),
    }
    buf = io.BytesIO()
    np.savez_compressed(buf, bits=np.packbits(mask.ravel()), meta=np.array(json.dumps(meta)))
    dst = Path(meshes_dir) / NOMBRE
    tmp = dst.with_suffix(".tmp")
    tmp.write_bytes(buf.getvalue())
    os.replace(tmp, dst)
    return dst


def cargar(meshes_dir: Path) -> dict | None:
    """La máscara guardada y su meta, o None si no hay (segmentación anterior a P6)."""
    p = Path(meshes_dir) / NOMBRE
    if not p.exists():
        return None
    try:
        with np.load(p, allow_pickle=False) as z:
            meta = json.loads(str(z["meta"]))
            n = int(np.prod(meta["shape"]))
            mask = np.unpackbits(z["bits"], count=n).astype(bool).reshape(meta["shape"])
    except (OSError, ValueError, KeyError) as exc:
        logger.warning("Máscara de la malla ilegible (%s): %s", p, exc)
        return None
    return {**meta, "mask": mask}


def borrar(meshes_dir: Path) -> None:
    (Path(meshes_dir) / NOMBRE).unlink(missing_ok=True)


def rehacer(datos: dict, centro_mm, radio_mm: float,
            volumen: Callable[[], tuple[np.ndarray, tuple[float, float, float]]] | None = None):
    """La malla entera desde la máscara, con la esfera (centro, radio) fina.

    `centro_mm` en el marco de la malla. `volumen()` devuelve (volumen,
    espaciado) del estudio tal como se segmentó; solo se llama si la receta
    lleva-el-borde-a-media-altura (angio-TC, receta de vasos).
    """
    from services.band_refine import translate_poly
    from services.segmentation import mask_to_surface

    shift = np.asarray(datos["shift_xyz"], dtype=np.float64)
    c = tuple(float(v) for v in np.asarray(centro_mm, dtype=np.float64) - shift)
    sp = tuple(float(v) for v in datos["spacing"])
    poly = mask_to_surface(datos["mask"], sp, zona_fina=(c, float(radio_mm)), **datos["surface_kw"])
    ref = datos.get("refine")
    if ref:
        if volumen is None:
            raise ValueError("Esta malla se hizo con la receta de vasos de angio-TC: hace falta el volumen.")
        from routers.segment import _downsample_mean
        from services.cta_vessels import refine_surface
        vol, vsp = volumen()
        vol = vol[int(ref.get("z0", 0)):]
        if int(ref.get("factor", 1)) > 1:
            vol, _sp, _f = _downsample_mean(vol, vsp, int(ref["factor"]))
        poly = refine_surface(poly, vol, sp, float(ref["background_hu"]),
                              low_hu=float(ref["low_hu"]), cap_hu=float(ref["cap_hu"]))
        del vol
    if np.any(shift != 0):
        poly = translate_poly(poly, tuple(shift))
    return poly


def ajustar_a_la_actual(nueva, actual, centro_mm, radio_mm: float,
                        tol_mm: float = TOLERANCIA_EDICION_MM):
    """Lo de `nueva` que corresponde a la malla de trabajo `actual`.

    La máscara guardada es la de ANTES de quedarse con el árbol principal
    (keep_main_tree) y de cualquier edición, así que rehecha trae piezas que
    la malla de trabajo ya no tiene (en angio-TC, a menudo hueso). Dos reglas:

    1. Pieza conexa de `nueva` sin ningún vértice a ≤ tol_mm de la actual: fuera.
    2. En las piezas que quedan, un triángulo fuera de la zona se queda solo si su
       centro cae a ≤ tol_mm de algún vértice de la actual (así un recorte o un
       borrado siguen hechos). Dentro de la zona se queda todo: es lo que se pidió ver.

    Una rama fina que la superficie de antes partía en islas, con la zona fina
    sale unida al árbol, y por eso entra por la regla 1.
    """
    import vtk
    from scipy.spatial import cKDTree
    from vtkmodules.util import numpy_support as ns

    cf = vtk.vtkPolyDataConnectivityFilter()
    cf.SetInputData(nueva)
    cf.SetExtractionModeToAllRegions(); cf.ColorRegionsOn(); cf.Update()
    col = cf.GetOutput()
    P = ns.vtk_to_numpy(col.GetPoints().GetData()).astype(np.float64)
    T = ns.vtk_to_numpy(col.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    reg = ns.vtk_to_numpy(col.GetPointData().GetArray("RegionId"))
    kd = cKDTree(ns.vtk_to_numpy(actual.GetPoints().GetData()).astype(np.float64))

    d_pts, _ = kd.query(P, distance_upper_bound=tol_mm)
    regiones_vivas = np.unique(reg[np.isfinite(d_pts)])
    cent = P[T].mean(axis=1)
    d_cent, _ = kd.query(cent, distance_upper_bound=tol_mm)
    en_zona = np.linalg.norm(cent - np.asarray(centro_mm, dtype=np.float64), axis=1) <= radio_mm
    keep = np.isin(reg[T[:, 0]], regiones_vivas) & (en_zona | np.isfinite(d_cent))
    T = T[keep]
    usados, nuevo = np.unique(T, return_inverse=True)
    pts = vtk.vtkPoints()
    pts.SetData(ns.numpy_to_vtk(np.ascontiguousarray(P[usados]), deep=True))
    ca = vtk.vtkCellArray()
    ca.SetData(ns.numpy_to_vtkIdTypeArray(np.arange(0, 3 * len(T) + 1, 3, dtype=np.int64), deep=True),
               ns.numpy_to_vtkIdTypeArray(nuevo.reshape(-1).astype(np.int64), deep=True))
    out = vtk.vtkPolyData(); out.SetPoints(pts); out.SetPolys(ca)
    return out


def ajustar(nueva, actual, datos: dict, centro_mm, radio_mm: float, huellas_limpias: set[str]):
    """Deja `nueva` como quedaría la malla de trabajo con la zona fina.

    Primero lo mismo que hizo la segmentación (la pieza mayor, si se quedó con
    ella). Si la malla de trabajo no se ha editado desde entonces —su huella es
    la de la segmentación o la de una zona fina anterior—, nada más: la malla
    rehecha ES la de trabajo con el cuello fino. Si se editó, se recorta a lo
    que la de trabajo conserva (`ajustar_a_la_actual`).
    """
    import vtk

    from routers.segment import mesh_fingerprint

    if datos.get("main_tree"):
        cf = vtk.vtkPolyDataConnectivityFilter()
        cf.SetInputData(nueva); cf.SetExtractionModeToLargestRegion(); cf.Update()
        cl = vtk.vtkCleanPolyData(); cl.SetInputConnection(cf.GetOutputPort()); cl.Update()
        nueva = cl.GetOutput()
    if mesh_fingerprint(actual) in huellas_limpias:
        return nueva
    return ajustar_a_la_actual(nueva, actual, centro_mm, radio_mm)
