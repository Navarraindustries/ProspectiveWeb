import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "hud.css"), "utf8");

describe("hud.css: preajustes W/L", () => {
  it("el desplegable queda alineado con la lectura W/L (48 px, junto a la escalera)", () => {
    const regla = css.split("\n").find((l) => l.startsWith(".hud-wl-presets {")) ?? "";
    expect(regla).toMatch(/right:\s*48px/);
    expect(css).toMatch(/\.hud-readout\.br\.beside-ladder\s*\{\s*right:\s*48px/);
  });
});
