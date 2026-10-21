import type { VolumeMeta } from "../api/types";
import { isHuModality } from "./modality";

/* Presets HU (port de utils/window_presets.py). Solo tienen sentido en TC. */
export const HU_PRESETS = [
  { name: "Cerebro", wc: 40, ww: 80 }, { name: "Hemorragia", wc: 55, ww: 100 }, { name: "Subdural", wc: 75, ww: 215 },
  { name: "CTA", wc: 170, ww: 600 }, { name: "Hueso", wc: 400, ww: 1000 }, { name: "Pulmón", wc: -600, ww: 1500 },
  { name: "Mediastino", wc: 50, ww: 350 }, { name: "Abdomen", wc: 40, ww: 350 }, { name: "Hígado", wc: 70, ww: 170 },
];

/** `reset`: no es una ventana sino «volver a la del estudio» (el visor la
 *  guarda como null); wc/ww van a NaN para que nadie los aplique por error. */
export type WindowPreset = { name: string; wc: number; ww: number; reset?: boolean };

/** Título de la lectura W/L (cortes y oblicuo): dice qué gesto la cambia. */
export const WL_TITLE = "Ventana y nivel · arrastrar en la imagen los cambia · doble clic restablece";

const RESET: WindowPreset = { name: "Restablecer", wc: NaN, ww: NaN, reset: true };

export function windowPresets(meta: VolumeMeta, band: [number, number] | null): WindowPreset[] {
  // «Auto» es la ventana del estudio: también en TC, donde antes solo había
  // presets clínicos y no había forma de volver a la de partida desde la lista.
  const out: WindowPreset[] = [{ name: "Auto", wc: meta.wc, ww: meta.ww }];
  if (isHuModality(meta.modality)) return [...out, ...HU_PRESETS, RESET];
  const [lo, hi] = meta.intensity_range;
  if (band && Number.isFinite(band[1]) && band[1] > band[0] && band[1] < 1e12) {
    out.push({ name: "Vasos", wc: (band[0] + band[1]) / 2, ww: band[1] - band[0] });
  }
  out.push({ name: "Todo", wc: (lo + hi) / 2, ww: hi - lo });
  out.push(RESET);
  return out;
}
