import { describe, expect, it } from "vitest";
import { VOLUME_PRESETS, presetToRange } from "./volumePresets";

describe("presetToRange", () => {
  it("hay seis preajustes con los nombres de siempre", () => {
    expect(VOLUME_PRESETS).toEqual(["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"]);
  });
  it("lleva 0 → lo y 255 → hi, y conserva el orden de los puntos", () => {
    const t = presetToRange("CTA", [1000, 3000]);
    expect(t.color[0][0]).toBe(1000); expect(t.color.at(-1)![0]).toBe(3000);
    expect(t.opacity[0][0]).toBe(1000); expect(t.opacity.at(-1)![0]).toBe(3000);
    for (let i = 1; i < t.color.length; i++) expect(t.color[i][0]).toBeGreaterThanOrEqual(t.color[i - 1][0]);
  });
  it("un rango degenerado no produce NaN ni puntos decrecientes", () => {
    const t = presetToRange("Hueso", [500, 500]);
    expect(t.opacity.every(([x, a]) => Number.isFinite(x) && Number.isFinite(a))).toBe(true);
    for (let i = 1; i < t.opacity.length; i++) expect(t.opacity[i][0]).toBeGreaterThanOrEqual(t.opacity[i - 1][0]);
  });
  it("los valores de color y opacidad no cambian, solo el dominio", () => {
    const t = presetToRange("Vasos CTA", [0, 255]);
    expect(t.color[2]).toEqual([120, 1, 0.18, 0.08]);
    expect(t.opacity[2]).toEqual([120, 0.75]);
  });
});
