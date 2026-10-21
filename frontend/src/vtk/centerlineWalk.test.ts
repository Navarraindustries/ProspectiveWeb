import { describe, expect, it } from "vitest";
import { indexAtArc, nearestIndex, stepTrackIndex, tangentAt, trackFromWire } from "./centerlineWalk";
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

describe("stepTrackIndex (Review Focus 5)", () => {
  const track = { points: [[0, 0, 0], [0, 0, 0.5], [0, 0, 1], [0, 0, 1.5]] as Vec3[], radiiMm: [1, 1, 1, 1], arcMm: [0, 0.5, 1, 1.5] };
  it("si el foco sigue sobre el punto guardado (a menos de la tolerancia), manda el índice guardado y no el más cercano", () => {
    // Vóxel de 1 mm: el punto 1 (z=0,5) se redondea a z=1, que está igual de cerca del punto 2.
    expect(stepTrackIndex(track, [0, 0, 1], 1, 1)).toBe(1);
  });
  it("si el foco se fue a otro sitio, se recalcula el más cercano", () => {
    expect(stepTrackIndex(track, [0, 0, 1.5], 0, 0.6)).toBe(3);
    expect(stepTrackIndex(track, [0, 0, 1.5], null, 0.6)).toBe(3);
  });
});
