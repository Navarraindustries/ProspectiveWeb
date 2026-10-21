import { describe, expect, it } from "vitest";
import { angleReferenceLabel, approachDirection } from "./approachView";

describe("approachDirection", () => {
  it("es el unitario de entrada → diana", () => {
    expect(approachDirection([0, 0, 0], [0, 3, 4])).toEqual([0, 0.6, 0.8]);
  });
  it("con los dos puntos iguales no hay dirección", () => {
    expect(approachDirection([1, 1, 1], [1, 1, 1])).toBeNull();
  });
});

describe("angleReferenceLabel (spec §4.1)", () => {
  it("con eje del aneurisma lo dice", () => {
    expect(angleReferenceLabel([0.1, 0.2, 0.97]).text).toBe("Ángulo respecto al eje del aneurisma");
  });
  it("sin eje (o nulo) avisa de que la referencia es el eje vertical", () => {
    expect(angleReferenceLabel(null).text).toBe("Ángulo respecto al eje vertical del estudio (sin eje del aneurisma medido)");
    expect(angleReferenceLabel([0, 0, 0]).text).toContain("eje vertical");
  });
});
