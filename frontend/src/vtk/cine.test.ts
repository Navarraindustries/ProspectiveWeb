import { describe, expect, it } from "vitest";
import { applyStep, clampFps, nextIndex, stepFromKey } from "./cine";
describe("cine", () => {
  it("clampFps acota a 1..30 y los no numéricos al defecto", () => {
    expect(clampFps(0)).toBe(1); expect(clampFps(99)).toBe(30); expect(clampFps(NaN)).toBe(8);
  });
  it("nextIndex rebota en los extremos y con un solo corte no se mueve", () => {
    expect(nextIndex(8, 1, 10, true)).toEqual({ index: 9, dir: 1 });
    expect(nextIndex(9, 1, 10, true)).toEqual({ index: 8, dir: -1 });
    expect(nextIndex(0, -1, 10, true)).toEqual({ index: 1, dir: 1 });
    expect(nextIndex(0, 1, 1, true)).toEqual({ index: 0, dir: 1 });
  });
  it("stepFromKey y applyStep", () => {
    expect(stepFromKey("PageUp")).toBe(10); expect(stepFromKey("PageDown")).toBe(-10);
    expect(stepFromKey("Home")).toBe(-Infinity); expect(stepFromKey("x")).toBeNull();
    expect(applyStep(95, 10, 100)).toBe(99); expect(applyStep(3, -Infinity, 100)).toBe(0); expect(applyStep(3, Infinity, 100)).toBe(99);
  });
});

import { cineShouldStop, isNativeKeyTarget } from "./cine";
it("cineShouldStop: otra celda enfocada u oculta lo para; sin foco o sin cine, no", () => {
  const all = { scene: true, axial: true, coronal: true, sagital: true, mip: true };
  const c = { pane: "coronal" as const };
  expect(cineShouldStop(null, { focusedPane: "axial", visible: all })).toBe(false);
  expect(cineShouldStop(c, { focusedPane: "coronal", visible: all })).toBe(false);
  // Espacio sin haber pinchado ninguna celda: el cine es de la principal y sigue.
  expect(cineShouldStop(c, { focusedPane: null, visible: all })).toBe(false);
  expect(cineShouldStop(c, { focusedPane: "axial", visible: all })).toBe(true);
  // La distribución ocultó la celda que reproduce (SOLA, o el quinto hueco de CUATRO).
  expect(cineShouldStop(c, { focusedPane: "coronal", visible: { ...all, coronal: false } })).toBe(true);
  expect(cineShouldStop(c, { focusedPane: null, visible: { ...all, coronal: false } })).toBe(true);
});
it("isNativeKeyTarget reconoce controles con teclado propio", () => {
  expect(isNativeKeyTarget(document.createElement("input"))).toBe(true);
  expect(isNativeKeyTarget(document.createElement("button"))).toBe(true);
  expect(isNativeKeyTarget(document.createElement("div"))).toBe(false);
  expect(isNativeKeyTarget(null)).toBe(false);
});
