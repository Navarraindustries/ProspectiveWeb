/* Auditoría estática de las páginas de gestión (fase 9). Cada tarea de página añade sus
   ficheros a REVISADOS; el comprobador se prueba con muestras y luego recorre la lista. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const leer = (f: string) => readFileSync(join(SRC, f), "utf8").replace(/\r\n/g, "\n");

/** Rutas relativas a `src/`, con «/». */
const REVISADOS: string[] = [
  "components/TablaTarjetas.tsx", "styles/office.css",
  "pages/Patients.tsx", "components/patients/PatientCard.tsx", "components/patients/PatientsSidePanel.tsx", "components/patients/patients.css",
];

const quitarComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** Texto del objeto/bloque `{ … }` que encierra la posición `pos`. */
function envolvente(s: string, pos: number): string {
  let ini = pos;
  for (let prof = 0; ini > 0; ini--) {
    const c = s[ini - 1];
    if (c === "}") prof++;
    else if (c === "{") {
      if (prof === 0) break;
      prof--;
    }
  }
  let fin = pos;
  for (let prof = 0; fin < s.length; fin++) {
    const c = s[fin];
    if (c === "{") prof++;
    else if (c === "}") {
      if (prof === 0) break;
      prof--;
    }
  }
  return s.slice(ini, fin);
}

export function revisarTsx(fuente: string): string[] {
  const s = quitarComentarios(fuente);
  const r: string[] = [];
  if (/type=["']checkbox["']/.test(s)) r.push("checkbox nativo");
  if (/[a-záéíóúñ]\((?:s|es)\)/i.test(s)) r.push("plural (s)");
  if (/overflowX\s*:/.test(s)) r.push("scroll horizontal");
  if (/className=["']table-scroll["']/.test(s)) r.push("table-scroll");
  if (/maxHeight\s*:\s*\d/.test(s)) r.push("maxHeight fijo");
  if (/onMouseEnter\s*=/.test(s)) r.push("hover en JS");
  if (/toLocale(?:Date)?String\(/.test(s)) r.push("fecha sin lib/fecha");
  let pequeno = /fontSize\s*:\s*(?:9|10|11)\b/.test(s);
  for (const m of s.matchAll(/fontSize\s*:\s*12\b/g)) {
    if (!envolvente(s, m.index ?? 0).includes("--font-mono")) pequeno = true;
  }
  if (pequeno) r.push("texto < 13 px");
  return r;
}

export function revisarCss(fuente: string): string[] {
  const s = quitarComentarios(fuente);
  const r: string[] = [];
  if (/overflow-x\s*:\s*auto/.test(s)) r.push("scroll horizontal");
  let pequeno = /font-size\s*:\s*(?:9|10|11)(?:\.\d+)?px/.test(s);
  for (const m of s.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (/font-size\s*:\s*12px/.test(m[2]) && !m[2].includes("--font-mono")) pequeno = true;
  }
  if (pequeno) r.push("texto < 13 px");
  return r;
}

describe("auditoría de las páginas de gestión", () => {
  it("el comprobador detecta cada regla", () => {
    expect(revisarTsx('<input type="checkbox" />')).toContain("checkbox nativo");
    expect(revisarTsx("{n} pedido(s)")).toContain("plural (s)");
    expect(revisarTsx("style={{ fontSize: 11 }}")).toContain("texto < 13 px");
    expect(revisarTsx('style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}')).toEqual([]);
    expect(revisarTsx('style={{\n fontSize: 12,\n fontFamily: "var(--font-mono)",\n}}')).toEqual([]);
    expect(revisarTsx('<a style={{ fontFamily: "var(--font-mono)" }} /><b style={{ fontSize: 12 }} />')).toContain("texto < 13 px");
    expect(revisarTsx("x.toLocaleDateString()")).toContain("fecha sin lib/fecha");
    expect(revisarTsx("// fontSize: 11\nconst a = 1;")).toEqual([]);
    expect(revisarCss(".a { font-size: 12px; }")).toContain("texto < 13 px");
    expect(revisarCss(".a { font-family: var(--font-mono); font-size: 12px; }")).toEqual([]);
    expect(revisarCss(".a { overflow-x: auto; }")).toContain("scroll horizontal");
  });
  it("los ficheros ya revisados cumplen", () => {
    const fallos = REVISADOS.flatMap((f) => (f.endsWith(".css") ? revisarCss : revisarTsx)(leer(f)).map((r) => `${f}: ${r}`));
    expect(fallos).toEqual([]);
  });
});
