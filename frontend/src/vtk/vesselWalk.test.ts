import { describe, expect, it } from "vitest";
import type { CenterlineTrack } from "./centerlineWalk";
import type { Vec3 } from "./geometry";
import { ARRANQUE_S, GIRO_GRADOS, GIRO_MS, MIRA_MM, PARADA_MM, REBOBINADO_MM_S, RECORRIDO_MM_S, arcAtTime, arcRebobinado, diameterAtArc, finRecorrido, giroFinal, longitudRecorrido, pointAtArc, poseGiro, rotarAlrededor, transportUp, walkPose } from "./vesselWalk";

/** Una L: 10 mm por +x y 10 mm por +y, muestras cada 0,5 mm. */
function ele(): CenterlineTrack {
  const points: Vec3[] = [], arcMm: number[] = [], radiiMm: number[] = [];
  for (let i = 0; i <= 20; i++) { points.push([i * 0.5, 0, 0]); arcMm.push(i * 0.5); radiiMm.push(1); }
  for (let i = 1; i <= 20; i++) { points.push([10, i * 0.5, 0]); arcMm.push(10 + i * 0.5); radiiMm.push(2); }
  return { points, arcMm, radiiMm };
}
const cerca = (a: Vec3, b: Vec3, tol = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < tol);

describe("vesselWalk", () => {
  it("interpola el punto y el calibre por arco", () => {
    const t = ele();
    expect(longitudRecorrido(t)).toBe(20);
    expect(cerca(pointAtArc(t, 2.25), [2.25, 0, 0])).toBe(true);
    expect(cerca(pointAtArc(t, 15), [10, 5, 0])).toBe(true);
    expect(cerca(pointAtArc(t, -3), [0, 0, 0])).toBe(true);
    expect(cerca(pointAtArc(t, 99), [10, 10, 0])).toBe(true);
    expect(diameterAtArc(t, 5)).toBeCloseTo(2);
    expect(diameterAtArc(t, 15)).toBeCloseTo(4);
  });

  it("tolera un arco que no empieza en 0", () => {
    const t = ele();
    const desplazada = { ...t, arcMm: t.arcMm.map((a) => a + 7) };
    expect(cerca(pointAtArc(desplazada, 2.25), [2.25, 0, 0])).toBe(true);
  });

  it("mira MIRA_MM por delante por la línea y sigue recto al acabar", () => {
    const t = ele();
    const p = walkPose(t, 0, [0, 0, 1]);
    expect(cerca(p.position, [0, 0, 0])).toBe(true);
    expect(cerca(p.focalPoint, [MIRA_MM, 0, 0])).toBe(true);
    const fin = walkPose(t, 20, [0, 0, 1]);
    // Al final la mirada sigue la dirección de llegada (+y), no se clava.
    expect(cerca(fin.focalPoint, [10, 10 + MIRA_MM, 0])).toBe(true);
  });

  it("el arriba se transporta sin girar la imagen", () => {
    const up = transportUp([0, 0.3, 1], [0, 1, 0]);
    expect(cerca(up, [0, 0, 1])).toBe(true);
    // Arriba paralelo a la marcha: sale una perpendicular.
    const raro = transportUp([0, 0, 1], [0, 0, 1]);
    expect(Math.abs(raro[2])).toBeLessThan(1e-9);
    expect(Math.hypot(...raro)).toBeCloseTo(1);
  });

  it("perfil trapecio: arranca suave, crucero y llega exacto", () => {
    const D = 40;
    const T = D / RECORRIDO_MM_S + ARRANQUE_S;
    expect(arcAtTime(0, 0, D)).toEqual({ s: 0, fin: false });
    // Al acabar de acelerar lleva media rampa recorrida.
    expect(arcAtTime(ARRANQUE_S, 0, D).s).toBeCloseTo(0.5 * RECORRIDO_MM_S * ARRANQUE_S);
    // Simétrico: a mitad de tiempo, mitad de camino.
    expect(arcAtTime(T / 2, 0, D).s).toBeCloseTo(D / 2);
    expect(arcAtTime(T, 0, D)).toEqual({ s: D, fin: true });
    expect(arcAtTime(T + 5, 0, D)).toEqual({ s: D, fin: true });
  });

  it("un tramo corto no llega a crucero y no se pasa", () => {
    let prev = 0;
    for (let t = 0; t < 3; t += 0.05) {
      const { s } = arcAtTime(t, 0, 1);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(s).toBeLessThanOrEqual(1);
      prev = s;
    }
    expect(arcAtTime(10, 0, 1).fin).toBe(true);
  });

  it("la vuelta final da 360° siempre hacia el mismo lado y acaba de frente", () => {
    expect(GIRO_GRADOS).toBe(360);
    expect(giroFinal(0)).toBe(0);
    expect(giroFinal(GIRO_MS)).toBe(0);
    expect(giroFinal(GIRO_MS + 100)).toBe(0);
    expect(giroFinal(GIRO_MS / 2)).toBeCloseTo(180);
    let antes = 0;
    for (let t = 10; t < GIRO_MS; t += 10) {
      const g = giroFinal(t);
      expect(g).toBeGreaterThanOrEqual(antes);   // nunca vuelve atrás
      antes = g;
    }
    expect(antes).toBeGreaterThan(359);
    // Arranque y frenada suaves: el primer y el último décimo giran poco.
    expect(giroFinal(GIRO_MS / 10)).toBeLessThan(10);
    expect(360 - giroFinal(GIRO_MS * 0.9)).toBeLessThan(10);
  });

  it("el giro rota la mirada sobre el arriba sin mover la cámara", () => {
    expect(cerca(rotarAlrededor([1, 0, 0], [0, 0, 1], 90), [0, 1, 0])).toBe(true);
    const p = walkPose(ele(), 0, [0, 0, 1]);
    const g = poseGiro(p, GIRO_MS / 4);
    expect(g.position).toEqual(p.position);
    const mira = [g.focalPoint[0] - g.position[0], g.focalPoint[1] - g.position[1], g.focalPoint[2] - g.position[2]] as Vec3;
    expect(Math.hypot(...mira)).toBeCloseTo(MIRA_MM);
    expect(Math.abs(mira[2])).toBeLessThan(1e-9);   // en el plano perpendicular al arriba
    expect(poseGiro(p, 0)).toBe(p);
  });

  it("se para antes del destino salvo en las líneas muy cortas", () => {
    expect(finRecorrido(20)).toBeCloseTo(20 - PARADA_MM);
    expect(finRecorrido(2 * PARADA_MM)).toBe(2 * PARADA_MM);
    expect(finRecorrido(0)).toBe(0);
  });

  it("sin camino que recorrer ya ha llegado", () => {
    expect(arcAtTime(1, 5, 5)).toEqual({ s: 5, fin: true });
    expect(arcAtTime(1, 6, 5)).toEqual({ s: 6, fin: true });
  });

  it("rebobinar va del final al origen por la misma línea, más deprisa que la ida", () => {
    const D = 60;
    expect(arcRebobinado(0, D, 0)).toEqual({ s: D, fin: false });
    // Arranca suave: tras ARRANQUE_S ha retrocedido lo que acelera a REBOBINADO_MM_S.
    expect(arcRebobinado(ARRANQUE_S, D, 0).s).toBeCloseTo(D - 0.5 * REBOBINADO_MM_S * ARRANQUE_S);
    const T = D / REBOBINADO_MM_S + ARRANQUE_S;
    expect(arcRebobinado(T / 2, D, 0).s).toBeCloseTo(D / 2);
    expect(arcRebobinado(T, D, 0)).toEqual({ s: 0, fin: true });
    expect(T).toBeLessThan(D / RECORRIDO_MM_S);   // tarda menos que la ida
  });

  it("rebobinar siempre retrocede, nunca adelanta", () => {
    let antes = 40;
    for (let t = 0; t <= 4; t += 0.05) {
      const { s } = arcRebobinado(t, 40, 3);
      expect(s).toBeLessThanOrEqual(antes + 1e-9);
      expect(s).toBeGreaterThanOrEqual(3);
      antes = s;
    }
  });
});
