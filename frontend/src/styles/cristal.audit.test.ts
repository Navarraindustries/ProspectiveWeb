/* Auditoría estática del cristal D (fase 7): cristal con reserva opaca, controles de solo
   icono con nombre accesible, HUD sin los tokens verdes viejos y contraste del texto sobre
   el peor fondo detrás del cristal. Recorre src/**\/*.tsx sin tests. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ratio } from "./contraste";

const SRC = join(__dirname, "..");
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(SRC, f).replace(/\\/g, "/");
const tsx = walk(SRC, /\.tsx$/);

/** Fin de la etiqueta de apertura que empieza en `start` (recorre llaves y cadenas). */
function openingTagEnd(src: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
    if (depth > 0 && (c === '"' || c === "'" || c === "`")) { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && c === '"') { const j = src.indexOf('"', i + 1); i = j < 0 ? src.length : j; }
    else if (depth === 0 && c === ">") return i;
  }
  return src.length;
}

/* Falsos positivos de (a): fichero → motivo. */
const GLASS_PERMITIDO: Record<string, string> = {
  "components/BottomSheet.tsx": "el hook devuelve el estilo; data-glass lo pone el consumidor (RightPanelColumn) en el mismo JSX",
};
/* Reglas CSS con backdrop-filter que no llevan [data-glass] en el selector: selector → motivo. */
const CSS_PERMITIDO: Record<string, string> = {
  ".pt-card-pill": "la pastilla lleva data-glass en su JSX (PatientCard.tsx); la reserva opaca sale de base.css",
};
/* Falsos positivos de (b): fichero → motivo. */
const ICONO_PERMITIDO: Record<string, string> = {
  // (vacío: ningún falso positivo conocido)
};
/* Ficheros que pueden usar var(--hud) / var(--hud-dim): ninguno hoy; el texto del HUD usa --hud-text. */
const HUD_PERMITIDO: string[] = [];

describe("auditoría del cristal", () => {
  it("todo glass() con desenfoque y todo backdropFilter va en un elemento con data-glass", () => {
    const fallos: string[] = [];
    const pat = /glass\(\s*["'](normal|dense|viewer)["']\s*\)|backdropFilter/g;
    for (const f of tsx) {
      if (GLASS_PERMITIDO[rel(f)]) continue;
      const src = read(f);
      for (const m of src.matchAll(pat)) {
        if (m[0] === "backdropFilter" && /glass\.ts$/.test(f)) continue;
        // etiqueta JSX más cercana que aún no se ha cerrado en este punto
        let start = -1;
        for (let i = m.index!; i >= 0; i--) {
          if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "") && openingTagEnd(src, i) > m.index!) { start = i; break; }
        }
        const tag = start < 0 ? "" : src.slice(start, openingTagEnd(src, start));
        if (!/\bdata-glass\b/.test(tag)) {
          const line = src.slice(0, m.index).split("\n").length;
          fallos.push(`${rel(f)}:${line} ${m[0]} sin data-glass en su elemento`);
        }
      }
    }
    expect(fallos).toEqual([]);
  });

  it("un <button> cuyo contenido es solo un <Icon> lleva aria-label", () => {
    const fallos: string[] = [];
    const pat = /<(button|Button|motion\.button)\b/g;
    // <Icon …/> (con llaves anidadas en las props) o {cond && <Icon …/>} como único contenido
    const esSoloIcono = (c: string) => {
      const x = c.startsWith("{") && c.endsWith("}") ? c.slice(1, -1).trim() : c;
      const i = x.indexOf("<Icon");
      if (i < 0 || x.slice(0, i).includes("<")) return false;
      const fin = openingTagEnd(x, i);
      return x[fin - 1] === "/" && x.slice(fin + 1).trim() === "";
    };
    let botones = 0;
    for (const f of tsx) {
      if (ICONO_PERMITIDO[rel(f)]) continue;
      const src = read(f);
      for (const m of src.matchAll(pat)) {
        botones++;
        const end = openingTagEnd(src, m.index!);
        if (src[end - 1] === "/") continue; // autocerrado
        const close = src.indexOf(`</${m[1]}>`, end);
        if (close < 0) continue;
        const contenido = src.slice(end + 1, close).trim();
        const soloIcono = esSoloIcono(contenido);
        const tag = src.slice(m.index!, end);
        if (soloIcono && !/\baria-label(ledby)?=/.test(tag)) {
          fallos.push(`${rel(f)}:${src.slice(0, m.index).split("\n").length} <${m[1]}> de solo icono sin aria-label`);
        }
      }
    }
    expect(botones, "el recorrido de botones no encontró casi nada").toBeGreaterThan(150);
    expect(fallos).toEqual([]);
  });

  it("todo backdrop-filter de CSS va en un selector [data-glass] o en la lista de permitidos", () => {
    let reglas = 0;
    const fallos: string[] = [];
    for (const f of walk(SRC, /\.css$/)) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(^|[\s;])(-webkit-)?backdrop-filter:\s*(?!none)/.test(m[2])) continue;
        reglas++;
        const sel = m[1].trim();
        if (sel.includes("[data-glass]") || CSS_PERMITIDO[sel]) continue;
        fallos.push(`${rel(f)}: ${sel} usa backdrop-filter sin [data-glass]`);
      }
    }
    expect(reglas, "el recorrido de CSS no encontró casi nada").toBeGreaterThanOrEqual(1);
    expect(fallos).toEqual([]);
  });

  it("el recorrido ve los ficheros y las llamadas a glass() que debe", () => {
    expect(tsx.length).toBeGreaterThan(100);
    const llamadas = tsx.reduce((n, f) => n + (read(f).match(/glass\(\s*["']/g) ?? []).length, 0);
    expect(llamadas).toBeGreaterThanOrEqual(25);
  });

  it("var(--hud) y var(--hud-dim) no se usan (el HUD usa --hud-text)", () => {
    const fuentes = walk(SRC, /\.(tsx|css)$/).filter((f) => !/styles[\\/]tokens[\\/]/.test(f));
    const fallos = fuentes
      .filter((f) => !HUD_PERMITIDO.includes(rel(f)))
      .filter((f) => /var\(--hud(-dim)?\)/.test(read(f)))
      .map(rel);
    expect(fallos).toEqual([]);
  });
});

/* Contraste WCAG sobre hex #RRGGBB (mismo cálculo que tokens.test.ts). Los hex y los alfas salen de colors.css. */
const css = read(join(__dirname, "tokens/colors.css"));
const bloque = (sel: string) => { const i = css.indexOf("\n" + sel + " {"); const j = i < 0 ? css.indexOf(sel + " {") : i; return css.slice(j, css.indexOf("\n}", j)); };
const oscuro = bloque(':root,\n[data-theme="dark"]');
const claro = bloque('[data-theme="light"]');
const hexDe = (b: string, name: string) => { const m = b.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\b`)); expect(m, `${name} no es #RRGGBB`).not.toBeNull(); return m![1]; };
const rgba = (b: string, name: string) => { const m = b.match(new RegExp(`${name}:\\s*(?:linear-gradient\\(rgba\\([^)]*\\), rgba\\([^)]*\\)\\), )?rgba\\((\\d+), ?(\\d+), ?(\\d+), ?([0-9.]+)\\)`)); expect(m, `${name} no es rgba()`).not.toBeNull(); return { rgb: [+m![1], +m![2], +m![3]], a: +m![4] }; };
const veloDeGlass = (b: string, name: string) => { const m = b.match(new RegExp(`${name}:\\s*linear-gradient\\(rgba\\((\\d+), ?(\\d+), ?(\\d+), ?([0-9.]+)\\)`)); expect(m, name).not.toBeNull(); return { rgb: [+m![1], +m![2], +m![3]], a: +m![4] }; };
const mix = (top: number[], a: number, under: number[]) => under.map((u, i) => u * (1 - a) + top[i] * a);
const aHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

describe("contraste sobre cristal", () => {
  it("en oscuro, el texto aguanta 4,5:1 sobre el cristal encima de lo más claro del corte", () => {
    // peor caso: blanco puro bajo el velo, el tinte y el velo propio del cristal (alfas leídos de colors.css)
    const velo = rgba(oscuro, "--veil");
    const tinte = rgba(oscuro, "--glass(?:-dense)?");
    const veloCristal = veloDeGlass(oscuro, "--glass");
    let bg = [255, 255, 255];
    bg = mix(velo.rgb, velo.a, bg);
    bg = mix([255, 255, 255], tinte.a, bg);
    bg = mix(veloCristal.rgb, veloCristal.a, bg);
    const peor = aHex(bg);
    for (const n of ["--muted-foreground", "--data", "--destructive-text", "--warning", "--success"]) {
      expect(ratio(hexDe(oscuro, n), peor), `${n} sobre ${peor}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("en claro, el texto aguanta 4,5:1 sobre --glass-solid", () => {
    const solido = hexDe(claro, "--glass-solid");
    for (const n of ["--muted-foreground", "--data", "--destructive-text", "--warning", "--success"]) {
      expect(ratio(hexDe(claro, n), solido), `${n} sobre ${solido}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
