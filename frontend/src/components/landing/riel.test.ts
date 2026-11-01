import { describe, expect, it } from "vitest";
import { pasosEncendidos } from "./riel";

describe("pasosEncendidos", () => {
  it.each([[0, 0], [0.01, 1], [1 / 7, 2], [0.5, 4], [1, 8], [1.5, 8], [-1, 0]])(
    "progreso %f enciende %i de 8", (p, esperado) => {
      expect(pasosEncendidos(p, 8)).toBe(esperado);
    });
});
