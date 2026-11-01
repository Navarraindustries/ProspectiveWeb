"""Sora (500-600) autoalojada para el logotipo: frontend/src/styles/tokens/fonts.css.

Fuentes de origen (SIL OFL), descargadas a una carpeta aparte:
  Sora[wght].ttf  https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf
  OFL.txt         https://github.com/google/fonts/raw/main/ofl/sora/OFL.txt
                  (se copia tal cual a frontend/src/assets/fonts/OFL-Sora.txt)

Uso (necesita fonttools y brotli, que no están en el venv del backend):
  python -I backend/scripts/fuentes_sora.py <carpeta_descargas> frontend/src/assets/fonts
Recorta el eje wght a 500-600 y escribe Sora-latin.woff2 y Sora-latin-ext.woff2 con los
mismos unicode-range que el «Inter» de fonts.css; imprime tamaño y nº de glifos.
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Los mismos unicode-range que los @font-face de Inter (fonts.css).
RANGOS = {
    "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
}


def puntos(rango: str) -> list[int]:
    """«U+0000-00FF,U+0131» -> lista de puntos de código."""
    out: list[int] = []
    for trozo in rango.split(","):
        trozo = trozo.strip()[2:]
        a, _, b = trozo.partition("-")
        out.extend(range(int(a, 16), int(b or a, 16) + 1))
    return out


def main(dl: str, sal: str) -> None:
    base = TTFont(os.path.join(dl, "Sora[wght].ttf"))
    base = instancer.instantiateVariableFont(base, {"wght": (500, 600)})
    for nombre, rango in RANGOS.items():
        # Copia independiente del instanciado: se guarda y se vuelve a abrir.
        ruta_tmp = os.path.join(sal, f".sora-{nombre}.tmp.ttf")
        base.save(ruta_tmp)
        fuente = TTFont(ruta_tmp)
        os.remove(ruta_tmp)
        cmap = fuente.getBestCmap()
        cps = [c for c in puntos(rango) if c in cmap]
        opciones = subset.Options()
        opciones.flavor = "woff2"
        opciones.layout_features = ["*"]
        opciones.name_IDs = ["*"]
        opciones.notdef_outline = True
        sub = subset.Subsetter(opciones)
        sub.populate(unicodes=cps)
        sub.subset(fuente)
        ruta = os.path.join(sal, f"Sora-{nombre}.woff2")
        fuente.flavor = "woff2"
        fuente.save(ruta)
        print(f"Sora-{nombre}.woff2: {len(cps)} glifos, {os.path.getsize(ruta) / 1024:.1f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
