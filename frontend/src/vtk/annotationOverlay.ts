/* Lo que se dibuja de las anotaciones encima de un corte, en px de la celda.
   Puro: SliceView solo lo pinta y la captura (que lee el DOM) recibe las mismas
   coordenadas, sin transformaciones que deshacer. */
import type { AnnotationKind, VolumeMeta } from "../api/types";
import { centroid, formatMeasure, measure, onSlice, type Annotation } from "./annotations";
import type { Plane, Vec3 } from "./geometry";
import { ANNOTATION_HEX } from "./planeColors";
import { mmToUv, PLANE_AXIS } from "./sliceCoords";

export type Shape =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dashed?: boolean }
  | { kind: "polygon"; points: { x: number; y: number }[]; color: string; fill: string; closed: boolean; width?: number }
  | { kind: "circle"; x: number; y: number; r: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };

export interface Box { left: number; top: number; w: number; h: number }

/** El naranja de los puntos pendientes del 3D (PENDING_COLOR en Viewer). */
export const DRAFT_HEX = "#fa8c1a";

const WIDTH = 1.5, WIDTH_SELECTED = 3;
const BEAD_R = 2.5, MARKER_R = 4;
// El rótulo se aparta del punto que nombra para no taparlo.
const TEXT_DX = 6, TEXT_DY = -6;
// Una nota larga taparía la imagen; entera se lee en el panel.
const NOTE_MAX = 24;

/** «R1 · 12,4 mm»; en compacto solo «R1». El marcador no mide: lleva su nota. */
export function labelFor(a: Annotation, compact: boolean): string {
  if (compact) return a.label;
  if (a.kind === "marcador") {
    const note = a.note.trim();
    if (!note) return a.label;
    return `${a.label} · ${note.length > NOTE_MAX ? note.slice(0, NOTE_MAX - 1) + "…" : note}`;
  }
  const v = formatMeasure(measure(a));
  return v ? `${a.label} · ${v}` : a.label;
}

/** Dónde va el rótulo: la regla en su punto medio, el ángulo en el vértice, la
 *  región en su centroide y el marcador en su punto. */
export function labelAnchor(a: Pick<Annotation, "kind" | "points">): Vec3 {
  const p = a.points;
  if (a.kind === "regla" && p.length >= 2) return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, (p[0][2] + p[1][2]) / 2];
  if (a.kind === "angulo" && p.length >= 2) return p[1];
  if (a.kind === "region") return centroid(p);
  return p[0];
}

/** Formas en px de la celda para las anotaciones visibles en este corte, más el borrador. */
export function shapesForSlice(
  list: Annotation[], draft: { kind: AnnotationKind; points: Vec3[] } | null,
  plane: Plane, index: number, meta: VolumeMeta, box: Box, opts: { compact: boolean; selected: string | null },
): Shape[] {
  const px = (m: Vec3) => {
    const { u, v } = mmToUv(plane, m, meta);
    return { x: box.left + u * box.w, y: box.top + v * box.h };
  };
  const out: Shape[] = [];
  const segment = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, width: number, dashed?: boolean) =>
    out.push({ kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, color, width, ...(dashed ? { dashed } : {}) });

  for (const a of list) {
    if (!a.visible || !onSlice(a, plane, index, meta)) continue;
    const color = ANNOTATION_HEX[a.kind];
    const width = opts.selected === a.id ? WIDTH_SELECTED : WIDTH;
    const pts = a.points.map(px);
    if (a.kind === "regla" && pts.length >= 2) {
      segment(pts[0], pts[1], color, width);
      for (const p of pts.slice(0, 2)) out.push({ kind: "circle", x: p.x, y: p.y, r: BEAD_R, color });
    } else if (a.kind === "angulo" && pts.length >= 3) {
      segment(pts[0], pts[1], color, width);
      segment(pts[1], pts[2], color, width);
    } else if (a.kind === "region" && pts.length >= 3) {
      // Relleno del mismo color al 20 % (#rrggbbaa): se ve qué queda dentro sin tapar la imagen.
      out.push({ kind: "polygon", points: pts, color, fill: `${color}33`, closed: true });
    } else if (a.kind === "marcador" && pts.length >= 1) {
      out.push({ kind: "circle", x: pts[0].x, y: pts[0].y, r: MARKER_R, color });
    } else continue;
    const at = px(labelAnchor(a));
    out.push({ kind: "text", x: at.x + TEXT_DX, y: at.y + TEXT_DY, text: labelFor(a, opts.compact), color });
  }

  // El borrador, discontinuo y sin rótulo: aún no mide nada. Sale en el corte
  // por el que pasa alguno de sus puntos, la misma regla que una regla hecha.
  if (draft && draft.points.length > 0) {
    const axis = PLANE_AXIS[plane];
    const step = meta.spacing[2 - axis];
    if (draft.points.some((p) => Math.abs(p[axis] - index * step) <= 0.5 * step)) {
      const pts = draft.points.map(px);
      if (draft.kind === "region") out.push({ kind: "polygon", points: pts, color: DRAFT_HEX, fill: "none", closed: false });
      else for (let k = 1; k < pts.length; k++) segment(pts[k - 1], pts[k], DRAFT_HEX, WIDTH, true);
      for (const p of pts) out.push({ kind: "circle", x: p.x, y: p.y, r: BEAD_R, color: DRAFT_HEX });
    }
  }
  return out;
}
