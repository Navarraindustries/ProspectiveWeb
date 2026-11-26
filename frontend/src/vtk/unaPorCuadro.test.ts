import { describe, expect, it } from "vitest";
import { unaPorCuadro } from "./unaPorCuadro";

function relojFalso() {
  const cola = new Map<number, () => void>();
  let n = 0;
  return {
    raf: (f: () => void) => { cola.set(++n, f); return n; },
    cancelar: (id: number) => { cola.delete(id); },
    cuadro: () => { const fs = [...cola.values()]; cola.clear(); fs.forEach((f) => f()); },
  };
}

describe("una pose por cuadro (FE-18)", () => {
  it("de muchos movimientos en un cuadro, aplica solo el último", () => {
    const r = relojFalso(); const aplicadas: number[] = [];
    const u = unaPorCuadro<number>((v) => aplicadas.push(v), r.raf, r.cancelar);
    [1, 2, 3, 4].forEach((v) => u.programar(v));
    expect(aplicadas).toEqual([]);
    r.cuadro();
    expect(aplicadas).toEqual([4]);
    u.programar(5); r.cuadro();
    expect(aplicadas).toEqual([4, 5]);
  });
  it("al soltar aplica la última sin esperar al cuadro, y no la repite", () => {
    const r = relojFalso(); const aplicadas: number[] = [];
    const u = unaPorCuadro<number>((v) => aplicadas.push(v), r.raf, r.cancelar);
    u.programar(7); u.programar(8); u.soltar();
    expect(aplicadas).toEqual([8]);
    r.cuadro();
    expect(aplicadas).toEqual([8]);
  });
  it("al cancelar no aplica lo pendiente", () => {
    const r = relojFalso(); const aplicadas: number[] = [];
    const u = unaPorCuadro<number>((v) => aplicadas.push(v), r.raf, r.cancelar);
    u.programar(9); u.descartar(); r.cuadro();
    expect(aplicadas).toEqual([]);
  });
});
