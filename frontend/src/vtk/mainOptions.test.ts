import { describe, expect, it } from "vitest";
import { headerLabels, MAIN_LABELS, mainOptions, presetOptions } from "./mainOptions";

describe("mainOptions", () => {
  it("cinco vistas en orden fijo con rótulos cortos", () => {
    expect(mainOptions().map((o) => o.key)).toEqual(["scene", "axial", "coronal", "sagital", "mip"]);
    expect(mainOptions().map((o) => o.label)).toEqual(["3D", "AX", "COR", "SAG", "VOL"]);
    expect(MAIN_LABELS.mip).toBe("VOL");
  });
  it("cada opción explica qué hace", () => {
    for (const o of mainOptions()) expect(o.title).toMatch(/principal/i);
  });
});

describe("presetOptions", () => {
  it("abrevia los presets cuando la banda de cabecera mide menos de 800 px", () => {
    expect(presetOptions(530).map((o) => o.label)).toEqual(["DER", "ABA", "SOLA"]);
    expect(presetOptions(799).map((o) => o.label)).toEqual(["DER", "ABA", "SOLA"]);
  });
  it("nombre entero desde 800 px o sin medida", () => {
    expect(presetOptions(800).map((o) => o.label)).toEqual(["DERECHA", "ABAJO", "SOLA"]);
    expect(presetOptions(Number.POSITIVE_INFINITY).map((o) => o.label)).toEqual(["DERECHA", "ABAJO", "SOLA"]);
  });
  it("las claves y los títulos no cambian al abreviar", () => {
    expect(presetOptions(500).map((o) => o.key)).toEqual(["derecha", "abajo", "sola"]);
    expect(presetOptions(500).map((o) => o.title)).toEqual(presetOptions(1000).map((o) => o.title));
  });
});

describe("headerLabels", () => {
  it("«PRINCIPAL» se reduce a «▸» en una banda de menos de 800 px", () => {
    expect(headerLabels(742).mainCaption).toBe("▸");
    expect(headerLabels(800).mainCaption).toBe("PRINCIPAL");
    expect(headerLabels(Number.POSITIVE_INFINITY).mainCaption).toBe("PRINCIPAL");
  });
});
