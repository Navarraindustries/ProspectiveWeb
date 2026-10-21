import { describe, expect, it } from "vitest";
import { HU_MODALITIES, isHuModality, unitFor } from "./modality";

describe("modality", () => {
  it("TC (CT, CTA, CTPA) está en HU, sin importar mayúsculas ni espacios", () => {
    expect(HU_MODALITIES).toEqual(["CT", "CTA", "CTPA"]);
    for (const m of ["CT", "cta", " CTPA "]) {
      expect(isHuModality(m)).toBe(true);
      expect(unitFor(m)).toBe(" HU");
    }
  });
  it("XA, MR o sin modalidad no llevan unidad", () => {
    for (const m of ["XA", "MR", "", null, undefined]) {
      expect(isHuModality(m)).toBe(false);
      expect(unitFor(m)).toBe("");
    }
  });
});
