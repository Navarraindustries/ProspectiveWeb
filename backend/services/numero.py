"""Cifras con coma decimal para el texto que lee una persona.

«Lo que lee una persona lleva coma decimal; lo que lee una máquina lleva
punto.» El backend manda los números como números; cuando tiene que mandar una
frase o una etiqueta ya hecha (un nombre de pieza, un aviso, el informe), las
cifras de dentro se escriben con `cifra`. Lo que va a un nombre de fichero, una
clave, un CSV o un log conserva el punto (`f"{v:.1f}"` de siempre).

Espejo de `frontend/src/lib/numero.ts`: `None`, NaN e infinitos → «—»; `-0` y
lo que se redondea a cero, sin signo («0,0», nunca «-0,0»). Redondea como
`Number.prototype.toFixed`: sobre el valor binario exacto del flotante, y un
empate exacto se aleja del cero (0.125 → «0,13», 2.5 → «3», −2.5 → «−3»; 1.005
es 1.00499… en binario → «1,00»). El `format` de Python redondea los empates
al par y daba otra cifra que la pantalla para el mismo número.
"""
from __future__ import annotations

import math
import re
from decimal import ROUND_HALF_UP, Decimal, localcontext

__all__ = ["cifra", "cifra_corta", "coordenadas", "punto_decimal"]

#: Lo que `cifra_corta` conserva, como `cifraCorta` en el frontend.
DECIMALES_CORTA = 6


def _finito(v) -> float | None:
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _fijo(x: float, decimales: int) -> str:
    """`x.toFixed(decimales)` de JavaScript, sin notación exponencial y con
    punto. Lo que redondea a cero sale sin signo."""
    d = max(0, int(decimales))
    with localcontext() as ctx:
        ctx.prec = 400          # cabe el mayor flotante con todos sus dígitos
        q = Decimal(x).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    txt = format(q, "f")
    if txt.startswith("-") and q == 0:
        txt = txt[1:]
    return txt


def cifra(v: float | int | None, decimales: int = 1, *, signo: bool = False) -> str:
    """`11` → «11,0»; `7.25, 2` → «7,25»; `None`/NaN/±inf → «—».

    `signo=True` antepone «+» a lo que no es negativo, como `f"{v:+.2f}"`
    («+0,30», «+0,00», «-0,25»)."""
    x = _finito(v)
    if x is None:
        return "—"
    txt = _fijo(x, decimales)
    if signo and not txt.startswith("-"):
        txt = "+" + txt
    return txt.replace(".", ",")


def cifra_corta(v: float | int | None) -> str:
    """Sin ceros de relleno, con coma: «2», «1,6», «0,05». Para umbrales y
    tallas que se citan tal como están definidos.

    La misma regla que `cifraCorta`: redondeo a 6 decimales como `toFixed(6)`
    y sin los ceros finales. Nunca notación científica (1234567 → «1234567»,
    1e-5 → «0,00001», −1e-9 → «0»)."""
    x = _finito(v)
    if x is None:
        return "—"
    txt = _fijo(x, DECIMALES_CORTA)
    if "." in txt:
        txt = txt.rstrip("0").rstrip(".")
    return txt.replace(".", ",")


_COMA_SUELTA = re.compile(r"(?<![^\W\d_])(?<!\d,)(?<!\d)(\d+),(\d+)(?!\d|,\d)")


def punto_decimal(texto: str) -> str:
    """La forma de máquina de un rótulo de persona: la coma decimal de un
    número suelto vuelve a ser punto («NAVARRO™ T1 Recto 7,0 mm» →
    «… 7.0 mm»). Para exportaciones (DICOM SR) que reciben un nombre ya hecho.
    No toca «a, b», «T1,2» ni cadenas «1,2,3»."""
    return _COMA_SUELTA.sub(r"\1.\2", texto or "")


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
