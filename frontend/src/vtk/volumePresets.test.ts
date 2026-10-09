import { describe, expect, it } from "vitest";
import { HU_VOLUME_PRESETS, XA_VOLUME_PRESETS, defaultVolumeWindow, defaultWindow, presetToRange, presetToWindow, volumePresetsFor } from "./volumePresets";

describe("presetToRange", () => {
  it("en TC hay seis preajustes de tejido con los nombres de siempre", () => {
    expect(HU_VOLUME_PRESETS).toEqual(["CTA", "Vasos CTA", "Cerebro", "Hemorragia", "Hueso", "Tejido blando"]);
    expect(volumePresetsFor("CT")).toEqual(HU_VOLUME_PRESETS);
    expect(volumePresetsFor("ctpa")).toEqual(HU_VOLUME_PRESETS);
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

describe("presetToWindow", () => {
  it("con la ventana por defecto reproduce presetToRange punto a punto", () => {
    expect(presetToWindow("Vasos CTA", defaultWindow([1000, 3000]))).toEqual(presetToRange("Vasos CTA", [1000, 3000]));
  });
  it("mueve el dominio con el nivel y lo estira con la ventana", () => {
    const t = presetToWindow("CTA", { wc: 2000, ww: 1000 });
    expect(t.color[0][0]).toBe(1500); expect(t.color.at(-1)![0]).toBe(2500);
  });
  it("una ventana nula o negativa se acota a 1 y los puntos siguen monótonos", () => {
    const t = presetToWindow("Hueso", { wc: 500, ww: -20 });
    for (let i = 1; i < t.opacity.length; i++) expect(t.opacity[i][0]).toBeGreaterThanOrEqual(t.opacity[i - 1][0]);
    expect(t.opacity.at(-1)![0] - t.opacity[0][0]).toBeCloseTo(1, 9);
  });
  it("defaultWindow es el centro y la anchura del rango", () => {
    expect(defaultWindow([1000, 3000])).toEqual({ wc: 2000, ww: 2000 });
    // Rango degenerado: el dominio sigue siendo [7, 8], como en el antiguo presetToRange, así que el nivel es 7.5.
    expect(defaultWindow([7, 7])).toEqual({ wc: 7.5, ww: 1 });
  });
});

describe("preajustes por modalidad (spec §3.2)", () => {
  it("fuera de TC solo hay VASOS y TODO, en ese orden", () => {
    expect(volumePresetsFor("XA")).toEqual(["Vasos", "Todo"]);
    expect(volumePresetsFor(null)).toEqual(XA_VOLUME_PRESETS);
  });
  it("«Vasos» y «Todo» reutilizan las curvas de «Vasos CTA» y «CTA» punto a punto", () => {
    expect(presetToRange("Vasos", [0, 255])).toEqual(presetToRange("Vasos CTA", [0, 255]));
    expect(presetToRange("Todo", [0, 255])).toEqual(presetToRange("CTA", [0, 255]));
  });
  it("la ventana por defecto de «Vasos» es la banda de vasos; la del resto, el rango", () => {
    expect(defaultVolumeWindow("Vasos", [0, 5000], [1470, 4717])).toEqual({ wc: 3093.5, ww: 3247 });
    expect(defaultVolumeWindow("Todo", [0, 5000], [1470, 4717])).toEqual(defaultWindow([0, 5000]));
    expect(defaultVolumeWindow("Hueso", [0, 5000], [1470, 4717])).toEqual(defaultWindow([0, 5000]));
  });
  it("sin banda (o degenerada) «Vasos» cae al rango", () => {
    expect(defaultVolumeWindow("Vasos", [0, 5000], null)).toEqual(defaultWindow([0, 5000]));
    expect(defaultVolumeWindow("Vasos", [0, 5000], [3000, 3000])).toEqual(defaultWindow([0, 5000]));
  });
});
