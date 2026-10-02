import { describe, expect, it } from "vitest";
import { indexFromDrag, planeAxis, planeHandles } from "./planeHandles";
import { polygonCentroid } from "./planeOutlines";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [10, 20, 30], spacing: [1, 0.5, 0.25] } as unknown as VolumeMeta;
describe("planeHandles", () => {
  it("el centroide de un rectángulo es su centro", () => { expect(polygonCentroid([[0, 0, 0], [4, 0, 0], [4, 2, 0], [0, 2, 0]])).toEqual([2, 1, 0]); });
  it("una asa cuadrada por contorno, en el centroide y con su color", () => {
    const h = planeHandles([{ plane: "axial", corners: [[0, 0, 5], [4, 0, 5], [4, 2, 5], [0, 2, 5]], color: [0, 0.5, 1] }]);
    expect(h).toEqual([{ id: "plane:axial", kind: "square", pos: [2, 1, 5], radiusMm: 1.2, color: [0, 0.5, 1] }]);
  });
  it("ejes de cada plano", () => {
    expect(planeAxis("axial", { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 })).toEqual([0, 0, 1]);
    expect(planeAxis("sagital", { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 })).toEqual([1, 0, 0]);
  });
  it("el índice se redondea por el espaciado del eje y se acota", () => {
    expect(indexFromDrag("sagital", 10, 1.1, meta)).toBe(14);      // sx = 0.25 → +4.4 → 14
    expect(indexFromDrag("axial", 9, 5, meta)).toBe(9);
    expect(indexFromDrag("coronal", 2, -5, meta)).toBe(0);
  });
});
