/* Identidad A (F2): el oscuro vive en :root y el claro bajo [data-theme="light"].
   Un token que exista solo en un tema deja una superficie transparente en el otro. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens/colors.css"), "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel + " {");
  return css.slice(i, css.indexOf("}", i));
};
const names = (b: string) => new Set([...b.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

describe("tokens de la identidad A", () => {
  it("el claro define exactamente los mismos nombres que el oscuro", () => {
    const dark = names(block(":root")), light = names(block('[data-theme="light"]'));
    expect([...dark].filter((n) => !light.has(n))).toEqual([]);
    expect([...light].filter((n) => !dark.has(n))).toEqual([]);
  });
  it("el oscuro es el de la identidad A", () => {
    const r = block(":root");
    expect(r).toMatch(/--canvas:\s*#0B0C0F/i);
    expect(r).toMatch(/--background:\s*#141519/i);
    expect(r).toMatch(/--card:\s*#1C1D22/i);
    expect(r).toMatch(/--foreground:\s*#F2F3F5/i);
    expect(r).toMatch(/--primary:\s*#3B8BFF/i);
    expect(r).toMatch(/--success:\s*#2ECC8A/i);
    expect(r).toMatch(/--destructive:\s*#FF5A5F/i);
    expect(r).toMatch(/--warning:\s*#F5B942/i);
  });
  it("las fuentes son Geist y Geist Mono, autoalojadas", () => {
    const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
    expect(fonts).toMatch(/font-family:\s*"Geist"/);
    expect(fonts).toMatch(/font-family:\s*"Geist Mono"/);
    expect(fonts).not.toMatch(/googleapis|Inter|JetBrains|Space Grotesk|Plus Jakarta/);
  });
  // se activa en la Tarea 17
  it.skip("ninguna pantalla de gestión usa un color literal", () => {
    const dir = join(__dirname, "../pages");
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src.match(literal), `${f} lleva un color escrito a mano`).toBeNull();
    }
  });
});
