import { describe, expect, it } from "vitest";
import { bandTier, headerLabels, MAIN_LABELS, mainOptions, presetOptions } from "./mainOptions";

describe("mainOptions", () => {
  it("cinco vistas en orden fijo con rótulos cortos", () => {
    expect(mainOptions().map((o) => o.key)).toEqual(["scene", "axial", "coronal", "sagital", "mip"]);
    expect(mainOptions().map((o) => o.label)).toEqual(["3D", "AX", "COR", "SAG", "VOLUMEN"]);
    expect(MAIN_LABELS.mip).toBe("VOLUMEN");
  });
  it("cada opción explica qué hace", () => {
    for (const o of mainOptions()) expect(o.title).toMatch(/principal/i);
  });
});

describe("presetOptions", () => {
  it("abrevia los presets cuando la banda de cabecera mide menos de 1100 px", () => {
    expect(presetOptions(530).map((o) => o.label)).toEqual(["DER", "ABA", "4", "SOLA"]);
    expect(presetOptions(1099).map((o) => o.label)).toEqual(["DER", "ABA", "4", "SOLA"]);
  });
  it("nombre entero desde 1100 px o sin medida", () => {
    expect(presetOptions(1100).map((o) => o.label)).toEqual(["DERECHA", "ABAJO", "CUATRO", "SOLA"]);
    expect(presetOptions(Number.POSITIVE_INFINITY).map((o) => o.label)).toEqual(["DERECHA", "ABAJO", "CUATRO", "SOLA"]);
  });
  it("las claves y los títulos no cambian al abreviar", () => {
    expect(presetOptions(500).map((o) => o.key)).toEqual(["derecha", "abajo", "cuatro", "sola"]);
    expect(presetOptions(500).map((o) => o.title)).toEqual(presetOptions(1200).map((o) => o.title));
  });
});

describe("headerLabels", () => {
  it("«PRINCIPAL» se reduce a «▸» en una banda de menos de 1100 px", () => {
    expect(headerLabels(742).mainCaption).toBe("▸");
    expect(headerLabels(1099).mainCaption).toBe("▸");
    expect(headerLabels(1100).mainCaption).toBe("PRINCIPAL");
    expect(headerLabels(Number.POSITIVE_INFINITY).mainCaption).toBe("PRINCIPAL");
  });
});

describe("bandTier", () => {
  it("bandTier por ancho y táctil", () => {
    expect(bandTier(1400, false)).toBe("ancho");
    expect(bandTier(1399, false)).toBe("medio");
    expect(bandTier(1100, false)).toBe("medio");
    expect(bandTier(1099, false)).toBe("estrecho");
    expect(bandTier(800, false)).toBe("estrecho");
    expect(bandTier(799, false)).toBe("iconos");
    expect(bandTier(2132, true)).toBe("iconos");
    expect(bandTier(Number.POSITIVE_INFINITY, false)).toBe("ancho");
  });
});

describe("presetOptions cuatro", () => {
  it("CUATRO está entre los presets y se abrevia a 4", () => {
    expect(presetOptions(1200).map((o) => o.key)).toContain("cuatro");
    expect(presetOptions(600).find((o) => o.key === "cuatro")!.label).toBe("4");
  });
});

describe("F1-112: el título de CUATRO", () => {
  it("dice qué cuatro vistas pinta y que VOLUMEN queda fuera", () => {
    expect(presetOptions(1000).find((o) => o.key === "cuatro")!.title)
      .toBe("Axial, coronal, sagital y 3D a cuartos; VOLUMEN queda fuera (Alt+4)");
  });
});
