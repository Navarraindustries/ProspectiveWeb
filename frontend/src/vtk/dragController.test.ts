// frontend/src/vtk/dragController.test.ts
import { describe, expect, it } from "vitest";
import { angleAround, pixelRay, screenToAxis, screenToPlane, screenToSphere } from "./dragController";
const ortho = { position: [0, 0, 100] as [number, number, number], focalPoint: [0, 0, 0] as [number, number, number], viewUp: [0, 1, 0] as [number, number, number], parallel: true, parallelScale: 10, viewAngleDeg: 30 };
const persp = { ...ortho, parallel: false };
const vp = { width: 200, height: 100 };
const close = (a: number[] | null, b: number[]) => { expect(a).not.toBeNull(); a!.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6)); };

describe("pixelRay", () => {
  it("ortográfica: el centro mira a −z desde el foco desplazado y el borde derecho está a parallelScale·aspecto", () => {
    close(pixelRay(ortho, vp, 100, 50).dir, [0, 0, -1]);
    close(pixelRay(ortho, vp, 200, 50).origin.slice(0, 2), [20, 0]);
    close(pixelRay(ortho, vp, 100, 0).origin.slice(0, 2), [0, 10]);
  });
  it("perspectiva: el centro mira a −z y los bordes abren tan(ángulo/2)", () => {
    close(pixelRay(persp, vp, 100, 50).dir, [0, 0, -1]);
    const r = pixelRay(persp, vp, 100, 0).dir;
    expect(r[1] / -r[2]).toBeCloseTo(Math.tan((15 * Math.PI) / 180), 6);
  });
});
describe("screenToPlane / Axis / Sphere / angleAround", () => {
  it("plano z=0: el píxel (150,50) cae en x=10", () => { close(screenToPlane(ortho, vp, 150, 50, { origin: [0, 0, 0], normal: [0, 0, 1] }), [10, 0, 0]); });
  it("plano paralelo al rayo → null", () => { expect(screenToPlane(ortho, vp, 150, 50, { origin: [0, 0, 0], normal: [1, 0, 0] })).toBeNull(); });
  it("eje x por el origen: el píxel (150,50) da t=10; eje paralelo al rayo → null", () => {
    expect(screenToAxis(ortho, vp, 150, 50, { origin: [0, 0, 0], dir: [1, 0, 0] })).toBeCloseTo(10, 6);
    expect(screenToAxis(ortho, vp, 150, 50, { origin: [0, 0, 0], dir: [0, 0, 1] })).toBeNull();
  });
  it("esfera de radio 5 en el origen: el centro corta en z=5 (la cara cercana); fuera → null", () => {
    close(screenToSphere(ortho, vp, 100, 50, { center: [0, 0, 0], r: 5 }), [0, 0, 5]);
    expect(screenToSphere(ortho, vp, 190, 50, { center: [0, 0, 0], r: 5 })).toBeNull();
  });
  it("angleAround crece en sentido antihorario visto desde la normal", () => {
    const a0 = angleAround(ortho, vp, 150, 50, [0, 0, 0], [0, 0, 1])!;
    const a1 = angleAround(ortho, vp, 100, 0, [0, 0, 0], [0, 0, 1])!;
    expect(((a1 - a0 + 2 * Math.PI) % (2 * Math.PI))).toBeCloseTo(Math.PI / 2, 6);
  });
});
