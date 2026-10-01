/* Leyenda del mapa de calor del clip: los mismos colores que pinta el servidor
   (services/clip_field.py), para que la barra diga lo que la malla enseña. */
import type { ClipFieldSummary, ClipForceVerdict } from "../api/types";
import type { HudTextLine } from "./hud/HudReadout";

export const FIELD_COLORS = {
  cubierto_optima: "rgb(34,197,94)", cubierto_aceptable: "rgb(245,158,11)", cubierto_insuficiente: "rgb(59,130,246)",
  cubierto_exceso: "rgb(239,68,68)", cubierto_sin_contacto: "rgb(148,163,184)", cubierto_sin_fuerza: "rgb(148,163,184)",
  residual: "rgb(217,70,239)", no_alcanzado: "rgb(107,114,128)",
  // Lo que queda fuera de evaluación (el domo, lejos del cuello): es casi todo
  // el saco, y un color en la malla que la leyenda no nombra se lee como dato.
  no_evaluado: "rgb(120,112,124)",
} as const;

const VERDICT_LABEL: Record<ClipForceVerdict, string> = {
  sin_contacto: "SIN CONTACTO", sin_fuerza: "SIN FUERZA", insuficiente: "INSUFICIENTE", optima: "ÓPTIMA", aceptable: "ACEPTABLE", exceso: "EXCESO",
};

/** Un porcentaje del cuello, o «—» si no hay cuello evaluado: 0/0/0 se leería
 *  como «nada cubierto», y lo que pasa es que el clip no está a su altura. */
export function neckPct(s: ClipFieldSummary, v: number, digits = 0): string {
  return s.neck_evaluated ? `${v.toFixed(digits)} %` : "—";
}

/** La fuerza de cada clip en gramos («120 g + 120 g»); «—» si un clip no tiene ficha. */
export function forcesText(s: ClipFieldSummary): string {
  const g = (f: number) => (f > 0 ? `${f.toFixed(0)} g` : "—");
  return s.clips.length > 1 ? s.clips.map((c) => g(c.force_g)).join(" + ") : g(s.force_g);
}

/** La ventana óptima del cuello en gramos, «80–120 g». La de g/mm² divide por la
 *  misma área que la presión y no añade nada: el veredicto es fuerza contra ventana. */
export function optimalWindowText(s: ClipFieldSummary): string {
  const [, optLo, optHi] = s.force_window_g;
  return `${optLo.toFixed(0)}–${optHi.toFixed(0)} g`;
}

export function legendLines(s: ClipFieldSummary): HudTextLine[] {
  const covKey = `cubierto_${s.pressure_verdict}` as keyof typeof FIELD_COLORS;
  return [
    { text: `CUELLO CUBIERTO ${neckPct(s, s.covered_pct)}`, color: FIELD_COLORS[covKey] ?? FIELD_COLORS.cubierto_sin_contacto },
    { text: `CUELLO RESIDUAL ${neckPct(s, s.residual_pct)}`, color: FIELD_COLORS.residual },
    { text: `CUELLO NO ALCANZADO ${neckPct(s, s.unreached_pct)}`, color: FIELD_COLORS.no_alcanzado },
    { text: "NO EVALUADO", color: FIELD_COLORS.no_evaluado },
    { text: `FUERZA ${forcesText(s)} · ${VERDICT_LABEL[s.pressure_verdict]} (${optimalWindowText(s)})` },
    { text: `VEREDICTO ${s.verdict.toUpperCase()} · ESTIMACIÓN GEOMÉTRICA` },
  ];
}
