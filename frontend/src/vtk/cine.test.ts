import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* vtk.js no pinta en jsdom: se fija el contrato en el código, como en copy.test.ts. */
const src = readFileSync(join(__dirname, "MipView.tsx"), "utf8");

describe("CINE en el volumen", () => {
  it("solo aparece en COMPUESTO, apagado por defecto", () => {
    expect(src).toMatch(/useState\(false\);?\s*\n[^\n]*/);
    expect(src).toMatch(/const \[cine, setCine\] = useState\(false\)/);
    expect(src).toMatch(/volumeMode === "compuesto" && <HudToggleGroup options=\{\[\{ key: "cine"/);
  });
  it("la dispersión se apaga en cuanto no toca", () => {
    expect(src).toMatch(/const cinematico = cine && volumeMode === "compuesto"/);
    expect(src).toMatch(/setVolumetricScatteringBlending\(cinematico \? 0\.6 : 0\)/);
  });
  it("dice que no es una medida", () => {
    expect(src).toMatch(/No es una medida/);
  });
  it("no queda la prueba temporal", () => {
    expect(src).not.toMatch(/__cine/);
  });
});
