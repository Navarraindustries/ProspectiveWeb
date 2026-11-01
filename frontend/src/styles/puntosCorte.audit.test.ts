/* Auditoría: los puntos de corte salen de styles/puntosCorte.ts. Una consulta
   de medios con un número que no sea uno de los comunes falla, salvo el legado
   listado (cada fase que lo migra lo borra de LEGADO). */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PUNTOS_CORTE } from "./puntosCorte";

const SRC = join(__dirname, "..");

const ANCHOS = new Set([640, 641, 1024, 1025, 1280, 1281, 1920]); // N+1 para «mayor que»
const ALTOS = new Set([600, 768, 900, 1080]); // altos de la matriz

/** Números previos al módulo. Cada fase que migra uno lo quita de aquí. */
const LEGADO: Record<string, number[]> = {
  "styles/landing.css": [760], // fase 11
  "styles/office.css": [760], // fase 9
  "styles/responsive.css": [1100, 820], // tarea 12 de esta fase
  "components/landing/heroFrames.ts": [760],
  "components/landing/FranjaCasos.tsx": [760],
  "components/landing/NavPildora.tsx": [900],
  "components/stepper/QuirofanoBar.tsx": [1366], // fase 10
};

function ficheros(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, out);
    else if (/\.(css|ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

/** Quita comentarios de bloque y de línea (sin tocar `://` de las URL). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Limitación: la sintaxis de rango `(width <= Npx)` no se vigila.
/** Cada `(max|min)-(width|height): Npx` dentro de paréntesis, o sea, de una
    consulta de medios; el `max-width: 760px` de una propiedad no cuenta. */
function consultas(): { fichero: string; eje: "ancho" | "alto"; valor: number }[] {
  const res: { fichero: string; eje: "ancho" | "alto"; valor: number }[] = [];
  for (const f of ficheros(SRC)) {
    const rel = relative(SRC, f).replaceAll("\\", "/");
    if (rel === "styles/puntosCorte.ts" || rel.startsWith("test/")) continue;
    const t = sinComentarios(readFileSync(f, "utf8"));
    for (const m of t.matchAll(/\(\s*(?:max|min)-(width|height)\s*:\s*(\d+)px/g)) {
      res.push({ fichero: rel, eje: m[1] === "width" ? "ancho" : "alto", valor: Number(m[2]) });
    }
  }
  return res;
}

describe("puntos de corte", () => {
  it("ningún punto de corte fuera de los comunes (salvo el legado listado)", () => {
    const sueltos = consultas().filter(({ fichero, eje, valor }) =>
      !(eje === "ancho" ? ANCHOS : ALTOS).has(valor) && !(LEGADO[fichero] ?? []).includes(valor));
    expect(sueltos).toEqual([]);
  });
  it("cada entrada del legado sigue existiendo (si se migra, se borra de LEGADO)", () => {
    const hallados = consultas();
    for (const [fichero, valores] of Object.entries(LEGADO))
      for (const v of valores)
        expect(hallados.some((h) => h.fichero === fichero && h.valor === v), `${fichero} ya no usa ${v}`).toBe(true);
  });
  it("breakpoints.css y PUNTOS_CORTE dicen lo mismo", () => {
    const css = readFileSync(join(__dirname, "tokens/breakpoints.css"), "utf8");
    for (const [k, v] of Object.entries({ movil: 640, tableta: 1024, estrecho: 1280, grande: 1920 }))
      expect(css).toMatch(new RegExp(`--bp-${k}:\\s*${v}px`));
    expect(PUNTOS_CORTE).toEqual({ movil: 640, tableta: 1024, estrecho: 1280, grande: 1920 });
  });
});
