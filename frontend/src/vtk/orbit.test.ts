// frontend/src/vtk/orbit.test.ts
import { describe, expect, it } from "vitest";
import { boundsCenter, rotationCenterMm, visibleBounds, visiblePoints, type Bounds6 } from "./orbit";
import type { VolumeMeta } from "../api/types";
const B: Bounds6 = [0, 30, 0, 20, 0, 10];
const meta = { shape: [11, 21, 31], spacing: [1, 1, 1] } as unknown as VolumeMeta;
describe("rotationCenterMm", () => {
  it("es el punto compartido en mm", () => { expect(rotationCenterMm({ x: 3, y: 4, z: 5 }, meta)).toEqual([3, 4, 5]); });
});
describe("visibleBounds en eje", () => {
  it("acumulado recorta hasta el corte, y desde el final a partir de él", () => {
    expect(visibleBounds(B, { mode: "eje", axis: 2, posMm: 4, acumulado: true, reverse: false, slabMm: 0 })).toEqual([0, 30, 0, 20, 0, 4]);
    expect(visibleBounds(B, { mode: "eje", axis: 2, posMm: 4, acumulado: true, reverse: true, slabMm: 0 })).toEqual([0, 30, 0, 20, 4, 10]);
  });
  it("lámina recorta ±slab y se acota a la caja", () => {
    expect(visibleBounds(B, { mode: "eje", axis: 0, posMm: 2, acumulado: false, reverse: false, slabMm: 5 })).toEqual([0, 7, 0, 20, 0, 10]);
  });
  it("en el borde nunca degenera: extensión mínima 1 mm", () => {
    const v = visibleBounds(B, { mode: "eje", axis: 2, posMm: 0, acumulado: true, reverse: false, slabMm: 0 });
    expect(v[5] - v[4]).toBeGreaterThanOrEqual(1);
    const w = visibleBounds(B, { mode: "eje", axis: 2, posMm: 10, acumulado: true, reverse: true, slabMm: 0 });
    expect(w[5] - w[4]).toBeGreaterThanOrEqual(1);
  });
  it("con caja LOCAL lo visible es la intersección del corte con la caja", () => {
    const v = visibleBounds([0, 100, 0, 100, 0, 100], { mode: "eje", axis: 2, posMm: 45, acumulado: true, reverse: false, slabMm: 5, box: [40, 60, 40, 60, 40, 60] });
    expect(v).toEqual([40, 60, 40, 60, 40, 45]);
  });
});
describe("visibleBounds en libre", () => {
  it("acumulado conserva el lado (v − o)·n ≤ 0 y el polígono", () => {
    const poly = [[0, 0, 5], [30, 0, 5], [30, 20, 5], [0, 20, 5]] as [number, number, number][];
    const v = visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: poly, acumulado: true, reverse: false, slabMm: 0 });
    expect(v).toEqual([0, 30, 0, 20, 0, 5]);
    const w = visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: poly, acumulado: true, reverse: true, slabMm: 0 });
    expect(w).toEqual([0, 30, 0, 20, 5, 10]);
  });
  it("lámina libre es la caja de los dos polígonos", () => {
    const a = [[0, 0, 3], [30, 0, 3], [30, 20, 3], [0, 20, 3]] as [number, number, number][];
    const b = [[0, 0, 7], [30, 0, 7], [30, 20, 7], [0, 20, 7]] as [number, number, number][];
    expect(visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 5], polygon: a, polygons: [a, b], acumulado: false, reverse: false, slabMm: 2 })).toEqual([0, 30, 0, 20, 3, 7]);
  });
  it("lámina libre oblicua incluye las esquinas de la caja que caen entre los dos planos", () => {
    // Plano x + z = 20 (normal oblicua), lámina ±8 mm: la esquina (30,·,0) está a
    // d = (30 + 0 − 20)/√2 ≈ 7 mm, dentro de la lámina, pero ningún polígono pasa
    // de x ≈ 25,7: sin la esquina, ENCUADRAR dejaría ese trozo fuera del encuadre.
    const s = Math.SQRT1_2, n: [number, number, number] = [s, 0, s], o: [number, number, number] = [15, 10, 5];
    const at = (k: number) => [[15 + k * s - 5, 0, 5 + k * s + 5], [15 + k * s + 5, 0, 5 + k * s - 5], [15 + k * s + 5, 20, 5 + k * s - 5], [15 + k * s - 5, 20, 5 + k * s + 5]] as [number, number, number][];
    const v = visibleBounds(B, { mode: "libre", normal: n, originMm: o, polygon: at(0), polygons: [at(-8), at(8)], acumulado: false, reverse: false, slabMm: 8 });
    expect(v[1]).toBe(30);
    expect(v[4]).toBe(0);
  });
  it("sin polígono (plano fuera de la caja) devuelve la caja entera", () => {
    expect(visibleBounds(B, { mode: "libre", normal: [0, 0, 1], originMm: [15, 10, 50], polygon: [], acumulado: true, reverse: false, slabMm: 0 })).toEqual(B);
  });
});
describe("visiblePoints", () => {
  it("en eje son las 8 esquinas de la caja visible", () => {
    const p = visiblePoints(B, { mode: "eje", axis: 2, posMm: 4, acumulado: true, reverse: false, slabMm: 0 });
    expect(p).toHaveLength(8);
    expect(Math.max(...p.map((q) => q[2]))).toBe(4);
  });
  it("en libre oblicuo acumulado deja fuera la esquina cortada", () => {
    // Plano x + y + z = 50 por (20,20,10), normal (1,1,1)/√3: la esquina (30,20,10)
    // está delante (d > 0) y no es visible; el resto de esquinas, detrás.
    const k = 1 / Math.sqrt(3), n: [number, number, number] = [k, k, k];
    const poly = [[30, 20, 0], [30, 10, 10], [20, 20, 10]] as [number, number, number][];
    const p = visiblePoints(B, { mode: "libre", normal: n, originMm: [20, 20, 10], polygon: poly, acumulado: true, reverse: false, slabMm: 0 });
    expect(p.some((q) => q[0] === 30 && q[1] === 20 && q[2] === 10)).toBe(false);
    expect(p.some((q) => q[0] === 0 && q[1] === 0 && q[2] === 0)).toBe(true);
    expect(p).toHaveLength(7 + 3);
  });
});
it("boundsCenter", () => { expect(boundsCenter(B)).toEqual([15, 10, 5]); });
