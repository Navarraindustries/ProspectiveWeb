import type { VolumeMeta } from "../api/types";

/* Presets HU (port de utils/window_presets.py). Solo tienen sentido en TC. */
export const HU_PRESETS = [
  { name: "Cerebro", wc: 40, ww: 80 }, { name: "Hemorragia", wc: 55, ww: 100 }, { name: "Subdural", wc: 75, ww: 215 },
  { name: "CTA", wc: 170, ww: 600 }, { name: "Hueso", wc: 400, ww: 1000 }, { name: "Pulmón", wc: -600, ww: 1500 },
  { name: "Mediastino", wc: 50, ww: 350 }, { name: "Abdomen", wc: 40, ww: 350 }, { name: "Hígado", wc: 70, ww: 170 },
];

export function windowPresets(meta: VolumeMeta, band: [number, number] | null) {
  if ((meta.modality || "").toUpperCase() === "CT") return HU_PRESETS;
  const [lo, hi] = meta.intensity_range;
  const out = [{ name: "Auto", wc: meta.wc, ww: meta.ww }];
  if (band && Number.isFinite(band[1]) && band[1] > band[0] && band[1] < 1e12) {
    out.push({ name: "Vasos", wc: (band[0] + band[1]) / 2, ww: band[1] - band[0] });
  }
  out.push({ name: "Todo", wc: (lo + hi) / 2, ww: hi - lo });
  return out;
}
