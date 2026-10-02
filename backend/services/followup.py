"""Superponer un estudio anterior al actual y ver DÓNDE ha cambiado el aneurisma.

La comparación longitudinal ya decía CUÁNTO (diámetro, volumen…). Esto dice
dónde: cada punto de la superficie actual cerca de la lesión se colorea con su
distancia al estudio anterior, hacia fuera (creció) o hacia dentro.

Cómo se superponen dos estudios
-------------------------------
Cada malla está en mm desde el primer vóxel de SU volumen. Primero se lleva
cada una al espacio del paciente con la geometría DICOM de su serie (posición
de cada corte y orientación): los ejes anatómicos son los mismos en los dos
estudios, el origen no (depende de la mesa del escáner). Después:

1. se superponen los centros de la lesión;
2. se afina con un ajuste rígido (ICP) de los VASOS que rodean la lesión, que
   no deberían haber cambiado; la lesión misma se excluye del ajuste, para no
   «corregir» el crecimiento que se quiere medir.

El residuo del ajuste en esos vasos es el RUIDO de la comparación: un cambio
menor que él (o que el vóxel mayor de los dos estudios) no se distingue. Se
devuelve, y el panel no llama crecimiento a nada por debajo.

Lo que no resuelve: dos modalidades distintas (angio-TC frente a 3D-RA)
segmentan la pared de forma distinta y eso aparece como un desplazamiento
uniforme; un umbral distinto en cada estudio, igual. Se avisa cuando las
modalidades no coinciden.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import vtk
from vtkmodules.util.numpy_support import numpy_to_vtk, vtk_to_numpy

logger = logging.getLogger(__name__)

#: Radio alrededor de la lesión donde se ajustan los vasos y se pinta el mapa.
ROI_MM = 20.0
#: Radio de la lesión que se EXCLUYE del ajuste (lo que se quiere medir).
LESION_EXCLUDE_MM = 7.0
#: Por debajo de esto el signo no se calcula (el cambio es ~0).
SIGN_MIN_MM = 0.05
#: Nombre del campo con el cambio, en mm (+ hacia fuera).
SCALAR = "cambio_mm"


@dataclass
class FollowupResult:
    map_path: Path                      # vasos actuales cerca de la lesión, con SCALAR
    ghost_path: Path | None             # saco anterior, ya superpuesto
    noise_mm: float                     # suelo de lo medible
    residual_median_mm: float           # ajuste de los vasos de alrededor
    max_growth_mm: float                # p98 del cambio hacia fuera en la lesión
    max_shrink_mm: float                # p98 hacia dentro
    grew_area_pct: float                # superficie de la lesión que salió más que el ruido
    volume_prev_mm3: float | None
    volume_curr_mm3: float | None
    rotation_deg: float                 # cuánto giró el ajuste fino
    warnings: list[str] = field(default_factory=list)


# ── Geometría DICOM → espacio del paciente ─────────────────────────────────── #

def mesh_to_patient(dicom_dir: Path, series_id: str, spacing_z: float) -> np.ndarray:
    """Afín 4×4: mm de la malla (x = columna, y = fila, z = corte) → paciente.

    Con la posición de los cortes en el orden de la carga, como el SEG."""
    import pydicom
    from services.dicom_loader import _series_file_names
    files = _series_file_names(series_id, dicom_dir)
    if not files:
        raise ValueError("No se encuentra la serie DICOM del estudio.")
    first = pydicom.dcmread(files[0], stop_before_pixels=True)
    pf = first.get("PerFrameFunctionalGroupsSequence")
    if len(files) == 1 and pf:
        ipps = np.array([f.PlanePositionSequence[0].ImagePositionPatient for f in pf], float)
        sh = first.SharedFunctionalGroupsSequence[0]
        po = (sh.get("PlaneOrientationSequence") or pf[0].PlaneOrientationSequence)[0]
        iop = np.array(po.ImageOrientationPatient, float)
    else:
        ipps = np.array([pydicom.dcmread(f, stop_before_pixels=True).ImagePositionPatient for f in files], float)
        iop = np.array(first.ImageOrientationPatient, float)
    rowdir, coldir = iop[:3], iop[3:]
    if len(ipps) > 1:
        step = (ipps[-1] - ipps[0]) / (len(ipps) - 1)
        slicedir = step / max(spacing_z, 1e-9)
    else:
        slicedir = np.cross(rowdir, coldir)
    A = np.eye(4)
    A[:3, 0], A[:3, 1], A[:3, 2], A[:3, 3] = rowdir, coldir, slicedir, ipps[0]
    return A


def _transform(poly: vtk.vtkPolyData, M: np.ndarray) -> vtk.vtkPolyData:
    t = vtk.vtkTransform()
    t.SetMatrix(M.ravel().tolist())
    f = vtk.vtkTransformPolyDataFilter()
    f.SetTransform(t)
    f.SetInputData(poly)
    f.Update()
    return f.GetOutput()


def _within(poly: vtk.vtkPolyData, center, r_out: float, r_in: float = 0.0) -> vtk.vtkPolyData:
    """Las celdas de la malla entre dos esferas centradas en `center`."""
    sph_out = vtk.vtkSphere(); sph_out.SetCenter(*center); sph_out.SetRadius(r_out)
    clip = vtk.vtkExtractPolyDataGeometry()
    clip.SetInputData(poly); clip.SetImplicitFunction(sph_out); clip.ExtractInsideOn()
    clip.ExtractBoundaryCellsOn(); clip.Update()
    out = clip.GetOutput()
    if r_in > 0:
        sph_in = vtk.vtkSphere(); sph_in.SetCenter(*center); sph_in.SetRadius(r_in)
        c2 = vtk.vtkExtractPolyDataGeometry()
        c2.SetInputData(out); c2.SetImplicitFunction(sph_in); c2.ExtractInsideOff(); c2.Update()
        out = c2.GetOutput()
    clean = vtk.vtkCleanPolyData(); clean.SetInputData(out); clean.Update()
    return clean.GetOutput()


def _icp(source: vtk.vtkPolyData, target: vtk.vtkPolyData) -> np.ndarray:
    icp = vtk.vtkIterativeClosestPointTransform()
    icp.SetSource(source)
    icp.SetTarget(target)
    icp.GetLandmarkTransform().SetModeToRigidBody()
    icp.SetMaximumNumberOfIterations(200)
    icp.SetMaximumNumberOfLandmarks(3000)
    icp.SetMaximumMeanDistance(1e-4)
    icp.StartByMatchingCentroidsOff()
    icp.Modified()
    icp.Update()
    m = icp.GetMatrix()
    return np.array([[m.GetElement(i, j) for j in range(4)] for i in range(4)])


def _closed_box(poly: vtk.vtkPolyData, center, half: float) -> vtk.vtkPolyData:
    """El trozo de la malla dentro de un cubo, CERRADO (las caras del corte
    tapadas), para poder decir qué queda dentro y qué fuera."""
    planes = vtk.vtkPlaneCollection()
    for axis in range(3):
        for sign in (1.0, -1.0):
            o = np.asarray(center, float).copy(); o[axis] -= sign * half
            n = np.zeros(3); n[axis] = sign            # apunta hacia el centro: se queda dentro
            pl = vtk.vtkPlane(); pl.SetOrigin(*o); pl.SetNormal(*n); planes.AddItem(pl)
    c = vtk.vtkClipClosedSurface(); c.SetInputData(poly); c.SetClippingPlanes(planes); c.Update()
    return c.GetOutput()


def _signed_distance(points: np.ndarray, surface: vtk.vtkPolyData, closed: vtk.vtkPolyData) -> np.ndarray:
    """Distancia a `surface` con signo + fuera / − dentro de `closed`.

    El signo no sale de las normales: con caras orientadas hacia dentro (una
    malla sintética lo estaba, y una zona del árbol real del case 3 también)
    el crecimiento se leía como reducción. Sale de una prueba de dentro/fuera
    por paridad de rayos, que no depende de la orientación."""
    mag = _unsigned_distance(points, surface)
    # El signo solo importa donde hay distancia: donde las dos superficies
    # coinciden (casi todo el mapa) el cambio es 0 y no se pregunta.
    need = mag > SIGN_MIN_MM
    out = np.zeros_like(mag)
    if need.any():
        inside = _inside_parity(points[need], closed)
        out[need] = np.where(inside, -mag[need], mag[need])
    return out


#: Tres direcciones poco simétricas: un rayo que roza una arista puede contar
#: mal; con tres y mayoría no.
_RAYS = np.array([[0.5773, 0.6123, 0.5401], [-0.7071, 0.2357, 0.6667], [0.2673, -0.8018, 0.5345]])


def _inside_parity(points: np.ndarray, closed: vtk.vtkPolyData) -> np.ndarray:
    """Dentro = el rayo cruza la superficie un número impar de veces.

    `vtkOBBTree.InsideOrOutside` no sirve: mira la normal del primer triángulo
    que cruza, así que con caras al revés invierte la respuesta (un punto a
    30 mm salía «dentro»). Contar cruces no depende de la orientación."""
    tree = vtk.vtkOBBTree(); tree.SetDataSet(closed); tree.BuildLocator()
    b = np.array(closed.GetBounds()).reshape(3, 2)
    far = float(np.linalg.norm(b[:, 1] - b[:, 0])) + 10.0
    hits = vtk.vtkPoints()
    out = np.zeros(len(points), dtype=bool)
    for i, p in enumerate(points):
        votes = 0
        for d in _RAYS:
            tree.IntersectWithLine(tuple(p), tuple(p + far * d), hits, None)
            votes += hits.GetNumberOfPoints() % 2
        out[i] = votes >= 2
    return out


def _unsigned_distance(points: np.ndarray, surface: vtk.vtkPolyData) -> np.ndarray:
    loc = vtk.vtkCellLocator(); loc.SetDataSet(surface); loc.BuildLocator()
    out = np.empty(len(points))
    cp = [0.0, 0.0, 0.0]; cid = vtk.reference(0); sid = vtk.reference(0); d2 = vtk.reference(0.0)
    for i, p in enumerate(points):
        loc.FindClosestPoint(p, cp, cid, sid, d2)
        out[i] = float(d2) ** 0.5
    return out


def _pts(poly: vtk.vtkPolyData) -> np.ndarray:
    return vtk_to_numpy(poly.GetPoints().GetData()).astype(float) if poly.GetNumberOfPoints() else np.zeros((0, 3))


def _rotation_deg(M: np.ndarray) -> float:
    c = (np.trace(M[:3, :3]) - 1) / 2
    return float(np.degrees(np.arccos(np.clip(c, -1, 1))))


def compare(
    curr_vessel: vtk.vtkPolyData, prev_vessel: vtk.vtkPolyData,
    curr_to_patient: np.ndarray, prev_to_patient: np.ndarray,
    curr_lesion: np.ndarray, prev_lesion: np.ndarray,
    out_dir: Path,
    curr_sac: vtk.vtkPolyData | None = None, prev_sac: vtk.vtkPolyData | None = None,
    voxel_mm: float = 0.0,
) -> FollowupResult:
    """Todo en el marco de la malla ACTUAL, para pintarlo en su visor."""
    warnings: list[str] = []
    # Anterior → paciente → actual (inversa de la del actual).
    P2C = np.linalg.inv(curr_to_patient) @ prev_to_patient
    lesion_prev_in_curr = (P2C @ np.append(prev_lesion, 1.0))[:3]
    # 1) Los centros de la lesión, encima.
    T0 = np.eye(4); T0[:3, 3] = np.asarray(curr_lesion, float) - lesion_prev_in_curr
    M0 = T0 @ P2C
    prev_v = _transform(prev_vessel, M0)

    # 2) Ajuste fino con los vasos de alrededor, sin la lesión.
    src = _within(prev_v, curr_lesion, ROI_MM, LESION_EXCLUDE_MM)
    tgt = _within(curr_vessel, curr_lesion, ROI_MM + 5.0)
    if src.GetNumberOfPoints() < 50 or tgt.GetNumberOfPoints() < 50:
        raise ValueError("No hay vasos suficientes alrededor de la lesión para superponer los estudios.")
    M_icp = _icp(src, tgt)
    M = M_icp @ M0
    rot = _rotation_deg(M_icp)
    prev_v = _transform(prev_vessel, M)

    # Ruido: cuánto distan, tras el ajuste, los vasos que no deberían cambiar.
    ring = _within(prev_v, curr_lesion, ROI_MM, LESION_EXCLUDE_MM)
    resid = _unsigned_distance(_pts(ring), curr_vessel)
    resid_med = float(np.median(resid)) if len(resid) else float("nan")
    noise = max(float(np.percentile(resid, 90)) if len(resid) else 0.0, voxel_mm)
    if resid_med > 1.0:
        warnings.append(
            f"Los vasos de alrededor no encajan bien (residuo mediano {resid_med:.1f} mm): la "
            f"superposición es aproximada y el mapa no distingue cambios menores de unos {noise:.1f} mm.")

    # 3) El mapa: vasos actuales cerca de la lesión, distancia con signo al anterior.
    roi = _within(curr_vessel, curr_lesion, ROI_MM)
    prev_near = _within(prev_v, curr_lesion, ROI_MM + 8.0)
    prev_closed = _closed_box(prev_v, curr_lesion, ROI_MM + 8.0)
    d = _signed_distance(_pts(roi), prev_near, prev_closed)
    arr = numpy_to_vtk(d.astype(np.float32), deep=True)
    arr.SetName(SCALAR)
    roi.GetPointData().AddArray(arr)
    roi.GetPointData().SetActiveScalars(SCALAR)

    out_dir.mkdir(parents=True, exist_ok=True)
    from services.segmentation import write_vtp
    map_path = out_dir / "seguimiento_mapa.vtp"
    write_vtp(roi, map_path)

    # Cifras sobre la LESIÓN: los puntos del mapa dentro de su radio.
    lp = _pts(roi)
    near = np.linalg.norm(lp - np.asarray(curr_lesion, float), axis=1) <= LESION_EXCLUDE_MM
    dl = d[near] if near.any() else d
    # Percentil 99,5 y no 98: un bulto ocupa poco de la lesión (5 % en la
    # validación) y el 98 caía en su falda. Y aun así se queda algo corto: la
    # distancia al punto más cercano recorta un pico estrecho (un bulto de
    # 1,5 mm sale ~1,2 en su centro).
    pos, neg = dl[dl > SIGN_MIN_MM], dl[dl < -SIGN_MIN_MM]
    grow = float(np.percentile(pos, 99.5)) if len(pos) else 0.0
    shrink = float(-np.percentile(neg, 0.5)) if len(neg) else 0.0
    grew_pct = float(100.0 * np.mean(dl > noise)) if len(dl) else 0.0

    ghost_path = None
    vprev = vcurr = None
    if prev_sac is not None and prev_sac.GetNumberOfPoints():
        ghost = _transform(prev_sac, M)
        ghost_path = out_dir / "seguimiento_saco_anterior.vtp"
        write_vtp(ghost, ghost_path)
        vprev = _volume(prev_sac)
    if curr_sac is not None and curr_sac.GetNumberOfPoints():
        vcurr = _volume(curr_sac)

    return FollowupResult(
        map_path=map_path, ghost_path=ghost_path, noise_mm=round(noise, 2),
        residual_median_mm=round(resid_med, 2), max_growth_mm=round(grow, 2),
        max_shrink_mm=round(shrink, 2), grew_area_pct=round(grew_pct, 1),
        volume_prev_mm3=round(vprev, 1) if vprev else None,
        volume_curr_mm3=round(vcurr, 1) if vcurr else None,
        rotation_deg=round(rot, 1), warnings=warnings,
    )


def _volume(poly: vtk.vtkPolyData) -> float:
    tri = vtk.vtkTriangleFilter(); tri.SetInputData(poly); tri.Update()
    m = vtk.vtkMassProperties(); m.SetInputData(tri.GetOutput()); m.Update()
    return float(m.GetVolume())
