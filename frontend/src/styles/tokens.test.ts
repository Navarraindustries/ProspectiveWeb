/* Dirección D (cristal): el oscuro vive en :root y el claro bajo [data-theme="light"].
   Un token que exista solo en un tema deja una superficie transparente en el otro. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ratio } from "./contraste";

// El selector oscuro se declara una sola vez junto a :root (ver colors.css).
const css = readFileSync(join(__dirname, "tokens/colors.css"), "utf8").replace(/\r\n/g, "\n");
const DARK = ":root,\n[data-theme=\"dark\"]";
const block = (sel: string) => {
  const i = css.indexOf(sel + " {");
  return css.slice(i, css.indexOf("}", i));
};
const names = (b: string) => new Set([...b.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

describe("tokens de la dirección D", () => {
  it("el claro define exactamente los mismos nombres que el oscuro", () => {
    const dark = names(block(DARK)), light = names(block('[data-theme="light"]'));
    expect([...dark].filter((n) => !light.has(n))).toEqual([]);
    expect([...light].filter((n) => !dark.has(n))).toEqual([]);
  });
  it("el oscuro es el de la dirección D", () => {
    const r = block(DARK);
    expect(r).toMatch(/--canvas:\s*#050608/i);
    expect(r).toMatch(/--background:\s*#0B0C0F/i);
    expect(r).toMatch(/--card:\s*#12141A/i);
    expect(r).toMatch(/--popover:\s*#12141A/i);
    expect(r).toMatch(/--foreground:\s*#FFFFFF/i);
    expect(r).toMatch(/--muted-foreground:\s*#B8C0CC/i);
    expect(r).toMatch(/--primary:\s*#5AA9FF/i);
    expect(r).toMatch(/--primary-foreground:\s*#06121F/i);
    expect(r).toMatch(/--primary-hover:\s*#7DBBFF/i);
    expect(r).toMatch(/--success:\s*#3DDC97/i);
    expect(r).toMatch(/--destructive:\s*#FF5A6A/i);
    expect(r).toMatch(/--destructive-text:\s*#FF8A96/i);
    expect(r).toMatch(/--warning:\s*#FFC247/i);
    expect(r).toMatch(/--border:\s*rgba\(255, ?255, ?255, ?0?\.14\)/);
    expect(r).toMatch(/--input:\s*rgba\(255, ?255, ?255, ?0?\.24\)/);
    expect(r).toMatch(/--ring:\s*var\(--primary\)/);
    expect(r).toMatch(/--chart-1:\s*var\(--primary\)/);
  });
  it("el oscuro declara color-scheme: dark y el claro color-scheme: light", () => {
    // Sin esto los controles nativos y las barras de desplazamiento salen con el estilo claro del navegador.
    expect(block(DARK)).toMatch(/color-scheme:\s*dark;/);
    expect(block('[data-theme="light"]')).toMatch(/color-scheme:\s*light;/);
  });
  it("la sombra oscura también se declara bajo data-theme=dark (la landing la fija)", () => {
    const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8").replace(/\r\n/g, "\n");
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-lg:/);
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-lg:\s*0 40px 90px rgba\(0, ?0, ?0, ?0?\.6\)/);
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-primary:\s*inset 0 1px 0 rgba\(255, ?255, ?255, ?0?\.5\), 0 8px 24px rgba\(90, ?169, ?255, ?0?\.28\)/);
    expect(spacing).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--shadow-sheet:\s*-30px 0 80px rgba\(0, ?0, ?0, ?0?\.6\)/);
  });
  it("las fuentes son Inter y JetBrains Mono, autoalojadas", () => {
    const fonts = readFileSync(join(__dirname, "tokens/fonts.css"), "utf8");
    expect(fonts).toMatch(/font-family:\s*"Inter"/);
    expect(fonts).toMatch(/font-family:\s*"JetBrains Mono"/);
    expect(fonts).toMatch(/InterVariable-latin\.woff2/);
    expect(fonts).toMatch(/unicode-range:/);
    expect(fonts).not.toMatch(/googleapis|Geist/);
    const typo = readFileSync(join(__dirname, "tokens/typography.css"), "utf8");
    expect(typo).toMatch(/--font-sans:\s*"Inter"/);
    expect(typo).toMatch(/--font-mono:\s*"JetBrains Mono"/);
    expect(typo).toMatch(/--text-eyebrow:\s*11px/);
    expect(typo).toMatch(/--tracking-eyebrow:\s*0\.14em/);
    expect(typo).toMatch(/--text-display:\s*40px/);
  });
  it("los tokens nuevos existen en los dos temas con los valores de la dirección D", () => {
    const dark = block(DARK), light = block('[data-theme="light"]');
    expect(dark).toMatch(/--surface-2:\s*#0A0B0E/i);
    expect(light).toMatch(/--surface-2:\s*#FFFFFF/i);
    expect(dark).toMatch(/--data:\s*#60ADFF/i);
    expect(light).toMatch(/--data:\s*#1F5FC0/i);
    expect(light).toMatch(/--canvas:\s*#F3F5F8/i);
    expect(light).toMatch(/--primary:\s*#0A66FF/i);
    expect(light).toMatch(/--muted-foreground:\s*#4A5361/i);
    expect(light).toMatch(/--accent:\s*#EEF4FF/i);
    expect(light).toMatch(/--destructive-text:\s*#B91C1C/i);
    expect(dark).toMatch(/--field-bg:\s*rgba\(5, ?6, ?8, ?0?\.5\)/);
    expect(light).toMatch(/--field-bg:\s*#FFFFFF/i);
    expect(dark).toMatch(/--veil:\s*rgba\(5, ?6, ?8, ?0?\.55\)/);
    expect(dark).toMatch(/--veil-dense:\s*rgba\(5, ?6, ?8, ?0?\.72\)/);
    expect(light).toMatch(/--veil:\s*rgba\(243, ?245, ?248, ?0\)/);
    expect(light).toMatch(/--veil-dense:\s*rgba\(243, ?245, ?248, ?0\)/);
    expect(dark).toMatch(/--glass:\s*linear-gradient\(rgba\(5, ?6, ?8, ?0?\.55\), rgba\(5, ?6, ?8, ?0?\.55\)\), rgba\(255, ?255, ?255, ?0?\.08\)/);
    expect(light).toMatch(/--glass:\s*rgba\(255, ?255, ?255, ?0?\.72\)/);
    expect(dark).toMatch(/--glass-dense:\s*linear-gradient\(rgba\(8, ?9, ?12, ?0?\.72\)/);
    expect(light).toMatch(/--glass-dense:\s*rgba\(255, ?255, ?255, ?0?\.86\)/);
    expect(dark).toMatch(/--glass-border:\s*rgba\(255, ?255, ?255, ?0?\.2\)/);
    expect(light).toMatch(/--glass-highlight:\s*inset 0 1px 0 rgba\(255, ?255, ?255, ?0?\.9\)/);
    expect(dark).toMatch(/--glass-hover:\s*rgba\(255, ?255, ?255, ?0?\.14\)/);
    expect(light).toMatch(/--glass-hover:\s*rgba\(0, ?0, ?0, ?0?\.04\)/);
  });
  it("el texto secundario aguanta 4,5:1 sobre cristal encima de lo más claro del corte", () => {
    // peor caso: blanco puro bajo el velo .55 y bajo el cristal .55 + blanco .08
    const mix = (top: number[], a: number, under: number[]) => under.map((u, i) => u * (1 - a) + top[i] * a);
    let bg = [255, 255, 255];
    bg = mix([5, 6, 8], 0.55, bg);          // --veil
    bg = mix([255, 255, 255], 0.08, bg);    // tinte del cristal
    bg = mix([5, 6, 8], 0.55, bg);          // velo del propio cristal
    const hexBg = "#" + bg.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
    expect(ratio("#B8C0CC", hexBg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#FFFFFF", hexBg)).toBeGreaterThanOrEqual(7);
  });
  it("el cristal tiene fondo de reserva opaco y desenfoque en los dos temas", () => {
    for (const b of [block(DARK), block('[data-theme="light"]')]) {
      expect(b).toMatch(/--glass-solid:\s*#[0-9A-F]{6}/i);
      expect(b).toMatch(/--glass-blur:\s*30px/);
      expect(b).toMatch(/--glass-blur-viewer:\s*12px/);
    }
  });
  it("los velos de hojas y diálogos existen en los dos temas y en el claro no son transparentes", () => {
    const dark = block(DARK), light = block('[data-theme="light"]');
    for (const n of ["scrim", "scrim-dense"]) {
      expect(dark).toMatch(new RegExp("--" + n + ":"));
      const m = light.match(new RegExp("--" + n + ":\\s*rgba\\([^)]*?,\\s*([0-9.]+)\\)"));
      expect(m, n).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThan(0);
    }
  });
  it("radios, sombras y alturas son los de la dirección D", () => {
    const spacing = readFileSync(join(__dirname, "tokens/spacing.css"), "utf8").replace(/\r\n/g, "\n");
    expect(spacing).toMatch(/--radius-sm:\s*8px/);
    expect(spacing).toMatch(/--radius-md:\s*14px/);
    expect(spacing).toMatch(/--radius-lg:\s*16px/);
    expect(spacing).toMatch(/--radius-xl:\s*24px/);
    expect(spacing).toMatch(/--radius-card-lg:\s*20px/);
    expect(spacing).toMatch(/--radius-full:\s*9999px/);
    expect(spacing).toMatch(/--shadow-md:\s*0 14px 40px rgba\(0, ?0, ?0, ?0?\.5\)/);
    expect(spacing).toMatch(/--shadow-lg:\s*0 40px 90px rgba\(0, ?0, ?0, ?0?\.6\)/);
    expect(spacing).toMatch(/--shadow-primary:\s*inset 0 1px 0 rgba\(255, ?255, ?255, ?0?\.5\), 0 8px 24px rgba\(90, ?169, ?255, ?0?\.28\)/);
    expect(spacing).toMatch(/--shadow-sheet:\s*-30px 0 80px rgba\(0, ?0, ?0, ?0?\.6\)/);
    expect(spacing).toMatch(/\[data-theme="light"\]\s*\{[^}]*--shadow-md:\s*0 10px 30px rgba\(11, ?12, ?15, ?0?\.10?\)/);
    expect(spacing).toMatch(/\[data-theme="light"\]\s*\{[^}]*--shadow-lg:\s*0 30px 60px rgba\(11, ?12, ?15, ?0?\.14\)/);
    expect(spacing).toMatch(/\[data-theme="light"\]\s*\{[^}]*--shadow-primary:\s*0 8px 22px rgba\(10, ?102, ?255, ?0?\.26\)/);
    expect(spacing).toMatch(/\[data-theme="light"\]\s*\{[^}]*--shadow-sheet:\s*-30px 0 80px rgba\(11, ?12, ?15, ?0?\.18\)/);
    expect(spacing).toMatch(/--control-sm:\s*32px/);
    expect(spacing).toMatch(/--control-md:\s*44px/);
    expect(spacing).toMatch(/--control-lg:\s*54px/);
    expect(spacing).toMatch(/--field-h:\s*48px/);
    expect(spacing).toMatch(/--control-icon:\s*40px/);
  });
  it("la etiqueta de campo es de 13 px y peso 500", () => {
    const typo = readFileSync(join(__dirname, "tokens/typography.css"), "utf8");
    expect(typo).toMatch(/--text-label:\s*13px/);
    expect(typo).toMatch(/--weight-label:\s*500/);
  });
  it("el claro cumple 4,5:1 en texto secundario y estados sobre sus fondos", () => {
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
      ["--foreground", "--glass-solid"],
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
    const dirs = [join(__dirname, "../pages"), join(__dirname, "../components/shell"), join(__dirname, "../components/patients"), join(__dirname, "../components/ficha")];
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
    expect(base).toMatch(/select option\s*\{[^}]*background:\s*var\(--glass-solid\)/);
    expect(base).toMatch(/::selection\s*\{[^}]*background:\s*var\(--accent\)/);
    expect(base).toMatch(/::selection\s*\{[^}]*color:\s*var\(--foreground\)/);
    expect(base).toMatch(/input, textarea\s*\{[^}]*caret-color:\s*var\(--primary\)/);
    expect(base).toMatch(/\*\s*\{[^}]*scrollbar-color:\s*color-mix\(in srgb, var\(--muted-foreground\) 45%, transparent\) transparent/);
    expect(base).toMatch(/@supports not \(scrollbar-color: auto\)\s*\{[\s\S]*::-webkit-scrollbar-thumb/);
    expect(base).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
  });
  it("el cristal tiene reserva opaca sin desenfoque o con transparencia reducida", () => {
    const base = readFileSync(join(__dirname, "base.css"), "utf8");
    expect(base).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(base).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(base).toMatch(/\[data-glass\]\s*\{[^}]*background:\s*var\(--glass-solid\) !important/);
  });
  it("la transparencia reducida también apaga el desenfoque de los tokens", () => {
    const base = readFileSync(join(__dirname, "base.css"), "utf8").replace(/\r\n/g, "\n");
    const i = base.indexOf("@media (prefers-reduced-transparency: reduce)");
    const rule = base.slice(i, base.indexOf("\n}\n", i));
    expect(rule).toMatch(/html\[data-theme\]\s*\{[^}]*--glass-blur:\s*0px;[^}]*--glass-blur-viewer:\s*0px;/);
  });
  it("html[data-blur=\"bajo\"] quita el desenfoque del visor y baja el resto a 12px", () => {
    const base = readFileSync(join(__dirname, "base.css"), "utf8");
    const m = base.match(/html\[data-blur="bajo"\]\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/--glass-blur-viewer:\s*0px/);
    expect(m![1]).toMatch(/--glass-blur:\s*12px/);
  });

  it("todo var(--x) que usa el código está definido en una hoja, en un style en línea o en la lista de las fijadas en ejecución", () => {
    // Variables que el código fija al montar sin que el escaneo las vea (cada una con su motivo).
    const EN_EJECUCION: Record<string, string> = {};
    const raiz = join(__dirname, "..");
    const ficheros: string[] = [];
    const recorre = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) recorre(p);
        else if (/\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f)) ficheros.push(p);
      }
    };
    recorre(raiz);
    const texto = ficheros.map((f) => readFileSync(f, "utf8")).join("\n");
    const definidas = new Set<string>(Object.keys(EN_EJECUCION));
    for (const m of texto.matchAll(/(?:^|[\s;{"'`])(--[a-z0-9-]+)\s*(?::|["'`]\s*:)/gi)) definidas.add(m[1]);
    for (const m of texto.matchAll(/setProperty\(\s*["'`](--[a-z0-9-]+)/g)) definidas.add(m[1]);
    const usadas = new Set([...texto.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]));
    expect([...usadas].filter((n) => !definidas.has(n)).sort()).toEqual([]);
  });
});
