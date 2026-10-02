// frontend/src/vtk/handleDrag.test.ts
import { describe, expect, it } from "vitest";
import { nextDrag } from "./handleDrag";
describe("ciclo de arrastre de un asa", () => {
  it("pulsar sobre un asa con el botón izquierdo empieza y apaga la cámara; sin asa no pasa nada", () => {
    expect(nextDrag({ id: null }, { type: "down", id: "clip:move", button: 0 })).toEqual({ state: { id: "clip:move" }, emit: "start", cameraEnabled: false });
    expect(nextDrag({ id: null }, { type: "down", id: null, button: 0 })).toEqual({ state: { id: null }, emit: null, cameraEnabled: true });
    expect(nextDrag({ id: null }, { type: "down", id: "clip:move", button: 2 })).toEqual({ state: { id: null }, emit: null, cameraEnabled: true });
  });
  it("mover emite move solo durante el arrastre; soltar, perder la captura o cancelar terminan y devuelven la cámara", () => {
    expect(nextDrag({ id: "a" }, { type: "move" }).emit).toBe("move");
    expect(nextDrag({ id: null }, { type: "move" }).emit).toBeNull();
    for (const t of ["up", "lost", "cancel"] as const) expect(nextDrag({ id: "a" }, { type: t })).toEqual({ state: { id: null }, emit: "end", cameraEnabled: true });
    expect(nextDrag({ id: "a" }, { type: "escape" })).toEqual({ state: { id: null }, emit: "cancel", cameraEnabled: true });
  });
});
