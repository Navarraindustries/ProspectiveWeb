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

/* Contenido de un botón que es solo un <Icon …/> (con llaves anidadas en las props):
   suelto, {cond && <Icon/>}, {cond ? <Icon/> : null} o {cond ? null : <Icon/>}. */
function esSoloIcono(c: string): boolean {
  let x = c.startsWith("{") && c.endsWith("}") ? c.slice(1, -1).trim() : c;
  if (x !== c) {
    const ternario = x.match(/^([^<]*?)\?\s*null\s*:\s*(<Icon[\s\S]*)$/);
    if (ternario) x = ternario[1] + ternario[2];
    else x = x.replace(/\s*:\s*null$/, "");
  }
  const i = x.indexOf("<Icon");
  if (i < 0 || x.slice(0, i).includes("<")) return false;
  const fin = openingTagEnd(x, i);
  return x[fin - 1] === "/" && x.slice(fin + 1).trim() === "";
}
/* Botones de solo icono que el recorrido reconoce hoy (todos con aria-label). */
const SUELO_SOLO_ICONO = 11;

/* Falsos positivos de (a): fichero → motivo. */
const GLASS_PERMITIDO: Record<string, string> = {
  "components/BottomSheet.tsx": "el hook devuelve el estilo; data-glass lo pone el consumidor (RightPanelColumn) en el mismo JSX",
};
/* Reglas CSS con backdrop-filter que no llevan [data-glass] en el selector: «fichero selector» → motivo. */
const CSS_PERMITIDO: Record<string, string> = {
  "components/patients/patients.css .pt-card-pill": "la pastilla lleva data-glass en su JSX (PatientCard.tsx); la reserva opaca sale de base.css",
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
    // glass() sin argumento es «normal», que también desenfoca.
    const pat = /\bglass\(\s*(?:["'](normal|dense|viewer)["']\s*)?\)|backdropFilter/g;
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

  it("esSoloIcono reconoce el icono suelto, el condicional y el ternario con null", () => {
    expect(esSoloIcono('<Icon name="x" size={14} />')).toBe(true);
    expect(esSoloIcono('{abierto && <Icon name="x" />}')).toBe(true);
    expect(esSoloIcono('{abierto ? <Icon name="x" /> : null}')).toBe(true);
    expect(esSoloIcono('{abierto ? null : <Icon name="x" />}')).toBe(true);
    expect(esSoloIcono('<Icon name="x" /> Cerrar')).toBe(false);
    expect(esSoloIcono('{abierto ? <Icon name="x" /> : "Cerrar"}')).toBe(false);
    expect(esSoloIcono("Cerrar")).toBe(false);
  });

  it("un <button> cuyo contenido es solo un <Icon> lleva aria-label", () => {
    const fallos: string[] = [];
    const pat = /<(button|Button|motion\.button)\b/g;
    let botones = 0;
    let soloIconos = 0;
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
        if (soloIcono) soloIconos++;
        const tag = src.slice(m.index!, end);
        if (soloIcono && !/\baria-label(ledby)?=/.test(tag)) {
          fallos.push(`${rel(f)}:${src.slice(0, m.index).split("\n").length} <${m[1]}> de solo icono sin aria-label`);
        }
      }
    }
    expect(botones, "el recorrido de botones no encontró casi nada").toBeGreaterThan(150);
    // Suelo de detecciones: los botones de solo icono (con aria-label) que ya existen.
    // Si esSoloIcono dejara de reconocerlos, la regla pasaría en vacío.
    expect(soloIconos, "la regla no reconoce los botones de solo icono que ya existen").toBeGreaterThanOrEqual(SUELO_SOLO_ICONO);
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
        if (sel.includes("[data-glass]") || CSS_PERMITIDO[`${rel(f)} ${sel}`]) continue;
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
const mix = (top: number[], a: number, under: number[]) => under.map((u, i) => u * (1 - a) + top[i] * a);
const aHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const deHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

type Capa = { rgb: number[]; a: number };
/** Capas de un token de fondo, de abajo arriba. Formas que hay en colors.css:
 *  `#RRGGBB`, `rgba(…)` y `linear-gradient(rgba(A), rgba(A)), rgba(B)` (B debajo, A encima). */
function capas(b: string, name: string): Capa[] {
  const m = b.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  expect(m, `${name} no está en el bloque`).not.toBeNull();
  const v = m![1].trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return [{ rgb: deHex(v), a: 1 }];
  const rgbas = [...v.matchAll(/rgba\((\d+), ?(\d+), ?(\d+), ?([0-9.]+)\)/g)].map((x) => ({ rgb: [+x[1], +x[2], +x[3]], a: +x[4] }));
  if (v.startsWith("linear-gradient(")) {
    expect(rgbas.length, `${name}: forma de cristal desconocida`).toBe(3);
    expect(rgbas[1], `${name}: el degradado no es liso`).toEqual(rgbas[0]);
    return [rgbas[2], rgbas[0]];
  }
  expect(rgbas.length, `${name}: forma de cristal desconocida`).toBe(1);
  return rgbas;
}
/** Color resultante de apilar los tokens `encima` (de abajo arriba) sobre `fondo`. */
const apilar = (b: string, encima: string[], fondo: number[]) =>
  aHex(encima.reduce((bg, n) => capas(b, n).reduce((acc, c) => mix(c.rgb, c.a, acc), bg), fondo));

const NEGRO = [0, 0, 0];
const BLANCO = [255, 255, 255];
const TEXTOS = ["--foreground", "--muted-foreground", "--data", "--destructive-text", "--warning", "--success"];

/** Fondo ambiente en hex: --canvas con los dos brillos apilados (lo más claro que ve el cristal). */
const ambiente = (b: string) => apilar(b, ["--ambient-glow-1", "--ambient-glow-2"], deHex(hexDe(b, "--canvas")));

/* Cada superficie de cristal con lo que de verdad tiene detrás. Para el visor se toma
   el píxel sin desenfocar (con data-blur="bajo" el desenfoque del visor es 0) y los dos
   extremos de la imagen: negro (el fondo del visor) y blanco (hueso en el MIP). */
const superficies = (b: string): { donde: string; fondo: string }[] => {
  const visor = deHex(hexDe(b, "--viewer-bg"));
  return [
    { donde: "cristal sobre el Ambiente (los dos brillos apilados)", fondo: apilar(b, ["--glass"], deHex(ambiente(b))) },
    { donde: "cristal denso sobre el Ambiente (los dos brillos apilados)", fondo: apilar(b, ["--glass-dense"], deHex(ambiente(b))) },
    { donde: "hoja o diálogo (--glass-dense) sobre el lienzo bajo --scrim-dense", fondo: apilar(b, ["--scrim-dense", "--glass-dense"], deHex(hexDe(b, "--canvas"))) },
    { donde: "pastillas del quirófano (--glass) sobre --viewer-bg", fondo: apilar(b, ["--glass"], visor) },
    { donde: "inspector (--glass-dense) sobre --viewer-bg", fondo: apilar(b, ["--glass-dense"], visor) },
    { donde: "dock y hoja inferior (--glass-viewer) sobre negro", fondo: apilar(b, ["--glass-viewer"], NEGRO) },
    { donde: "dock y hoja inferior (--glass-viewer) sobre blanco", fondo: apilar(b, ["--glass-viewer"], BLANCO) },
    { donde: "reserva opaca (--glass-solid)", fondo: hexDe(b, "--glass-solid") },
  ];
};

describe("contraste sobre cristal", () => {
  it("el modelo de capas reproduce el peor fondo ya medido (--glass-dense oscuro sobre blanco = #4D4E50)", () => {
    expect(apilar(oscuro, ["--glass-dense"], BLANCO).toUpperCase()).toBe("#4D4E50");
  });

  for (const [tema, b] of [["oscuro", oscuro], ["claro", claro]] as const) {
    // Texto sin cristal directamente sobre el Ambiente. --success y --warning no van nunca
    // sobre el fondo: viven dentro del cristal, que ya cubre la lista de arriba.
    it(`en ${tema}, el texto sin cristal aguanta 4,5:1 sobre el Ambiente`, () => {
      const fondo = ambiente(b);
      const fallos: string[] = [];
      for (const n of ["--foreground", "--muted-foreground", "--data", "--destructive-text"]) {
        const r = ratio(hexDe(b, n), fondo);
        if (r < 4.5) fallos.push(`${n} sobre el Ambiente (${fondo}): ${r.toFixed(2)}:1`);
      }
      expect(fallos).toEqual([]);
    });

    it(`en ${tema}, el texto aguanta 4,5:1 sobre el peor fondo de cada superficie de cristal`, () => {
      const fallos: string[] = [];
      for (const { donde, fondo } of superficies(b)) {
        for (const n of TEXTOS) {
          const r = ratio(hexDe(b, n), fondo);
          if (r < 4.5) fallos.push(`${n} sobre ${donde} (${fondo}): ${r.toFixed(2)}:1`);
        }
      }
      expect(fallos).toEqual([]);
    });
  }
});
