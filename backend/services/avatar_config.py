"""Configuración del avatar y estado del onboarding: listas cerradas y lectura segura.

Los hex de piel y pelo los fija el constructor del avatar del frontend; este
fichero es la fuente de verdad y el frontend se contrasta con él en un test.
`piel` se guarda como índice 0-5 en PIELES; el resto de colores, como hex.
"""
from __future__ import annotations

import json

PIELES = ("#F3D2BC", "#E0A982", "#C68A63", "#9C6A4E", "#6E4A36", "#4A3022")
PEINADOS = ("corto", "largo", "mono", "rapado", "rizado", "coleta")
COLORES_PELO = ("#2B1D16", "#121212", "#6B4226", "#D8B26E", "#A4492A", "#C9CCD2")
CABEZAS = ("nada", "gorro", "gorro_amplio")
OJOS = ("nada", "gafas", "lupas")
PIJAMAS = ("#3FC4AB", "#5AA9FF", "#A98BF0", "#B5485A", "#E0A84A", "#4A5263")
FONDOS = ("#12141A", "#10233D", "#241A3D", "#0F2E28", "#DCE3EC")

_CLAVES = ("v", "piel", "peinado", "pelo", "cabeza", "ojos", "mascarilla", "pijama", "fondo")
_LISTAS = {
    "peinado": PEINADOS, "pelo": COLORES_PELO, "cabeza": CABEZAS,
    "ojos": OJOS, "pijama": PIJAMAS, "fondo": FONDOS,
}


def validar_config(data: dict) -> dict:
    """Devuelve la config si es válida; ValueError si sobra/falta una clave o un valor sale de su lista."""
    if not isinstance(data, dict):
        raise ValueError("La configuración del avatar debe ser un objeto.")
    desconocidas = set(data) - set(_CLAVES)
    if desconocidas:
        raise ValueError(f"Claves desconocidas: {sorted(desconocidas)}")
    faltan = [k for k in _CLAVES if k not in data]
    if faltan:
        raise ValueError(f"Faltan claves: {faltan}")
    if data["v"] != 1 or isinstance(data["v"], bool):
        raise ValueError("Versión de avatar no soportada.")
    piel = data["piel"]
    if isinstance(piel, bool) or not isinstance(piel, int) or not 0 <= piel < len(PIELES):
        raise ValueError("piel fuera de rango.")
    if not isinstance(data["mascarilla"], bool):
        raise ValueError("mascarilla debe ser booleana.")
    for clave, lista in _LISTAS.items():
        if data[clave] not in lista:
            raise ValueError(f"{clave} fuera de la lista.")
    return dict(data)


def leer_config(texto: str | None) -> dict | None:
    """Config guardada o None si no hay, no es JSON o no pasa la validación."""
    if not texto:
        return None
    try:
        return validar_config(json.loads(texto))
    except (ValueError, TypeError):
        return None


def _onboarding_por_defecto() -> dict:
    return {"estado": "pendiente", "pistas_vistas": [], "pistas_activas": True, "tarjeta_cerrada": False}


def leer_onboarding(texto: str | None) -> dict:
    """Estado del onboarding; nulo o inválido → el de un usuario nuevo. Rellena claves ausentes."""
    base = _onboarding_por_defecto()
    if not texto:
        return base
    try:
        data = json.loads(texto)
    except (ValueError, TypeError):
        return base
    if not isinstance(data, dict):
        return base
    base.update({k: v for k, v in data.items() if k in ("estado", "fecha", "pistas_vistas", "pistas_activas", "tarjeta_cerrada")})
    return base
