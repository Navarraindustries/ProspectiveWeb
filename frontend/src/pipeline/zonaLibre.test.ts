import { describe, it, expect } from "vitest";
import { zonaLibre, BANDA_SUPERIOR, MARGEN_INSPECTOR, HOJA_ASOMAR, ANCHO_TIRA } from "./zonaLibre";

describe("zonaLibre", () => {
  it("escritorio desplegado: deja sitio al inspector de 380 y sus márgenes", () => {
    expect(zonaLibre({ estrecho: false, plegado: false, ancho: false })).toEqual({ top: 72, right: 428, bottom: 0, left: 0 });
  });
  it("inspector ancho (520)", () => {
    expect(zonaLibre({ estrecho: false, plegado: false, ancho: true }).right).toBe(568);
  });
  it("plegado: el visor gana el ancho del inspector salvo la tira y sus márgenes", () => {
    // 36 + 2·24: la píldora plegada no flota sobre la banda del visor ni la escalera de cortes.
    for (const ancho of [false, true]) {
      expect(zonaLibre({ estrecho: false, plegado: true, ancho })).toEqual({ top: 72, right: 84, bottom: 0, left: 0 });
    }
  });
  it("estrecho: reserva la hoja asomada y no depende de su altura", () => {
    for (const hoja of [undefined, "asomar", "media", "completa"] as const) {
      expect(zonaLibre({ estrecho: true, plegado: false, ancho: true, hoja })).toEqual({ top: 72, right: 0, bottom: 96, left: 0 });
    }
  });
  it("constantes", () => {
    expect([BANDA_SUPERIOR, MARGEN_INSPECTOR, HOJA_ASOMAR, ANCHO_TIRA]).toEqual([72, 24, 96, 36]);
  });
});
