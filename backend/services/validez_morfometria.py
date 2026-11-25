"""Qué partes de la morfometría guardada valen.

La medida automática anula por separado el grupo del volumen (saco abierto o
inverosímil) y el del cuello (no detectado). La pantalla lo sabía; el informe,
el DICOM SR y Decisión leían las cifras del estado sin saberlo, e imprimían
«Volumen 0,00 mm³», «AR 0,00» o un «Riesgo morfométrico bajo» sin índices
medidos detrás.

Las sesiones medidas antes de guardar la validez no la tienen: se dan por
buenas, como hasta ahora.
"""
from __future__ import annotations

from dataclasses import dataclass

from services.sessions import read_state

#: Qué cifras dependen de qué grupo.
DEL_VOLUMEN = ("volume_mm3", "surface_area_mm2", "compactness", "undulation_index")
DEL_CUELLO = ("neck_diameter_mm", "dome_to_neck_ratio", "aspect_ratio", "bottleneck_factor")


@dataclass(frozen=True)
class Validez:
    volumen: bool
    cuello: bool
    fiable: bool

    @property
    def diametro_del_parche(self) -> bool:
        """Sin saco cerrado, el Ø máximo es el del trozo de malla que marcó el
        detector, no el del aneurisma aislado."""
        return not self.volumen


def validez(session_id: str) -> Validez:
    def _bien(clave: str) -> bool:
        return (read_state(session_id, clave, "") or "") != "0"
    return Validez(volumen=_bien("morpho.volume_valid"), cuello=_bien("morpho.neck_valid"),
                   fiable=_bien("morpho.reliable"))
