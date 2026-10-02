import { describe, expect, it } from "vitest";
import { canAdvanceFromDetect } from "./detectGate";
import { vetoHint } from "./detectCopy";
import type { AneurysmCandidate } from "../../api/types";

const site = { id: "cand-001" } as AneurysmCandidate;

describe("canAdvanceFromDetect", () => {
  it("sin ningún sitio no deja avanzar", () => {
    expect(canAdvanceFromDetect([], [])).toBe(false);
  });
  it("con aceptados deja avanzar", () => {
    expect(canAdvanceFromDetect([site], [])).toBe(true);
  });
  it("con solo descartados también deja avanzar: se pueden medir", () => {
    expect(canAdvanceFromDetect([], [site])).toBe(true);
  });
});

describe("vetoHint", () => {
  it("nombra el motivo del veto", () => {
    expect(vetoHint("No es sacular")).toBe(
      "Descartado por «No es sacular»: compruébalo en el 3D antes de medir.");
  });
});
