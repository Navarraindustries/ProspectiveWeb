import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, type ViewerLayout } from "./layout";
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
  it("la fila de deslizadores del Oblicuo (hud-controls) sube la holgura del dock en su celda", () => {
    const src = readFileSync(resolve(__dirname, "ObliqueView.tsx"), "utf8");
    const fila = src.match(/className="hud-controls" style=\{\{([^}]*)\}\}/);
    expect(fila, "fila hud-controls del Oblicuo").not.toBeNull();
    expect(fila![1]).toMatch(/marginBottom:\s*"var\(--hud-bl-extra,\s*0px\)"/);
  });
  it("la celda bajo el dock es la de abajo a la izquierda de cada distribución", () => {
    const L = (over: object) => ({ ...DEFAULT_LAYOUT, main: "axial", side: ["scene", "coronal", "sagital", "mip"], ...over }) as ViewerLayout;
    expect(dockCornerSlot(gridFor(L({ hidden: ["scene", "coronal", "sagital", "mip"] }), false).areas)).toBe("main");
    expect(dockCornerSlot(gridFor(L({}), false).areas)).toBe("main");
    expect(dockCornerSlot(gridFor(L({ preset: "abajo" }), false).areas)).toBe("s0");
    const iguales = gridFor(L({ equal: true, hidden: ["mip"] }), false);
    expect(dockCornerSlot(iguales.areas)).toBe(iguales.slotOf.coronal);
  });
});

describe("controles de las celdas en táctil", () => {
  it("conmutadores, cine y preajustes miden 44 px y van a 13 px", () => {
    const regla = /([^{}]+)\{([^}]*)\}/g;
    const tactiles = [...css.matchAll(regla)].filter(([, sel]) => sel.includes('[data-hud][data-tactil="true"]'));
    const de = (s: string) => tactiles.find(([, sel]) => sel.split(",").some((x) => x.trim().endsWith(s)))?.[2] ?? "";
    for (const s of [".hud-toggle button", ".hud-cine button", "select.hud-wl-presets"]) {
      expect(de(s), s).toMatch(/min-height:\s*44px/);
      expect(de(s), s).toMatch(/min-width:\s*44px/);
      expect(de(s), s).toMatch(/font-size:\s*13px/);
    }
  });
});
