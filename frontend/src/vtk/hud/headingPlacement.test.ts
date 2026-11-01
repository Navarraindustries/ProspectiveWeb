import { describe, expect, it } from "vitest";
import { headingPlacement } from "./headingPlacement";

const TL = ["CANDIDATOS ANEURISMÁTICOS", "Candidato 1 · Ø 11,6 mm"];

describe("headingPlacement", () => {
  it("se aparta del rótulo de la izquierda cuando el 20 % no basta", () => {
    const p = headingPlacement(800, TL, ["3D"])!;
    expect(p.top).toBe(24);
    expect(p.left).toBeCloseTo(14 + 25 * 6.72 + 16);
    expect(p.right).toBeCloseTo(160);
  });
  it("con sitio se queda en el 20 % de cada lado", () => {
    expect(headingPlacement(1500, TL, ["3D"])).toEqual({ top: 24, left: 300, right: 300 });
  });
  it("cuenta la línea más larga, no la primera", () => {
    const p = headingPlacement(1200, ["3D", "VISTA PREVIA · CAPTURA [150HU, 500HU]"], [])!;
    expect(p.left).toBeCloseTo(14 + 37 * 6.72 + 16);
  });
  it("si no quedan 200 px, no se pinta", () => {
    expect(headingPlacement(450, TL, ["3D"])).toBeNull();
  });
});
