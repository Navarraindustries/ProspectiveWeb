import { describe, expect, it } from "vitest";
import { derivedMipWindow, mipRampPoints } from "./mipRamp";

describe("la rampa del MIP", () => {
  it("con la ventana derivada del umbral reproduce la rampa histórica punto a punto", () => {
    // Antes: ctf (rlo→negro, lo→gris 0,25, rhi→blanco); otf (rlo 0, lo 0, lo+15 % 0,9, rhi 1).
    const r = mipRampPoints(derivedMipWindow(2000, 5000), 1000);
    expect(r.color).toEqual([[1000, 0, 0, 0], [2000, 0.25, 0.25, 0.25], [5000, 1, 1, 1]]);
    expect(r.opacity).toEqual([[1000, 0], [2000, 0], [2450, 0.9], [5000, 1]]);
  });
  it("derivedMipWindow centra la ventana entre el umbral y el techo", () => {
    expect(derivedMipWindow(2000, 5000)).toEqual({ wc: 3500, ww: 3000 });
    expect(derivedMipWindow(5000, 5000).ww).toBe(1);   // nunca una rampa sin pendiente
  });
  it("una ventana movida por el usuario desplaza negro y blanco con ella", () => {
    const r = mipRampPoints({ wc: 3000, ww: 1000 }, 1000);
    expect(r.color.map((p) => p[0])).toEqual([1000, 2500, 3500]);
    expect(r.opacity.map((p) => p[0])).toEqual([1000, 2500, 2650, 3500]);
  });
  it("con el suelo de la ventana por debajo del rango los puntos siguen crecientes y finitos", () => {
    const r = mipRampPoints({ wc: 500, ww: 2000 }, 1000);   // lo = −500 < rlo
    const xs = [...r.color.map((p) => p[0]), ...r.opacity.map((p) => p[0])];
    expect(xs.every(Number.isFinite)).toBe(true);
    for (const pts of [r.color, r.opacity]) for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThanOrEqual(pts[i - 1][0]);
    expect(r.color[0][0]).toBe(-500);   // el negro empieza donde empieza la ventana
  });
});
