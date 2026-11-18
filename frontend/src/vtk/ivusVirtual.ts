/* IVUS virtual de VINI 3D: lo que el panel calcula sobre el pullback que da el
   servidor (api.ivusVirtual). Puro, para probarlo sin canvas.

   Marco de cada sección: (u, v) en mm, la línea central en (0, 0); en la
   imagen, la columna crece con u y la fila con v. Un ángulo θ es la dirección
   (cos θ, sin θ) en ese marco. */
import type { FdOption, FdSizingResult, IvusSection, IvusSectionStent } from "../api/types";
import type { CenterlineTrack } from "./centerlineWalk";

/** Firma de una línea central: si cambia (otra extracción), el pullback se vuelve a pedir. */
export function claveDeLinea(t: CenterlineTrack): string {
  const n = t.points.length, p0 = t.points[0], pn = t.points[n - 1];
  const f = (v: number) => v.toFixed(2);
  return n ? `${n}:${f(t.arcMm[n - 1] ?? 0)}:${p0.map(f).join(",")}:${pn.map(f).join(",")}` : "vacia";
}

/** Píxel (columna, fila) de un punto (u, v) mm en una imagen de lado `ladoPx`. */
export function mmAPx(u: number, v: number, fovMm: number, ladoPx: number): [number, number] {
  return [(u / fovMm + 0.5) * ladoPx, (v / fovMm + 0.5) * ladoPx];
}

/** Vista longitudinal (modo L): cada sección cortada por la recta que pasa por
 *  la línea central con ángulo `anguloDeg`. Devuelve una imagen de `S` filas por
 *  `n` columnas (una por sección): fila 0 = extremo en la dirección θ, fila
 *  S − 1 = el opuesto. Muestreo bilineal. */
export function vistaL(pila: Uint8Array, n: number, S: number, anguloDeg: number): Uint8Array {
  const out = new Uint8Array(S * n);
  const a = (anguloDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (let k = 0; k < S; k++) {
    const t = S / 2 - (k + 0.5);                       // px desde el centro, positivo hacia θ
    // Centro de píxel a centro de píxel; en el último medio píxel se toma el del borde.
    const xr = S / 2 + t * c - 0.5, yr = S / 2 + t * s - 0.5;
    if (xr < -0.5 || yr < -0.5 || xr > S - 0.5 || yr > S - 0.5) continue;
    const x = Math.min(S - 1, Math.max(0, xr)), y = Math.min(S - 1, Math.max(0, yr));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1);
    for (let i = 0; i < n; i++) {
      const b = i * S * S;
      const p00 = pila[b + y0 * S + x0], p10 = pila[b + y0 * S + x1];
      const p01 = pila[b + y1 * S + x0], p11 = pila[b + y1 * S + x1];
      out[k * n + i] = Math.round((p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy);
    }
  }
  return out;
}

/** Dónde corta la recta de ángulo θ por la línea central al contorno de la luz:
 *  [distancia hacia θ, distancia hacia θ + 180°] en mm (la intersección más
 *  cercana a cada lado), o null si el contorno no la rodea. */
export function bordesEnL(contorno: number[][] | undefined, anguloDeg: number): [number, number] | null {
  if (!contorno || contorno.length < 3) return null;
  const a = (anguloDeg * Math.PI) / 180, d = [Math.cos(a), Math.sin(a)];
  let pos = Infinity, neg = -Infinity;
  for (let j = 0; j < contorno.length; j++) {
    const p = contorno[j], q = contorno[(j + 1) % contorno.length];
    const e = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * e[1] - p[1] * e[0]) / den;         // a lo largo de d
    const w = (p[0] * d[1] - p[1] * d[0]) / den;         // a lo largo de la arista
    if (w < 0 || w > 1) continue;
    if (t > 0) pos = Math.min(pos, t); else if (t < 0) neg = Math.max(neg, t);
  }
  return Number.isFinite(pos) && Number.isFinite(neg) ? [pos, -neg] : null;
}

/** Anillos de escala: cada 1 mm en campos pequeños, cada 2 mm si no. */
export function anillosMm(fovMm: number): number[] {
  const paso = fovMm <= 12 ? 1 : 2;
  const out: number[] = [];
  for (let r = paso; r < fovMm / 2 - 1e-9; r += paso) out.push(r);
  return out;
}

/** Extremos (u, v) mm de un diámetro: la cuerda de ángulo `anguloDeg` que pasa
 *  por el centroide, recortada al contorno. */
export function cuerda(s: IvusSection, anguloDeg: number | null | undefined): [[number, number], [number, number]] | null {
  if (!s.valid || anguloDeg == null || !s.centroid || !s.contour) return null;
  const [cx, cy] = s.centroid;
  const desplazado = s.contour.map(([u, v]) => [u - cx, v - cy]);
  const b = bordesEnL(desplazado, anguloDeg);
  if (!b) return null;
  const a = (anguloDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return [[cx + b[0] * c, cy + b[0] * sn], [cx - b[1] * c, cy - b[1] * sn]];
}

/* ── Dispositivo: plan del flow diverter (4) y aposición del stent (5) ── */

export type EstadoAposicion = "separado" | "comprimido" | "contacto" | "cuello";

/** Cómo está un punto del stent respecto a la pared, con el ruido (un vóxel)
 *  como suelo: por debajo no se distingue. null = frente al cuello. */
export function estadoAposicion(mm: number | null | undefined, ruidoMm: number): EstadoAposicion {
  if (mm == null) return "cuello";
  if (mm > ruidoMm) return "separado";
  if (mm < -ruidoMm) return "comprimido";
  return "contacto";
}

/** Cómo está el stent en una sección entera: lo peor que tenga. */
export function estadoSeccionStent(st: IvusSectionStent, ruidoMm: number): EstadoAposicion {
  if (st.at_neck) return "cuello";
  if ((st.max_gap_mm ?? 0) > ruidoMm) return "separado";
  if ((st.max_compression_mm ?? 0) > ruidoMm) return "comprimido";
  return "contacto";
}

/** Las opciones del catálogo que encajan, en el orden del servidor (la primera es la propuesta). */
export function opcionesQueEncajan(fd: FdSizingResult | null | undefined): FdOption[] {
  return (fd?.options ?? []).filter((o) => o.fits && o.diameter_mm > 0 && o.length_mm > 0);
}

export type ZonaPlan = "anclaje proximal" | "cuello" | "anclaje distal" | "despliegue";

/** En qué parte del plan cae una posición de la línea (o null, fuera del dispositivo). */
export function zonaDelPlan(arcMm: number, fd: FdSizingResult, opcion: FdOption | null): ZonaPlan | null {
  const dentro = (a: number, b: number) => arcMm >= Math.min(a, b) - 1e-6 && arcMm <= Math.max(a, b) + 1e-6;
  const [c0, c1] = fd.neck_arc_mm;
  if (dentro(c0, c1)) return "cuello";
  if (dentro(fd.proximal.arc_from_mm, fd.proximal.arc_to_mm)) return "anclaje proximal";
  if (dentro(fd.distal.arc_from_mm, fd.distal.arc_to_mm)) return "anclaje distal";
  if (opcion && dentro(opcion.deploy_arc_mm[0], opcion.deploy_arc_mm[1])) return "despliegue";
  return null;
}

/** Ø del dispositivo menos Ø del vaso (mm): + sobredimensionado, − corto. */
export function diferenciaDispositivo(dispositivoMm: number, vasoMm: number | null | undefined): number | null {
  return vasoMm == null || !(vasoMm > 0) ? null : dispositivoMm - vasoMm;
}

/** El estado del stent en una sección, contando que dentro de la lesión
 *  (saco) tampoco hay pared: allí no hay mala aposición que medir. */
export function estadoDeSeccion(s: IvusSection, ruidoMm: number): EstadoAposicion | null {
  if (!s.stent) return null;
  return s.in_lesion ? "cuello" : estadoSeccionStent(s.stent, ruidoMm);
}
