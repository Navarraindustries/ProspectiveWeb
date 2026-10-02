import { describe, expect, it } from "vitest";
import { planeOutlines } from "./planeOutlines";
import type { VolumeMeta } from "../api/types";

const meta = { shape: [10, 20, 30], spacing: [1, 0.5, 0.25] } as unknown as VolumeMeta;   // (z,y,x) y (sz,sy,sx)

describe("planeOutlines", () => {
  it("sin meta o sin vóxel no hay planos", () => {
    expect(planeOutlines(null, meta)).toEqual([]);
    expect(planeOutlines({ x: 0, y: 0, z: 0 }, null)).toEqual([]);
  });
  it("el plano axial pasa por z del vóxel y cubre toda la extensión x,y en mm", () => {
    const ax = planeOutlines({ x: 3, y: 4, z: 5 }, meta).find((p) => p.plane === "axial")!;
    expect(ax.corners.every((c) => Math.abs(c[2] - 5 * 1) < 1e-9)).toBe(true);           // z = 5 × sz
    const xs = ax.corners.map((c) => c[0]), ys = ax.corners.map((c) => c[1]);
    expect(Math.min(...xs)).toBe(0); expect(Math.max(...xs)).toBeCloseTo(29 * 0.25);      // (nx−1)·sx
    expect(Math.min(...ys)).toBe(0); expect(Math.max(...ys)).toBeCloseTo(19 * 0.5);
  });
  it("sagital fija x y coronal fija y, con el color de su plano", () => {
    const out = planeOutlines({ x: 3, y: 4, z: 5 }, meta);
    const sag = out.find((p) => p.plane === "sagital")!, cor = out.find((p) => p.plane === "coronal")!;
    expect(sag.corners.every((c) => Math.abs(c[0] - 3 * 0.25) < 1e-9)).toBe(true);
    expect(cor.corners.every((c) => Math.abs(c[1] - 4 * 0.5) < 1e-9)).toBe(true);
    expect(sag.color[0]).toBeGreaterThan(sag.color[2]);     // naranja: más rojo que azul
    expect(cor.color[1]).toBeGreaterThan(cor.color[0]);     // verde
  });
  it("mover el corte mueve solo su rectángulo", () => {
    const a = planeOutlines({ x: 3, y: 4, z: 5 }, meta), b = planeOutlines({ x: 3, y: 4, z: 9 }, meta);
    expect(a.find((p) => p.plane === "coronal")).toEqual(b.find((p) => p.plane === "coronal"));
    expect(a.find((p) => p.plane === "axial")).not.toEqual(b.find((p) => p.plane === "axial"));
  });
  it("con plano libre hay un cuarto contorno con N vértices y su color", () => {
    const out = planeOutlines({ x: 3, y: 4, z: 5 }, meta, { azimuthDeg: 30, elevationDeg: 50, offsetMm: 0 });
    expect(out).toHaveLength(4);
    const libre = out.find((p) => p.plane === "libre")!;
    expect(libre.corners.length).toBeGreaterThanOrEqual(3);
    expect(libre.color[2]).toBeGreaterThan(libre.color[1]);     // lavanda: más azul que verde
  });
  it("sin plano libre o con el plano fuera de la caja siguen siendo tres", () => {
    expect(planeOutlines({ x: 3, y: 4, z: 5 }, meta)).toHaveLength(3);
    expect(planeOutlines({ x: 3, y: 4, z: 5 }, meta, { azimuthDeg: 0, elevationDeg: 0, offsetMm: 999 })).toHaveLength(3);
  });
});
