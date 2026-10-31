/* La insignia del canal de la cuota (30-10): en la API se llama «saco», delante
   del clínico «saco pequeño», y lleva explicación porque no es un voto más. */
import { describe, expect, it } from "vitest";
import { DETECT_MORE, SMALL_SAC_CHANNEL, channelLabel, channelTitle } from "./detectCopy";

describe("canal de saco pequeño", () => {
  it("se enseña como «saco pequeño» y explica la cuota al pasar el ratón", () => {
    expect(channelLabel(SMALL_SAC_CHANNEL)).toBe("saco pequeño");
    expect(channelTitle(SMALL_SAC_CHANNEL)).toMatch(/5\.º puesto/);
    expect(channelTitle(SMALL_SAC_CHANNEL)).toMatch(/No vota/);
  });

  it("los demás canales van tal cual y sin explicación", () => {
    for (const ch of ["curvatura", "calibre", "cociente"]) {
      expect(channelLabel(ch)).toBe(ch);
      expect(channelTitle(ch)).toBeUndefined();
    }
  });

  it("el desplegable «Más» cuenta que es una cuota, no un cuarto voto", () => {
    expect(DETECT_MORE.some((t) => t.includes("Saco pequeño") && t.includes("cuota"))).toBe(true);
  });
});
