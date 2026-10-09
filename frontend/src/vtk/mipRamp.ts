/* La rampa de gris del MIP expresada como ventana (nivel y anchura), para que
   el botón derecho y el doble clic la muevan igual que en los cortes. Sin
   ventana del usuario se deriva del umbral: negro hasta él, blanco en el techo
   del rango robusto — exactamente la rampa que había antes (spec §3.3). */
import type { VolumeWindow } from "./volumePresets";

export interface MipRamp { color: [number, number, number, number][]; opacity: [number, number][] }

export function derivedMipWindow(thresholdLo: number, rangeHi: number): VolumeWindow {
  const ww = Math.max(1, rangeHi - thresholdLo);
  return { wc: thresholdLo + ww / 2, ww };
}

export function mipRampPoints(w: VolumeWindow, rangeLo: number): MipRamp {
  const ww = Math.max(1, w.ww), lo = w.wc - ww / 2, hi = w.wc + ww / 2;
  // El negro arranca en el suelo del rango o en el de la ventana, el menor:
  // una ventana bajada por debajo del rango no puede dejar puntos decrecientes.
  const floor = Math.min(rangeLo, lo);
  return {
    color: [[floor, 0, 0, 0], [lo, 0.25, 0.25, 0.25], [hi, 1, 1, 1]],
    opacity: [[floor, 0], [lo, 0], [lo + ww * 0.15, 0.9], [hi, 1]],
  };
}
