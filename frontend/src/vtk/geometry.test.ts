import { describe, expect, it } from "vitest";
import {
  cameraHeading, edgeLabels, manualToDirection, mmToVoxel, screenAxes, sliceCamera, voxelToMm,
} from "./geometry";
import type { VolumeMeta } from "../api/types";

const meta = {
  shape: [100, 200, 300], spacing: [0.5, 0.25, 0.25], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, origin_mm: [0, 0, 0],
  intensity_range: [0, 1], cache_key: "1", full_stride: 1,
} as VolumeMeta;

const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

describe("mm ↔ vóxel", () => {
  it("round-trips a voxel through mm using the (z,y,x) spacing", () => {
    const v = { x: 30, y: 40, z: 7 };
    const mm = voxelToMm(v, meta);
    expect(mm).toEqual([7.5, 10, 3.5]);
    expect(mmToVoxel(mm, meta)).toEqual(v);
  });
  it("clamps out-of-volume points to the last voxel", () => {
    expect(mmToVoxel([1000, -5, 3], meta)).toEqual({ x: 299, y: 0, z: 6 });
  });
});

describe("cámaras de plano (misma orientación que los PNG)", () => {
  it("axial: x a la derecha, y hacia abajo", () => {
    const { direction, viewUp } = sliceCamera("axial");
    expect(cross(direction, viewUp)).toEqual([1, 0, 0]);
    expect(viewUp).toEqual([0, -1, 0]);
  });
  it("coronal: x a la derecha, z arriba", () => {
    const { direction, viewUp } = sliceCamera("coronal");
    expect(cross(direction, viewUp)).toEqual([1, 0, 0]);
    expect(viewUp).toEqual([0, 0, 1]);
  });
  it("sagital: y a la derecha, z arriba", () => {
    const { direction, viewUp } = sliceCamera("sagital");
    expect(cross(direction, viewUp)).toEqual([0, 1, 0]);
    expect(viewUp).toEqual([0, 0, 1]);
  });
  it("screenAxes agrees with the camera", () => {
    expect(screenAxes("axial")).toEqual({ right: [1, 0, 0], down: [0, 1, 0] });
    expect(screenAxes("sagital")).toEqual({ right: [0, 1, 0], down: [0, 0, -1] });
  });
});

describe("etiquetas de orientación", () => {
  const known = { direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], manual: null };
  it("uses the DICOM direction when known (LPS identity)", () => {
    expect(edgeLabels("axial", known)).toEqual({ left: "DER", right: "IZQ", top: "ANT", bottom: "POST" });
    expect(edgeLabels("coronal", known)).toEqual({ left: "DER", right: "IZQ", top: "SUP", bottom: "INF" });
    expect(edgeLabels("sagital", known)).toEqual({ left: "ANT", right: "POST", top: "SUP", bottom: "INF" });
  });
  it("labels are bracketed when orientation is assumed (manual)", () => {
    const o = { direction: null, manual: { anteriorEdge: "top" as const, firstSliceSuperior: false } };
    expect(edgeLabels("axial", o)).toEqual({ left: "[DER]", right: "[IZQ]", top: "[ANT]", bottom: "[POST]" });
  });
  it("assumes the default orientation, bracketed, when nothing is known", () => {
    expect(edgeLabels("axial", { direction: null, manual: null })).toEqual({ left: "[DER]", right: "[IZQ]", top: "[ANT]", bottom: "[POST]" });
  });
  it("manual anterior-at-right rotates the axial labels", () => {
    const o = { direction: null, manual: { anteriorEdge: "right" as const, firstSliceSuperior: true } };
    expect(edgeLabels("axial", o)).toEqual({ left: "[POST]", right: "[ANT]", top: "[DER]", bottom: "[IZQ]" });
    // El primer corte superior invierte el eje z.
    expect(edgeLabels("coronal", o).top).toBe("[INF]");
  });
  it("manualToDirection is orthonormal", () => {
    const d = manualToDirection({ anteriorEdge: "left", firstSliceSuperior: false });
    const col = (k: number) => [d[k], d[3 + k], d[6 + k]];
    for (let i = 0; i < 3; i++) {
      expect(Math.hypot(...col(i))).toBeCloseTo(1);
      for (let j = i + 1; j < 3; j++) {
        expect(col(i)[0] * col(j)[0] + col(i)[1] * col(j)[1] + col(i)[2] * col(j)[2]).toBeCloseTo(0);
      }
    }
  });
});

describe("rumbo de cámara", () => {
  const known = { direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], manual: null };
  it("looking from anterior gives azimuth 0, elevation 0", () => {
    const h = cameraHeading([0, 1, 0], [0, 0, 1], known);
    expect(h.azimuthDeg).toBeCloseTo(0);
    expect(h.elevationDeg).toBeCloseTo(0);
    expect(h.known).toBe(true);
  });
  it("looking from the patient's left gives azimuth 90", () => {
    expect(cameraHeading([-1, 0, 0], [0, 0, 1], known).azimuthDeg).toBeCloseTo(90);
  });
  it("looking from above gives elevation 90", () => {
    expect(cameraHeading([0, 0, -1], [0, -1, 0], known).elevationDeg).toBeCloseTo(90);
  });
  it("assumes the default orientation (known: false) without any orientation", () => {
    const h = cameraHeading([0, 1, 0], [0, 0, 1], { direction: null, manual: null });
    expect(h.known).toBe(false);
    expect(h.azimuthDeg).toBeCloseTo(0);
  });
});
