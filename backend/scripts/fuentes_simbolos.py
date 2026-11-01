"""Subconjunto «símbolos» de Inter y JetBrains Mono para frontend/src/styles/tokens/fonts.css.

Fuentes de origen (SIL OFL), descargadas a una carpeta aparte:
  InterVariable.woff2     https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.woff2
  JetBrainsMono-wght.ttf  https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/variable/JetBrainsMono%5Bwght%5D.ttf

Uso (necesita fonttools y brotli, que no están en el venv del backend):
  python -I backend/scripts/fuentes_simbolos.py <carpeta_descargas> frontend/src/assets/fonts
Escribe InterVariable-simbolos.woff2 y JetBrainsMonoVariable-simbolos.woff2 e
imprime el unicode-range exacto (solo los puntos de código que cada fuente tiene).
La familia «Inter» toma de JetBrains Mono los que Inter no tiene (fonts.css).
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

BLOQUES = [
    (0x0370, 0x03FF),  # griego (π, Δ)
    (0x2190, 0x21FF),  # flechas
    (0x2200, 0x22FF),  # operadores matemáticos (≥ ≤ ≈ √ ∩)
    (0x2300, 0x23FF),  # técnicos varios (⌘ ⌀)
    (0x25A0, 0x25FF),  # formas geométricas (● ○ ▸ ▾ ▶ ◀)
    (0x2600, 0x26FF),  # símbolos varios (★ ⚠)
    (0x2700, 0x27BF),  # dingbats (✓ ✕)
]


def rangos(cps):
    cps = sorted(cps)
    out, ini, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        out.append((ini, prev))
        ini = prev = c
    out.append((ini, prev))
    return ",".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in out)


def main(dl, sal):
    for origen, destino in (("InterVariable.woff2", "InterVariable-simbolos.woff2"),
                            ("JetBrainsMono-wght.ttf", "JetBrainsMonoVariable-simbolos.woff2")):
        fuente = TTFont(os.path.join(dl, origen))
        cmap = fuente.getBestCmap()
        cps = [c for a, b in BLOQUES for c in range(a, b + 1) if c in cmap]
        opciones = subset.Options()
        opciones.flavor = "woff2"
        opciones.layout_features = ["*"]
        opciones.name_IDs = ["*"]
        opciones.notdef_outline = True
        sub = subset.Subsetter(opciones)
        sub.populate(unicodes=cps)
        sub.subset(fuente)
        ruta = os.path.join(sal, destino)
        fuente.flavor = "woff2"
        fuente.save(ruta)
        print(f"{destino}: {len(cps)} glifos, {os.path.getsize(ruta) // 1024} KB")
        print(f"  unicode-range: {rangos(cps)};")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
