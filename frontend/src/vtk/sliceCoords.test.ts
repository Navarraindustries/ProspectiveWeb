import { describe, expect, it } from "vitest";
import { mmToUv, uvToMm } from "./sliceCoords";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [101, 201, 301], spacing: [2, 0.5, 0.25] } as unknown as VolumeMeta;   // [nz, ny, nx], [sz, sy, sx]
describe("uvToMm / mmToUv", () => {
  it("axial: u→x, v→y, el índice fija z", () => {
    expect(uvToMm("axial", 10, 0.5, 0.25, meta)).toEqual([150 * 0.25, 50 * 0.5, 10 * 2]);
  });
  it("coronal y sagital invierten v como el visor (v = 1 − f(z))", () => {
    expect(uvToMm("coronal", 20, 0, 1, meta)).toEqual([0, 20 * 0.5, 0]);
    expect(uvToMm("sagital", 30, 1, 0, meta)).toEqual([30 * 0.25, 200 * 0.5, 100 * 2]);
  });
  it("ida y vuelta en los tres planos", () => {
    for (const plane of ["axial", "coronal", "sagital"] as const) {
      const p = uvToMm(plane, 7, 0.3, 0.8, meta);
      const { u, v } = mmToUv(plane, p, meta);
      expect(u).toBeCloseTo(0.3, 9); expect(v).toBeCloseTo(0.8, 9);
    }
  });
});
