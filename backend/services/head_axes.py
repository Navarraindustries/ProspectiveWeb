# -*- coding: utf-8 -*-
"""Dónde tiene la cara el paciente, en coordenadas de la malla.

Por qué hace falta
------------------
Un corredor de abordaje no es una recta cualquiera: entrar por la cara, por la
órbita o desde el cuello no es un abordaje malo, es un abordaje que no existe.
Para descartarlos hay que saber qué dirección de la malla es «anterior» y cuál
«superior», y eso no está en la geometría: está en el DICOM.

Dónde estaba escondido
----------------------
`ImageOrientationPatient` da los cosenos directores de las filas y las columnas
de la imagen en coordenadas LPS del paciente. En una serie clásica está en la
raíz del fichero; en una 3DRA multiframe —que es lo que tiene este proyecto—
vive dentro de `PerFrameFunctionalGroupsSequence[i].PlaneOrientationSequence`, y
por eso el cargador lo leía como ausente: preguntaba por el atributo de la raíz.

El paso de vóxel a mundo
------------------------
La malla se construye con `SetDimensions(x, y, z)` y `SetSpacing(sx, sy, sz)`
sobre un array `(z, y, x)`, así que:

    mundo x  ↔  columnas de la imagen  →  coseno de FILA del IOP
    mundo y  ↔  filas de la imagen     →  coseno de COLUMNA del IOP
    mundo z  ↔  cortes                 →  su producto vectorial

Con esa matriz `M` (mundo → LPS), la dirección de la malla que apunta a una
dirección anatómica se obtiene con `Mᵀ · lps`, porque `M` es ortonormal.

Lo que NO se da por bueno
-------------------------
Un exportador puede rellenar el IOP con la matriz identidad y la posición con
ceros sin haber medido nada. Eso se detecta y se marca: el resultado dice de
dónde salen los ejes y con cuánta confianza, y quien mira puede desmentirlo — la
nariz se ve en el visor 3D.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

#: LPS: +x izquierda del paciente, +y posterior, +z superior.
_LPS_ANTERIOR = np.array([0.0, -1.0, 0.0])
_LPS_SUPERIOR = np.array([0.0, 0.0, 1.0])
_LPS_LEFT = np.array([1.0, 0.0, 0.0])


@dataclass
class HeadAxes:
    """Las direcciones anatómicas expresadas en coordenadas de la malla."""

    anterior: tuple[float, float, float]
    superior: tuple[float, float, float]
    left: tuple[float, float, float]
    #: "dicom" · "dicom_sin_verificar" · "manual" · "desconocida"
    source: str
    note: str = ""

    @property
    def usable(self) -> bool:
        return self.source != "desconocida"


UNKNOWN = HeadAxes(
    anterior=(0.0, 0.0, 0.0), superior=(0.0, 0.0, 0.0), left=(0.0, 0.0, 0.0),
    source="desconocida",
    note=("El estudio no trae la orientación del paciente, así que no se puede "
          "saber qué dirección es anterior. Sin eso no se puede garantizar que "
          "un corredor no entre por la cara, y por eso no se propone ninguno."),
)


def _iop_from_dataset(ds) -> tuple[list[float] | None, list[float] | None]:
    """(IOP, IPP) de una serie clásica o de una multiframe."""
    iop = getattr(ds, "ImageOrientationPatient", None)
    ipp = getattr(ds, "ImagePositionPatient", None)
    if iop is not None:
        return [float(v) for v in iop], ([float(v) for v in ipp] if ipp else None)

    for campo in ("SharedFunctionalGroupsSequence", "PerFrameFunctionalGroupsSequence"):
        seq = getattr(ds, campo, None)
        if not seq:
            continue
        item = seq[0]
        po = getattr(item, "PlaneOrientationSequence", None)
        pp = getattr(item, "PlanePositionSequence", None)
        if po:
            valores = [float(v) for v in po[0].ImageOrientationPatient]
            pos = ([float(v) for v in pp[0].ImagePositionPatient] if pp else None)
            return valores, pos
    return None, None


def axes_from_dicom(dicom_dir: Path | str) -> HeadAxes:
    """Lee la orientación del primer fichero de la carpeta."""
    import pydicom

    carpeta = Path(dicom_dir)
    ficheros = sorted(p for p in carpeta.rglob("*") if p.is_file())
    if not ficheros:
        return UNKNOWN

    iop = ipp = None
    for f in ficheros[:5]:
        try:
            ds = pydicom.dcmread(str(f), stop_before_pixels=True)
        except Exception:  # noqa: BLE001 — un fichero ilegible no es el final
            continue
        iop, ipp = _iop_from_dataset(ds)
        if iop:
            break
    if not iop or len(iop) < 6:
        return UNKNOWN

    fila = np.asarray(iop[:3], dtype=float)
    columna = np.asarray(iop[3:6], dtype=float)
    normal = np.cross(fila, columna)
    if float(np.linalg.norm(normal)) < 1e-6:
        return UNKNOWN

    # mundo → LPS. Ver el encabezado para por qué fila va con la x del mundo.
    M = np.column_stack([fila, columna, normal / np.linalg.norm(normal)])

    def _mundo(lps: np.ndarray) -> tuple[float, float, float]:
        w = M.T @ lps
        n = float(np.linalg.norm(w)) or 1.0
        w = w / n
        return (float(w[0]), float(w[1]), float(w[2]))

    # Un IOP perfectamente canónico junto a una posición en el origen es lo que
    # escribe un exportador que no midió nada. Los ejes se usan igual —son lo
    # único que hay— pero dejan de presentarse como un dato del estudio.
    canonico = bool(np.allclose(np.abs(M), np.eye(3), atol=1e-6))
    en_origen = ipp is not None and all(abs(v) < 1e-9 for v in ipp)
    if canonico and en_origen:
        fuente = "dicom_sin_verificar"
        nota = ("La orientación del estudio es exactamente la identidad y la "
                "posición es el origen: es lo que escribe un exportador por "
                "defecto. Los ejes se usan porque son lo único que hay, pero "
                "comprueba en el visor que el frente del paciente cae donde el "
                "software dice antes de fiarte de un corredor.")
    else:
        fuente = "dicom"
        nota = ""

    return HeadAxes(anterior=_mundo(_LPS_ANTERIOR), superior=_mundo(_LPS_SUPERIOR),
                    left=_mundo(_LPS_LEFT), source=fuente, note=nota)


def describe_direction(d, axes: HeadAxes) -> str:
    """La dirección de entrada, dicha en anatomía y no en coordenadas.

    `d` apunta DESDE el aneurisma HACIA la entrada, que es como se lee un
    abordaje: «entra por delante y por arriba», no «el vector (0,7, 0,6, 0)».
    """
    d = np.asarray(d, dtype=float)
    n = float(np.linalg.norm(d)) or 1.0
    d = d / n
    ant = float(np.dot(d, np.asarray(axes.anterior)))
    sup = float(np.dot(d, np.asarray(axes.superior)))
    izq = float(np.dot(d, np.asarray(axes.left)))

    partes: list[str] = []
    if abs(sup) >= 0.9:
        # Casi vertical: decir además «anterior» o «lateral» de una dirección
        # que apenas se aparta del eje es precisión inventada.
        return "desde arriba" if sup > 0 else "desde abajo"
    if abs(ant) >= 0.35:
        partes.append("anterior" if ant > 0 else "posterior")
    if abs(izq) >= 0.35:
        partes.append("izquierda" if izq > 0 else "derecha")
    if not partes:
        partes.append("lateral" if abs(izq) >= abs(ant) else "medial")

    grados = np.degrees(np.arcsin(max(-1.0, min(1.0, sup))))
    if grados >= 10:
        altura = f"{grados:.0f}° por encima del plano axial"
    elif grados <= -10:
        altura = f"{abs(grados):.0f}° por debajo del plano axial"
    else:
        altura = "en el plano axial"
    return f"{' '.join(partes)}, {altura}"
