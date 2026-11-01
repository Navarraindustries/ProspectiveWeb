import { describe, expect, it } from "vitest";
import { AR_HIGH, DNR_HIGH } from "../morphometry/thresholds";
import { cifra } from "../../lib/numero";
import { INDICES, NOMBRE_COTA } from "./indices";

describe("INDICES", () => {
  it("ocho siglas en orden", () => {
    expect(INDICES.map((i) => i.abbr)).toEqual(["DNR", "AR", "BF", "UI", "EI", "NSI", "SR", "PHASES"]);
  });
  it("cotas de cada índice", () => {
    expect(Object.fromEntries(INDICES.map((i) => [i.abbr, i.cotas]))).toEqual({
      DNR: ["dmax", "cuello"], AR: ["altura", "cuello"], BF: ["anchura", "cuello"], UI: ["contorno"],
      EI: ["elipse"], NSI: ["esfera"], SR: ["dmax", "madre"], PHASES: ["dmax"],
    });
  });
  it("los detalles llevan los cortes con coma", () => {
    expect(INDICES[0].detalle).toBe(`Ø máx / cuello · riesgo ↑ si ≥ ${cifra(DNR_HIGH, 1)}`);
    expect(INDICES[0].detalle).toContain("2,0");
    expect(INDICES[1].detalle).toBe(`altura de domo / cuello · riesgo ↑ si ≥ ${cifra(AR_HIGH, 1)}`);
  });
  it("nombres de cota", () => {
    expect(NOMBRE_COTA.madre).toBe("Ø arteria madre");
  });
});
