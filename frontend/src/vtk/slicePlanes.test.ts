import { describe, expect, it } from "vitest";
import { slicePlaneSpecs } from "./slicePlanes";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [10, 20, 30], spacing: [1, 0.5, 0.25] } as unknown as VolumeMeta;
describe("slicePlaneSpecs", () => {
  it("tres planos de índice por el punto compartido", () => {
    const s = slicePlaneSpecs({ x: 4, y: 6, z: 5 }, meta);
    expect(s.map((p) => p.plane)).toEqual(["axial", "coronal", "sagital"]);
    expect(s[0].normal).toEqual([0, 0, 1]); expect(s[0].originMm[2]).toBe(5);
    expect(s[1].normal).toEqual([0, 1, 0]); expect(s[1].originMm[1]).toBe(3);
    expect(s[2].normal).toEqual([1, 0, 0]); expect(s[2].originMm[0]).toBe(1);
  });
});
