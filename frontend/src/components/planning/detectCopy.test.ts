/* La insignia del canal de la cuota (30-10): en la API se llama «saco», delante
   del clínico «saco pequeño», y lleva explicación porque no es un voto más. */
import { describe, expect, it } from "vitest";
import { candidateLabel } from "../../vtk/candidateOverlay";
import type { AneurysmCandidate } from "../../api/types";
import { hudCandidateLine } from "../../vtk/hudCandidate";
import { DETECT_MORE, SMALL_SAC_CHANNEL, candidateName, candidateNameAt, channelLabel, channelTitle } from "./detectCopy";

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

describe("candidateName (A65)", () => {
  it("nunca enseña el id interno", () => {
    expect(candidateName({ id: "cand-003", rank: 3 })).toBe("Candidato 3");
    expect(candidateName({ id: "cand-007", rank: 2 }, true)).toBe("Descartado D2");
    expect(candidateName({ id: "cand-009", rank: 0, patch_kind: "manual" })).toBe("Marcado a mano");
    expect(candidateName({ id: "cand-004" })).toBe("Candidato 4");
    expect(candidateName({ id: "cand-004" }, true)).toBe("Candidato descartado");
    expect(candidateName({ id: "cand-004", rank: null }, true)).toBe("Candidato descartado");
    expect(candidateName({ id: "otro" })).toBe("Candidato");
  });
});

describe("la misma numeración en panel, HUD, registro y etiqueta 3D (A65)", () => {
  const sinRank = (id: string, extra = {}) =>
    ({ id, max_diameter_mm: 4, patch_kind: "region", channels: ["curvatura"], ...extra }) as unknown as AneurysmCandidate;
  const acc = [sinRank("cand-007"), sinRank("cand-002")];
  const rej = [sinRank("cand-011"), sinRank("cand-003")];

  it("un aceptado sin rank se numera por su posición, no por su id", () => {
    expect(candidateName(acc[1]!, false, 1)).toBe("Candidato 2");
    expect(hudCandidateLine(acc[1]!, null, false, 1)).toBe("Candidato 2 · Ø 4,0 mm est.");
    expect(candidateNameAt(acc, rej, 1)).toBe("Candidato 2");
    expect(candidateLabel(acc[1]!, 1, false)).toBe("2");
  });
  it("un descartado sin rank lleva D{posición+1}, igual que la etiqueta 3D", () => {
    expect(candidateNameAt(acc, rej, 3)).toBe("Descartado D2");
    expect(candidateLabel(rej[1]!, 1, true)).toBe("D2");
    expect(hudCandidateLine(rej[1]!, null, true, 1)).toBe("Descartado D2 · Ø 4,0 mm est.");
    expect(candidateName(rej[1]!, true)).toBe("Candidato descartado");
  });
  it("sin candidato en esa posición, null", () => {
    expect(candidateNameAt(acc, rej, 9)).toBeNull();
  });
});
