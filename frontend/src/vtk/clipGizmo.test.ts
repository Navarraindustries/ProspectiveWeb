// frontend/src/vtk/clipGizmo.test.ts
import { describe, expect, it } from "vitest";
import { beginDrag, clipHandles, dragPose, gizmoReadout } from "./clipGizmo";
const cam = { position: [0, 0, 100] as [number, number, number], focalPoint: [0, 0, 0] as [number, number, number], viewUp: [0, 1, 0] as [number, number, number], parallel: true, parallelScale: 10, viewAngleDeg: 30 };
const vp = { width: 200, height: 100 };
const clip = { key: 1, clip_id: "c", name: "C", position: [0, 0, 0] as [number, number, number], rotation_deg: 0, azimuthDeg: 0, elevationDeg: 0 };
const n: [number, number, number] = [0, 0, 1];
describe("clipGizmo", () => {
  it("tres asas en su sitio", () => {
    const h = clipHandles(clip, n);
    expect(h.map((x) => x.id)).toEqual(["clip:move", "clip:roll", "clip:tilt"]);
    expect(h[2].pos).toEqual([0, 0, 6]); expect(h[2].lineTo).toEqual([0, 0, 0]); expect(h[1].radiusMm).toBe(3);
  });
  it("desplazar en el plano del cuello: 50 px a la derecha son 10 mm en x", () => {
    const s = beginDrag("clip:move", clip, n, n, cam, vp, 100, 50, false);
    expect(dragPose("clip:move", s, cam, vp, 150, 50, false)!.position.map((v) => +v.toFixed(6))).toEqual([10, 0, 0]);
  });
  it("con Shift se desplaza a lo largo de la normal", () => {
    const camSide = { ...cam, position: [100, 0, 0] as [number, number, number], viewUp: [0, 0, 1] as [number, number, number] };   // mira desde +x; z es vertical en pantalla
    const s = beginDrag("clip:move", clip, n, n, camSide, vp, 100, 50, true);
    expect(dragPose("clip:move", s, camSide, vp, 100, 25, true)!.position.map((v) => +v.toFixed(6))).toEqual([0, 0, 5]);
  });
  it("girar: un cuarto de vuelta antihoraria son +90° de rotación", () => {
    const s = beginDrag("clip:roll", clip, n, n, cam, vp, 150, 50, false);
    expect(dragPose("clip:roll", s, cam, vp, 100, 0, false)!.rotation_deg).toBeCloseTo(90, 5);
  });
  it("inclinar: arrastrar el extremo del brazo sobre la esfera cambia los ángulos y se acota a 60°", () => {
    const camSide = { ...cam, position: [100, 0, 0] as [number, number, number], viewUp: [0, 0, 1] as [number, number, number] };
    const s = beginDrag("clip:tilt", clip, n, n, camSide, vp, 100, 20, false);         // el brazo apunta a +z (arriba en pantalla)
    const p = dragPose("clip:tilt", s, camSide, vp, 100, 50, false)!;                   // llevado hacia el centro → cerca de 90° → se acota
    expect(p.elevationDeg).toBeCloseTo(60, 5);
  });
  // Revisión de la Tarea 5: el brazo que apunta lejos de la cámara se agarra
  // por la cara de atrás de la esfera; tomar siempre la cercana lo reflejaba.
  it("inclinar con el brazo de espaldas a la cámara: un píxel es un ángulo pequeño, sin reflejo", () => {
    const camBack = { ...cam, position: [0, 0, -100] as [number, number, number] };   // mira hacia +z; la punta (0,0,6) es la cara lejana
    const s = beginDrag("clip:tilt", clip, n, n, camBack, vp, 100, 50, false);
    const p = dragPose("clip:tilt", s, camBack, vp, 101, 50, false)!;               // 0,2 mm al lado
    expect(p.elevationDeg).toBeGreaterThan(0.5);
    expect(p.elevationDeg).toBeLessThan(5);
    const q = dragPose("clip:tilt", s, camBack, vp, 102, 50, false)!;               // y sigue por la misma cara
    expect(q.elevationDeg).toBeGreaterThan(p.elevationDeg);
    expect(q.elevationDeg).toBeLessThan(10);
  });
  it("inclinar sin mover el puntero no salta: se descuenta dónde se agarró el asa", () => {
    const s = beginDrag("clip:tilt", clip, n, n, cam, vp, 102.5, 50, false);        // 0,5 mm al lado de la punta
    expect(dragPose("clip:tilt", s, cam, vp, 102.5, 50, false)!.elevationDeg).toBeCloseTo(0, 6);
  });
  it("sin intersección devuelve null", () => {
    const s = beginDrag("clip:tilt", clip, n, n, cam, vp, 100, 50, false);
    expect(dragPose("clip:tilt", s, cam, vp, 199, 99, false)).toBeNull();
  });
  it("lectura con coma decimal", () => {
    expect(gizmoReadout({ ...clip, position: [12.34, 4.5, 6.78], rotation_deg: 15, azimuthDeg: 0, elevationDeg: 20 })).toBe("CLIP C · 12,3 4,5 6,8 mm · ROT 15° · AZ 0° · EL 20°");
  });
  // De la revisión de la Tarea 3: los bordes que el gesto no debe romper.
  it("girar cruzando ±180° no salta una vuelta entera", () => {
    const s = beginDrag("clip:roll", { ...clip, rotation_deg: 170 }, n, n, cam, vp, 50, 49, false);   // casi −x, ligeramente por encima: ángulo ≈ +π
    const p = dragPose("clip:roll", s, cam, vp, 50, 51, false)!;                                    // casi −x, ligeramente por debajo: ángulo ≈ −π
    expect(Math.abs(p.rotation_deg - 170)).toBeLessThan(5);
  });
  it("con Shift el desplazamiento por la normal se acota a ±50 mm", () => {
    const camNear = { ...cam, position: [1, 0, 100] as [number, number, number] };   // casi a lo largo de la normal: t enorme pero finito
    const s = beginDrag("clip:move", clip, n, n, camNear, vp, 100, 50, true);
    expect(dragPose("clip:move", s, camNear, vp, 150, 50, true)!.position[2]).toBeCloseTo(-50, 6);
  });
  it("el modo del arrastre se fija al empezar: soltar Shift a medias no cambia de gesto", () => {
    const camSide = { ...cam, position: [100, 0, 0] as [number, number, number], viewUp: [0, 0, 1] as [number, number, number] };
    const s = beginDrag("clip:move", clip, n, n, camSide, vp, 100, 50, true);
    expect(dragPose("clip:move", s, camSide, vp, 100, 25, false)!.position.map((v) => +v.toFixed(6))).toEqual([0, 0, 5]);
  });
});
