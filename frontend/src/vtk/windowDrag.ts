import type { VolumeWindow } from "./volumePresets";

/* La misma sensibilidad que el arrastre de ventana de los cortes (SliceView):
   400 px recorren todo el rango robusto del volumen. Arrastrar hacia arriba
   sube el nivel (dy negativo en pantalla) y hacia la derecha ensancha la
   ventana, que nunca baja de 1 para que la rampa no degenere. */
export function windowFromDrag(start: VolumeWindow, dxPx: number, dyPx: number, range: [number, number]): VolumeWindow {
  const k = (range[1] - range[0]) / 400;
  return { wc: start.wc - dyPx * k, ww: Math.max(1, start.ww + dxPx * k) };
}
