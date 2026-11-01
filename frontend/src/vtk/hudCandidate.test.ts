import { describe, expect, it } from "vitest";
import { hudCandidateLine } from "./hudCandidate";

const c = { id: "cand-001", max_diameter_mm: 3.7, patch_kind: "region" as const, rank: 1, channels: ["curvatura"] };

describe("hudCandidateLine (A65)", () => {
  it("con medida", () => {
    expect(hudCandidateLine(c, { max_diameter_mm: 10.9, neck_source: "auto", candidate_id: "cand-001" })).toBe("Candidato 1 · Ø 10,9 mm");
  });
  it("sin medida, estimado", () => {
    expect(hudCandidateLine(c, null)).toBe("Candidato 1 · Ø 3,7 mm est.");
  });
  it("marcado a mano", () => {
    expect(hudCandidateLine({ ...c, id: "cand-005", rank: 0, patch_kind: "manual" as const }, null)).toBe("Marcado a mano");
  });
  it("descartado", () => {
    expect(hudCandidateLine({ ...c, rank: 2 }, null, true)).toBe("Descartado D2 · Ø 3,7 mm est.");
  });
});
