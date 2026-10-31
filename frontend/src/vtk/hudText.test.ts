import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "hud/hud.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("texto del HUD", () => {
  it("el texto del HUD ya no usa el verde: ni --hud ni --hud-dim fuera de los planos", () => {
    expect(css).not.toMatch(/var\(--hud\)/);
    expect(css).not.toMatch(/var\(--hud-dim\)/);
    expect(css).toMatch(/\.hud\s*\{[^}]*color:\s*var\(--hud-text\)/);
    expect(css).toMatch(/\.hud-warn\s*\{[^}]*var\(--hud-amber\)/);
  });
  it("los tokens de texto del HUD existen en los dos temas", () => {
    const colors = readFileSync(resolve(__dirname, "../styles/tokens/colors.css"), "utf8");
    expect(colors.match(/--hud-text:/g)?.length).toBeGreaterThanOrEqual(2);
    expect(colors).toMatch(/--hud:\s*#8CFF9E/i); // los actores siguen
  });
});
