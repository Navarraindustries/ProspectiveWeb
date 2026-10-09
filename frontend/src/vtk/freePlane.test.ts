import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_PLANE, clampOffsetToBox, clampPlane, clipPolygon, normalOf, originOf, planeFromNormal, rightOf, sliceSegment, upOf } from "./freePlane";
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
  it("con azimut 0 el arriba es (0, −cos e, sin e), el del oblicuo «EJE X» anterior", () => {
    const e = 30, r = (e * Math.PI) / 180;
    const u = upOf({ azimuthDeg: 0, elevationDeg: e, offsetMm: 0 });
    expect(u[0]).toBeCloseTo(0, 9); expect(u[1]).toBeCloseTo(-Math.cos(r), 9); expect(u[2]).toBeCloseTo(Math.sin(r), 9);
  });
  it("cerca del coronal el arriba gira menos de 1° por cada 0,5° de azimut", () => {
    const deg = (x: number[], y: number[]) => (Math.acos(Math.min(1, Math.max(-1, dot(x, y) / (len(x) * len(y))))) * 180) / Math.PI;
    for (const e of [80, 85, 89]) for (const a of [0, 45, 90]) {
      const u0 = upOf({ azimuthDeg: a, elevationDeg: e, offsetMm: 0 });
      const u1 = upOf({ azimuthDeg: a + 0.5, elevationDeg: e, offsetMm: 0 });
      expect(deg(u0, u1)).toBeLessThan(1);
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
  it("con el offset acotado a una cara, el polígono es esa cara (4 vértices), también la del vértice máximo", () => {
    const top = clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: 99 }, centre, meta);
    const polyTop = clipPolygon(top, centre, meta);
    expect(polyTop).toHaveLength(4);
    expect(polyTop.every((v) => Math.abs(v[2] - 10) < 1e-6)).toBe(true);
    const bottom = clampOffsetToBox({ ...DEFAULT_FREE_PLANE, offsetMm: -99 }, centre, meta);
    const polyBottom = clipPolygon(bottom, centre, meta);
    expect(polyBottom).toHaveLength(4);
    expect(polyBottom.every((v) => Math.abs(v[2]) < 1e-6)).toBe(true);
    const px = clampOffsetToBox({ azimuthDeg: 90, elevationDeg: 90, offsetMm: 99 }, centre, meta);
    const polyX = clipPolygon(px, centre, meta);
    expect(polyX).toHaveLength(4);
    expect(polyX.every((v) => Math.abs(v[0] - 30) < 1e-6)).toBe(true);
    const py = clampOffsetToBox({ azimuthDeg: 0, elevationDeg: 90, offsetMm: 99 }, centre, meta);
    const polyY = clipPolygon(py, centre, meta);
    expect(polyY).toHaveLength(4);
    expect(polyY.every((v) => Math.abs(v[1] - 20) < 1e-6)).toBe(true);
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

describe("planeFromNormal (spec §4.2)", () => {
  it("es la inversa de normalOf para una rejilla de direcciones (salvo el signo, que es el mismo plano)", () => {
    for (const a of [-150, -90, -30, 0, 45, 120, 180]) for (const e of [-80, -45, 0, 30, 60, 89]) {
      const n = normalOf({ azimuthDeg: a, elevationDeg: e, offsetMm: 0 });
      const m = normalOf(planeFromNormal(n));
      expect(Math.abs(dot(n, m))).toBeCloseTo(1, 6);
    }
  });
  it("una normal hacia −z se expresa con su opuesta (elevación en rango, offset 0)", () => {
    const p = planeFromNormal([0, 0, -1]);
    expect(p.elevationDeg).toBeCloseTo(0, 6); expect(p.offsetMm).toBe(0);
    expect(normalOf(p).map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("una normal horizontal se acota a 89° sin NaN", () => {
    const p = planeFromNormal([1, 0, 0]);
    expect(p.elevationDeg).toBe(89); expect(Number.isFinite(p.azimuthDeg)).toBe(true);
    expect(normalOf(p)[0]).toBeGreaterThan(0.99);
  });
  it("una normal nula da el plano por defecto", () => {
    expect(planeFromNormal([0, 0, 0])).toEqual(DEFAULT_FREE_PLANE);
  });
});
