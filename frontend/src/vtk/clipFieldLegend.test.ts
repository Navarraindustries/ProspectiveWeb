import { describe, expect, it } from "vitest";
import { FIELD_COLORS, forceValue, legendLines } from "./clipFieldLegend";
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
      "FUERZA 120 g · PROVISIONAL (80–120 g)", "VEREDICTO OK · ESTIMACIÓN GEOMÉTRICA",
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
    expect(l[4].text).toBe("FUERZA 120 g + 120 g · PROVISIONAL (80–120 g)");
  });
});

describe("la leyenda y la tarjeta dicen la misma fuerza (F1-202)", () => {
  const conBanda: ClipFieldSummary = { ...base, force_target_g: 120, force_band_g: [120, 200] };

  it("la cifra de la leyenda es la de la tarjeta: objetivo y banda", () => {
    expect(forceValue(conBanda)).toBe("120 g · banda 120–200 g");
    expect(legendLines(conBanda)[4].text).toBe(`FUERZA ${forceValue(conBanda)} · PROVISIONAL (80–120 g)`);
  });
  it("con la fuerza caracterizada el veredicto se dice tal cual", () => {
    const l = legendLines({ ...base, force_provisional: false, force_is_band_min: false });
    expect(l[4].text).toBe("FUERZA 120 g · ÓPTIMA (80–120 g)");
  });
  it("lo que falla se sigue diciendo aunque sea provisional", () => {
    expect(legendLines({ ...base, pressure_verdict: "insuficiente" })[4].text).toBe("FUERZA 120 g · INSUFICIENTE (80–120 g)");
  });
  it("un objetivo 0 (sin objetivo) no se lee como «0 g»", () => {
    expect(forceValue({ ...base, force_provisional: false, force_target_g: 0, force_band_g: [], force_g: 140 })).toBe("140 g");
  });
});
