// frontend/src/vtk/clipPose.test.ts
import { describe, expect, it } from "vitest";
import { applyPoint, axisRotation, clampTilt, invert, multiply, neckFrameAngles, neckFrameNormal, poseDelta, poseMatrix, IDENTITY } from "./clipPose";
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("poseMatrix reproduce pose_transform", () => {
  it("normal +z y rotación 0 es una traslación", () => {
    close(applyPoint(poseMatrix([1, 2, 3], [0, 0, 1], 0), [0, 0, 5]), [1, 2, 8]);
  });
  it("normal −z gira 180° alrededor de x", () => {
    close(applyPoint(poseMatrix([0, 0, 0], [0, 0, -1], 0), [0, 1, 0]), [0, -1, 0]);
    close(applyPoint(poseMatrix([0, 0, 0], [0, 0, -1], 0), [0, 0, 1]), [0, 0, -1]);
  });
  it("normal +x lleva el eje local z a x", () => {
    close(applyPoint(poseMatrix([0, 0, 0], [1, 0, 0], 0), [0, 0, 1]), [1, 0, 0]);
  });
  it("la rotación es alrededor del z local, antes de alinear", () => {
    close(applyPoint(poseMatrix([0, 0, 0], [0, 0, 1], 90), [1, 0, 0]), [0, 1, 0]);
    close(applyPoint(poseMatrix([0, 0, 0], [1, 0, 0], 90), [1, 0, 0]), [0, 1, 0]);   // z→x deja y en y; el giro de 90° en z local manda x local a y local
  });
});

describe("invert / multiply / poseDelta", () => {
  it("m · inv(m) es la identidad", () => {
    const m = poseMatrix([3, -2, 7], [0.3, 0.4, 0.866], 33);
    close(multiply(m, invert(m)), IDENTITY);
  });
  it("poseDelta(p, p) es la identidad y poseDelta(a, b) lleva puntos de a a b", () => {
    const a = { position: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], rotationDeg: 0 };
    const b = { position: [5, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], rotationDeg: 90 };
    close(poseDelta(a, a), IDENTITY);
    close(applyPoint(poseDelta(a, b), [1, 0, 0]), [5, 1, 0]);
  });
});

describe("marco del cuello", () => {
  it("0/0 devuelve el eje; sin eje, +z", () => {
    close(neckFrameNormal([0, 1, 0], 0, 0), [0, 1, 0]);
    close(neckFrameNormal(null, 0, 0), [0, 0, 1]);
    close(neckFrameNormal([0, 0, 0], 0, 0), [0, 0, 1]);
  });
  it("con eje +z la normal es la de freePlane y los ángulos se recuperan", () => {
    const n = neckFrameNormal([0, 0, 1], 30, 40);
    close(n, [Math.sin(40 * Math.PI / 180) * Math.sin(30 * Math.PI / 180), Math.sin(40 * Math.PI / 180) * Math.cos(30 * Math.PI / 180), Math.cos(40 * Math.PI / 180)]);
    const a = neckFrameAngles([0, 0, 1], n);
    expect(a.azimuthDeg).toBeCloseTo(30, 5); expect(a.elevationDeg).toBeCloseTo(40, 5);
  });
  it("con un eje inclinado los ángulos también se recuperan", () => {
    const axis: [number, number, number] = [0.6, 0, 0.8];
    const n = neckFrameNormal(axis, -70, 25);
    const a = neckFrameAngles(axis, n);
    expect(a.azimuthDeg).toBeCloseTo(-70, 4); expect(a.elevationDeg).toBeCloseTo(25, 4);
  });
  it("clampTilt acota a 60° y a ±180°", () => {
    expect(clampTilt({ azimuthDeg: 200, elevationDeg: 95 })).toEqual({ azimuthDeg: 180, elevationDeg: 60 });
    expect(clampTilt({ azimuthDeg: -10, elevationDeg: -5 })).toEqual({ azimuthDeg: -10, elevationDeg: 0 });
  });
});

describe("IDENTITY compartida", () => {
  it("está congelada y axisRotation devuelve una copia que se puede modificar", () => {
    expect(Object.isFrozen(IDENTITY)).toBe(true);
    const r = axisRotation([0, 0, 1]);
    expect(r).toEqual(IDENTITY);
    expect(r).not.toBe(IDENTITY);
    r[3] = 5;
    expect(IDENTITY[3]).toBe(0);
    expect(axisRotation([0, 0, 0])).not.toBe(IDENTITY);
  });
});
