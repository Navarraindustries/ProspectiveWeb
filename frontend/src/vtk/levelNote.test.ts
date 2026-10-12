import { describe, expect, it } from "vitest";
import { levelNoteFor, volumeStateLabel } from "./levelNote";

describe("levelNoteFor", () => {
  it("F1-113: el nivel grueso dice que es una vista previa y que las medidas no cambian, sin la cuenta", () => {
    // «RESOLUCIÓN REDUCIDA · 4/12» se leía como «faltan datos» o «medidas peores».
    expect(levelNoteFor("coarse", 3, null)).toBe("Vista previa en baja resolución; las medidas no cambian");
    expect(levelNoteFor("coarse", 3, null, true)).toBe("BAJA RESOLUCIÓN");
    expect(levelNoteFor("coarse", 3, null)).not.toMatch(/\d+\/\d+/);
  });

  it("el completo servido con stride en el plano también es vista previa, con su proporción", () => {
    // Un 512×512×1030 llega a 256²: sin rótulo parecería nativo.
    expect(levelNoteFor("full", 2, null)).toBe("Vista previa 1:2; las medidas no cambian");
    expect(levelNoteFor("full", 2, null, true)).toBe("1:2");
  });

  it("says nothing for a native full level", () => {
    expect(levelNoteFor("full", 1, null)).toBeNull();
  });

  it("reports a failed full download while showing the coarse fallback", () => {
    expect(levelNoteFor("coarse", 3, "boom")).toBe("Vista previa en baja resolución; las medidas no cambian");
    expect(levelNoteFor(null, 1, "boom")).toBe("SIN VOLUMEN COMPLETO");
    expect(levelNoteFor(null, 1, "boom", true)).toBe("SIN COMPLETO");
  });
});

describe("F1-119: volumeStateLabel", () => {
  it("estado de carga y estado vacío distintos", () => {
    // Antes salía «SIN VOLUMEN» mientras la meta aún se estaba pidiendo.
    expect(volumeStateLabel({ series: true, webgl2: true, error: null })).toBe("CARGANDO VOLUMEN…");
    expect(volumeStateLabel({ series: true, webgl2: true, error: "boom" })).toBe("SIN VOLUMEN");
    expect(volumeStateLabel({ series: true, webgl2: false, error: null })).toBe("SIN VOLUMEN · SIN WEBGL2");
    // Sin serie no hay nada que cargar: decir «CARGANDO» sería esperar para nada.
    expect(volumeStateLabel({ series: false, webgl2: true, error: null })).toBe("SIN VOLUMEN");
  });
});
