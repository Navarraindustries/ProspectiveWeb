/* Los preajustes de tejido del antiguo VolumeView, expresados en el dominio
   0–255 del volumen reducido que aquel pedía al servidor. Aquí se llevan al
   rango real de intensidades del volumen que ya está en el navegador, para
   que «Hueso» siga siendo hueso sin volver a bajar nada. */
export type VolumePreset = "CTA" | "Vasos CTA" | "Cerebro" | "Hemorragia" | "Hueso" | "Tejido blando";
export const VOLUME_PRESETS: VolumePreset[] = ["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"];
export interface TransferPoints { color: [number, number, number, number][]; opacity: [number, number][]; lighting: { ambient: number; diffuse: number; specular: number } }

// [x, r, g, b] y [x, a] con x en 0–255: el servidor reescalaba p1–p99 a
// 0–255, así que 0 y 255 son los extremos de `intensity_range`.
const RAW: Record<VolumePreset, TransferPoints> = {
  "CTA": {
    color: [[0, 0, 0, 0], [70, 0.5, 0.15, 0.1], [130, 0.9, 0.55, 0.35], [200, 1, 0.85, 0.7], [255, 1, 1, 1]],
    opacity: [[0, 0], [60, 0], [110, 0.18], [180, 0.5], [255, 0.85]],
    lighting: { ambient: 0.25, diffuse: 0.7, specular: 0.3 },
  },
  "Vasos CTA": {
    color: [[0, 0, 0, 0], [90, 0, 0, 0], [120, 1, 0.18, 0.08], [170, 1, 0.6, 0.3], [210, 0, 0, 0], [255, 0, 0, 0]],
    opacity: [[0, 0], [95, 0], [120, 0.75], [160, 0.95], [200, 0.6], [220, 0.08], [255, 0]],
    lighting: { ambient: 0.1, diffuse: 0.95, specular: 0.45 },
  },
  "Cerebro": {
    color: [[0, 0, 0, 0], [40, 0, 0, 0], [70, 0.42, 0.38, 0.38], [110, 0.6, 0.52, 0.5], [160, 0.85, 0.75, 0.65], [255, 1, 1, 1]],
    opacity: [[0, 0], [40, 0], [70, 0.08], [110, 0.16], [160, 0.35], [255, 0.7]],
    lighting: { ambient: 0.25, diffuse: 0.8, specular: 0.15 },
  },
  "Hemorragia": {
    color: [[0, 0, 0, 0], [120, 0, 0, 0], [150, 0.85, 0.65, 0.55], [175, 1, 0.35, 0.1], [200, 1, 0.9, 0.5], [255, 1, 1, 1]],
    opacity: [[0, 0], [130, 0], [150, 0.3], [175, 0.7], [200, 0.9], [255, 0.8]],
    lighting: { ambient: 0.2, diffuse: 0.85, specular: 0.2 },
  },
  "Hueso": {
    color: [[0, 0, 0, 0], [170, 0, 0, 0], [200, 0.88, 0.8, 0.6], [230, 1, 0.95, 0.82], [255, 1, 1, 1]],
    opacity: [[0, 0], [180, 0], [200, 0.3], [230, 0.8], [255, 0.95]],
    lighting: { ambient: 0.15, diffuse: 0.95, specular: 0.45 },
  },
  "Tejido blando": {
    color: [[0, 0, 0, 0], [50, 0, 0, 0], [90, 0.38, 0.22, 0.18], [130, 0.75, 0.55, 0.45], [170, 0.9, 0.78, 0.68], [210, 1, 0.9, 0.7], [240, 0, 0, 0]],
    opacity: [[0, 0], [50, 0], [90, 0.06], [130, 0.18], [170, 0.28], [210, 0.4], [235, 0.05], [255, 0]],
    lighting: { ambient: 0.25, diffuse: 0.85, specular: 0.1 },
  },
};

/** Ventana de intensidad (nivel y anchura) a la que se llevan los puntos 0–255 de un preajuste. */
export interface VolumeWindow { wc: number; ww: number }

/** La ventana que abarca todo el rango; con hi ≤ lo se usa anchura 1 para que el dominio no degenere. */
export function defaultWindow(range: [number, number]): VolumeWindow {
  const lo = range[0], hi = Math.max(range[1], range[0] + 1);
  return { wc: (lo + hi) / 2, ww: hi - lo };
}

/** Los puntos del preajuste (dominio 0–255) llevados linealmente a la ventana; ww se acota a ≥ 1 para que los puntos sigan siendo monótonos. */
export function presetToWindow(preset: VolumePreset, w: VolumeWindow): TransferPoints {
  const ww = Math.max(1, w.ww), lo = w.wc - ww / 2;
  const map = (x: number) => lo + (x / 255) * ww;
  const p = RAW[preset];
  return {
    color: p.color.map(([x, r, g, b]) => [map(x), r, g, b] as [number, number, number, number]),
    opacity: p.opacity.map(([x, a]) => [map(x), a] as [number, number]),
    lighting: p.lighting,
  };
}

/** Los puntos del preajuste llevados al rango real [lo, hi]: es la ventana por defecto de ese rango. */
export function presetToRange(preset: VolumePreset, range: [number, number]): TransferPoints {
  return presetToWindow(preset, defaultWindow(range));
}
