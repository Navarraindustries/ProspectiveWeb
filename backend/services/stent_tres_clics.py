"""Stent virtual en tres clics: proximal, distal y saco (P10, como Siemens).

Hasta ahora, desplegar un flow diverter sobre la línea central pedía ocho
pasos repartidos entre Morfometría y Dispositivos: marcar origen y destino,
extraer la línea, medir el cuello, dimensionar, aplicar la opción y
desplegar. Aquí los mismos cálculos van encadenados a partir de tres puntos:

1. **Línea central de proximal a distal** (services/centerline): la arteria
   que va a llevar el dispositivo, pasando por delante del cuello. Sustituye
   la línea central que hubiera.
2. **Dónde cae el cuello a lo largo de ella.** Si la morfometría midió el
   cuello de ESTE saco, ese (con su borde, si se marcó). Si no, el tramo de
   línea cuya esfera inscrita toca la malla del saco elegido con el tercer
   clic: es donde el vaso se abre hacia la lesión (la misma regla que corta
   el vaso portador en P13, services/curvatura.tramo_portador).
3. **Dimensionado** (services/fd_sizing) y la primera opción del catálogo
   que encaja, o la que se pida.
4. **Despliegue** sobre la línea con ese diámetro y esa longitud etiquetada.

Nada de esto decide: son los mismos cálculos de antes, con sus avisos, y el
resultado se puede corregir en la pestaña como siempre.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.spatial import cKDTree

#: Un clic en el saco vale si cae a menos de esto de la malla de la lesión.
MAX_CLIC_SACO_MM = 3.0
#: Holgura de contacto entre la esfera inscrita y la malla del saco.
HOLGURA_CONTACTO_MM = 0.5
#: Si el cuello medido en Morfometría está a más de esto del saco elegido, es
#: de otra lesión y no se usa.
MAX_CUELLO_A_SACO_MM = 3.0


@dataclass
class Cuello:
    centro: tuple[float, float, float]
    ancho_mm: float
    borde: list[tuple[float, float, float]]
    fuente: str          # "morfometria" | "saco"


def distancia_a_malla(puntos_malla: np.ndarray, p) -> float:
    if len(puntos_malla) == 0:
        return float("inf")
    return float(cKDTree(puntos_malla).query(np.asarray(p, float))[0])


def elegir_saco(mallas: list[tuple[str, np.ndarray]], clic) -> tuple[str, np.ndarray] | None:
    """La malla de lesión más cercana al clic, si está a menos de
    MAX_CLIC_SACO_MM; sin clic, la primera (el saco medido va primero)."""
    if not mallas:
        return None
    if clic is None:
        return mallas[0]
    d, nombre_pts = min(((distancia_a_malla(pts, clic), (n, pts)) for n, pts in mallas),
                        key=lambda t: t[0])
    return nombre_pts if d <= MAX_CLIC_SACO_MM else None


def tramo_en_contacto(puntos: np.ndarray, radios: np.ndarray,
                      lesion: np.ndarray) -> tuple[float, float] | None:
    """El tramo de arco (mm) cuya esfera inscrita toca la malla de la lesión:
    por donde el vaso se abre al saco. None si la línea no la toca."""
    pts = np.asarray(puntos, float)
    if len(pts) < 2 or len(lesion) == 0:
        return None
    arco = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    d, _ = cKDTree(np.asarray(lesion, float)).query(pts)
    toca = np.flatnonzero(d <= np.asarray(radios, float) + HOLGURA_CONTACTO_MM)
    if len(toca) == 0:
        return None
    return float(arco[toca[0]]), float(arco[toca[-1]])


def cuello_desde_saco(puntos: np.ndarray, radios: np.ndarray, lesion: np.ndarray) -> Cuello | None:
    tramo = tramo_en_contacto(puntos, radios, lesion)
    if tramo is None:
        return None
    s0, s1 = tramo
    pts = np.asarray(puntos, float)
    arco = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    medio = (s0 + s1) / 2
    centro = tuple(float(np.interp(medio, arco, pts[:, k])) for k in range(3))
    return Cuello(centro=centro, ancho_mm=max(s1 - s0, 1.0), borde=[], fuente="saco")


def elegir_opcion(opciones, device_id: str | None):
    """La opción pedida si encaja; si no, la primera del catálogo que encaja."""
    validas = [o for o in opciones if o.fits]
    if device_id:
        pedida = next((o for o in opciones if o.device_id == device_id), None)
        if pedida is None:
            raise ValueError(f"El dispositivo «{device_id}» no está en el catálogo de flow diverters.")
        if not pedida.fits:
            raise ValueError(f"{pedida.name} no encaja en este vaso: {pedida.reason}")
        return pedida
    return validas[0] if validas else None
