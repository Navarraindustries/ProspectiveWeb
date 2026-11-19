"""Máscara de cerebro externa: quitar los candidatos lejos del cerebro (P8 del plan).

Kim 2025 baja los falsos positivos de un detector de aneurismas con reglas
anatómicas: lo que cae fuera de la cabeza o lejos de las arterias no se
enseña. Aquí la anatomía llega de fuera, como una máscara de cerebro (la de
TotalSegmentator, `brain.nii.gz`, que se saca en el PC de la oficina, O3): el
detector no la calcula, solo la lee y quita los candidatos que caen a más de
un margen de ella.

Por qué un margen y no «dentro»: los aneurismas del polígono de Willis están
en las cisternas, entre el cerebro y el hueso, no en el parénquima. Una
máscara de cerebro los deja fuera por unos milímetros. Cuánto margen hace
falta para no perder ninguno es justo lo que mide la O3 en los 172
(`scripts/cerebro_zenodo.py` da la distancia de cada lesión a la máscara).

Marcos: la máscara viene con su propia geometría (origen, espaciado y
dirección de SimpleITK, en LPS, aunque el NIfTI se haya escrito en RAS o
reorientado); los candidatos están en el marco de la malla (índice ×
espaciado del DICOM de la sesión). El paso de uno a otro es el origen y la
dirección del DICOM: paciente = origen + D · malla (la inversa de
`scripts.ingest_zenodo.patient_to_mesh`).

La distancia se mide en mm, en paciente, hasta el centro del vóxel de borde
más cercano (un árbol k-d de los vóxeles de borde): no hace falta una
transformada de distancias sobre 150 M de vóxeles. Dentro de la máscara la
distancia es 0.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

logger = logging.getLogger(__name__)

#: Nombre del fichero de máscara dentro de la carpeta de una sesión.
NOMBRE_SESION = "brain_mask.nii.gz"
#: Margen por defecto (mm). Provisional hasta que la O3 lo mida en los 172.
MARGEN_MM = 10.0

IDENTIDAD = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def _matriz(direction: Sequence[float] | None) -> np.ndarray:
    d = np.asarray(direction if direction is not None and len(direction) == 9 else IDENTIDAD,
                   dtype=np.float64)
    return d.reshape(3, 3)


def malla_a_paciente(puntos: np.ndarray, origin: Sequence[float],
                     direction: Sequence[float] | None) -> np.ndarray:
    """(N, 3) del marco de la malla → (N, 3) de paciente (LPS, mm)."""
    p = np.atleast_2d(np.asarray(puntos, dtype=np.float64))
    return np.asarray(origin, dtype=np.float64)[None, :] + p @ _matriz(direction).T


class MascaraCerebro:
    """Una máscara binaria con su geometría; responde distancias en mm."""

    def __init__(self, mascara_zyx: np.ndarray, origin: Sequence[float],
                 spacing_xyz: Sequence[float], direction: Sequence[float] | None,
                 fuente: str = ""):
        self.mascara = np.asarray(mascara_zyx, dtype=bool)
        self.origin = np.asarray(origin, dtype=np.float64)
        self.spacing = np.asarray(spacing_xyz, dtype=np.float64)
        self.direction = _matriz(direction)
        self.fuente = fuente
        self._arbol = None
        # índice continuo (x, y, z) → paciente: origen + D · diag(espaciado) · índice
        self._a_paciente = self.direction @ np.diag(self.spacing)
        self._a_indice = np.linalg.inv(self._a_paciente)

    @classmethod
    def desde_fichero(cls, ruta: Path | str, etiqueta: int | None = None) -> "MascaraCerebro":
        """Lee cualquier formato de SimpleITK (NIfTI, NRRD, MHA…).

        *etiqueta*: en una máscara de varias clases (el `--ml` de
        TotalSegmentator), el valor del cerebro; sin ella, todo lo > 0.
        """
        import SimpleITK as sitk

        img = sitk.ReadImage(str(ruta))
        arr = sitk.GetArrayFromImage(img)          # (z, y, x)
        m = arr == etiqueta if etiqueta is not None else arr > 0
        return cls(m, img.GetOrigin(), img.GetSpacing(), img.GetDirection(), fuente=str(ruta))

    @property
    def vacia(self) -> bool:
        return not self.mascara.any()

    def indices(self, puntos_paciente: np.ndarray) -> np.ndarray:
        """Índice continuo (x, y, z) de cada punto de paciente."""
        p = np.atleast_2d(np.asarray(puntos_paciente, dtype=np.float64)) - self.origin[None, :]
        return p @ self._a_indice.T

    def dentro(self, puntos_paciente: np.ndarray) -> np.ndarray:
        """Si el vóxel más cercano a cada punto está en la máscara."""
        ijk = np.rint(self.indices(puntos_paciente)).astype(np.int64)
        nz, ny, nx = self.mascara.shape
        ok = ((ijk[:, 0] >= 0) & (ijk[:, 0] < nx) & (ijk[:, 1] >= 0) & (ijk[:, 1] < ny)
              & (ijk[:, 2] >= 0) & (ijk[:, 2] < nz))
        out = np.zeros(len(ijk), dtype=bool)
        out[ok] = self.mascara[ijk[ok, 2], ijk[ok, 1], ijk[ok, 0]]
        return out

    def _borde(self):
        if self._arbol is None:
            from scipy.ndimage import binary_erosion
            from scipy.spatial import cKDTree

            borde = self.mascara & ~binary_erosion(self.mascara, border_value=0)
            zyx = np.argwhere(borde)
            pts = self.origin[None, :] + zyx[:, ::-1].astype(np.float64) @ self._a_paciente.T
            self._arbol = cKDTree(pts)
        return self._arbol

    def distancia_mm(self, puntos_paciente: np.ndarray) -> np.ndarray:
        """0 dentro de la máscara; fuera, la distancia al vóxel de borde más cercano."""
        p = np.atleast_2d(np.asarray(puntos_paciente, dtype=np.float64))
        if self.vacia:
            return np.full(len(p), np.inf)
        d, _ = self._borde().query(p)
        d = np.asarray(d, dtype=np.float64)
        d[self.dentro(p)] = 0.0
        return d

    def distancia_malla_mm(self, puntos_malla: np.ndarray, origin: Sequence[float],
                           direction: Sequence[float] | None) -> np.ndarray:
        return self.distancia_mm(malla_a_paciente(puntos_malla, origin, direction))


@dataclass
class FiltroCerebro:
    """Qué hizo el filtro: para el registro del banco y el diagnóstico."""
    applied: bool
    margin_mm: float | None = None
    checked: int = 0
    dropped: int = 0
    #: distancia (mm) de cada candidato quitado, en el orden en que iban.
    dropped_mm: list[float] | None = None
    source: str = ""
    reason: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


def drop_outside_brain(hits: list, mascara: MascaraCerebro, origin: Sequence[float],
                       direction: Sequence[float] | None, margen_mm: float = MARGEN_MM):
    """Los candidatos a ≤ *margen_mm* del cerebro, en el mismo orden; y lo que se quitó.

    Cada `hit` tiene `.position` (x, y, z) del marco de la malla, como en
    `services.hu_floor.drop_air`. Una máscara vacía no quita nada (sería un
    fallo de la segmentación externa, no un estudio sin cerebro).
    """
    if not hits:
        return hits, FiltroCerebro(applied=True, margin_mm=margen_mm, source=mascara.fuente)
    if mascara.vacia:
        return hits, FiltroCerebro(applied=False, margin_mm=margen_mm, source=mascara.fuente,
                                   reason="máscara vacía")
    pos = np.array([[float(v) for v in h.position] for h in hits])
    dist = mascara.distancia_malla_mm(pos, origin, direction)
    kept, dropped = [], []
    for h, d in zip(hits, dist):
        if d > margen_mm:
            dropped.append(round(float(d), 1))
        else:
            kept.append(h)
    if dropped:
        logger.info("Máscara de cerebro: %d de %d candidatos a más de %.0f mm, fuera (%s)",
                    len(dropped), len(hits), margen_mm, dropped)
    return kept, FiltroCerebro(applied=True, margin_mm=margen_mm, checked=len(hits),
                               dropped=len(dropped), dropped_mm=dropped or None,
                               source=mascara.fuente)


@dataclass
class CerebroSesion:
    mascara: MascaraCerebro
    origin: tuple[float, float, float]
    direction: tuple[float, ...]
    margen_mm: float = MARGEN_MM


def de_sesion(session_id: str) -> tuple[CerebroSesion | None, FiltroCerebro]:
    """La máscara de la sesión (`<sesión>/brain_mask.nii.gz`), si la hay y se puede usar.

    Hace falta la orientación del DICOM para pasar la máscara al marco de la
    malla; sin ella (`orientation_known` falso) no se aplica: una dirección
    supuesta podría quitar justo los candidatos buenos.
    """
    from services.sessions import session_dir

    ruta = session_dir(session_id) / NOMBRE_SESION
    if not ruta.exists():
        return None, FiltroCerebro(applied=False, reason="sin máscara")
    try:
        from services.mpr import ensure_volume_cached
        meta = ensure_volume_cached(session_id)
    except Exception as exc:  # sin volumen no hay marco
        logger.warning("Máscara de cerebro sin volumen para la sesión %s: %s", session_id, exc)
        return None, FiltroCerebro(applied=False, source=str(ruta), reason="sin volumen")
    if not meta.get("orientation_known") or meta.get("direction") is None:
        return None, FiltroCerebro(applied=False, source=str(ruta), reason="orientación desconocida")
    try:
        mascara = MascaraCerebro.desde_fichero(ruta)
    except Exception as exc:
        logger.warning("Máscara de cerebro ilegible (%s): %s", ruta, exc)
        return None, FiltroCerebro(applied=False, source=str(ruta), reason="ilegible")
    origin = tuple(float(v) for v in meta.get("origin_mm") or (0.0, 0.0, 0.0))
    return (CerebroSesion(mascara, origin, tuple(float(v) for v in meta["direction"])),
            FiltroCerebro(applied=False, source=str(ruta)))
