"""Fotogramas del hero con Case 3 (3DRA XA multiframe 384^3).

Orientacion (DICOM, PerFrameFunctionalGroupsSequence, comprobada con
`services.head_axes.axes_from_dicom`): en el array (k, j, i) = (z, y, x) de
`load_series`, k crece hacia ANTERIOR, j hacia SUPERIOR, i hacia la IZQUIERDA
del paciente. El plano axial anatomico es por tanto j = constante, con la
imagen (k, i). Se pinta en convencion radiologica: anterior arriba (k
invertido) e izquierda del paciente a la derecha de la imagen (i tal cual).

Cada fotograma es una losa MIP fina (2*HALF+1 cortes) centrada en el corte j;
en una 3DRA un corte de 0,32 mm solo deja puntos sueltos. Recorrido: de
arriba (superior) hacia abajo hasta el corte de la lesion (GT basilar,
62/64/63 mm de malla -> j = 199). Numeracion de `sliceOf`: corte contado
desde el extremo superior del volumen, 0-based: n = 383 - j.

Uso: python hero_slices_case3.py [--half 6] [--l 1800] [--w 3000] [--out DIR]

Orden de los cinco scripts (con `backend/.venv/Scripts/python.exe`; nunca dos
procesos VTK a la vez):
  1. explore_case3.py: carga con `load_series`, comprueba la orientacion y
     guarda work/vol.npy (226 MB). Sin VTK.
  2. seg_detect_case3.py: segmentacion + deteccion por el camino de la app
     (un proceso VTK, unos 270 s). Escribe la malla y los parches en work/.
  3. hero_slices_case3.py (este): los 60 fotogramas y su manifiesto
     (work/hero_slices_meta.json, que se copia a media/landing/hero.json).
  4. render_case3.py [--only hero|views]: hero-3d.webp y secciones/.
  5. render_clips.py: clips/.
`work` es backend/data/landing_case3 (datos de paciente, ignorado por git).
"""
import argparse, json, os, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import WORK, MEDIA
ap = argparse.ArgumentParser()
ap.add_argument("--half", type=int, default=6)
ap.add_argument("--l", type=float, default=1800)
ap.add_argument("--w", type=float, default=3000)
ap.add_argument("--out", default=str(MEDIA))
ap.add_argument("--q", type=int, default=78)
ap.add_argument("--j0", type=int, default=None)
args = ap.parse_args()

v = np.load(WORK / "vol.npy", mmap_mode="r")
meta = json.load(open(WORK / "vol_meta.json"))
sz, sy, sx = meta["spacing"]
N = v.shape[1]
GT = np.array([62.0, 64.0, 63.0])
J_LES = int(round(GT[1] / sy))
LOWER = 1471.0  # umbral automatico de la app para Case 3 (xa_band_pass)


def slab(j, half):
    a = np.asarray(v[:, max(0, j - half): min(N, j + half + 1), :]).max(axis=1)
    return a[::-1, :]


# Inicio del recorrido: la fila mas alta con vasos (>= 5 % de los voxeles de
# vaso del corte de la lesion), para que el primer fotograma no salga negro.
if args.j0 is None:
    ref = (slab(J_LES, 0) > LOWER).sum()
    j0 = J_LES
    for j in range(N - 1, J_LES, -1):
        if (np.asarray(v[:, j, :]) > LOWER).sum() >= 0.05 * ref:
            j0 = j
            break
else:
    j0 = args.j0
print("lesion j", J_LES, "inicio j0", j0)
rows = [int(round(x)) for x in np.linspace(j0, J_LES, 60)]
rows[-1] = J_LES
assert all(rows[i] > rows[i + 1] for i in range(59)), "recorrido no estricto"

# Recorte cuadrado comun: caja de los vasos en la MIP de todo el recorrido.
mip = np.asarray(v[:, J_LES - args.half: j0 + args.half + 1, :]).max(axis=1)[::-1, :]
ys, xs = np.where(mip > LOWER)
y0, y1 = np.percentile(ys, [0.5, 99.5]); x0, x1 = np.percentile(xs, [0.5, 99.5])
side = int(round(max(y1 - y0, x1 - x0) * 1.15))
side = min(side, mip.shape[0])
cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
ty = int(round(min(max(cy - side / 2, 0), mip.shape[0] - side)))
tx = int(round(min(max(cx - side / 2, 0), mip.shape[1] - side)))
ly = (N - 1) - int(round(GT[2] / sz)); lx = int(round(GT[0] / sx))
print("recorte", ty, tx, side, "lesion en recorte", (ly - ty) / side, (lx - tx) / side)

lo = args.l - args.w / 2
out = Path(args.out); hero = out / "hero"; hero.mkdir(parents=True, exist_ok=True)
total = 0
for f, j in enumerate(rows):
    s = slab(j, args.half)
    u8 = (np.clip((s - lo) / args.w, 0, 1) * 255).astype(np.uint8)
    crop = u8[ty: ty + side, tx: tx + side]
    im = Image.fromarray(np.ascontiguousarray(crop)).resize((1024, 1024), Image.LANCZOS)
    p = hero / ("%03d.webp" % f)
    im.save(p, "WEBP", quality=args.q, method=6)
    total += os.path.getsize(p)
print("60 fotogramas, %.2f MB" % (total / 1e6))
slice_of = [(N - 1) - j for j in rows]
manifest = {"count": 60, "total": N, "lesionFrame": 59, "lesionSlice": (N - 1) - J_LES,
            "window": {"w": int(args.w), "l": int(args.l)},
            "frames": ["%03d.webp" % i for i in range(60)], "sliceOf": slice_of,
            "lesion": {"diameterMm": None, "neckMm": None}}
json.dump({"manifest": manifest, "rows_j": rows, "crop": {"ty": ty, "tx": tx, "side": side},
           "slab_half": args.half, "lesion_frac_in_crop": [(ly - ty) / side, (lx - tx) / side]},
          open(WORK / "hero_slices_meta.json", "w"), indent=1)
print("ok")
