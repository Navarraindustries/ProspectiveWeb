import { describe, expect, it } from "vitest";
import { formatMeasure, measure, nextLabel, onSlice, polygonArea, toCsv } from "./annotations";
import type { Annotation } from "./annotations";
import type { VolumeMeta } from "../api/types";
const meta = { shape: [100, 100, 100], spacing: [1, 1, 1] } as unknown as VolumeMeta;
const base = { id: "x", label: "", note: "", visible: true, created_at: "", created_by: "" };
describe("measure", () => {
  it("regla: distancia euclídea", () => {
    expect(measure({ kind: "regla", points: [[0, 0, 0], [3, 4, 0]] })).toEqual({ kind: "distancia", mm: 5 });
  });
  it("ángulo en el vértice central: recto y obtuso", () => {
    expect(measure({ kind: "angulo", points: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] })).toEqual({ kind: "angulo", deg: 90 });
    const m = measure({ kind: "angulo", points: [[1, 0, 0], [0, 0, 0], [-1, 1, 0]] });
    expect(m && m.kind === "angulo" ? m.deg : NaN).toBeCloseTo(135, 6);
  });
  it("región: área del cordón y perímetro, también no convexa", () => {
    const sq = measure({ kind: "region", points: [[0, 0, 5], [2, 0, 5], [2, 2, 5], [0, 2, 5]] });
    expect(sq).toEqual({ kind: "area", mm2: 4, perimetroMm: 8 });
    const l = polygonArea([[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]], 2);
    expect(l).toBeCloseTo(5, 9);
  });
  it("marcador: sin medida; formato con coma decimal", () => {
    expect(measure({ kind: "marcador", points: [[1, 1, 1]] })).toBeNull();
    expect(formatMeasure({ kind: "distancia", mm: 12.449 })).toBe("12,4 mm");
    expect(formatMeasure({ kind: "angulo", deg: 63.4 })).toBe("63°");
    expect(formatMeasure({ kind: "area", mm2: 47.9, perimetroMm: 1 })).toBe("48 mm²");
  });
});
describe("nextLabel", () => {
  it("prefijo por tipo y máximo + 1, aunque falten números", () => {
    expect(nextLabel("regla", [])).toBe("R1");
    expect(nextLabel("regla", [{ label: "R1" }, { label: "R7" }, { label: "A3" }])).toBe("R8");
    expect(nextLabel("marcador", [{ label: "lesión" }])).toBe("M1");
  });
});
describe("onSlice", () => {
  const regla: Annotation = { ...base, kind: "regla", points: [[10, 10, 20.3], [30, 10, 19.8]], plane: null };
  const region: Annotation = { ...base, kind: "region", points: [[1, 56, 1], [5, 56, 1], [5, 56, 5]], plane: { plane: "coronal", index: 56 } };
  it("una regla hecha en 3D se dibuja en el corte que pasa por sus puntos", () => {
    expect(onSlice(regla, "axial", 20, meta)).toBe(true);
    expect(onSlice(regla, "axial", 22, meta)).toBe(false);          // 1,7 mm > 0,5 × 1 mm
    expect(onSlice(regla, "coronal", 10, meta)).toBe(true);
  });
  it("la región solo en su plano e índice", () => {
    expect(onSlice(region, "coronal", 56, meta)).toBe(true);
    expect(onSlice(region, "coronal", 57, meta)).toBe(false);
    expect(onSlice(region, "axial", 1, meta)).toBe(false);
  });
});
describe("toCsv", () => {
  it("una fila por anotación con valor y puntos", () => {
    const csv = toCsv([{ ...base, id: "1", kind: "regla", label: "R1", points: [[0, 0, 0], [3, 4, 0]], plane: { plane: "axial", index: 3 } }]);
    expect(csv.split("\n")[0]).toBe("nombre;tipo;valor;unidad;corte;nota;puntos_mm");
    expect(csv.split("\n")[1]).toBe("R1;regla;5,0;mm;AX 3;;0 0 0 | 3 4 0");
  });
});
