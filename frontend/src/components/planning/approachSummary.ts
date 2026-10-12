/* Cómo se nombra el abordaje guardado y su corredor.

   Aparte de DevicesPanel porque el «Resumen del caso» del informe (F1-220)
   dice lo mismo en una línea, y repetir los rótulos en dos sitios los haría
   divergir: el panel diría «Corredor libre» y el resumen otra cosa. */

import type { CorridorAssessmentOut, TrajectoryResult } from "../../api/types";

/** El veredicto del corredor, con las palabras del panel de Dispositivos. */
export const VERDICT_LABEL: Record<CorridorAssessmentOut["verdict"], string> = {
  viable: "Corredor libre",
  revisar: "Revisar el corredor",
  no_viable: "Corredor bloqueado",
};

/** «Corredor libre · 62 mm · 18°», o «Trayectoria guardada · …» sin corredor
 *  analizado (sin malla no hay contra qué cruzarlo). */
export function approachSummary(tr: TrajectoryResult): string {
  const head = tr.corridor ? VERDICT_LABEL[tr.corridor.verdict] : "Trayectoria guardada";
  return `${head} · ${tr.depth_mm.toFixed(0)} mm · ${tr.angle_deg.toFixed(0)}°`;
}
