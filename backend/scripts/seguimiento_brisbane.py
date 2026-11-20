"""O6: el mapa de cambios de Prospective sobre dos sesiones segmentadas de Royal Brisbane.

    python scripts/seguimiento_brisbane.py --anterior VASO.nii SACO.nii --actual VASO.nii SACO.nii --salida DIR

Royal Brisbane (OpenNeuro ds005096, CC0) trae la máscara del aneurisma y la de
«aneurisma con arteria madre» de UNA sesión por paciente; solo sub-039 tiene dos
(2016 y 2018). Aquí cada máscara se pasa a malla en coordenadas del paciente (las del
NIfTI) y se llama a `services.followup.compare` igual que hace la app: centros de la
lesión encima, ajuste fino con los vasos de alrededor y distancia con signo.

Como las mallas ya están en el paciente, las dos matrices malla→paciente son la identidad.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import vtk

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vtkmodules.util.numpy_support import numpy_to_vtk  # noqa: E402


def malla_de_mascara(ruta: Path, suavizado: int = 15) -> tuple[vtk.vtkPolyData, np.ndarray, float]:
    """Malla de una máscara NIfTI en mm del paciente, su centro y su vóxel mayor."""
    import SimpleITK as sitk

    img = sitk.ReadImage(str(ruta))
    arr = (sitk.GetArrayFromImage(img) > 0).astype(np.uint8)
    idx = np.argwhere(arr)
    if len(idx) == 0:
        raise ValueError(f"máscara vacía: {ruta}")
    # Solo la caja de la máscara, con un vóxel de margen: los volúmenes son de 512 × 512 × N.
    lo, hi = np.maximum(idx.min(axis=0) - 2, 0), np.minimum(idx.max(axis=0) + 3, arr.shape)
    caja = np.ascontiguousarray(arr[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]])
    vimg = vtk.vtkImageData()
    vimg.SetDimensions(caja.shape[2], caja.shape[1], caja.shape[0])
    vimg.GetPointData().SetScalars(numpy_to_vtk(caja.ravel(), deep=True))
    mc = vtk.vtkFlyingEdges3D()
    mc.SetInputData(vimg)
    mc.SetValue(0, 0.5)
    sm = vtk.vtkWindowedSincPolyDataFilter()  # quita el escalón del vóxel sin encoger
    sm.SetInputConnection(mc.GetOutputPort())
    sm.SetNumberOfIterations(suavizado)
    sm.SetPassBand(0.1)
    sm.Update()
    poly = sm.GetOutput()

    # Índice (x, y, z) de la caja → mm del paciente con la geometría del NIfTI.
    M = np.eye(4)
    M[:3, :3] = np.array(img.GetDirection()).reshape(3, 3) @ np.diag(img.GetSpacing())
    M[:3, 3] = img.TransformIndexToPhysicalPoint([int(lo[2]), int(lo[1]), int(lo[0])])
    t = vtk.vtkTransform()
    t.SetMatrix(M.ravel().tolist())
    f = vtk.vtkTransformPolyDataFilter()
    f.SetInputData(poly)
    f.SetTransform(t)
    f.Update()
    centro = np.array(img.TransformContinuousIndexToPhysicalPoint([float(v) for v in idx.mean(axis=0)[::-1]]))
    return f.GetOutput(), centro, float(max(img.GetSpacing()))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--anterior", type=Path, nargs=2, required=True, metavar=("VASO", "SACO"))
    ap.add_argument("--actual", type=Path, nargs=2, required=True, metavar=("VASO", "SACO"))
    ap.add_argument("--salida", type=Path, required=True)
    a = ap.parse_args(argv)

    from services import followup

    vaso_ant, _, vox_ant = malla_de_mascara(a.anterior[0])
    saco_ant, centro_ant, _ = malla_de_mascara(a.anterior[1])
    vaso_act, _, vox_act = malla_de_mascara(a.actual[0])
    saco_act, centro_act, _ = malla_de_mascara(a.actual[1])
    r = followup.compare(vaso_act, vaso_ant, np.eye(4), np.eye(4), centro_act, centro_ant, a.salida,
                         curr_sac=saco_act, prev_sac=saco_ant, voxel_mm=max(vox_ant, vox_act))
    d = {k: (str(v) if isinstance(v, Path) else v) for k, v in asdict(r).items() if k != "prev_to_curr"}
    d["distancia_entre_centros_mm"] = round(float(np.linalg.norm(centro_act - centro_ant)), 1)
    d["voxel_mayor_mm"] = max(vox_ant, vox_act)
    (a.salida / "resultado_o6.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(d, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
