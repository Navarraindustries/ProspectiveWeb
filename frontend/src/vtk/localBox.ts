/* La caja del MIP local: la lesión y lo que la rodea (spec §6), el mismo cubo
   que encuadra «Centrar en la lesión», acotado al volumen. */
import type { Vec3 } from "./geometry";
import { lesionFrameRadiusMm } from "./lesionFrame";
import { MIN_EXTENT_MM, type Bounds6 } from "./orbit";

export function localBox(center: Vec3, diameterMm: number, volume: Bounds6): Bounds6 {
  const r = lesionFrameRadiusMm(diameterMm);
  const out: Bounds6 = [0, 0, 0, 0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const lo = Math.max(volume[2 * a], Math.min(volume[2 * a + 1], center[a] - r));
    const hi = Math.max(volume[2 * a], Math.min(volume[2 * a + 1], center[a] + r));
    out[2 * a] = lo; out[2 * a + 1] = hi;
    // Nunca una caja plana: resetCamera daría NaN y los planos se cruzarían.
    if (hi - lo < MIN_EXTENT_MM) {
      if (lo <= volume[2 * a]) out[2 * a + 1] = Math.min(volume[2 * a + 1], lo + MIN_EXTENT_MM);
      else out[2 * a] = Math.max(volume[2 * a], hi - MIN_EXTENT_MM);
    }
  }
  return out;
}
