import { describe, expect, it } from "vitest";
import * as copy from "./copy";
import { LIMITES, PARADAS_PACIENTES, PISTAS_PASO, ZONAS_QUIROFANO } from "./copy";

const PROHIBIDO = /punto|nivel|logro|racha|misión|premio|desbloque/i;

const explicaciones = [
  ...Object.entries(PARADAS_PACIENTES),
  ...ZONAS_QUIROFANO.map((e, i) => [`zona${i}`, e] as const),
  ...Object.entries(PISTAS_PASO),
];

function textos(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(textos);
  if (v && typeof v === "object") return Object.values(v).flatMap(textos);
  return [];
}

describe("textos del onboarding", () => {
  it("cantidades", () => {
    expect(Object.keys(PARADAS_PACIENTES)).toHaveLength(9);
    expect(ZONAS_QUIROFANO).toHaveLength(5);
    expect(Object.keys(PISTAS_PASO)).toHaveLength(8);
    expect(copy.TRAMOS_INTRO).toHaveLength(4);
    expect(copy.PRIMEROS_PASOS).toHaveLength(4);
  });

  it.each(explicaciones)("%s respeta los límites", (_n, e) => {
    for (const campo of ["titulo", "como", "cuando", "porque"] as const) {
      expect(e[campo].trim().length).toBeGreaterThan(0);
      expect(e[campo].length).toBeLessThanOrEqual(LIMITES[campo]);
    }
  });

  it("ningún texto del módulo lleva términos de juego", () => {
    for (const t of textos(copy)) expect(t).not.toMatch(PROHIBIDO);
  });
});
