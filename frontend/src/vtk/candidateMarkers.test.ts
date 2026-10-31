import { describe, expect, it } from "vitest";
import type { AneurysmCandidate } from "../api/types";
import { candidateMarkers, litSequence, shouldReplay } from "./candidateMarkers";
import { CANDIDATE_COLOR, CANDIDATE_DIM_COLOR } from "./markerColors";

function c(x: number, y: number, z: number): AneurysmCandidate {
  return {
    id: `c-${x}-${y}-${z}`,
    center_mm: { x, y, z },
    max_diameter_mm: 5,
    confidence: 0.5,
    dome_mesh_url: "",
    selected: false,
    channels: [],
    patch_kind: "region",
    rank: 1,
    veto: null,
  };
}

describe("candidateMarkers", () => {
  it("un marcador por candidato encendido, el seleccionado en el color vivo y el resto apagados", () => {
    const cands = [c(1, 1, 1), c(2, 2, 2), c(3, 3, 3)];
    const out = candidateMarkers(cands, 1, 2);
    expect(out).toHaveLength(2);
    expect(out[1].color).toEqual(CANDIDATE_COLOR);
    expect(out[0].color).toEqual(CANDIDATE_DIM_COLOR);
    expect(out[0].pos).toEqual([1, 1, 1]);
  });

  it("la secuencia reparte el segundo entre los candidatos y con uno solo enciende en 0", () => {
    expect(litSequence(3)).toEqual([0, 500, 1000]);
    expect(litSequence(1)).toEqual([0]);
  });

  it("el radio de 1 mm se expresa como escala sobre el radio compartido", () => {
    const out = candidateMarkers([c(0, 0, 0)], 0, 1, 0.5);
    expect(out[0].scale).toBeCloseTo(2);
  });

  it("shouldReplay: misma lista no, lista nueva o ninguna previa sí", () => {
    const l: unknown[] = [];
    expect(shouldReplay(l, l)).toBe(false);
    expect(shouldReplay(l, [])).toBe(true);
    expect(shouldReplay(null, l)).toBe(true);
  });

  it("lit mayor que la lista no inventa marcadores", () => {
    expect(candidateMarkers([c(0, 0, 0)], 0, 9)).toHaveLength(1);
  });
});
