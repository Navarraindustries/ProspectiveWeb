"""Con qué resolución se midió cada cosa de la sesión (P15, Dalmer 2026).

Una cifra en milímetros sin el vóxel con el que se midió no dice cuánto
fiarse de ella. En la app intervienen tres rejillas distintas:

- **El volumen segmentado.** El del DICOM o, si se aplicó el preprocesado,
  el remuestreado (`dicom.spacing_*` guarda el que se segmentó, no el de la
  cabecera: la segmentación lo reescribe). Si la segmentación fue a media
  resolución, la malla se hizo con vóxeles `factor` veces mayores
  (`seg.downsample_factor`). De la malla salen la morfometría, las secciones
  del IVUS y el dimensionado.
- **La línea central.** Vuelve a vóxelizar la malla en su propia rejilla
  (0,8 mm por defecto, más gruesa si la malla es grande); el Ø inscrito sale
  de la transformada de distancia sobre ella y va a saltos de ese tamaño. En
  el fantoma de la P14, un tubo de Ø 2 mm sale con 1,6.
- **El barrido de ramas.** Otra rejilla; no ve ramas de menos de dos vóxeles.

Lo que no esté guardado (una línea de antes de P15, una sesión sin
segmentar) sale como None: el informe no inventa una resolución.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Resolucion:
    #: Vóxel del volumen segmentado (x, y, z) en mm.
    estudio_mm: tuple[float, float, float] | None = None
    #: El volumen segmentado es el preprocesado (remuestreado), no el DICOM tal cual.
    preprocesado: bool = False
    #: Reducción de la segmentación (1 = resolución completa).
    factor: int = 1
    #: Rejilla de la línea central guardada (mm), si la hay y la registró.
    linea_mm: float | None = None
    #: Rejilla del barrido de ramas (mm) y el calibre mínimo que ve.
    ramas_mm: float | None = None
    ramas_suelo_mm: float | None = None

    @property
    def malla_mm(self) -> tuple[float, float, float] | None:
        """El vóxel con el que se hizo la malla."""
        if self.estudio_mm is None:
            return None
        return tuple(v * self.factor for v in self.estudio_mm)  # type: ignore[return-value]

    @property
    def lado_mayor_mm(self) -> float | None:
        """El lado mayor del vóxel de la malla: el error de un diámetro medido en ella."""
        m = self.malla_mm
        return max(m) if m else None

    @property
    def vacia(self) -> bool:
        return self.estudio_mm is None and self.linea_mm is None and self.ramas_mm is None


def _f(raw: str) -> float:
    try:
        return float(raw) if raw else 0.0
    except ValueError:
        return 0.0


def resolucion_sesion(session_id: str) -> Resolucion:
    from services.sessions import read_state, session_subdir

    r = Resolucion()
    sp = tuple(_f(read_state(session_id, f"dicom.spacing_{k}", "")) for k in "xyz")
    # Sin malla no hay medida que acompañar: el vóxel del DICOM cargado solo
    # no dice nada de una morfometría que no existe.
    if all(v > 0 for v in sp) and read_state(session_id, "seg.mesh_url", ""):
        r.estudio_mm = sp  # type: ignore[assignment]
        try:
            r.factor = max(1, int(read_state(session_id, "seg.downsample_factor", "") or 1))
        except ValueError:
            r.factor = 1
        r.preprocesado = bool(read_state(session_id, "preprocess.ops", ""))

    try:
        from services.centerline import voxel_linea

        meshes = session_subdir(session_id, "meshes")
        npz = meshes / "centerline_points.npz"
        if npz.exists() and (meshes / "centerline.vtp").exists():
            with np.load(npz) as data:
                r.linea_mm = voxel_linea(data)
    except Exception as exc:  # noqa: BLE001 — una línea ilegible no tumba el informe
        logger.warning("Resolución de la línea central ilegible en %s: %s", session_id, exc)

    try:
        from services.branch_origins import thaw_scan

        scan = thaw_scan(session_id)
        if scan is not None:
            r.ramas_mm = scan.voxel_mm
            r.ramas_suelo_mm = scan.calibre_floor_mm or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Resolución del barrido de ramas ilegible en %s: %s", session_id, exc)
    return r
