/* Modelo puro de las anotaciones persistentes: medidas, etiquetas, qué corte las
   enseña y exportación. Las fórmulas de medida se repiten en
   backend/services/annotations.py: el servidor las recalcula para el informe y
   no puede depender de lo que diga el cliente. */
import type { AnnotationKind, AnnotationPlane, VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";
import { PLANE_AXIS } from "./sliceCoords";

/** Tipo del almacén (tuplas); el del cable es AnnotationWire en api/types. */
export interface Annotation {
  id: string; kind: AnnotationKind; points: Vec3[];
  plane: AnnotationPlane | null; label: string; note: string; visible: boolean;
  created_at: string; created_by: string;
}

export type Measure = { kind: "distancia"; mm: number } | { kind: "angulo"; deg: number }
  | { kind: "area"; mm2: number; perimetroMm: number } | null;

export const POINTS_NEEDED: Record<AnnotationKind, number> = { regla: 2, angulo: 3, region: 3, marcador: 1 };
export const KIND_PREFIX: Record<AnnotationKind, string> = { regla: "R", angulo: "A", region: "G", marcador: "M" };
/** Los topes del servidor (backend/models/annotations.py). WHY aquí también:
 *  cada PUT lleva la lista entera, así que una sola anotación que el servidor
 *  rechace (422) dejaría sin guardar todas las que vengan detrás. */
export const LABEL_MAX = 40;
export const NOTE_MAX = 500;
export const ANNOTATIONS_MAX = 200;

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Fórmula del cordón sobre los dos ejes del plano; el eje normal no cuenta. */
export function polygonArea(points: Vec3[], normalAxis: 0 | 1 | 2): number {
  const [i, j] = ([0, 1, 2] as const).filter((k) => k !== normalAxis);
  let s = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k], q = points[(k + 1) % points.length];
    s += p[i] * q[j] - q[i] * p[j];
  }
  return Math.abs(s) / 2;
}

/** Eje perpendicular al polígono: el que menos varía (una región se dibuja en un corte). */
function normalAxisOf(points: Vec3[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 2, bestSpread = Infinity;
  for (const k of [2, 1, 0] as const) {
    const vals = points.map((p) => p[k]);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread < bestSpread) { bestSpread = spread; best = k; }
  }
  return best;
}

export function measure(a: Pick<Annotation, "kind" | "points">): Measure {
  const pts = a.points;
  if (pts.length < POINTS_NEEDED[a.kind]) return null;
  if (a.kind === "regla") return { kind: "distancia", mm: dist(pts[0], pts[1]) };
  if (a.kind === "angulo") {
    const [p, v, q] = pts;
    const u = [p[0] - v[0], p[1] - v[1], p[2] - v[2]], w = [q[0] - v[0], q[1] - v[1], q[2] - v[2]];
    const nu = Math.hypot(u[0], u[1], u[2]), nw = Math.hypot(w[0], w[1], w[2]);
    if (nu === 0 || nw === 0) return null;
    const c = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (nu * nw);
    // El acotado evita NaN cuando el redondeo deja c en 1,0000000002.
    return { kind: "angulo", deg: (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI };
  }
  if (a.kind === "region") {
    let per = 0;
    for (let k = 0; k < pts.length; k++) per += dist(pts[k], pts[(k + 1) % pts.length]);
    return { kind: "area", mm2: polygonArea(pts, normalAxisOf(pts)), perimetroMm: per };
  }
  return null;
}

// Coma decimal a mano: no depende de los datos de idioma del motor (Node sin ICU completo).
const es = (x: number, digits: number) => x.toFixed(digits).replace(".", ",");

export function formatMeasure(m: Measure): string {
  if (!m) return "";
  if (m.kind === "distancia") return `${es(m.mm, 1)} mm`;
  if (m.kind === "angulo") return `${es(m.deg, 0)}°`;
  return `${es(m.mm2, 0)} mm²`;
}

/** Máximo + 1 y no el primer hueco: borrar R2 no debe hacer que la próxima regla
 *  reutilice un nombre que el médico ya citó en una nota. */
export function nextLabel(kind: AnnotationKind, existing: { label: string }[]): string {
  const prefix = KIND_PREFIX[kind];
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const e of existing) {
    const m = re.exec(e.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

/** ¿Se dibuja esta anotación en el corte `index` del plano? La región solo en el suyo;
 *  el resto, si algún punto cae a menos de medio vóxel del corte (así una regla hecha
 *  en el 3D aparece donde la atraviesa). */
export function onSlice(a: Annotation, plane: Plane, index: number, meta: VolumeMeta): boolean {
  if (a.kind === "region") return a.plane?.plane === plane && a.plane.index === index;
  const axis = PLANE_AXIS[plane];
  const step = meta.spacing[2 - axis];
  return a.points.some((p) => Math.abs(p[axis] - index * step) <= 0.5 * step);
}

export function centroid(points: Vec3[]): Vec3 {
  const n = points.length || 1;
  const s = points.reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  return [s[0] / n, s[1] / n, s[2] / n];
}

const CSV_HEADER = "nombre;tipo;valor;unidad;corte;nota;puntos_mm";
const SLICE_TAG: Record<Plane, string> = { axial: "AX", coronal: "COR", sagital: "SAG" };
const num = (x: number) => String(Math.round(x * 10) / 10);
// Un ';' o un salto de línea en la nota descuadrarían las columnas al abrirlo en Excel.
// WHY el apóstrofo: Excel ejecuta como fórmula lo que empieza por = + - @ o
// tabulador, y una nota es texto libre. Las comillas se escapan entre comillas
// para que una «"» suelta no parta la columna.
const cell = (s: string) => {
  let t = s.replace(/[;\r\n]+/g, " ");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
};

export function toCsv(list: Annotation[]): string {
  const rows = list.map((a) => {
    const m = measure(a);
    let valor = "", unidad = "";
    if (m?.kind === "distancia") { valor = es(m.mm, 1); unidad = "mm"; }
    else if (m?.kind === "angulo") { valor = es(m.deg, 0); unidad = "°"; }
    else if (m?.kind === "area") { valor = es(m.mm2, 0); unidad = "mm²"; }
    // El índice interno cuenta desde 0, pero lo que la gente ve (HUD, panel) cuenta
    // desde 1: el CSV y el informe numeran igual que la pantalla.
    const corte = a.plane ? `${SLICE_TAG[a.plane.plane]} ${a.plane.index + 1}` : "3D";
    const puntos = a.points.map((p) => p.map(num).join(" ")).join(" | ");
    return [cell(a.label), a.kind, valor, unidad, corte, cell(a.note), puntos].join(";");
  });
  return [CSV_HEADER, ...rows].join("\n");
}

/** Id de anotación nuevo. WHY: `crypto.randomUUID` solo existe en contextos
 *  seguros; servida por http plano en la red del hospital no está y el cierre
 *  de la anotación reventaba. `getRandomValues` sí está en cualquier contexto. */
export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
