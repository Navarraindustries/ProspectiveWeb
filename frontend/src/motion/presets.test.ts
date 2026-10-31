import { describe, expect, it } from "vitest";
import { DUR, EASE, glide, glideTransition, lens, lensCard, panelSwap, panelTransition, pressable, sheetSlide, sheetTransition } from "./presets";

describe("presets de movimiento", () => {
  it("usa las duraciones y la curva de la especificación", () => {
    expect(DUR).toEqual({ respuesta: 0.12, estado: 0.24, panel: 0.48, landing: 0.9 });
    expect(EASE).toEqual([0.16, 1, 0.3, 1]);
    expect(pressable.whileTap).toEqual({ scale: 0.98 });
    expect(pressable.transition.duration).toBe(0.12);
    expect(panelTransition.duration).toBe(0.24);
    expect(sheetTransition.duration).toBe(0.48);
  });
  it("el panel cruza con 8 px y la hoja entra desde el borde derecho", () => {
    expect(panelSwap.initial).toEqual({ opacity: 0, x: 8 });
    expect(panelSwap.exit).toEqual({ opacity: 0, x: -8 });
    expect(sheetSlide.initial).toEqual({ x: "100%" });
    expect(sheetSlide.animate).toEqual({ x: 0 });
  });
  it("glide y lente", () => {
    expect(glide.initial).toEqual({ opacity: 0, scale: 0.96, y: 14 });
    expect(glideTransition.duration).toBe(0.48);
    expect(lens.whileHover.scale).toBe(1.06);
    expect(lensCard.whileHover.scale).toBe(1.02);
  });
});
