import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCandidateGuard, requestCandidate } from "./candidateGuard";

afterEach(() => registerCandidateGuard(null));

describe("candidateGuard", () => {
  it("sin panel que atienda, el visor elige por su cuenta", () => {
    expect(requestCandidate(2)).toBe(false);
  });

  it("con el panel montado, el cambio pasa por su selección con pregunta", () => {
    const elegir = vi.fn();
    registerCandidateGuard(elegir);
    expect(requestCandidate(2)).toBe(true);
    expect(elegir).toHaveBeenCalledWith(2);
  });
});
