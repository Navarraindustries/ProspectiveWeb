import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dockCornerSlot, gridFor } from "./layoutGrid";

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
  it("ningún .tsx del visor ni del HUD pinta texto o trazo DOM con el verde de los actores", () => {
    const dirs = [__dirname, resolve(__dirname, "hud")];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx") && !n.includes(".test."))) {
        const lines = readFileSync(resolve(dir, f), "utf8").split(/\r?\n/).filter((l) => !l.includes('color("--hud"'));
        for (const l of lines) {
          expect(l, f).not.toMatch(/var\(--hud\)/);
          expect(l, f).not.toMatch(/var\(--hud-dim\)/);
        }
      }
    }
  });
  it("las bandas y selectores del visor usan --viewer-bg y no el negro literal", () => {
    for (const f of ["ViewerHeader.tsx", "SliceView.tsx"]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src, f).not.toMatch(/background:\s*"#000"/);
    }
  });
  it("las lecturas de abajo a la izquierda suman la holgura del dock solo en la celda que lo tiene debajo", () => {
    expect(css).toMatch(/\.viewer-cell\[data-dock-corner\]\s*\{[^}]*--hud-bl-extra:\s*var\(--dock-holgura,\s*0px\)/);
    expect(css).toMatch(/\.hud-readout\.bl\s*\{[^}]*calc\(22px \+ var\(--hud-bl-extra,\s*0px\)\)/);
    expect(css).toMatch(/\.hud-cine\s*\{[^}]*calc\(40px \+ var\(--hud-bl-extra,\s*0px\)\)/);
  });
  it("la celda bajo el dock es la de abajo a la izquierda de cada distribución", () => {
    const L = (preset: string) => ({ preset, main: "axial", side: ["coronal", "sagital", "scene"], mainFraction: 0.7 }) as never;
    expect(dockCornerSlot(gridFor(L("sola"), false).areas)).toBe("main");
    expect(dockCornerSlot(gridFor(L("derecha"), false).areas)).toBe("main");
    expect(dockCornerSlot(gridFor(L("abajo"), false).areas)).toBe("s0");
    expect(dockCornerSlot(gridFor(L("cuatro"), false).areas)).toBe(gridFor(L("cuatro"), false).slotOf.sagital);
  });
});
