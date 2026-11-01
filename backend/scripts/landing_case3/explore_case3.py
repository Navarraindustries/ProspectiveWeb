"""Exploracion de Case 3: orientacion, percentiles, previas de cortes. Sin VTK."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import BACKEND, WORK, MEDIA, CASE3, PW
sys.path.insert(0, str(BACKEND))
OUTD = WORK

from services.dicom_loader import load_series, scan_series
from services.head_axes import axes_from_dicom

ser = scan_series(CASE3)
print([(s.get("series_uid"), s.get("n_slices")) for s in ser])
dcm = load_series(ser[0]["series_uid"], CASE3)
v = dcm.volume
print("shape", v.shape, "spacing", dcm.spacing, "origin", dcm.origin, "dir", dcm.direction,
      "known", dcm.orientation_known, "WC/WW", dcm.window_center, dcm.window_width)
ax = axes_from_dicom(CASE3, ser[0]["series_uid"])
print("axes", ax)
p = np.percentile(v[::2, ::2, ::2], [1, 5, 25, 50, 75, 90, 95, 99, 99.5, 99.9])
print("percentiles", [round(float(x)) for x in p])
np.save(OUTD / "vol.npy", v)
json.dump({"spacing": list(dcm.spacing), "origin": list(dcm.origin), "direction": list(dcm.direction)},
          open(OUTD / "vol_meta.json", "w"))

def w8(a, lo, hi):
    return (np.clip((a - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)

sp = dcm.spacing
gt = np.array([62.0, 64.0, 63.0])  # mm malla (x, y, z)
gi = (gt / np.array([sp[2], sp[1], sp[0]]))  # indices (col, row, slice)
print("GT index col,row,slice", gi)
c, r, s = [int(round(x)) for x in gi]
lo, hi = p[5], p[9]
Image.fromarray(w8(v[s], lo, hi)).save(OUTD / "prev_slice_k.png")          # plano k (coronal anat.)
Image.fromarray(w8(v[:, r, :], lo, hi)).save(OUTD / "prev_row_j.png")      # plano j (axial anat. si +y = superior)
Image.fromarray(w8(v[:, :, c], lo, hi)).save(OUTD / "prev_col_i.png")      # plano i (sagital)
for name, ax_ in (("mip_k", 0), ("mip_j", 1), ("mip_i", 2)):
    Image.fromarray(w8(v.max(axis=ax_), p[7], p[9] * 1.2)).save(OUTD / f"{name}.png")
print("done")
