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
  it("cada valor de cada sección tiene etiqueta no vacía", () => {
    const secciones: [Record<string, string>, readonly string[]][] = [
      [ETIQUETAS.peinado, PEINADOS], [ETIQUETAS.pelo, COLORES_PELO], [ETIQUETAS.cabeza, CABEZAS],
      [ETIQUETAS.ojos, OJOS], [ETIQUETAS.pijama, PIJAMAS], [ETIQUETAS.fondo, FONDOS],
    ];
    for (const [et, lista] of secciones) {
      expect(Object.keys(et).sort()).toEqual([...lista].sort());
      for (const v of lista) expect(et[v].trim()).not.toBe("");
    }
    expect(ETIQUETAS.piel).toHaveLength(PIELES.length);
    ETIQUETAS.piel.forEach((e) => expect(e.trim()).not.toBe(""));
  });
  it("«nada» se lee según la sección", () => {
    expect(ETIQUETAS.cabeza.nada).toBe("Sin gorro");
    expect(ETIQUETAS.ojos.nada).toBe("Sin gafas");
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

describe("configPorDefecto: valores fijos", () => {
  // Si este test cambia, cambia el avatar por defecto de TODAS las cuentas que no
  // eligieron el suyo. Tocar el hash o el orden de las listas solo a propósito.
  it.each([
    [1, { v: 1, piel: 1, peinado: "rapado", pelo: "#A4492A", cabeza: "gorro_amplio", ojos: "lupas", mascarilla: false, pijama: "#E0A84A", fondo: "#10233D" }],
    [2, { v: 1, piel: 1, peinado: "rizado", pelo: "#A4492A", cabeza: "nada", ojos: "nada", mascarilla: false, pijama: "#4A5263", fondo: "#12141A" }],
    [7, { v: 1, piel: 1, peinado: "rizado", pelo: "#121212", cabeza: "nada", ojos: "gafas", mascarilla: false, pijama: "#B5485A", fondo: "#10233D" }],
    [42, { v: 1, piel: 4, peinado: "largo", pelo: "#121212", cabeza: "gorro", ojos: "gafas", mascarilla: false, pijama: "#B5485A", fondo: "#0F2E28" }],
    [1000, { v: 1, piel: 4, peinado: "mono", pelo: "#A4492A", cabeza: "gorro_amplio", ojos: "nada", mascarilla: false, pijama: "#E0A84A", fondo: "#10233D" }],
  ])("id %i", (id, esperado) => {
    expect(configPorDefecto(id)).toEqual(esperado);
  });
});
