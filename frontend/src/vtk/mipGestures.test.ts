import { describe, expect, it } from "vitest";
import { indexOf, wheelAction, withIndex } from "./mipGestures";

describe("wheelAction", () => {
  it("la rueda avanza o retrocede un corte acotado", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 5, 10)).toEqual({ kind: "slice", next: 6 });
    expect(wheelAction({ deltaY: -100, ctrlKey: false }, 5, 10)).toEqual({ kind: "slice", next: 4 });
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 9, 10)).toEqual({ kind: "slice", next: 9 });
    expect(wheelAction({ deltaY: -100, ctrlKey: false }, 0, 10)).toEqual({ kind: "slice", next: 0 });
  });
  it("con un solo corte no se mueve", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: false }, 0, 1)).toEqual({ kind: "slice", next: 0 });
  });
  it("Ctrl+rueda es zoom y lo hace vtk", () => {
    expect(wheelAction({ deltaY: 100, ctrlKey: true }, 5, 10)).toEqual({ kind: "zoom" });
  });
  it("deltaY cero no hace nada", () => {
    expect(wheelAction({ deltaY: 0, ctrlKey: false }, 5, 10)).toEqual({ kind: "none" });
  });
});

describe("índice por plano", () => {
  const v = { x: 1, y: 2, z: 3 };
  it("lee y escribe la componente del plano", () => {
    expect(indexOf("axial", v)).toBe(3); expect(indexOf("coronal", v)).toBe(2); expect(indexOf("sagital", v)).toBe(1);
    expect(withIndex("axial", v, 7)).toEqual({ x: 1, y: 2, z: 7 });
    expect(withIndex("sagital", v, 7)).toEqual({ x: 7, y: 2, z: 3 });
  });
});
