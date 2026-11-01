import { describe, expect, it } from "vitest";
import { stepAviso, stepDone, type GateState } from "./stepGate";
import { MORPHO_AUTO_HINT } from "./steps";

const base = { series: {}, segmentation: {}, candidates: [{ id: "cand-001", rank: 1 }], rejectedCandidates: [],
  morphometry: null, treatment: null, clipPlan: null, plannedClips: null } as unknown as GateState;

describe("stepGate", () => {
  it("hecho = tiene resultado", () => {
    expect([0, 1, 2, 3].map((i) => stepDone(i, base))).toEqual([true, true, true, false]);
  });
  it("re-segmentar vacía lo de después: sin candidatos ni medida, los pasos 3 y 4 dejan de estar hechos", () => {
    const resegmentado = { ...base, candidates: [], morphometry: null } as unknown as GateState;
    expect(stepDone(2, resegmentado)).toBe(false);
    expect(stepDone(3, resegmentado)).toBe(false);
  });
  it("Fabricación e Informe no tienen resultado propio", () => {
    expect(stepDone(6, base)).toBe(false);
    expect(stepDone(7, base)).toBe(false);
  });
  it("el paso 4 avisa de que calculará la morfometría solo si aún no la hay y se puede abrir", () => {
    expect(stepAviso(3, base)).toBe(MORPHO_AUTO_HINT);
    expect(stepAviso(3, { ...base, morphometry: {} } as GateState)).toBeNull();
    expect(stepAviso(3, { ...base, candidates: [] })).toBeNull();
    expect(stepAviso(2, base)).toBeNull();
  });
});
