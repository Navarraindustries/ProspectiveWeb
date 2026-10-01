/* Leyenda del mapa de calor del clip: los mismos colores que pinta el servidor
   (services/clip_field.py), para que la barra diga lo que la malla enseña. */
import type { ClipFieldSummary } from "../api/types";
import type { HudTextLine } from "./hud/HudReadout";

export const FIELD_COLORS = {
  cubierto_optima: "rgb(34,197,94)", cubierto_aceptable: "rgb(245,158,11)", cubierto_insuficiente: "rgb(59,130,246)",
  cubierto_exceso: "rgb(239,68,68)", cubierto_sin_contacto: "rgb(148,163,184)", cubierto_sin_fuerza: "rgb(148,163,184)",
  residual: "rgb(217,70,239)", no_alcanzado: "rgb(107,114,128)",
  // Lo que queda fuera de evaluación (el domo, lejos del cuello): es casi todo
  // el saco, y un color en la malla que la leyenda no nombra se lee como dato.
  no_evaluado: "rgb(120,112,124)",
} as const;

const VERDICT_LABEL: Record<ClipFieldSummary["pressure_verdict"], string> = {
  sin_contacto: "SIN CONTACTO", sin_fuerza: "SIN FUERZA", insuficiente: "INSUFICIENTE", optima: "ÓPTIMA", aceptable: "ACEPTABLE", exceso: "EXCESO",
};

export function legendLines(s: ClipFieldSummary): HudTextLine[] {
  const covKey = `cubierto_${s.pressure_verdict}` as keyof typeof FIELD_COLORS;
  const [, optLo, optHi] = s.window_g_mm2;
  // Sin contacto o sin fuerza conocida no hay presión que dar: un número ahí
  // (0 o la de un clip sin ficha) se leería como medida.
  const presion = s.pressure_verdict === "sin_contacto" || s.pressure_verdict === "sin_fuerza"
    ? `PRESIÓN — · ${VERDICT_LABEL[s.pressure_verdict]}`
    : `PRESIÓN ${s.pressure_g_mm2.toFixed(1)} g/mm² · ${VERDICT_LABEL[s.pressure_verdict]} (${optLo.toFixed(1)}–${optHi.toFixed(1)})`;
  return [
    { text: `CUBIERTO ${Math.round(s.covered_pct)} %`, color: FIELD_COLORS[covKey] ?? FIELD_COLORS.cubierto_sin_contacto },
    { text: `CUELLO RESIDUAL ${Math.round(s.residual_pct)} %`, color: FIELD_COLORS.residual },
    { text: `NO ALCANZADO ${Math.round(s.unreached_pct)} %`, color: FIELD_COLORS.no_alcanzado },
    { text: "NO EVALUADO", color: FIELD_COLORS.no_evaluado },
    { text: presion },
    { text: `VEREDICTO ${s.verdict.toUpperCase()} · ESTIMACIÓN GEOMÉTRICA` },
  ];
}
