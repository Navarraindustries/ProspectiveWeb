"""Genera favicon-32.png y apple-touch-icon.png del icono D (solo biblioteca estándar).

Uso: python -I backend/scripts/favicon_png.py frontend/public
Rasterizado por supermuestreo 4x4 en el espacio 48x48 del icono.
"""
import struct
import sys
import zlib
from pathlib import Path

AZUL = (0x5A, 0xA9, 0xFF, 255)
OSCURO = (0x06, 0x12, 0x1F, 255)
BLANCO = (255, 255, 255, 255)
NADA = (0, 0, 0, 0)
SS = 4


def _en_rect_redondeado(x, y, rx):
    if not (0 <= x <= 48 and 0 <= y <= 48):
        return False
    if rx <= 0:
        return True
    cx = min(max(x, rx), 48 - rx)
    cy = min(max(y, rx), 48 - rx)
    return (x - cx) ** 2 + (y - cy) ** 2 <= rx * rx


def _color(x, y, geo):
    if not _en_rect_redondeado(x, y, geo["rx"]):
        return NADA
    tx, ty, s = geo["tx"], geo["ty"], geo["s"]
    qx, qy = (x - tx) / s, (y - ty) / s
    t = geo["trazo"]
    col = AZUL
    fuera = ((qx - 24) / (15 + t / 2)) ** 2 + ((qy - 25) / (18 + t / 2)) ** 2 <= 1
    dentro = ((qx - 24) / (15 - t / 2)) ** 2 + ((qy - 25) / (18 - t / 2)) ** 2 < 1
    if fuera and not dentro:
        col = OSCURO
    for cx, cy, r in geo["pequenos"]:
        if (qx - cx) ** 2 + (qy - cy) ** 2 <= r * r:
            col = OSCURO
    cx, cy, r = geo["grande"]
    if (qx - cx) ** 2 + (qy - cy) ** 2 <= r * r:
        col = BLANCO
    return col


def _rasterizar(tam, geo):
    filas = []
    k = 48 / tam
    for py in range(tam):
        fila = bytearray([0])
        for px in range(tam):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) * k
                    y = (py + (sy + 0.5) / SS) * k
                    c = _color(x, y, geo)
                    for i in range(4):
                        acc[i] += c[i]
            fila.extend(round(v / (SS * SS)) for v in acc)
        filas.append(bytes(fila))
    return _png(tam, tam, b"".join(filas))


def _chunk(tipo, datos):
    cuerpo = tipo + datos
    return struct.pack(">I", len(datos)) + cuerpo + struct.pack(">I", zlib.crc32(cuerpo) & 0xFFFFFFFF)


def _png(ancho, alto, crudo):
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(crudo, 9))
            + _chunk(b"IEND", b""))


PEQUENO = dict(rx=12, tx=7.5, ty=7.5, s=0.6875, trazo=4, pequenos=[], grande=(28.5, 20, 5))
COMPLETO = dict(rx=0, tx=8, ty=8, s=0.666667, trazo=3.5,
                pequenos=[(18, 30, 1.8), (23.5, 35, 1.8)], grande=(28.5, 20, 5))


def main(sal: str) -> None:
    d = Path(sal)
    (d / "favicon-32.png").write_bytes(_rasterizar(32, PEQUENO))
    (d / "apple-touch-icon.png").write_bytes(_rasterizar(180, COMPLETO))


if __name__ == "__main__":
    main(sys.argv[1])
