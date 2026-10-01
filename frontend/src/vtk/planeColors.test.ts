import { describe, expect, it } from "vitest";
import { PLANE_HEX, RESERVED_HEX, planeRgb01, referencePlanes } from "./planeColors";

describe("planeColors", () => {
  it("tres planos, tres colores distintos y ninguno reservado", () => {
    const hexes = Object.values(PLANE_HEX);
    expect(new Set(hexes).size).toBe(3);
    for (const h of hexes) expect(RESERVED_HEX.map((r) => r.toLowerCase())).not.toContain(h.toLowerCase());
  });
  it("convierte a 0–1 para vtk", () => {
    const [r, g, b] = planeRgb01("axial");
    expect(r).toBeCloseTo(0x4c / 255, 5); expect(g).toBeCloseTo(0xc9 / 255, 5); expect(b).toBeCloseTo(0xf0 / 255, 5);
  });
  it("cada corte sabe qué plano es cada línea de referencia", () => {
    expect(referencePlanes("axial")).toEqual({ u: "sagital", v: "coronal" });
    expect(referencePlanes("coronal")).toEqual({ u: "sagital", v: "axial" });
    expect(referencePlanes("sagital")).toEqual({ u: "coronal", v: "axial" });
  });
});
