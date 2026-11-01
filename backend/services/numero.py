"""Cifras con coma decimal para el texto que lee una persona.

«Lo que lee una persona lleva coma decimal; lo que lee una máquina lleva
punto.» El backend manda los números como números; cuando tiene que mandar una
frase o una etiqueta ya hecha (un nombre de pieza, un aviso, el informe), las
cifras de dentro se escriben con `cifra`. Lo que va a un nombre de fichero, una
clave, un CSV o un log conserva el punto (`f"{v:.1f}"` de siempre).

Espejo de `frontend/src/lib/numero.ts`: `None`, NaN e infinitos → «—»; `-0` y
lo que se redondea a cero, sin signo («0,0», nunca «-0,0»).
"""
from __future__ import annotations

import math

__all__ = ["cifra", "cifra_corta", "coordenadas"]


def cifra(v: float | int | None, decimales: int = 1, *, signo: bool = False) -> str:
    """`11` → «11,0»; `7.25, 2` → «7,25»; `None`/NaN/±inf → «—».

    `signo=True` antepone «+» a lo que no es negativo, como `f"{v:+.2f}"`
    («+0,30», «+0,00», «-0,25»)."""
    if v is None:
        return "—"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "—"
    if not math.isfinite(x):
        return "—"
    txt = f"{x:.{max(0, int(decimales))}f}"
    if txt.startswith("-") and float(txt) == 0:
        txt = txt[1:]
    if signo and not txt.startswith("-"):
        txt = "+" + txt
    return txt.replace(".", ",")


def cifra_corta(v: float | int | None) -> str:
    """Como `f"{v:g}"` (sin ceros de relleno: «2», «1,6», «0,05») con coma.
    Para umbrales y tallas que se citan tal como están definidos."""
    if v is None:
        return "—"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "—"
    if not math.isfinite(x):
        return "—"
    txt = f"{x:g}"
    if txt.startswith("-") and x == 0:
        txt = txt[1:]
    return txt.replace(".", ",")


def coordenadas(v, decimales: int = 1) -> str:
    """«(1,2; 4,6; −7,9)»: los ejes separados por «; » para que la coma de los
    decimales no se confunda con la que separa x, y, z. Sin valor, «—».
    Espejo de `coordenadas` en `frontend/src/lib/numero.ts` (signo «−»)."""
    if v is None:
        return "—"
    try:
        ejes = [cifra(x, decimales).replace("-", "−") for x in v]
    except TypeError:
        return "—"
    return f"({'; '.join(ejes)})"
