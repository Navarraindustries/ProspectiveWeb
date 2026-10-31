"""Franja de aneurismas de la landing (rediseño D).

Toma la figura `data/paperfinal.jpg` (mallas de aneurismas: vasos en rojo,
sacos en azul, sobre blanco) y la reescribe en el idioma de la dirección D:
fondo #050608, vasos en gris claro y sacos en el rojo de lesión (#FF5A6A),
conservando el sombreado de cada pieza. Las sombras de contacto del suelo
blanco se descartan. Salida: `frontend/public/media/landing/aneurismas.webp`
(2400 px de ancho) y `aneurismas-movil.webp` (recorte central de 1200 px).

Uso: backend/.venv/Scripts/python.exe -X utf8 backend/scripts/landing_aneurismas.py
"""

import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "data", "paperfinal.jpg")
OUT = os.path.join(ROOT, "frontend", "public", "media", "landing")

FONDO = np.array([5, 6, 8], dtype=np.float32)
VASO = np.array([201, 206, 214], dtype=np.float32)    # gris claro azulado
LESION = np.array([255, 90, 106], dtype=np.float32)   # --destructive del tema oscuro


def recolorear(rgb: np.ndarray) -> np.ndarray:
    f = rgb.astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(axis=-1)
    mn = f.min(axis=-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)

    # Cobertura de pieza: el suelo y sus sombras son grises (saturación baja);
    # las mallas están saturadas. Rampa suave para no dejar bordes duros.
    cobertura = np.clip((sat - 0.18) / 0.22, 0.0, 1.0)

    # Qué pieza es: azul (saco) frente a rojo (vaso).
    azul = np.clip((b - r) * 4.0 + 0.5, 0.0, 1.0)

    # Sombreado propio de la malla: el canal dominante de cada pieza (rojo en
    # los vasos, azul en los sacos), estirado entre sus percentiles 3 y 97
    # dentro de esa clase para recuperar el volumen que la figura tenía.
    dominante = np.where(azul > 0.5, b, r)
    sombreado = np.zeros_like(dominante)
    for clase in (azul > 0.5, azul <= 0.5):
        m = clase & (cobertura > 0.8)
        if m.any():
            lo, hi = np.percentile(dominante[m], [3, 97])
            sombreado[clase] = np.clip((dominante[clase] - lo) / max(hi - lo, 1e-3), 0.0, 1.0)
    sombreado = (0.28 + 0.82 * sombreado ** 1.4)[..., None]

    color = (VASO * (1.0 - azul[..., None]) + LESION * azul[..., None]) * sombreado
    color = np.clip(color, 0, 255)
    out = FONDO * (1.0 - cobertura[..., None]) + color * cobertura[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert("RGB")
    out = Image.fromarray(recolorear(np.asarray(im)))
    ancho = out.resize((2400, round(2400 * out.height / out.width)), Image.LANCZOS)
    ancho.save(os.path.join(OUT, "aneurismas.webp"), quality=80, method=6)
    w, h = out.size
    lado = h
    centro = out.crop(((w - lado) // 2, 0, (w + lado) // 2, h)).resize((1200, 1200), Image.LANCZOS)
    centro.save(os.path.join(OUT, "aneurismas-movil.webp"), quality=80, method=6)
    for n in ("aneurismas.webp", "aneurismas-movil.webp"):
        p = os.path.join(OUT, n)
        print(n, Image.open(p).size, round(os.path.getsize(p) / 1024), "KB")


if __name__ == "__main__":
    main()
