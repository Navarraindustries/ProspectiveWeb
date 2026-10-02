import { describe, expect, it } from "vitest";
import { dragAngles, obliqueReadout, wheelOffset } from "./obliqueGestures";
const p0 = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
describe("gestos del oblicuo", () => {
  it("arrastrar 40 px a la derecha y 20 px arriba gira 20° de azimut y sube 10° de elevación", () => {
    expect(dragAngles(p0, 40, -20)).toEqual({ azimuthDeg: 20, elevationDeg: 10, offsetMm: 0 });
  });
  it("el arrastre no pasa de ±89° de elevación ni de ±180° de azimut", () => {
    expect(dragAngles(p0, 1000, -1000)).toEqual({ azimuthDeg: 180, elevationDeg: 89, offsetMm: 0 });
  });
  it("la rueda mueve el desplazamiento un paso por evento", () => {
    expect(wheelOffset(p0, 100, 0.32).offsetMm).toBeCloseTo(0.32, 9);
    expect(wheelOffset(p0, -100, 0.32).offsetMm).toBeCloseTo(-0.32, 9);
  });
  it("la lectura usa coma decimal y signo", () => {
    expect(obliqueReadout({ azimuthDeg: 20, elevationDeg: -10, offsetMm: 3.25 })).toBe("AZ 20° · EL −10° · +3,3 mm");
    expect(obliqueReadout({ azimuthDeg: 0, elevationDeg: 0, offsetMm: -0.5 })).toBe("AZ 0° · EL 0° · −0,5 mm");
  });
});
