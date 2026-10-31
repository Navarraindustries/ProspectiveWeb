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
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-primary:\s*0 8px 24px rgba\(59, ?139, ?255, ?0?\.30?\)/);
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-sheet:\s*-30px 0 80px rgba\(0, ?0, ?0, ?0?\.50?\)/);
  });
  it("las fuentes son Geist y Geist Mono, autoalojadas", () => {
    const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
    expect(fonts).toMatch(/font-family:\s*"Geist"/);
    expect(fonts).toMatch(/font-family:\s*"Geist Mono"/);
    expect(fonts).not.toMatch(/googleapis|Inter|JetBrains|Space Grotesk|Plus Jakarta/);
  });
  it("los tokens nuevos existen en los dos temas con los valores de la dirección A", () => {
    const dark = block(DARK), light = block('[data-theme="light"]');
    expect(dark).toMatch(/--surface-2:\s*#0E1014/i);
    expect(light).toMatch(/--surface-2:\s*#FFFFFF/i);
    expect(dark).toMatch(/--data:\s*#8CBBFF/i);
    expect(light).toMatch(/--data:\s*#1F5FC0/i);
    expect(light).toMatch(/--canvas:\s*#F6F7F9/i);
    expect(light).toMatch(/--primary:\s*#0A66FF/i);
    expect(light).toMatch(/--muted-foreground:\s*#5B6470/i);
    expect(light).toMatch(/--accent:\s*#EEF4FF/i);
  });
  it("radios, sombras y alturas son los de la dirección A", () => {
    const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8");
    expect(spacing).toMatch(/--radius-md:\s*11px/);
    expect(spacing).toMatch(/--radius-lg:\s*12px/);
    expect(spacing).toMatch(/--radius-xl:\s*12px/);
    expect(spacing).toMatch(/--shadow-primary:\s*0 8px 24px rgba\(59, ?139, ?255, ?0?\.30?\)/);
    expect(spacing).toMatch(/--shadow-sheet:\s*-30px 0 80px rgba\(0, ?0, ?0, ?0?\.50?\)/);
    expect(spacing).toMatch(/--control-sm:\s*34px/);
    expect(spacing).toMatch(/--control-md:\s*38px/);
    expect(spacing).toMatch(/--control-lg:\s*44px/);
  });
  it("la etiqueta de campo es de 13 px y peso 500", () => {
    const typo = readFileSync(join(__dirname, "tokens/typography.css"), "utf8");
    expect(typo).toMatch(/--text-label:\s*13px/);
    expect(typo).toMatch(/--weight-label:\s*500/);
  });
  it("el claro cumple 4,5:1 en texto secundario y estados sobre sus fondos", () => {
    // contraste WCAG calculado sobre los hex del bloque claro
    const l = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: string, b: string) => { const [x, y] = [l(a), l(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // Los hex salen del propio bloque claro de colors.css, no de literales copiados aquí.
    const css = readFileSync(join(__dirname, "tokens/colors.css"), "utf8").replace(/\r\n/g, "\n");
    // Con la llave y al inicio de línea: el comentario de cabecera también nombra el selector.
    const start = css.indexOf('\n[data-theme="light"] {');
    expect(start).toBeGreaterThan(-1);
    const light = css.slice(start, css.indexOf("\n}", start));
    const hex = (name: string) => {
      const m = light.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\b`));
      expect(m, `${name} no es un #RRGGBB en el bloque claro`).not.toBeNull();
      return m![1];
    };
    const pairs: [string, string][] = [
      ["--muted-foreground", "--canvas"],
      ["--success", "--success-bg"],
      ["--destructive", "--destructive-bg"],
      ["--warning", "--warning-bg"],
      ["--accent-foreground", "--accent"],
    ];
    for (const [fg, bg] of pairs) {
      expect(ratio(hex(fg), hex(bg)), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("las duraciones son 120/240/480/900 y los nombres viejos son alias", () => {
    const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8");
    expect(spacing).toMatch(/--dur-1:\s*120ms/); expect(spacing).toMatch(/--dur-2:\s*240ms/);
    expect(spacing).toMatch(/--dur-3:\s*480ms/); expect(spacing).toMatch(/--dur-4:\s*900ms/);
    expect(spacing).toMatch(/--dur-base:\s*var\(--dur-2\)/);
    expect(spacing).toMatch(/--ease-out:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });
  it("con prefers-reduced-motion solo queda la opacidad", () => {
    const base = readFileSync(join(__dirname, "base.css"), "utf8").replace(/\r\n/g, "\n");
    const i = base.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(i).toBeGreaterThan(-1);
    const rule = base.slice(i, base.indexOf("\n}\n", i));
    expect(rule).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(rule).toMatch(/transition-property:\s*opacity, color, background-color !important/);
    expect(rule).toMatch(/scroll-behavior:\s*auto !important/);
  });
  it("ninguna pantalla de gestión ni el shell usa un color literal", () => {
    /* Workspace.tsx no es una pantalla de gestión: es el visor, que pertenece a F3
       y conserva sus colores por ahora. */
    const EXCLUIDOS = ["Workspace.tsx"];
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    const dirs = [join(__dirname, "../pages"), join(__dirname, "../components/shell")];
    const archivos = dirs.flatMap((d) =>
      readdirSync(d).filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && !EXCLUIDOS.includes(f)).map((f) => join(d, f)));
    expect(archivos.length).toBeGreaterThan(15);
    for (const f of archivos) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, "$1");
      expect(src.match(literal), `${f} lleva un color escrito a mano`).toBeNull();
    }
  });
  it("las superficies del navegador salen de la paleta", () => {
    const base = readFileSync(join(__dirname, "base.css"), "utf8");
    expect(base).toMatch(/::selection\s*\{[^}]*background:\s*var\(--accent\)/);
    expect(base).toMatch(/::selection\s*\{[^}]*color:\s*var\(--foreground\)/);
    expect(base).toMatch(/input, textarea\s*\{[^}]*caret-color:\s*var\(--primary\)/);
    expect(base).toMatch(/\*\s*\{[^}]*scrollbar-color:\s*color-mix\(in srgb, var\(--muted-foreground\) 45%, transparent\) transparent/);
    expect(base).toMatch(/@supports not \(scrollbar-color: auto\)\s*\{[\s\S]*::-webkit-scrollbar-thumb/);
    expect(base).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
  });
});
