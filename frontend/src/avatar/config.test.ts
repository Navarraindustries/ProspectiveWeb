import { describe, expect, it } from "vitest";
import listas from "./listas.json";
import {
  PIELES, PEINADOS, COLORES_PELO, CABEZAS, OJOS, PIJAMAS, FONDOS, ETIQUETAS,
  configPorDefecto, configAleatoria,
} from "./config";

describe("listas", () => {
  it("coinciden con listas.json", () => {
    expect([...PIELES]).toEqual(listas.pieles);
    expect([...PEINADOS]).toEqual(listas.peinados);
    expect([...COLORES_PELO]).toEqual(listas.coloresPelo);
    expect([...CABEZAS]).toEqual(listas.cabezas);
    expect([...OJOS]).toEqual(listas.ojos);
    expect([...PIJAMAS]).toEqual(listas.pijamas);
    expect([...FONDOS]).toEqual(listas.fondos);
  });
  it("todas las opciones tienen etiqueta", () => {
    for (const l of [PEINADOS, CABEZAS, OJOS, COLORES_PELO, PIJAMAS, FONDOS])
      for (const v of l) expect(ETIQUETAS[v]).toBeTruthy();
    expect(ETIQUETAS_PIEL).toHaveLength(PIELES.length);
  });
});

function valida(c: ReturnType<typeof configPorDefecto>) {
  expect(c.v).toBe(1);
  expect(c.piel).toBeGreaterThanOrEqual(0);
  expect(c.piel).toBeLessThan(PIELES.length);
  expect(PEINADOS).toContain(c.peinado);
  expect(COLORES_PELO).toContain(c.pelo);
  expect(CABEZAS).toContain(c.cabeza);
  expect(OJOS).toContain(c.ojos);
  expect(PIJAMAS).toContain(c.pijama);
  expect(FONDOS).toContain(c.fondo);
}

describe("configPorDefecto", () => {
  it("es determinista y varía con el usuario", () => {
    const a = configPorDefecto(42);
    expect(configPorDefecto(42)).toEqual(a);
    expect(configPorDefecto(43)).not.toEqual(a);
    expect(a.mascarilla).toBe(false);
    valida(a);
    for (let i = 0; i < 50; i++) valida(configPorDefecto(i));
  });
  it("aleatoria es válida", () => {
    for (let i = 0; i < 50; i++) valida(configAleatoria());
    valida(configAleatoria(() => 0.999999));
    valida(configAleatoria(() => 0));
  });
});
