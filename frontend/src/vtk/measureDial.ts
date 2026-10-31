// Dial de medida alrededor del saco: circunferencia con marcas radiales cada
// pocos mm de perímetro, en el plano perpendicular al eje cuello→ápice.
// Es una función pura: `progress` (0→1) la anima quien la llama.

import type { MeshLine } from "./MeshView";
import type { Vec3 } from "./geometry";
import { hexToRgb01 } from "./planeColors";

/** Espejo de --data (el azul de las cifras medidas). */
export const DIAL_COLOR = hexToRgb01("#8CBBFF");
const DIAL_LINE_RADIUS_MM = 0.12;

export interface DialOpts { segments: number; tickEveryMm: number; tickLenMm: number }
const DEFAULT_OPTS: DialOpts = { segments: 48, tickEveryMm: 2, tickLenMm: 0.8 };

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

export function measureDial(
  center: Vec3, axis: Vec3, radiusMm: number, progress: number, opts: DialOpts = DEFAULT_OPTS,
): MeshLine[] {
  if (!(progress > 0) || !(radiusMm > 0)) return [];
  const p = Math.min(progress, 1);
  const { segments, tickEveryMm, tickLenMm } = opts;
  const k = norm(axis);
  const ref: Vec3 = Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(k, ref));
  const v = norm(cross(k, u));
  const at = (t: number, r: number): Vec3 => [
    center[0] + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)),
    center[1] + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t)),
    center[2] + r * (u[2] * Math.cos(t) + v[2] * Math.sin(t)),
  ];
  const out: MeshLine[] = [];
  const line = (a: Vec3, b: Vec3): MeshLine => ({ a, b, color: DIAL_COLOR, radiusMm: DIAL_LINE_RADIUS_MM });

  // Arco: tantos segmentos como cubra el progreso; el último, truncado.
  const covered = p * segments;
  const full = Math.floor(covered + 1e-9);
  const step = (2 * Math.PI) / segments;
  for (let i = 0; i < full; i++) out.push(line(at(i * step, radiusMm), at(((i + 1) % segments) * step, radiusMm)));
  const frac = covered - full;
  if (frac > 1e-9 && full < segments) out.push(line(at(full * step, radiusMm), at((full + frac) * step, radiusMm)));

  // Marcas cada `tickEveryMm` de perímetro hasta donde llega el arco. Con una
  // sola marca por vuelta no hay escala: no se dibujan.
  const perimeter = 2 * Math.PI * radiusMm;
  if (tickEveryMm > 0 && tickEveryMm < perimeter) {
    const reach = p * perimeter;
    for (let s = 0; s <= reach + 1e-9; s += tickEveryMm) {
      const t = s / radiusMm;
      out.push(line(at(t, radiusMm), at(t, radiusMm + tickLenMm)));
    }
  }
  return out;
}
