import { describe, expect, it } from "vitest";
import * as copy from "./copy";
import { LIMITES, PRIMEROS_PASOS } from "./copy";

const PROHIBIDO = /punto|nivel|logro|racha|misión|premio|desbloque/i;
const CAMPOS = ["titulo", "como", "cuando", "porque"] as const;

type Expl = Record<(typeof CAMPOS)[number], string>;

function esExplicacion(v: unknown): v is Expl {
  return !!v && typeof v === "object" && CAMPOS.every((c) => typeof (v as Record<string, unknown>)[c] === "string");
}

/** Recoge toda Explicacion del módulo, sea cual sea su grupo. */
function recoger(v: unknown, ruta: string, out: [string, Expl][]): void {
  if (esExplicacion(v)) { out.push([ruta, v]); return; }
  if (Array.isArray(v)) v.forEach((x, i) => recoger(x, `${ruta}[${i}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) recoger(x, `${ruta}.${k}`, out);
}

/** Todos los textos; las funciones se llaman con un nombre de muestra. */
function textos(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return textos((v as (n: string) => unknown)("Ana"));
  if (Array.isArray(v)) return v.flatMap(textos);
  if (v && typeof v === "object") return Object.values(v).flatMap(textos);
  return [];
}

const explicaciones: [string, Expl][] = [];
recoger({ ...copy }, "copy", explicaciones);

describe("textos del onboarding", () => {
  it("cantidades", () => {
    expect(explicaciones.length).toBeGreaterThanOrEqual(9 + 5 + 8);
    expect(Object.keys(copy.PARADAS_PACIENTES)).toHaveLength(9);
    expect(copy.ZONAS_QUIROFANO).toHaveLength(5);
    expect(Object.keys(copy.PISTAS_PASO)).toHaveLength(8);
    expect(copy.TRAMOS_INTRO).toHaveLength(4);
    expect(PRIMEROS_PASOS).toHaveLength(4);
  });

  it.each(explicaciones)("%s respeta los límites", (_n, e) => {
    for (const campo of CAMPOS) {
      expect(e[campo].trim().length).toBeGreaterThan(0);
      expect(e[campo].length).toBeLessThanOrEqual(LIMITES[campo]);
    }
  });

  it("primeros pasos: lugar y cta legibles y cortos", () => {
    for (const p of PRIMEROS_PASOS) {
      expect(p.lugar.trim().length).toBeGreaterThan(0);
      expect(p.lugar.length).toBeLessThanOrEqual(90);
      expect(p.cta.trim().length).toBeGreaterThan(0);
    }
  });

  it("ningún texto del módulo (funciones incluidas) lleva términos de juego", () => {
    const todos = textos({ ...copy });
    expect(todos.length).toBeGreaterThan(50);
    for (const t of todos) expect(t).not.toMatch(PROHIBIDO);
  });
});
