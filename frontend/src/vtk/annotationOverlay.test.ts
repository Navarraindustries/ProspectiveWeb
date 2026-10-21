import { describe, expect, it } from "vitest";
import type { VolumeMeta } from "../api/types";
import type { Annotation } from "./annotations";
import { labelAnchor, labelFor, shapesForSlice, type Shape } from "./annotationOverlay";
import { ANNOTATION_HEX } from "./planeColors";

// 101 vóxeles de 1 mm: u = x / 100, así las px se leen a ojo.
const meta = { shape: [101, 101, 101], spacing: [1, 1, 1] } as unknown as VolumeMeta;
const box = { left: 10, top: 20, w: 200, h: 100 };
const opts = { compact: false, selected: null };

const ann = (o: Partial<Annotation>): Annotation => ({
  id: "x", kind: "regla", points: [], plane: null, label: "R1", note: "",
  visible: true, created_at: "", created_by: "", ...o,
});
const regla = ann({ id: "r", points: [[10, 50, 20], [40, 50, 20]], plane: { plane: "axial", index: 20 } });
const angulo = ann({ id: "a", kind: "angulo", label: "A1", points: [[10, 10, 20], [50, 50, 20], [90, 10, 20]] });
const region = ann({ id: "g", kind: "region", label: "G1", points: [[0, 30, 0], [50, 30, 0], [50, 30, 100]], plane: { plane: "coronal", index: 30 } });
const marcador = ann({ id: "m", kind: "marcador", label: "M1", note: "rama", points: [[25, 25, 20]] });

const of = (s: Shape[], k: Shape["kind"]) => s.filter((x) => x.kind === k);

describe("shapesForSlice", () => {
  it("una regla en su corte: línea, dos extremos y su rótulo, en px de mmToUv × box", () => {
    const s = shapesForSlice([regla], null, "axial", 20, meta, box, opts);
    expect(of(s, "line")).toEqual([{ kind: "line", x1: 30, y1: 70, x2: 90, y2: 70, color: ANNOTATION_HEX.regla, width: 1.5 }]);
    expect(of(s, "circle").map((c) => c.kind === "circle" && [c.x, c.y])).toEqual([[30, 70], [90, 70]]);
    const t = of(s, "text");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ text: "R1 · 30,0 mm", color: ANNOTATION_HEX.regla });
  });

  it("un ángulo: dos brazos y el texto junto al vértice", () => {
    const s = shapesForSlice([angulo], null, "axial", 20, meta, box, opts);
    expect(of(s, "line")).toHaveLength(2);
    const t = of(s, "text")[0];
    expect(t.kind === "text" && t.text).toBe("A1 · 90°");
    // vértice (50, 50) → (110, 70); el texto se aparta unos px de él.
    expect(t.kind === "text" && Math.hypot(t.x - 110, t.y - 70)).toBeLessThan(12);
  });

  it("una región en su corte: polígono cerrado con relleno", () => {
    const s = shapesForSlice([region], null, "coronal", 30, meta, box, opts);
    const g = of(s, "polygon");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ closed: true, color: ANNOTATION_HEX.region });
    expect(g[0].kind === "polygon" && g[0].fill).not.toBe("none");
    expect(g[0].kind === "polygon" && g[0].points).toEqual([{ x: 10, y: 120 }, { x: 110, y: 120 }, { x: 110, y: 20 }]);
    expect(of(s, "text")[0]).toMatchObject({ text: expect.stringMatching(/^G1 · \d+ mm²$/) });
  });

  it("el borrador de región: polígono abierto y sin texto", () => {
    const draft = { kind: "region" as const, points: region.points.slice(0, 2) };
    const s = shapesForSlice([], draft, "coronal", 30, meta, box, opts);
    expect(of(s, "polygon")).toEqual([expect.objectContaining({ closed: false, fill: "none" })]);
    expect(of(s, "text")).toHaveLength(0);
  });

  it("el borrador de regla se dibuja discontinuo en su corte y no en otro", () => {
    const draft = { kind: "regla" as const, points: regla.points };
    const s = shapesForSlice([], draft, "axial", 20, meta, box, opts);
    expect(of(s, "line")).toEqual([expect.objectContaining({ dashed: true })]);
    expect(shapesForSlice([], draft, "axial", 22, meta, box, opts)).toEqual([]);
  });

  it("compact deja el rótulo en el nombre", () => {
    const s = shapesForSlice([regla], null, "axial", 20, meta, box, { compact: true, selected: null });
    expect(of(s, "text")[0]).toMatchObject({ text: "R1" });
  });

  it("la seleccionada va con trazo 3", () => {
    const s = shapesForSlice([regla], null, "axial", 20, meta, box, { compact: false, selected: "r" });
    expect(of(s, "line")[0]).toMatchObject({ width: 3 });
  });

  it("ni las ocultas ni las que no tocan el corte", () => {
    expect(shapesForSlice([{ ...regla, visible: false }], null, "axial", 20, meta, box, opts)).toEqual([]);
    expect(shapesForSlice([regla], null, "axial", 22, meta, box, opts)).toEqual([]);
    expect(shapesForSlice([region], null, "coronal", 31, meta, box, opts)).toEqual([]);
  });

  it("un marcador: punto y rótulo con su nota", () => {
    const s = shapesForSlice([marcador], null, "axial", 20, meta, box, opts);
    expect(of(s, "circle")).toHaveLength(1);
    expect(of(s, "text")[0]).toMatchObject({ text: "M1 · rama" });
  });
});

describe("labelFor y labelAnchor", () => {
  it("nombre y valor, o solo el nombre en compacto", () => {
    expect(labelFor(regla, false)).toBe("R1 · 30,0 mm");
    expect(labelFor(regla, true)).toBe("R1");
    expect(labelFor({ ...marcador, note: "" }, false)).toBe("M1");
  });

  it("regla en su punto medio, ángulo en el vértice, marcador en su punto", () => {
    expect(labelAnchor(regla)).toEqual([25, 50, 20]);
    expect(labelAnchor(angulo)).toEqual([50, 50, 20]);
    expect(labelAnchor(marcador)).toEqual([25, 25, 20]);
  });
});
