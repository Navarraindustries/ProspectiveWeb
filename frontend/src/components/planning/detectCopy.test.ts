/* La insignia del canal de la cuota (30-10): en la API se llama «saco», delante
   del clínico «saco pequeño», y lleva explicación porque no es un voto más. */
import { describe, expect, it } from "vitest";
import { candidateLabel } from "../../vtk/candidateOverlay";
import type { AneurysmCandidate } from "../../api/types";
import { hudCandidateLine } from "../../vtk/hudCandidate";
import {
  DETECT_LINES, DETECT_MORE, SMALL_SAC_CHANNEL, candidateName, candidateNameAt, channelLabel, channelTitle,
  tissueLabel, tissueTitle,
} from "./detectCopy";

describe("canal de saco pequeño", () => {
  it("se enseña como «saco pequeño» y explica la cuota al pasar el ratón", () => {
    expect(channelLabel(SMALL_SAC_CHANNEL)).toBe("saco pequeño");
    expect(channelTitle(SMALL_SAC_CHANNEL)).toMatch(/5\.º puesto/);
    expect(channelTitle(SMALL_SAC_CHANNEL)).toMatch(/No vota/);
  });

  it("los demás canales van tal cual y explican en palabras de la consulta qué miran", () => {
    for (const ch of ["curvatura", "calibre", "cociente"]) expect(channelLabel(ch)).toBe(ch);
    expect(channelTitle("curvatura")).toBe("La superficie se abomba.");
    expect(channelTitle("calibre")).toBe("Más gruesa que el resto de la vasculatura.");
    expect(channelTitle("cociente")).toBe("Más gruesa que el vaso de al lado.");
    expect(channelTitle("otro")).toBeUndefined();
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
    expect(hudCandidateLine(acc[1]!, null, candidateNameAt(acc, rej, 1))).toBe("Candidato 2 · Ø 4,0 mm est.");
    expect(candidateNameAt(acc, rej, 1)).toBe("Candidato 2");
    expect(candidateLabel(acc[1]!, 1, false)).toBe("2");
  });
  it("un descartado sin rank lleva D{posición+1}, igual que la etiqueta 3D", () => {
    expect(candidateNameAt(acc, rej, 3)).toBe("Descartado D2");
    expect(candidateLabel(rej[1]!, 1, true)).toBe("D2");
    expect(hudCandidateLine(rej[1]!, null, candidateNameAt(acc, rej, 3))).toBe("Descartado D2 · Ø 4,0 mm est.");
    expect(candidateName(rej[1]!, true)).toBe("Candidato descartado");
  });
  it("sin candidato en esa posición, null", () => {
    expect(candidateNameAt(acc, rej, 9)).toBeNull();
  });
});

describe("tejido alrededor del candidato (09-11)", () => {
  it("dice la etiqueta con la cifra que la decidió, con coma y sin decimales", () => {
    expect(tissueLabel({ tissue: "hueso", hu_mean: 180.5, hu_max: 910.4 })).toBe("hueso o calcio cerca · máx 910 HU");
    expect(tissueLabel({ tissue: "contraste", hu_mean: 251.6, hu_max: 420 })).toBe("vaso con contraste · 252 HU");
    expect(tissueLabel({ tissue: "otro", hu_mean: 40, hu_max: 180 })).toBe("sin contraste · máx 180 HU");
  });

  it("sin medir (3DRA, sesión antigua) no dice nada", () => {
    expect(tissueLabel({})).toBeNull();
    expect(tissueLabel({ tissue: null, hu_mean: null, hu_max: null })).toBeNull();
    expect(tissueTitle(null)).toBeUndefined();
  });

  it("«hueso» avisa de que una pared calcificada también sale así", () => {
    expect(tissueTitle("hueso")).toMatch(/calcio de la pared/);
    expect(tissueTitle("otro")).toMatch(/trombosada/);
    expect(DETECT_MORE.join(" ")).toMatch(/Describe, no filtra/);
  });

  it("la nota dice que la lista se llena aunque el estudio esté sano", () => {
    expect(DETECT_LINES[1]).toMatch(/se llena hasta 5 aunque el estudio esté sano/);
    expect(DETECT_LINES[1]).toMatch(/no dice si hay aneurisma o no/);
  });
});
