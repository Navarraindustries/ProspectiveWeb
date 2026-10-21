/* Borrador de una anotación mientras se marca: cuándo se termina, cuándo se
   cierra una región y cómo se deshace un punto. Puro, para que el corte y el
   3D compartan las mismas reglas. */
import type { AnnotationKind } from "../api/types";
import type { Vec3 } from "./geometry";
import { POINTS_NEEDED } from "./annotations";

export type DraftStep = { draft: Vec3[]; done: Vec3[] | null };
type Px = { x: number; y: number };

/** Añade un punto; `done` trae los puntos de la anotación terminada (y el borrador vuelve a []). */
export function addPoint(kind: AnnotationKind, draft: Vec3[], p: Vec3): DraftStep {
  const next = [...draft, p];
  // WHY: la región no tiene número de puntos fijo; la cierra el usuario.
  if (kind !== "region" && next.length >= POINTS_NEEDED[kind]) return { draft: [], done: next };
  return { draft: next, done: null };
}

/** Un clic a ≤ radiusPx del primer punto cierra la región (si ya tiene ≥ 3). */
export function closesRegion(draftPx: Px[], clickPx: Px, radiusPx = 8): boolean {
  if (draftPx.length < POINTS_NEEDED.region) return false;
  return Math.hypot(clickPx.x - draftPx[0].x, clickPx.y - draftPx[0].y) <= radiusPx;
}

/** null si < 3 puntos: con dos no hay área. */
export function closeRegion(draft: Vec3[]): Vec3[] | null {
  return draft.length >= POINTS_NEEDED.region ? [...draft] : null;
}

export function removeLast(draft: Vec3[]): Vec3[] {
  return draft.slice(0, -1);
}
