/* Identidad A (F2): el oscuro vive en :root y el claro bajo [data-theme="light"].
   Un token que exista solo en un tema deja una superficie transparente en el otro. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El selector oscuro se declara una sola vez junto a :root (ver colors.css).
const css = readFileSync(join(__dirname, "tokens/colors.css"), "utf8").replace(/\r\n/g, "\n");
const DARK = ":root,\n[data-theme=\"dark\"]";
const block = (sel: string) => {
  const i = css.indexOf(sel + " {");
  return css.slice(i, css.indexOf("}", i));
};
const names = (b: string) => new Set([...b.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

describe("tokens de la identidad A", () => {
  it("el claro define exactamente los mismos nombres que el oscuro", () => {
    const dark = names(block(DARK)), light = names(block('[data-theme="light"]'));
    expect([...dark].filter((n) => !light.has(n))).toEqual([]);
    expect([...light].filter((n) => !dark.has(n))).toEqual([]);
  });
  it("el oscuro es el de la identidad A", () => {
    const r = block(DARK);
    expect(r).toMatch(/--canvas:\s*#0B0C0F/i);
    expect(r).toMatch(/--background:\s*#141519/i);
    expect(r).toMatch(/--card:\s*#1C1D22/i);
    expect(r).toMatch(/--foreground:\s*#F2F3F5/i);
    expect(r).toMatch(/--primary:\s*#3B8BFF/i);
    expect(r).toMatch(/--success:\s*#2ECC8A/i);
    expect(r).toMatch(/--destructive:\s*#FF5A5F/i);
    expect(r).toMatch(/--warning:\s*#F5B942/i);
  });
  it("el oscuro declara color-scheme: dark y el claro color-scheme: light", () => {
    // Sin esto los controles nativos y las barras de desplazamiento salen con el estilo claro del navegador.
    expect(block(DARK)).toMatch(/color-scheme:\s*dark;/);
    expect(block('[data-theme="light"]')).toMatch(/color-scheme:\s*light;/);
  });
  it("la sombra oscura también se declara bajo data-theme=dark (la landing la fija)", () => {
    const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8").replace(/\r\n/g, "\n");
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-lg:/);
  });
  it("las fuentes son Geist y Geist Mono, autoalojadas", () => {
    const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
    expect(fonts).toMatch(/font-family:\s*"Geist"/);
    expect(fonts).toMatch(/font-family:\s*"Geist Mono"/);
    expect(fonts).not.toMatch(/googleapis|Inter|JetBrains|Space Grotesk|Plus Jakarta/);
  });
  it("ninguna pantalla de gestión ni el shell usa un color literal", () => {
    /* Workspace.tsx no es una pantalla de gestión: es el visor, que pertenece a F3
       y conserva sus colores por ahora. */
    const EXCLUIDOS = ["Workspace.tsx"];
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    const dirs = [join(__dirname, "../pages"), join(__dirname, "../components/shell"), join(__dirname, "../components/patients")];
    const archivos = dirs.flatMap((d) =>
      readdirSync(d).filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && !EXCLUIDOS.includes(f)).map((f) => join(d, f)));
    expect(archivos.length).toBeGreaterThan(15);
    for (const f of archivos) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, "$1");
      expect(src.match(literal), `${f} lleva un color escrito a mano`).toBeNull();
    }
  });
});
