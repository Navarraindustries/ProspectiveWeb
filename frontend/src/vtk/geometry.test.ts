import { describe, expect, it } from "vitest";
import {
  cameraHeading, edgeLabels, fromLps, standardViewInVolume, lpsToVolumeUserMatrix, manualToDirection, mmToVoxel, screenAxes, sliceCamera, voxelToMm,
} from "./geometry";
import type { VolumeMeta } from "../api/types";

const meta = {
  shape: [100, 200, 300], spacing: [0.5, 0.25, 0.25], wc: 0, ww: 1, modality: "XA",
  direction: null, orientation_known: false, orientation_manual: null, origin_mm: [0, 0, 0],
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
  it("labels lose the brackets once the orientation is fixed by hand", () => {
    // Fijada con «Fijar orientación» deja de ser una suposición.
    const o = { direction: null, manual: { anteriorEdge: "top" as const, firstSliceSuperior: false } };
    expect(edgeLabels("axial", o)).toEqual({ left: "DER", right: "IZQ", top: "ANT", bottom: "POST" });
  });
  it("assumes the default orientation, bracketed, when nothing is known", () => {
    expect(edgeLabels("axial", { direction: null, manual: null })).toEqual({ left: "[DER]", right: "[IZQ]", top: "[ANT]", bottom: "[POST]" });
  });
  it("manual anterior-at-right rotates the axial labels", () => {
    const o = { direction: null, manual: { anteriorEdge: "right" as const, firstSliceSuperior: true } };
    expect(edgeLabels("axial", o)).toEqual({ left: "POST", right: "ANT", top: "DER", bottom: "IZQ" });
    // El primer corte superior invierte el eje z.
    expect(edgeLabels("coronal", o).top).toBe("INF");
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
  it("a hand-fixed orientation is known and turns the heading", () => {
    // Anterior a la derecha: mirar a lo largo de −x del volumen es mirar
    // desde anterior (azimut 0).
    const h = cameraHeading([-1, 0, 0], [0, 0, 1], { direction: null, manual: { anteriorEdge: "right", firstSliceSuperior: false } });
    expect(h.known).toBe(true);
    expect(h.azimuthDeg).toBeCloseTo(0);
  });
});

describe("lpsToVolumeUserMatrix", () => {
  // Aplica una mat4 en columnas (gl-matrix, como vtk.js) a un vector.
  const apply = (m: number[], v: [number, number, number]) =>
    [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2]);

  it("lleva la cara del maniquí (anterior en LPS) al eje del volumen que es anterior", () => {
    // Anterior a la derecha en el axial: +x del volumen es anterior.
    const d = manualToDirection({ anteriorEdge: "right", firstSliceSuperior: false });
    expect(apply(lpsToVolumeUserMatrix(d), [0, -1, 0])).toEqual([1, 0, 0]);
  });

  it("lleva la cabeza (superior en LPS) al primer corte cuando el primer corte es superior", () => {
    const d = manualToDirection({ anteriorEdge: "top", firstSliceSuperior: true });
    expect(apply(lpsToVolumeUserMatrix(d), [0, 0, 1]).map((x) => x + 0)).toEqual([0, 0, -1]);
  });
});

describe("vistas estándar de la cámara 3D", () => {
  const clean = (v: number[]) => v.map((x) => (Object.is(x, -0) ? 0 : x));
  // Volumen → LPS con la dirección en filas, como la usa el resto de geometry.
  const toLpsVec = (d: number[], v: number[]) => [
    d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
    d[3] * v[0] + d[4] * v[1] + d[5] * v[2],
    d[6] * v[0] + d[7] * v[1] + d[8] * v[2],
  ];
  // Definición en términos del paciente: [hacia dónde mira, qué queda arriba].
  const DEF: Record<string, [number[], number[]]> = {
    axial: [[0, 0, -1], [0, -1, 0]],         // desde superior, anterior arriba
    axial_inf: [[0, 0, 1], [0, -1, 0]],
    coronal: [[0, 1, 0], [0, 0, 1]],         // desde anterior, superior arriba
    coronal_post: [[0, -1, 0], [0, 0, 1]],
    sagital: [[-1, 0, 0], [0, 0, 1]],        // desde la izquierda del paciente
    sagital_izq: [[1, 0, 0], [0, 0, 1]],
  };

  it("con la dirección identidad reproduce los vectores de siempre (+z superior)", () => {
    const o = { direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], manual: null };
    // Los de antes eran [posición, arriba]: posición = −dirección de proyección.
    const old: Record<string, [number[], number[]]> = {
      axial: [[0, 0, 1], [0, -1, 0]], axial_inf: [[0, 0, -1], [0, -1, 0]],
      coronal: [[0, -1, 0], [0, 0, 1]], coronal_post: [[0, 1, 0], [0, 0, 1]],
      sagital: [[1, 0, 0], [0, 0, 1]], sagital_izq: [[-1, 0, 0], [0, 0, 1]],
    };
    for (const [view, [pos, up]] of Object.entries(old)) {
      const v = standardViewInVolume(view as never, o);
      expect(clean(v.direction.map((x) => -x))).toEqual(pos);
      expect(clean(v.viewUp)).toEqual(up);
    }
  });

  it("con la dirección del Case 3 cada vista cumple su definición en LPS", () => {
    // SimpleITK en filas: i→L, j→S, k→A (lo que devuelve el XA000000.dcm).
    const d = [1, 0, 0, 0, 0, -1, 0, 1, 0];
    const o = { direction: d, manual: null };
    for (const [view, [look, up]] of Object.entries(DEF)) {
      const v = standardViewInVolume(view as never, o);
      toLpsVec(d, v.direction).forEach((x, i) => expect(x).toBeCloseTo(look[i]));
      toLpsVec(d, v.viewUp).forEach((x, i) => expect(x).toBeCloseTo(up[i]));
    }
    // Y la cinta de rumbo lo confirma: «AX» se ve desde arriba.
    const ax = standardViewInVolume("axial", o);
    expect(cameraHeading(ax.direction, ax.viewUp, o).elevationDeg).toBeCloseTo(90);
    const cor = standardViewInVolume("coronal", o);
    const hc = cameraHeading(cor.direction, cor.viewUp, o);
    expect(hc.azimuthDeg).toBeCloseTo(0);
    expect(hc.elevationDeg).toBeCloseTo(0);
    const sag = standardViewInVolume("sagital", o);
    expect(cameraHeading(sag.direction, sag.viewUp, o).azimuthDeg).toBeCloseTo(90);
  });

  it("fromLps es la inversa de la dirección", () => {
    const d = [0, 0, 1, 1, 0, 0, 0, 1, 0];
    const v: [number, number, number] = [0.2, -0.5, 0.7];
    toLpsVec(d, fromLps(d, v)).forEach((x, i) => expect(x).toBeCloseTo(v[i]));
  });
});
