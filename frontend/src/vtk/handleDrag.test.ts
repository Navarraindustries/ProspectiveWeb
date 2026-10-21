// frontend/src/vtk/handleDrag.test.ts
import { describe, expect, it } from "vitest";
import { chooseHandle, nextDrag } from "./handleDrag";
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

describe("qué asa gana cuando la pulsación toca varias", () => {
  it("una esfera gana al anillo aunque el anillo esté más cerca (canto del anillo sobre la esfera verde)", () => {
    expect(chooseHandle([{ id: "clip:roll", kind: "ring" }, { id: "clip:move", kind: "sphere" }])).toBe("clip:move");
  });
  it("entre iguales, la más cercana (el orden en que llegan)", () => {
    expect(chooseHandle([{ id: "clip:tilt", kind: "sphere" }, { id: "clip:move", kind: "sphere" }])).toBe("clip:tilt");
    expect(chooseHandle([{ id: "plane:axial", kind: "square" }, { id: "clip:roll", kind: "ring" }])).toBe("plane:axial");
  });
  it("sin nada debajo, ninguna", () => {
    expect(chooseHandle([])).toBeNull();
  });
});
