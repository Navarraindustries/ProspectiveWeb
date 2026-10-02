import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HUD_HEX, PLANE_HEX, RESERVED_HEX, hexToRgb01, planeRgb01, referencePlanes } from "./planeColors";

/** Valor de una variable CSS declarada en tokens/colors.css. */
function cssVar(css: string, name: string): string | undefined {
  return css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();
}

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
  it("convierte cualquier hex a 0–1 (el verde del HUD incluido)", () => {
    expect(hexToRgb01(HUD_HEX)).toEqual([0x8c / 255, 0xff / 255, 0x9e / 255]);
  });
  // Los rótulos y líneas de los cortes leen las variables CSS; la traza del
  // MIP, los rectángulos y el punto del 3D leen estas constantes. Un cambio en
  // un solo lado rompería «un color por plano en todas partes» sin avisar.
  it("PLANE_HEX y HUD_HEX coinciden con tokens/colors.css", () => {
    const css = readFileSync(resolve(__dirname, "../styles/tokens/colors.css"), "utf8");
    expect(cssVar(css, "--plane-axial")?.toLowerCase()).toBe(PLANE_HEX.axial.toLowerCase());
    expect(cssVar(css, "--plane-coronal")?.toLowerCase()).toBe(PLANE_HEX.coronal.toLowerCase());
    expect(cssVar(css, "--plane-sagital")?.toLowerCase()).toBe(PLANE_HEX.sagital.toLowerCase());
    expect(cssVar(css, "--hud")?.toLowerCase()).toBe(HUD_HEX.toLowerCase());
  });
  it("cada corte sabe qué plano es cada línea de referencia", () => {
    expect(referencePlanes("axial")).toEqual({ u: "sagital", v: "coronal" });
    expect(referencePlanes("coronal")).toEqual({ u: "sagital", v: "axial" });
    expect(referencePlanes("sagital")).toEqual({ u: "coronal", v: "axial" });
  });
});
