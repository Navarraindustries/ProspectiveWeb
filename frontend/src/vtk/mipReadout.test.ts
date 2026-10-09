import { describe, expect, it } from "vitest";
import { mipReadoutLines } from "./mipReadout";

const base = { reverse: false, index: 192, count: 384, slabMm: 10, threshold: 2141.4 };

describe("mipReadoutLines", () => {
  it("keeps the full readout in the main pane", () => {
    expect(mipReadoutLines({ ...base, mode: "acumulado", compact: false })).toEqual(["ACUMULADO HASTA 193/384", "UMBRAL 2141"]);
    expect(mipReadoutLines({ ...base, mode: "acumulado", reverse: true, compact: false })[0]).toBe("ACUMULADO DESDE 193/384");
    expect(mipReadoutLines({ ...base, mode: "lamina", compact: false })[0]).toBe("LÁMINA ±10 mm");
  });
  it("shortens to one line in a strip cell", () => {
    expect(mipReadoutLines({ ...base, mode: "acumulado", compact: true })).toEqual(["ACUM 193/384"]);
    expect(mipReadoutLines({ ...base, mode: "lamina", compact: true })).toEqual(["LÁMINA ±10"]);
  });
  it("en compuesto la lectura nombra el preajuste y el corte", () => {
    expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, render: "compuesto", preset: "Vasos CTA" }))
      .toEqual(["COMPUESTO · VASOS CTA", "ACUMULADO HASTA 5/10"]);
    expect(mipReadoutLines({ mode: "lamina", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: true, render: "compuesto", preset: "Hueso" }))
      .toEqual(["COMP ±8"]);
  });
  it("en recorte libre la línea del corte dice el desplazamiento", () => {
    expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, clip: "libre", offsetMm: 3.25 })).toEqual(["LIBRE +3,3 mm", "UMBRAL 1470"]);
    expect(mipReadoutLines({ mode: "lamina", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: true, clip: "libre", offsetMm: 0 })).toEqual(["LIB ±8"]);
  });
  it("el umbral lleva la unidad solo en TC", () => {
    const o = { mode: "acumulado" as const, reverse: false, index: 4, count: 10, slabMm: 8, threshold: 220, compact: false };
    expect(mipReadoutLines({ ...o, unit: " HU" })[1]).toBe("UMBRAL 220 HU");
    expect(mipReadoutLines({ ...o, unit: "" })[1]).toBe("UMBRAL 220");
  });
  it("en compuesto la lectura añade nivel y ventana", () => {
    expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, render: "compuesto", preset: "Hueso", window: { wc: 2200.4, ww: 1799.6 } }))
      .toEqual(["COMPUESTO · HUESO", "ACUMULADO HASTA 5/10", "NIV 2200 · VENT 1800"]);
    // En TC la ventana va en HU y se dice.
    expect(mipReadoutLines({ mode: "acumulado", reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, render: "compuesto", preset: "Hueso", window: { wc: 400, ww: 1000 }, unit: " HU" })[2])
      .toBe("NIV 400 HU · VENT 1000 HU");
  });
  it("en MIP ampliado la ventana se lee junto al umbral mientras es la derivada, y sola cuando se movió", () => {
    const o = { mode: "acumulado" as const, reverse: false, index: 4, count: 10, slabMm: 8, threshold: 1470, compact: false, window: { wc: 3093.5, ww: 3247 } };
    expect(mipReadoutLines({ ...o, windowDerived: true })[1]).toBe("UMBRAL 1470 · NIV 3094 · VENT 3247");
    expect(mipReadoutLines({ ...o, windowDerived: false })[1]).toBe("NIV 3094 · VENT 3247");
    // Sin ventana (llamadas antiguas) la lectura es la de siempre.
    expect(mipReadoutLines({ ...o, window: undefined })[1]).toBe("UMBRAL 1470");
    // En compacto no cabe: no cambia.
    expect(mipReadoutLines({ ...o, compact: true, windowDerived: true })).toEqual(["ACUM 5/10"]);
  });
});
