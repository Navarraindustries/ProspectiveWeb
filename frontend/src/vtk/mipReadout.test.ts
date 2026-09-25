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
});
