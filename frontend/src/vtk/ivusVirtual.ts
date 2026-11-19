/* IVUS virtual de VINI 3D: lo que el panel calcula sobre el pullback que da el
   servidor (api.ivusVirtual). Puro, para probarlo sin canvas.

   Marco de cada sección: (u, v) en mm, la línea central en (0, 0); en la
   imagen, la columna crece con u y la fila con v. Un ángulo θ es la dirección
   (cos θ, sin θ) en ese marco. */
import type { FdOption, FdSizingResult, IvusBranch, IvusCompareSection, IvusSection, IvusSectionStent } from "../api/types";
import type { Annotation } from "./annotations";
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

// ── VINI 3D, segunda tanda (18-11): ramas, comparación y marcas ─────────── #

/** Las ramas visibles cuyo origen cae a menos de `tolMm` de esta posición. */
export function ramasCerca(ramas: IvusBranch[] | undefined, arcMm: number, tolMm = 0.75): IvusBranch[] {
  return (ramas ?? []).filter((r) => Math.abs(r.arc_mm - arcMm) <= tolMm);
}

/** Las ramas visibles que tapa un dispositivo desplegado de `a` a `b` (mm de la línea). */
export function ramasBajo(ramas: IvusBranch[] | undefined, a: number, b: number): IvusBranch[] {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return (ramas ?? []).filter((r) => r.arc_mm >= lo - 1e-6 && r.arc_mm <= hi + 1e-6);
}

/** Cambio de área de la sección actual frente a la misma sección del estudio
 *  anterior, en % del área anterior (null si alguna de las dos no mide). */
export function cambioArea(ahora: IvusSection | undefined, antes: IvusCompareSection | undefined): number | null {
  const a = ahora?.valid ? ahora.area_mm2 : null, b = antes?.valid ? antes.area_mm2 : null;
  return a == null || b == null || !(b > 0) ? null : ((a - b) / b) * 100;
}

/** Un marcador de anotación situado sobre la línea central. */
export interface MarcaEnLinea { id: string; arc_mm: number; etiqueta: string; nota: string }

/** Margen sobre el radio local: un marcador más lejos no es de esta arteria. */
export const MARCA_MARGEN_MM = 2;

/** Los marcadores visibles que caen sobre la arteria recorrida, con su posición
 *  a lo largo de la línea (el punto más cercano), ordenados. */
export function marcasEnLinea(anotaciones: Annotation[], t: CenterlineTrack | null): MarcaEnLinea[] {
  if (!t || t.points.length < 2) return [];
  const out: MarcaEnLinea[] = [];
  for (const a of anotaciones) {
    if (a.kind !== "marcador" || !a.visible || !a.points[0]) continue;
    const p = a.points[0];
    let mejor = -1, dMin = Infinity;
    t.points.forEach((q, k) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < dMin) { dMin = d; mejor = k; }
    });
    if (mejor < 0 || dMin > (t.radiiMm[mejor] ?? 0) + MARCA_MARGEN_MM) continue;
    out.push({ id: a.id, arc_mm: t.arcMm[mejor], etiqueta: a.label, nota: a.note });
  }
  return out.sort((x, y) => x.arc_mm - y.arc_mm);
}

/* ── Gráfico de secciones (P4, 18-11) ─────────────────────────────────── */

/** Qué enseña el gráfico de secciones a lo largo de la línea. */
export type MetricaGrafico = "area" | "diametros" | "circularidad";
export const METRICAS_GRAFICO: { id: MetricaGrafico; rotulo: string }[] = [
  { id: "area", rotulo: "Área" }, { id: "diametros", rotulo: "Ø" }, { id: "circularidad", rotulo: "Circularidad" },
];

/** Una curva del gráfico: un valor por sección (null = hueco: sin medida o en la lesión). */
export interface SerieGrafico { nombre: string; tono: "texto" | "tenue" | "ambar"; valores: (number | null)[]; raya?: boolean }
export interface Grafico { series: SerieGrafico[]; min: number; max: number; unidad: string }

/** Las curvas del gráfico de secciones y su escala. Dentro de la lesión no hay
 *  valor: allí el área es la del saco y aplastaría la escala del vaso. */
export function graficoDe(secs: IvusSection[], metrica: MetricaGrafico, previo?: IvusCompareSection[] | null): Grafico {
  const de = (f: (s: IvusSection) => number | null | undefined) =>
    secs.map((s) => (s.valid && !s.in_lesion ? f(s) ?? null : null));
  let series: SerieGrafico[];
  let unidad = "mm";
  if (metrica === "area") {
    unidad = "mm²";
    series = [{ nombre: "Área", tono: "texto", valores: de((s) => s.area_mm2) }];
    if (previo?.length) {
      series.push({
        nombre: "Antes", tono: "tenue", raya: true,
        valores: secs.map((s, k) => (s.in_lesion || !previo[k]?.valid ? null : previo[k].area_mm2 ?? null)),
      });
    }
  } else if (metrica === "diametros") {
    series = [
      { nombre: "Ø máx", tono: "tenue", valores: de((s) => s.d_max_mm) },
      { nombre: "Ø perímetro", tono: "texto", valores: de((s) => s.d_perimeter_mm) },
      { nombre: "Ø inscrito", tono: "ambar", valores: de((s) => s.d_inscribed_mm) },
    ];
  } else {
    unidad = "";
    series = [{ nombre: "Circularidad", tono: "texto", valores: de((s) => s.circularity) }];
  }
  // La escala, sin las secciones de rama: allí el corte abarca dos luces y una
  // sola confluencia aplastaría todo el vaso (se pintan recortadas arriba).
  const numeros = (filtro: (k: number) => boolean) => series.flatMap((s) => s.valores.filter((v, k): v is number =>
    v != null && Number.isFinite(v) && filtro(k)));
  const sinRamas = numeros((k) => !secs[k]?.in_branch);
  const todos = sinRamas.length ? sinRamas : numeros(() => true);
  if (metrica === "circularidad") {
    const bajo = todos.length ? Math.min(...todos) : 1;
    return { series, unidad, max: 1, min: Math.max(0, Math.min(0.6, Math.floor(bajo * 10) / 10)) };
  }
  const alto = todos.length ? Math.max(...todos) : 1;
  return { series, unidad, min: 0, max: alto > 0 ? alto * 1.1 : 1 };
}
