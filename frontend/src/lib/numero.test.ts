import { describe, expect, it } from "vitest";
import { cifra, coordenadas, mm } from "./numero";

describe("cifra", () => {
  it("usa coma decimal y un decimal por defecto", () => {
    expect(cifra(11)).toBe("11,0");
    expect(cifra(3.14159, 2)).toBe("3,14");
    expect(cifra(7.6, 0)).toBe("8");
  });
  it("sin valor pinta una raya, nunca NaN", () => {
    expect(cifra(null)).toBe("—");
    expect(cifra(undefined)).toBe("—");
    expect(cifra(NaN)).toBe("—");
    expect(cifra(Infinity)).toBe("—");
  });
  it("-0 y lo que redondea a cero no llevan signo", () => {
    expect(cifra(-0)).toBe("0,0");
    expect(cifra(-0.04)).toBe("0,0");
    expect(cifra(-0.004, 2)).toBe("0,00");
    expect(cifra(-0.4, 0)).toBe("0");
  });
  it("conserva el signo de un negativo real", () => {
    expect(cifra(-2.5)).toBe("-2,5");
    expect(cifra(-2.5, 1, { menosTipografico: true })).toBe("−2,5");
  });
});

describe("mm", () => {
  it("añade la unidad", () => {
    expect(mm(11)).toBe("11,0 mm");
    expect(mm(2.345, 2)).toBe("2,35 mm");
  });
  it("sin valor, solo la raya", () => {
    expect(mm(null)).toBe("—");
    expect(mm(NaN)).toBe("—");
  });
});

describe("coordenadas", () => {
  it("separa los ejes con punto y coma", () => {
    expect(coordenadas([1.5, 2.25, -4.1])).toBe("(1,5; 2,3; −4,1)");
    expect(coordenadas(null)).toBe("—");
  });
});
