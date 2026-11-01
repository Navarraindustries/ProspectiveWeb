import { describe, it, expect } from "vitest";
import { zonaLibre, BANDA_SUPERIOR, MARGEN_INSPECTOR, HOJA_ASOMAR } from "./zonaLibre";

describe("zonaLibre", () => {
  it("escritorio desplegado: deja sitio al inspector de 380 y sus márgenes", () => {
    expect(zonaLibre({ estrecho: false, plegado: false, ancho: false })).toEqual({ top: 72, right: 428, bottom: 0, left: 0 });
  });
  it("inspector ancho (520)", () => {
    expect(zonaLibre({ estrecho: false, plegado: false, ancho: true }).right).toBe(568);
  });
  it("plegado: el visor gana todo el ancho", () => {
    expect(zonaLibre({ estrecho: false, plegado: true, ancho: true }).right).toBe(0);
  });
  it("estrecho: reserva la hoja asomada y no depende de su altura", () => {
    for (const hoja of [undefined, "asomar", "media", "completa"] as const) {
      expect(zonaLibre({ estrecho: true, plegado: false, ancho: true, hoja })).toEqual({ top: 72, right: 0, bottom: 96, left: 0 });
    }
  });
  it("constantes", () => {
    expect([BANDA_SUPERIOR, MARGEN_INSPECTOR, HOJA_ASOMAR]).toEqual([72, 24, 96]);
  });
});
