"""Distancia firmada a una malla cerrada, sin `vtkImplicitPolyDataDistance`.

Con VTK 9.6.1 y SimpleITK cargados en el mismo proceso (el backend carga los
dos), `vtkImplicitPolyDataDistance` se cae con un acceso a memoria inválido al
evaluar puntos, sobre todo lejos de la malla: lo destapó la prueba de los
fantomas de tubos (P14, 19-11). La reproducción mínima es importar SimpleITK,
dar una malla de ~30 000 triángulos y evaluar unos miles de puntos al azar;
sin SimpleITK, o con los localizadores de celdas solos, no se cae. Se cae el
proceso entero, no una excepción: en la app tumbaba el backend.

Esto hace lo mismo con piezas que sí aguantan: `vtkStaticCellLocator` da el
punto más cercano de la malla y el signo sale de la normal en ese punto (las
normales de los vértices interpoladas en el triángulo; la del triángulo si se
anulan). Da las mismas cifras que la clase de VTK en mallas orientadas hacia
fuera (las de la segmentación lo están; comprobado en 12 000 puntos: misma
distancia, signo y gradiente). Si los triángulos miran hacia dentro, VTK da
el signo al revés; aquí se detecta por el volumen firmado y se corrige.
Negativo dentro, positivo fuera.
"""
from __future__ import annotations

import math

import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy


class DistanciaFirmada:
    """Misma interfaz que usa el código de `vtkImplicitPolyDataDistance`:
    `SetInput(malla)`, `EvaluateFunction(x, y, z)` (o una terna) y
    `EvaluateGradient(punto, g)`, que escribe el gradiente en `g`."""

    def __init__(self, malla: vtk.vtkPolyData | None = None) -> None:
        self._loc = None
        if malla is not None:
            self.SetInput(malla)

    def SetInput(self, malla: vtk.vtkPolyData) -> None:  # noqa: N802 — interfaz de VTK
        tri = vtk.vtkTriangleFilter()
        tri.SetInputData(malla)
        tri.PassVertsOff(); tri.PassLinesOff()
        nf = vtk.vtkPolyDataNormals()
        nf.SetInputConnection(tri.GetOutputPort())
        # Sin reorientar: se respeta la orientación de la malla, como VTK.
        nf.SplittingOff(); nf.ConsistencyOff(); nf.AutoOrientNormalsOff()
        nf.ComputePointNormalsOn(); nf.ComputeCellNormalsOn()
        nf.Update()
        self._malla = vtk.vtkPolyData()
        self._malla.DeepCopy(nf.GetOutput())
        n = self._malla.GetNumberOfCells()
        if n == 0:
            self._loc = None
            return
        self._pts = vtk_to_numpy(self._malla.GetPoints().GetData()).astype(np.float64)
        celdas = vtk_to_numpy(self._malla.GetPolys().GetConnectivityArray()).astype(np.int64)
        self._tris = celdas.reshape(n, 3)
        self._npun = vtk_to_numpy(self._malla.GetPointData().GetNormals()).astype(np.float64)
        self._ncel = vtk_to_numpy(self._malla.GetCellData().GetNormals()).astype(np.float64)
        # Malla con los triángulos hacia dentro (volumen firmado negativo): se
        # invierte el signo para que dentro siga siendo negativo. La clase de
        # VTK no lo hace, y con una malla así el centrado de la línea empujaba
        # los puntos fuera del vaso.
        a, b, c = (self._pts[self._tris[:, k]] for k in range(3))
        volumen = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6.0
        self._orientacion = -1.0 if volumen < 0.0 else 1.0
        self._loc = vtk.vtkStaticCellLocator()
        self._loc.SetDataSet(self._malla)
        self._loc.BuildLocator()
        self._cp = [0.0, 0.0, 0.0]
        self._cid = vtk.reference(0)
        self._sub = vtk.reference(0)
        self._d2 = vtk.reference(0.0)

    # ------------------------------------------------------------------ #

    def _cercano(self, x: tuple[float, float, float]):
        """(distancia firmada, vector unitario de la malla al punto con signo)."""
        if self._loc is None:
            return 0.0, (0.0, 0.0, 0.0)
        self._loc.FindClosestPoint(x, self._cp, self._cid, self._sub, self._d2)
        cid = int(self._cid)
        cp = self._cp
        dx, dy, dz = x[0] - cp[0], x[1] - cp[1], x[2] - cp[2]
        d = math.sqrt(max(float(self._d2), 0.0))
        nrm = self._normal(cid, cp) * self._orientacion
        prod = dx * nrm[0] + dy * nrm[1] + dz * nrm[2]
        signo = -1.0 if prod < 0.0 else 1.0
        if d > 1e-12:
            return signo * d, (signo * dx / d, signo * dy / d, signo * dz / d)
        return 0.0, tuple(nrm)

    def _normal(self, cid: int, cp) -> np.ndarray:
        """Normal en `cp`: la de los vértices interpolada con las coordenadas
        baricéntricas del punto en su triángulo; la del triángulo si se anula."""
        i, j, k = self._tris[cid]
        a, b, c = self._pts[i], self._pts[j], self._pts[k]
        p = np.asarray(cp, dtype=np.float64)
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18:
            return self._ncel[cid]
        v = (d11 * d20 - d01 * d21) / den
        w = (d00 * d21 - d01 * d20) / den
        u = 1.0 - v - w
        n = u * self._npun[i] + v * self._npun[j] + w * self._npun[k]
        largo = float(np.linalg.norm(n))
        return n / largo if largo > 1e-9 else self._ncel[cid]

    # ------------------------------------------------------------------ #

    def EvaluateFunction(self, *args) -> float:  # noqa: N802 — interfaz de VTK
        x = args[0] if len(args) == 1 else args
        return self._cercano((float(x[0]), float(x[1]), float(x[2])))[0]

    def EvaluateGradient(self, x, g) -> None:  # noqa: N802 — interfaz de VTK
        _, grad = self._cercano((float(x[0]), float(x[1]), float(x[2])))
        g[0], g[1], g[2] = grad
