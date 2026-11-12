import { describe, expect, it } from "vitest";
import { flightDurationMs, interpolateCamera, VUELO_MAX_MS, VUELO_MIN_MS } from "./cameraFlight";
import type { CameraState } from "./MeshView";

const st = (position: [number, number, number], focalPoint: [number, number, number], viewUp: [number, number, number], extra: Partial<CameraState> = {}): CameraState =>
  ({ position, focalPoint, viewUp, viewAngle: 30, parallelScale: 50, ...extra });

const norm = (v: number[]) => Math.hypot(...v);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe("interpolateCamera", () => {
  const a = st([0, 0, 100], [0, 0, 0], [0, 1, 0]);
  const b = st([10, 0, 0], [0, 0, 0], [0, 0, 1], { parallelScale: 5, viewAngle: 20 });

  it("sale de A y llega a B exactamente", () => {
    expect(interpolateCamera(a, b, 0)).toEqual(a);
    expect(interpolateCamera(a, b, 1)).toEqual(b);
  });

  it("gira alrededor del foco en vez de atravesar la malla", () => {
    // A mitad de camino la cámara no pasa cerca del foco: la distancia va de
    // 100 a 10 y en medio es la media geométrica (≈ 31,6), no una recta que
    // cortaría por dentro del árbol.
    const m = interpolateCamera(a, b, 0.5);
    const d = norm(sub(m.position, m.focalPoint));
    expect(d).toBeCloseTo(Math.sqrt(100 * 10), 3);
    // La dirección está a 45° de las dos: un arco, no una cuerda.
    const dir = sub(m.position, m.focalPoint).map((x) => x / d);
    expect(dot(dir, [0, 0, 1])).toBeCloseTo(Math.SQRT1_2, 3);
    expect(dot(dir, [1, 0, 0])).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("el «arriba» queda perpendicular a la dirección de vista en todo el vuelo", () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const m = interpolateCamera(a, b, t);
      const dir = sub(m.position, m.focalPoint);
      expect(Math.abs(dot(dir, m.viewUp)) / norm(dir)).toBeLessThan(1e-9);
      expect(norm(m.viewUp)).toBeCloseTo(1, 9);
    }
  });

  it("la escala y el zoom cambian en proporción, no en línea recta", () => {
    const m = interpolateCamera(a, b, 0.5);
    expect(m.parallelScale).toBeCloseTo(Math.sqrt(50 * 5), 6);
    expect(m.viewAngle).toBeCloseTo(25, 6);
  });

  it("el foco se desplaza en línea recta", () => {
    const c = st([0, 0, 100], [20, 0, 0], [0, 1, 0]);
    const m = interpolateCamera(a, c, 0.25);
    expect(m.focalPoint[0]).toBeCloseTo(5, 9);
  });

  it("la cara contraria (180°) gira alrededor del «arriba», sin NaN", () => {
    const contra = st([0, 0, -100], [0, 0, 0], [0, 1, 0]);
    const m = interpolateCamera(a, contra, 0.5);
    expect(m.position.every(Number.isFinite)).toBe(true);
    // A mitad de la media vuelta la cámara mira de lado y conserva el «arriba».
    expect(Math.abs(m.position[1])).toBeLessThan(1e-6);
    expect(norm(m.position)).toBeCloseTo(100, 6);
    expect(m.viewUp[1]).toBeCloseTo(1, 6);
  });

  it("un «arriba» invertido gira alrededor de la dirección de vista", () => {
    const boca = st([0, 0, 100], [0, 0, 0], [0, -1, 0]);
    const m = interpolateCamera(a, boca, 0.5);
    expect(m.viewUp.every(Number.isFinite)).toBe(true);
    expect(Math.abs(m.viewUp[2])).toBeLessThan(1e-9);
    expect(norm(m.viewUp)).toBeCloseTo(1, 9);
  });
});

describe("flightDurationMs", () => {
  const a = st([0, 0, 100], [0, 0, 0], [0, 1, 0]);

  it("sin cambio no hay vuelo", () => {
    expect(flightDurationMs(a, a)).toBe(0);
  });

  it("un desplazamiento pequeño va rápido; media vuelta, al máximo", () => {
    const corto = flightDurationMs(a, st([2, 0, 100], [2, 0, 0], [0, 1, 0]));
    const vuelta = flightDurationMs(a, st([0, 0, -100], [0, 0, 0], [0, 1, 0]));
    expect(corto).toBeGreaterThanOrEqual(VUELO_MIN_MS);
    expect(corto).toBeLessThan(vuelta);
    expect(vuelta).toBe(VUELO_MAX_MS);
  });

  it("acercarse mucho a la lesión cuenta como movimiento", () => {
    const cerca = flightDurationMs(a, st([0, 0, 10], [0, 0, 0], [0, 1, 0]));
    expect(cerca).toBeGreaterThan(VUELO_MIN_MS);
    expect(cerca).toBeLessThanOrEqual(VUELO_MAX_MS);
  });
});
