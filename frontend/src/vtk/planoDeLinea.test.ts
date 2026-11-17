/* UNI-87: el plano libre no se da la vuelta cuando el vaso cruza la horizontal. */
import { describe, expect, it } from "vitest";
import { planoDeLinea, tangentAt } from "./centerlineWalk";
import { clampPlane, normalOf, planeFromNormal, rightOf, upOf, type FreePlane } from "./freePlane";
import { dragAngles } from "./obliqueGestures";
import type { Vec3 } from "./geometry";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const grados = (a: Vec3, b: Vec3) => (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI;

/** Un «lomo» en el plano vertical de azimut `az`: sube, cruza la horizontal
 *  en el centro y baja (la tangente va de +60° a −60° de inclinación). */
function lomo(azDeg: number, n = 121, r = 20): Vec3[] {
  const a = (azDeg * Math.PI) / 180, h: Vec3 = [Math.sin(a), Math.cos(a), 0];
  return Array.from({ length: n }, (_, i) => {
    const t = (((i / (n - 1)) * 120 - 60) * Math.PI) / 180;
    return [r * Math.sin(t) * h[0] + 50, r * Math.sin(t) * h[1] + 50, r * Math.cos(t) + 50];
  });
}

/** Un vaso casi horizontal que ondula arriba y abajo de z constante. */
function casiHorizontal(n = 200): Vec3[] {
  return Array.from({ length: n }, (_, i) => [50 + i * 0.4, 50 + i * 0.25, 50 + 0.6 * Math.sin(i / 8)]);
}

/** Mayor salto entre secciones consecutivas: de la normal, del «arriba» y de la derecha del corte. */
function mayorSalto(planos: FreePlane[]) {
  let normal = 0, arriba = 0, derecha = 0;
  for (let i = 1; i < planos.length; i++) {
    const p = planos[i - 1], q = planos[i];
    normal = Math.max(normal, grados(normalOf(p), normalOf(q)));
    arriba = Math.max(arriba, grados(upOf(p), upOf(q)));
    derecha = Math.max(derecha, grados(rightOf(p), rightOf(q)));
  }
  return { normal, arriba, derecha };
}

describe("plano libre a lo largo de una línea central (UNI-87)", () => {
  it.each([0, 37, 90, 145, -120])("un vaso que cruza z = 0 en el azimut %i° no da saltos de 180°", (az) => {
    const pts = lomo(az);
    const s = mayorSalto(pts.map((_, i) => planoDeLinea(pts, i)));
    // 120° de giro en 120 pasos: cada paso gira ~1° y la imagen también.
    expect(s.normal).toBeLessThan(3);
    expect(s.arriba).toBeLessThan(3);
    expect(s.derecha).toBeLessThan(3);
  });

  it("antes sí se daba la vuelta: doblar cada sección hacia +z salta al cruzar", () => {
    const pts = lomo(37);
    const s = mayorSalto(pts.map((_, i) => planeFromNormal(tangentAt(pts, i))));
    expect(Math.max(s.normal, s.arriba, s.derecha)).toBeGreaterThan(90);
  });

  it("un vaso casi horizontal que ondula alrededor de z constante tampoco salta", () => {
    const pts = casiHorizontal();
    const s = mayorSalto(pts.map((_, i) => planoDeLinea(pts, i)));
    expect(Math.max(s.normal, s.arriba, s.derecha)).toBeLessThan(3);
  });

  it("cada sección sigue perpendicular al vaso", () => {
    const pts = lomo(145);
    pts.forEach((_, i) => expect(Math.abs(dot(normalOf(planoDeLinea(pts, i)), tangentAt(pts, i)))).toBeCloseTo(1, 6));
  });

  it("el mismo punto da siempre el mismo plano, se llegue desde donde se llegue", () => {
    const pts = lomo(90);
    const ida = pts.map((_, i) => planoDeLinea(pts, i));
    expect(planoDeLinea(pts, 100)).toEqual(ida[100]);
    expect(planoDeLinea(pts, 3)).toEqual(ida[3]);
  });

  it("una línea que baja entera se ve como si subiera: la normal se queda lejos de −z", () => {
    const baja: Vec3[] = Array.from({ length: 10 }, (_, i) => [0, 0.1 * i, 100 - 3 * i]);
    for (let i = 0; i < baja.length; i++) expect(planoDeLinea(baja, i).elevationDeg).toBeLessThan(10);
  });
});

describe("rango de elevación del plano y de los mandos", () => {
  it("el plano puede quedar más allá de 90° y clampPlane lo respeta", () => {
    expect(clampPlane({ azimuthDeg: 0, elevationDeg: 120, offsetMm: 0 }).elevationDeg).toBe(120);
    expect(planeFromNormal([1, 0, -0.5], { conSentido: true }).elevationDeg).toBeGreaterThan(90);
  });

  it("arrastrar desde un plano a 120° no salta a 89° y puede volver al rango", () => {
    const p = { azimuthDeg: 30, elevationDeg: 120, offsetMm: 0 };
    expect(dragAngles(p, 0, 2).elevationDeg).toBeCloseTo(119);
    expect(dragAngles(p, 0, -40).elevationDeg).toBe(120);       // hacia fuera no pasa de donde estaba
    expect(dragAngles(p, 0, 100).elevationDeg).toBeCloseTo(70);
  });
});
