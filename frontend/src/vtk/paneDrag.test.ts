import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD_PX, beginDrag, cancelDrag, endDrag, moveDrag } from "./paneDrag";

describe("arrastre para intercambiar", () => {
  it("no se activa hasta pasar el umbral", () => {
    let s = beginDrag("axial", 10, 10);
    s = moveDrag(s, 10 + DRAG_THRESHOLD_PX, 10, "mip");
    expect(s.active).toBe(false);
    expect(endDrag(s)).toBeNull();                     // un clic con temblor no intercambia
    s = moveDrag(s, 10 + DRAG_THRESHOLD_PX + 1, 10, "mip");
    expect(s.active).toBe(true);
    expect(s.over).toBe("mip");
  });
  it("mientras no está activo, el destino no se marca", () => {
    const s = moveDrag(beginDrag("axial", 0, 0), 2, 2, "mip");
    expect(s.over).toBeNull();
  });
  it("activo y sobre otra vista, al soltar devuelve el par", () => {
    const s = moveDrag(beginDrag("axial", 0, 0), 40, 0, "coronal");
    expect(endDrag(s)).toEqual(["axial", "coronal"]);
  });
  it("sobre sí misma o fuera de toda vista no hay intercambio", () => {
    expect(endDrag(moveDrag(beginDrag("axial", 0, 0), 40, 0, "axial"))).toBeNull();
    expect(endDrag(moveDrag(beginDrag("axial", 0, 0), 40, 0, null))).toBeNull();
  });
  it("cancelar deja el estado vacío y soltar después no hace nada", () => {
    expect(cancelDrag()).toBeNull();
    expect(endDrag(null)).toBeNull();
  });
});
