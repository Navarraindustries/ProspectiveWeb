import { describe, expect, it } from "vitest";
import {
  CABECEO_MAX, MIRADA_AL_FRENTE, RECORRIDO_MM_S, REBOBINADO_MM_S, SIN_TECLAS, finDeLinea, girarMirada,
  pasoPaseo, poseConMirada, velocidadObjetivo, type WalkPose,
} from "./vesselWalk";
import type { CenterlineTrack } from "./centerlineWalk";

const near = (a: number[], b: number[], tol = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < tol);

describe("mirada durante el recorrido", () => {
  const p: WalkPose = { position: [0, 0, 0], focalPoint: [0, 0, 4], viewUp: [0, 1, 0] };

  it("al frente no cambia nada", () => {
    expect(poseConMirada(p, MIRADA_AL_FRENTE)).toBe(p);
  });

  it("90° de guiñada mira de lado sin moverse; 180° mira hacia atrás", () => {
    const q = poseConMirada(p, { guinada: 90, cabeceo: 0 });
    expect(q.position).toEqual([0, 0, 0]);
    expect(near(q.focalPoint, [4, 0, 0], 1e-9)).toBe(true);
    const atras = poseConMirada(p, { guinada: 180, cabeceo: 0 });
    expect(near(atras.focalPoint, [0, 0, -4], 1e-9)).toBe(true);
  });

  it("el cabeceo sube la mirada y el arriba se queda perpendicular", () => {
    const q = poseConMirada(p, { guinada: 0, cabeceo: 90 });
    expect(near(q.focalPoint, [0, 4, 0], 1e-9) || near(q.focalPoint, [0, -4, 0], 1e-9)).toBe(true);
    const f = q.focalPoint, u = q.viewUp;
    expect(Math.abs(f[0] * u[0] + f[1] * u[1] + f[2] * u[2])).toBeLessThan(1e-9);
  });

  it("arrastrar acumula, da la vuelta en ±180 y topa el cabeceo", () => {
    expect(girarMirada(MIRADA_AL_FRENTE, 100, 0).guinada).toBeCloseTo(30);
    expect(girarMirada({ guinada: 170, cabeceo: 0 }, 100, 0).guinada).toBeCloseTo(-160);
    expect(girarMirada(MIRADA_AL_FRENTE, 0, 10_000).cabeceo).toBe(CABECEO_MAX);
  });
});

describe("avance con teclas y en automático", () => {
  it("las teclas mandan sobre el modo; Mayús va más rápido", () => {
    expect(velocidadObjetivo("avance", SIN_TECLAS)).toBe(RECORRIDO_MM_S);
    expect(velocidadObjetivo("rebobinado", SIN_TECLAS)).toBe(-REBOBINADO_MM_S);
    expect(velocidadObjetivo("quieto", SIN_TECLAS)).toBe(0);
    expect(velocidadObjetivo("avance", { adelante: false, atras: true, rapido: false })).toBe(-RECORRIDO_MM_S);
    expect(velocidadObjetivo("quieto", { adelante: true, atras: false, rapido: true })).toBeGreaterThan(RECORRIDO_MM_S);
    expect(velocidadObjetivo("quieto", { adelante: true, atras: true, rapido: false })).toBe(0);
  });

  const simular = (s: number, objetivo: number, L: number, segundos: number) => {
    let st = { s, v: 0 };
    for (let t = 0; t < segundos; t += 1 / 60) st = pasoPaseo(st.s, st.v, 1 / 60, objetivo, L);
    return st;
  };

  it("arranca suave, llega al final y se para justo en él", () => {
    const uno = pasoPaseo(0, 0, 1 / 60, RECORRIDO_MM_S, 40);
    expect(uno.s).toBeGreaterThan(0);
    expect(uno.v).toBeLessThan(RECORRIDO_MM_S);
    const fin = simular(0, RECORRIDO_MM_S, 40, 10);
    expect(fin.s).toBe(40);
    expect(fin.v).toBe(0);
  });

  it("con la rampa de las teclas, un toque de 0,1 s ya se nota", () => {
    let lento = { s: 10, v: 0 }, rapido = { s: 10, v: 0 };
    for (let i = 0; i < 6; i++) {
      lento = pasoPaseo(lento.s, lento.v, 1 / 60, RECORRIDO_MM_S, 40);
      rapido = pasoPaseo(rapido.s, rapido.v, 1 / 60, RECORRIDO_MM_S, 40, 0.15);
    }
    expect(rapido.s - 10).toBeGreaterThan(2 * (lento.s - 10));
  });

  it("retrocede hasta el origen sin pasarse", () => {
    expect(simular(10, -RECORRIDO_MM_S, 40, 5).s).toBe(0);
  });

  it("al soltar la tecla frena y se queda donde va", () => {
    const yendo = simular(0, RECORRIDO_MM_S, 40, 2);
    let st = yendo;
    for (let i = 0; i < 120; i++) st = pasoPaseo(st.s, st.v, 1 / 60, 0, 40);
    expect(st.v).toBe(0);
    expect(st.s).toBeGreaterThan(yendo.s);
    expect(st.s).toBeLessThan(40);
  });
});

describe("hasta dónde llega", () => {
  const t = (endsInLesion: boolean): CenterlineTrack => ({ points: [[0, 0, 0], [0, 0, 20]], radiiMm: [1, 1], arcMm: [0, 20], endsInLesion });
  it("dentro de la lesión hasta el final; a un destino marcado, se para antes de la pared", () => {
    expect(finDeLinea(t(true))).toBe(20);
    expect(finDeLinea(t(false))).toBeLessThan(20);
  });
});
