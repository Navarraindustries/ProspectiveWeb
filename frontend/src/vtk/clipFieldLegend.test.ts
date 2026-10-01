import { describe, expect, it } from "vitest";
import { FIELD_COLORS, legendLines } from "./clipFieldLegend";
import type { ClipFieldSummary } from "../api/types";

const base: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", force_window_g: [70, 80, 120, 150], neck_evaluated: true,
  clips: [{ name: "T1 10", force_g: 120, verdict: "optima" }],
  verdict: "ok", criteria: [], clip_name: "T1 10", note: "" };

describe("legendLines", () => {
  it("una línea por categoría del cuello con su color, la fuerza frente a la ventana en gramos y el veredicto", () => {
    const l = legendLines(base);
    expect(l.map((x) => x.text)).toEqual([
      "CUELLO CUBIERTO 92 %", "CUELLO RESIDUAL 8 %", "CUELLO NO ALCANZADO 0 %", "NO EVALUADO",
      "FUERZA 120 g · ÓPTIMA (80–120 g)", "VEREDICTO OK · ESTIMACIÓN GEOMÉTRICA",
    ]);
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_optima);
    expect(l[1].color).toBe(FIELD_COLORS.residual);
    expect(l[3].color).toBe(FIELD_COLORS.no_evaluado);
  });
  it("la presión en g/mm² no sale en la leyenda", () => {
    expect(legendLines(base).some((x) => x.text.includes("g/mm²"))).toBe(false);
  });
  it("sin contacto lo dice y pinta el cubierto en gris", () => {
    const l = legendLines({ ...base, covered_pct: 0, pressure_g_mm2: 0, pressure_verdict: "sin_contacto", verdict: "fail" });
    expect(l[4].text).toBe("FUERZA 120 g · SIN CONTACTO (80–120 g)");
    expect(l[5].text).toBe("VEREDICTO FAIL · ESTIMACIÓN GEOMÉTRICA");
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_sin_contacto);
  });
  it("sin cuello evaluado los porcentajes son «—», no 0 %", () => {
    const l = legendLines({ ...base, covered_pct: 0, residual_pct: 0, pressure_verdict: "sin_contacto", neck_evaluated: false });
    expect(l.slice(0, 3).map((x) => x.text)).toEqual(["CUELLO CUBIERTO —", "CUELLO RESIDUAL —", "CUELLO NO ALCANZADO —"]);
  });
  it("sin fuerza conocida no inventa una cifra pero deja la ventana en gramos", () => {
    const l = legendLines({ ...base, force_g: 0, clips: [{ name: "importado", force_g: 0, verdict: "sin_fuerza" }],
      pressure_verdict: "sin_fuerza", verdict: "warn" });
    expect(l[4].text).toBe("FUERZA — · SIN FUERZA (80–120 g)");
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_sin_fuerza);
  });
  it("con dos clips da la fuerza de cada uno y el veredicto del peor", () => {
    const l = legendLines({ ...base, clips: [{ name: "A", force_g: 120, verdict: "optima" }, { name: "B", force_g: 120, verdict: "optima" }] });
    expect(l[4].text).toBe("FUERZA 120 g + 120 g · ÓPTIMA (80–120 g)");
  });
});
