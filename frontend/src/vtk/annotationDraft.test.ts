import { describe, expect, it } from "vitest";
import { addPoint, closeRegion, closesRegion, removeLast } from "./annotationDraft";

describe("addPoint", () => {
  it("regla termina al segundo punto, ángulo al tercero, marcador al primero", () => {
    expect(addPoint("regla", [], [0, 0, 0])).toEqual({ draft: [[0, 0, 0]], done: null });
    expect(addPoint("regla", [[0, 0, 0]], [1, 0, 0])).toEqual({ draft: [], done: [[0, 0, 0], [1, 0, 0]] });
    expect(addPoint("angulo", [[0, 0, 0], [1, 0, 0]], [1, 1, 0]).done).toHaveLength(3);
    expect(addPoint("marcador", [], [2, 2, 2]).done).toEqual([[2, 2, 2]]);
  });
  it("la región no termina sola", () => {
    expect(addPoint("region", [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [0, 1, 0]).done).toBeNull();
  });
});

describe("cerrar la región", () => {
  it("por el primer punto a ≤ 8 px, o con Intro si tiene ≥ 3", () => {
    const px = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }];
    expect(closesRegion(px, { x: 15, y: 14 })).toBe(true);
    expect(closesRegion(px, { x: 30, y: 30 })).toBe(false);
    expect(closesRegion(px.slice(0, 2), { x: 10, y: 10 })).toBe(false);
    expect(closeRegion([[0, 0, 0], [1, 0, 0]])).toBeNull();
    expect(closeRegion([[0, 0, 0], [1, 0, 0], [1, 1, 0]])).toHaveLength(3);
    expect(removeLast([[0, 0, 0], [1, 0, 0]])).toEqual([[0, 0, 0]]);
  });
});
