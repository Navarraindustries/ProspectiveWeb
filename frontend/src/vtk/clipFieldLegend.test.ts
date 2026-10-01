import { describe, expect, it } from "vitest";
import { FIELD_COLORS, legendLines } from "./clipFieldLegend";
import type { ClipFieldSummary } from "../api/types";

const base: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", verdict: "ok", criteria: [], clip_name: "T1 10", note: "" };

describe("legendLines", () => {
  it("una línea por categoría con su color, la presión frente a la ventana y el veredicto", () => {
    const l = legendLines(base);
    expect(l.map((x) => x.text)).toEqual([
      "CUBIERTO 92 %", "CUELLO RESIDUAL 8 %", "NO ALCANZADO 0 %", "NO EVALUADO",
      "PRESIÓN 14.3 g/mm² · ÓPTIMA (11.6–17.4)", "VEREDICTO OK · ESTIMACIÓN GEOMÉTRICA",
    ]);
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_optima);
    expect(l[1].color).toBe(FIELD_COLORS.residual);
    expect(l[3].color).toBe(FIELD_COLORS.no_evaluado);
  });
  it("sin contacto lo dice y pinta el cubierto en gris", () => {
    const l = legendLines({ ...base, covered_pct: 0, pressure_g_mm2: 0, pressure_verdict: "sin_contacto", verdict: "fail" });
    expect(l[4].text).toBe("PRESIÓN — · SIN CONTACTO");
    expect(l[5].text).toBe("VEREDICTO FAIL · ESTIMACIÓN GEOMÉTRICA");
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_sin_contacto);
  });
  it("sin fuerza conocida no inventa presión y lo dice", () => {
    const l = legendLines({ ...base, pressure_verdict: "sin_fuerza", verdict: "warn" });
    expect(l[4].text).toBe("PRESIÓN — · SIN FUERZA");
    expect(l[0].color).toBe(FIELD_COLORS.cubierto_sin_fuerza);
  });
  it("la fuerza provisional no ensucia el texto de la presión: el número sale tal cual", () => {
    // La marca de banda provisional no va en el texto de la línea (la leyenda
    // es estrecha); el texto conserva el número sin prefijo «~».
    const t = legendLines({ ...base, force_provisional: true, force_is_band_min: true })[4].text;
    expect(t.startsWith("PRESIÓN ~")).toBe(false);
    expect(t).toContain("14.3");
  });
});
