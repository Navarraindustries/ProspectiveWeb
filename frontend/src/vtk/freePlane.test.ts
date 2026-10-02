import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_PLANE, clampOffsetToBox, clampPlane, clipPolygon, normalOf, originOf, rightOf, sliceSegment, upOf } from "./freePlane";
import type { VolumeMeta } from "../api/types";

const meta = { shape: [11, 21, 31], spacing: [1, 1, 1] } as unknown as VolumeMeta;   // caja 30×20×10 mm (x,y,z)
const centre = { x: 15, y: 10, z: 5 };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

describe("normalOf / upOf / rightOf", () => {
  it("0/0 es el plano axial de índices y mira hacia +z", () => {
    expect(normalOf(DEFAULT_FREE_PLANE).map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("la elevación inclina desde +z y el azimut elige el lado", () => {
    const n = normalOf({ azimuthDeg: 90, elevationDeg: 90, offsetMm: 0 });
    expect(n[0]).toBeCloseTo(1, 6); expect(n[2]).toBeCloseTo(0, 6);
  });
  it("arriba y derecha son unitarios y ortogonales a la normal, también a 89°", () => {
    for (const e of [0, 45, 89, -89]) for (const a of [0, 30, 180]) {
      const p = { azimuthDeg: a, elevationDeg: e, offsetMm: 0 };
      const n = normalOf(p), u = upOf(p), r = rightOf(p);
      expect(len(u)).toBeCloseTo(1, 6); expect(len(r)).toBeCloseTo(1, 6);
      expect(dot(u, n)).toBeCloseTo(0, 6); expect(dot(r, n)).toBeCloseTo(0, 6); expect(dot(r, u)).toBeCloseTo(0, 6);
    }
  });
  it("clampPlane acota los ángulos", () => {
    expect(clampPlane({ azimuthDeg: 200, elevationDeg: 95, offsetMm: 3 })).toEqual({ azimuthDeg: 180, elevationDeg: 89, offsetMm: 3 });
  });
});

describe("originOf", () => {
  it("parte del punto compartido y avanza offset por la normal", () => {
    expect(originOf({ ...DEFAULT_FREE_PLANE, offsetMm: 2.5 }, centre, meta)).toEqual([15, 10, 7.5]);
  });
});

describe("clipPolygon", () => {
  it("el plano axial por el centro es el rectángulo de D1 (4 vértices)", () => {
    const poly = clipPolygon(DEFAULT_FREE_PLANE, centre, meta);
    expect(poly).toHaveLength(4);
    expect(poly.every((v) => v[2] === 5)).toBe(true);
    expect(Math.max(...poly.map((v) => v[0]))).toBe(30); expect(Math.max(...poly.map((v) => v[1]))).toBe(20);
  });
  it("un plano diagonal por el centro corta la caja en 6 vértices, ordenados en sentido antihorario visto desde n", () => {
    const p = { azimuthDeg: 30, elevationDeg: 50, offsetMm: 0 };    // normal ≈ (0.38, 0.66, 0.64): corta las 6 aristas sin pasar por ningún vértice
    const poly = clipPolygon(p, centre, meta);
    expect(poly).toHaveLength(6);
    const n = normalOf(p), u = upOf(p), r = rightOf(p);
    const c = poly.reduce((s, v) => [s[0] + v[0] / 6, s[1] + v[1] / 6, s[2] + v[2] / 6], [0, 0, 0]);
    const ang = poly.map((v) => Math.atan2(dot([v[0] - c[0], v[1] - c[1], v[2] - c[2]], u), dot([v[0] - c[0], v[1] - c[1], v[2] - c[2]], r)));
    for (let i = 1; i < ang.length; i++) expect((ang[i] - ang[i - 1] + 2 * Math.PI) % (2 * Math.PI)).toBeLessThan(Math.PI);
    expect(len(n)).toBeCloseTo(1, 6);
  });
  it("fuera de la caja no hay polígono", () => {
    expect(clipPolygon({ ...DEFAULT_FREE_PLANE, offsetMm: 50 }, centre, meta)).toEqual([]);
  });
  it("clampOffsetToBox devuelve el plano al intervalo en que corta la caja", () => {
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: 50 }, centre, meta).offsetMm).toBe(5);
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: -50 }, centre, meta).offsetMm).toBe(-5);
    expect(clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: 2 }, centre, meta).offsetMm).toBe(2);
  });
});

describe("sliceSegment", () => {
  it("paralelo al corte → null", () => {
    expect(sliceSegment(DEFAULT_FREE_PLANE, centre, meta, "axial", 5)).toBeNull();
  });
  it("plano inclinado 45° alrededor de x cruza el corte axial en una horizontal por el punto", () => {
    const p = { azimuthDeg: 0, elevationDeg: 45, offsetMm: 0 };           // n ∝ (0, 1, 1): corta z=5 en y=10
    const seg = sliceSegment(p, centre, meta, "axial", 5)!;
    expect(seg[0][1]).toBeCloseTo(0.5, 6); expect(seg[1][1]).toBeCloseTo(0.5, 6);
    expect(Math.min(seg[0][0], seg[1][0])).toBeCloseTo(0, 6); expect(Math.max(seg[0][0], seg[1][0])).toBeCloseTo(1, 6);
  });
  it("en el corte coronal la v va invertida (1 − z/Z), como las líneas de referencia", () => {
    const p = { azimuthDeg: 90, elevationDeg: 45, offsetMm: 0 };          // n ∝ (1, 0, 1): corta y=10 en la recta x + z = 20
    const seg = sliceSegment(p, centre, meta, "coronal", 10)!;
    // en x = 10 (u = 1/3) z = 10 (v = 1 − 10/10 = 0); en x = 20 (u = 2/3) z = 0 (v = 1)
    const byU = [seg[0], seg[1]].sort((a, b) => a[0] - b[0]);
    expect(byU[0]).toEqual([expect.closeTo(1 / 3, 6), expect.closeTo(0, 6)]);
    expect(byU[1]).toEqual([expect.closeTo(2 / 3, 6), expect.closeTo(1, 6)]);
  });
  it("un índice fuera del volumen no da segmento", () => {
    const p = { azimuthDeg: 0, elevationDeg: 45, offsetMm: 0 };
    expect(sliceSegment(p, centre, meta, "axial", -1)).toBeNull();
    expect(sliceSegment(p, centre, meta, "axial", 11)).toBeNull();
  });
});
