import { describe, expect, it } from "vitest";
import { indexAtArc, nearestIndex, tangentAt, trackFromWire } from "./centerlineWalk";
import type { Vec3 } from "./geometry";

const pts: Vec3[] = [[0, 0, 0], [0, 0, 1], [0, 1, 2], [0, 2, 2]];
const arc = [0, 1, 1 + Math.SQRT2, 2 + Math.SQRT2];

describe("centerlineWalk", () => {
  it("tangentAt usa diferencias centradas y unilaterales en los extremos, unitarias", () => {
    expect(tangentAt(pts, 0)).toEqual([0, 0, 1]);
    const t1 = tangentAt(pts, 1);   // (p2 − p0) normalizado = (0, 1, 2)/√5
    expect(t1[1]).toBeCloseTo(1 / Math.sqrt(5), 9); expect(t1[2]).toBeCloseTo(2 / Math.sqrt(5), 9);
    expect(tangentAt(pts, 3)).toEqual([0, 1, 0]);
  });
  it("con un solo punto la tangente es +z", () => {
    expect(tangentAt([[1, 1, 1]], 0)).toEqual([0, 0, 1]);
  });
  it("indexAtArc devuelve el índice del arco más cercano, acotado", () => {
    expect(indexAtArc(arc, 0)).toBe(0); expect(indexAtArc(arc, 1.1)).toBe(1);
    expect(indexAtArc(arc, 2.3)).toBe(2); expect(indexAtArc(arc, 99)).toBe(3); expect(indexAtArc(arc, -5)).toBe(0);
  });
  it("nearestIndex da el punto más cercano y la distancia", () => {
    expect(nearestIndex(pts, [0, 0.9, 2.1])).toEqual({ index: 2, distMm: expect.closeTo(Math.hypot(0.1, 0.1), 9) });
  });
  it("trackFromWire convierte Position3D en Vec3", () => {
    const t = trackFromWire({ points: [{ x: 1, y: 2, z: 3 }], radii_mm: [1.5], arc_mm: [0] });
    expect(t).toEqual({ points: [[1, 2, 3]], radiiMm: [1.5], arcMm: [0] });
  });
});
