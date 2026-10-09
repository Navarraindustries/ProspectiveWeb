/* Los planos de recorte del MIP en RECORTE EJE, con o sin la caja LOCAL.
   vtk.js admite seis planos en el mapper de volumen (vClipPlaneNormals[6]):
   la caja aporta seis y el corte del eje se FUNDE con la cara de su lado en
   vez de sumarse (spec §6). vtk conserva el semiespacio (p − origen)·normal ≥ 0. */
import type { Vec3 } from "./geometry";
import { MIN_EXTENT_MM, type Bounds6 } from "./orbit";

export interface ClipPlaneSpec { origin: Vec3; normal: Vec3 }

export function axisClipPlanes(o: { axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number; box: Bounds6 | null }): ClipPlaneSpec[] {
  const n = (a: number, sign: 1 | -1): Vec3 => { const v: Vec3 = [0, 0, 0]; v[a] = sign; return v; };
  const at = (a: number, mm: number): Vec3 => { const v: Vec3 = [0, 0, 0]; v[a] = mm; return v; };
  if (!o.box) {
    if (o.acumulado) return [{ origin: at(o.axis, o.posMm), normal: n(o.axis, o.reverse ? 1 : -1) }];
    return [{ origin: at(o.axis, o.posMm - o.slabMm), normal: n(o.axis, 1) }, { origin: at(o.axis, o.posMm + o.slabMm), normal: n(o.axis, -1) }];
  }
  const b = o.box.slice() as Bounds6;
  const lo = 2 * o.axis, hi = lo + 1;
  if (o.acumulado) { if (o.reverse) b[lo] = Math.max(b[lo], o.posMm); else b[hi] = Math.min(b[hi], o.posMm); }
  else { b[lo] = Math.max(b[lo], o.posMm - o.slabMm); b[hi] = Math.min(b[hi], o.posMm + o.slabMm); }
  // El corte puede caer fuera de la caja: se deja 1 mm pegado al lado que manda.
  if (b[hi] - b[lo] < MIN_EXTENT_MM) {
    if (o.acumulado && !o.reverse) b[lo] = b[hi] - MIN_EXTENT_MM;
    else b[hi] = b[lo] + MIN_EXTENT_MM;
  }
  const out: ClipPlaneSpec[] = [];
  for (let a = 0; a < 3; a++) {
    out.push({ origin: at(a, b[2 * a]), normal: n(a, 1) });
    out.push({ origin: at(a, b[2 * a + 1]), normal: n(a, -1) });
  }
  return out;
}
