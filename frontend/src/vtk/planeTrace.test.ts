import { describe, expect, it } from "vitest";
import { planeCorners, toPixels, traceVisible, traceVisibleForNormal, tracePolygon } from "./planeTrace";

describe("planeCorners", () => {
  it("devuelve el rectángulo del volumen en el plano z = pos", () => {
    const c = planeCorners([0, 10, 0, 20, 0, 30], 2, 7);
    expect(c).toEqual([[0, 0, 7], [10, 0, 7], [10, 20, 7], [0, 20, 7]]);
  });
  it("en el eje x fija x", () => {
    expect(planeCorners([0, 10, 0, 20, 0, 30], 0, 3).every((p) => p[0] === 3)).toBe(true);
  });
});

describe("traceVisible", () => {
  it("se oculta cuando la cámara mira el plano de canto", () => {
    expect(traceVisible([1, 0, 0], 2)).toBe(false);          // mirando a lo largo de x, plano z: de canto
    expect(traceVisible([0, 0, -1], 2)).toBe(true);          // de frente
    expect(traceVisible([Math.cos(0.1), 0, Math.sin(0.1)], 2)).toBe(true);   // 5,7° > 5°
    expect(traceVisible([Math.cos(0.05), 0, Math.sin(0.05)], 2)).toBe(false); // 2,9° < 5°
  });
});

describe("toPixels y tracePolygon", () => {
  it("convierte display normalizado (y hacia arriba) en píxeles (y hacia abajo)", () => {
    expect(toPixels([0.5, 0.5], 400, 200)).toEqual({ x: 200, y: 100 });
    expect(toPixels([0, 1], 400, 200)).toEqual({ x: 0, y: 0 });
  });
  it("escribe los puntos para el polígono SVG", () => {
    expect(tracePolygon([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe("1,2 3.5,4");
  });
});

describe("traceVisibleForNormal", () => {
  it("traceVisibleForNormal oculta la traza cuando la cámara mira de canto al plano", () => {
    expect(traceVisibleForNormal([0, 0, 1], [0, 0, 1])).toBe(true);
    expect(traceVisibleForNormal([1, 0, 0], [0, 0, 1])).toBe(false);
    expect(traceVisibleForNormal([Math.sin(4 * Math.PI / 180), 0, Math.cos(4 * Math.PI / 180)], [1, 0, 0])).toBe(false);
  });
});
