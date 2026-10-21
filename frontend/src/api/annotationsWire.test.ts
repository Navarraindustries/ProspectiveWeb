import { describe, expect, it } from "vitest";
import { fromWire, toWire } from "./annotationsWire";
import type { AnnotationWire } from "./types";

const WIRE: AnnotationWire = {
  id: "a1", kind: "regla", points: [{ x: 0, y: 1.5, z: -2 }, { x: 3, y: 4, z: 0 }],
  plane: { plane: "axial", index: 3 }, label: "R1", note: "", visible: true,
  created_at: "2026-10-08T00:00:00+00:00", created_by: "admin",
};

describe("annotationsWire", () => {
  it("pasa los puntos a tuplas y vuelve igual", () => {
    const a = fromWire(WIRE);
    expect(a.points).toEqual([[0, 1.5, -2], [3, 4, 0]]);
    expect(a.plane).toEqual({ plane: "axial", index: 3 });
    expect(toWire(a)).toEqual(WIRE);
  });
});
