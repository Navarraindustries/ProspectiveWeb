import { describe, expect, it } from "vitest";
import { anillosMm, bordesEnL, cuerda, mmAPx, vistaL } from "./ivusVirtual";
import type { IvusSection } from "../api/types";

const circulo = (r: number, cx = 0, cy = 0, n = 72) =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]);

describe("IVUS virtual: geometría del panel", () => {
  it("mmAPx pone la línea central en el centro y el borde del campo en el borde", () => {
    expect(mmAPx(0, 0, 10, 200)).toEqual([100, 100]);
    expect(mmAPx(5, -5, 10, 200)).toEqual([200, 0]);
  });

  it("bordesEnL: en un círculo centrado da el radio a cada lado, en cualquier ángulo", () => {
    for (const ang of [0, 37, 90, 145]) {
      const b = bordesEnL(circulo(2), ang)!;
      expect(b[0]).toBeCloseTo(2, 2); expect(b[1]).toBeCloseTo(2, 2);
    }
  });

  it("bordesEnL: con la luz descentrada, cada lado mide lo suyo; sin rodear la línea, null", () => {
    const b = bordesEnL(circulo(2, 1, 0), 0)!;
    expect(b[0]).toBeCloseTo(3, 2); expect(b[1]).toBeCloseTo(1, 2);
    expect(bordesEnL(circulo(1, 5, 5), 0)).toBeNull();
    expect(bordesEnL([], 0)).toBeNull();
  });

  it("cuerda: el diámetro pasa por el centroide y mide 2r", () => {
    const s: IvusSection = { arc_mm: 0, valid: true, centroid: [1, 1], contour: circulo(1.5, 1, 1) };
    const [p, q] = cuerda(s, 90)!;
    expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeCloseTo(3, 2);
    expect((p[0] + q[0]) / 2).toBeCloseTo(1, 2);
    expect(cuerda({ ...s, valid: false }, 90)).toBeNull();
  });

  it("anillos cada 1 mm en campos pequeños y cada 2 mm en grandes, dentro del campo", () => {
    expect(anillosMm(10)).toEqual([1, 2, 3, 4]);
    expect(anillosMm(20)).toEqual([2, 4, 6, 8]);
  });
});

describe("vista longitudinal", () => {
  // Dos secciones 4×4: la primera con una columna clara (u fija), la segunda con una fila clara (v fija).
  const S = 4;
  const pila = new Uint8Array(2 * S * S);
  for (let r = 0; r < S; r++) pila[r * S + 3] = 200;            // sección 0: columna 3 (u > 0)
  for (let c = 0; c < S; c++) pila[S * S + 0 * S + c] = 100;   // sección 1: fila 0 (v < 0)

  it("tiene una columna por sección y S filas", () => {
    expect(vistaL(pila, 2, S, 0).length).toBe(2 * S);
  });

  it("a 0° la fila de arriba es el lado +u; a 90°, el lado +v", () => {
    const l0 = vistaL(pila, 2, S, 0);           // filas × 2 columnas
    expect(l0[0 * 2 + 0]).toBe(200);              // arriba, sección 0: u = +1,5 px → columna 3
    expect(l0[(S - 1) * 2 + 0]).toBe(0);          // abajo: lado −u
    const l90 = vistaL(pila, 2, S, 90);
    expect(l90[(S - 1) * 2 + 1]).toBe(100);       // abajo = −v (fila 0) en la sección 1
    expect(l90[0 * 2 + 1]).toBe(0);
  });
});
