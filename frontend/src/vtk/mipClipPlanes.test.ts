import { describe, expect, it } from "vitest";
import { axisClipPlanes } from "./mipClipPlanes";

const box: [number, number, number, number, number, number] = [10, 30, 20, 40, 30, 50];
const base = { axis: 2 as const, posMm: 35, acumulado: true, reverse: false, slabMm: 5, box: null };

describe("axisClipPlanes", () => {
  it("sin caja reproduce los planos de siempre: uno en acumulado, dos en lámina", () => {
    expect(axisClipPlanes(base)).toEqual([{ origin: [0, 0, 35], normal: [0, 0, -1] }]);
    expect(axisClipPlanes({ ...base, reverse: true })).toEqual([{ origin: [0, 0, 35], normal: [0, 0, 1] }]);
    expect(axisClipPlanes({ ...base, acumulado: false })).toEqual([
      { origin: [0, 0, 30], normal: [0, 0, 1] }, { origin: [0, 0, 40], normal: [0, 0, -1] },
    ]);
  });
  it("con caja son exactamente seis planos y el corte sustituye a la cara de su lado", () => {
    const p = axisClipPlanes({ ...base, box });
    expect(p).toHaveLength(6);
    // Eje z: suelo de la caja (30, normal +z) y el corte (35, normal −z) en vez del techo (50).
    expect(p).toContainEqual({ origin: [0, 0, 30], normal: [0, 0, 1] });
    expect(p).toContainEqual({ origin: [0, 0, 35], normal: [0, 0, -1] });
    expect(p.some((q) => q.origin[2] === 50)).toBe(false);
    // Las otras caras siguen.
    expect(p).toContainEqual({ origin: [10, 0, 0], normal: [1, 0, 0] });
    expect(p).toContainEqual({ origin: [0, 40, 0], normal: [0, -1, 0] });
  });
  it("en lámina los dos planos se funden con las dos caras del eje (siguen siendo seis)", () => {
    const p = axisClipPlanes({ ...base, acumulado: false, slabMm: 3, box });
    expect(p).toHaveLength(6);
    expect(p).toContainEqual({ origin: [0, 0, 32], normal: [0, 0, 1] });
    expect(p).toContainEqual({ origin: [0, 0, 38], normal: [0, 0, -1] });
  });
  it("un corte fuera de la caja no la vacía: queda al menos 1 mm", () => {
    const p = axisClipPlanes({ ...base, posMm: 5, box });   // acumulado hasta 5, caja 30–50 en z
    const z = p.filter((q) => q.normal[2] !== 0).map((q) => q.origin[2]).sort((a, b) => a - b);
    expect(z[1] - z[0]).toBeGreaterThanOrEqual(1);
    expect(p).toHaveLength(6);
  });
});
