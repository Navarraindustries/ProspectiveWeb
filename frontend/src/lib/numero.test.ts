import { describe, expect, it } from "vitest";
import { cifra, cifraCorta, comaDecimal, coordenadas, mm } from "./numero";

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

describe("cifraCorta", () => {
  it("sin ceros de relleno y con coma", () => {
    expect(cifraCorta(2)).toBe("2");
    expect(cifraCorta(2.5)).toBe("2,5");
    expect(cifraCorta(0.05)).toBe("0,05");
    expect(cifraCorta(0.1 + 0.2)).toBe("0,3");
    expect(cifraCorta(-0)).toBe("0");
    expect(cifraCorta(null)).toBe("—");
    expect(cifraCorta(NaN)).toBe("—");
  });
});

describe("comaDecimal", () => {
  it("cambia el punto entre dígitos y nada más", () => {
    expect(comaDecimal("NAVARRO™ T1 Recto, mordaza 7.5 mm")).toBe("NAVARRO™ T1 Recto, mordaza 7,5 mm");
    expect(comaDecimal("Fin de frase. Otra 3.25 g.")).toBe("Fin de frase. Otra 3,25 g.");
    expect(comaDecimal("ya con coma: 7,5 mm")).toBe("ya con coma: 7,5 mm");
  });
});

describe("coordenadas", () => {
  it("separa los ejes con punto y coma", () => {
    expect(coordenadas([1.5, 2.25, -4.1])).toBe("(1,5; 2,3; −4,1)");
    expect(coordenadas(null)).toBe("—");
  });
});
