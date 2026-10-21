import { describe, expect, it } from "vitest";
import { windowFromDrag } from "./windowDrag";

describe("windowFromDrag", () => {
  it("vertical cambia el nivel y horizontal la ventana, 400 px recorren el rango", () => {
    expect(windowFromDrag({ wc: 2000, ww: 1000 }, 40, -40, [1000, 3000])).toEqual({ wc: 2200, ww: 1200 });
  });
  it("la ventana nunca baja de 1", () => {
    expect(windowFromDrag({ wc: 2000, ww: 10 }, -400, 0, [1000, 3000]).ww).toBe(1);
  });
});
