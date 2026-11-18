/* VINI 3D, segunda tanda (18-11): lo puro de ramas, comparación y marcas. */
import { describe, expect, it } from "vitest";
import type { IvusBranch, IvusCompareSection, IvusSection } from "../api/types";
import type { Annotation } from "./annotations";
import type { CenterlineTrack } from "./centerlineWalk";
import { cambioArea, marcasEnLinea, ramasBajo, ramasCerca } from "./ivusVirtual";

const rama = (arc: number): IvusBranch => ({ arc_mm: arc, calibre_mm: 1, parent_mm: 3, angle_deg: 0, distance_mm: 1.5 });

describe("ramas a lo largo de la línea", () => {
  const ramas = [rama(2), rama(5), rama(9.5)];
  it("cerca de una sección: a menos de 0,75 mm", () => {
    expect(ramasCerca(ramas, 5.5).map((r) => r.arc_mm)).toEqual([5]);
    expect(ramasCerca(ramas, 6)).toEqual([]);
    expect(ramasCerca(undefined, 5)).toEqual([]);
  });
  it("bajo un dispositivo, con los extremos dentro y en cualquier orden", () => {
    expect(ramasBajo(ramas, 5, 9.5).map((r) => r.arc_mm)).toEqual([5, 9.5]);
    expect(ramasBajo(ramas, 9.5, 5).map((r) => r.arc_mm)).toEqual([5, 9.5]);
    expect(ramasBajo(ramas, 6, 9)).toEqual([]);
  });
});

describe("cambio de área frente al estudio anterior", () => {
  const ahora = { valid: true, area_mm2: 6 } as IvusSection;
  const antes = { valid: true, area_mm2: 8, contour: [] } as unknown as IvusCompareSection;
  it("en % del área anterior", () => {
    expect(cambioArea(ahora, antes)).toBeCloseTo(-25);
  });
  it("null si alguna sección no mide", () => {
    expect(cambioArea({ ...ahora, valid: false }, antes)).toBeNull();
    expect(cambioArea(ahora, { ...antes, valid: false })).toBeNull();
    expect(cambioArea(ahora, undefined)).toBeNull();
  });
});

describe("marcadores sobre la línea", () => {
  const track: CenterlineTrack = {
    points: [0, 1, 2, 3, 4].map((z) => [0, 0, z * 2]), radiiMm: [1.5, 1.5, 1.5, 1.5, 1.5], arcMm: [0, 2, 4, 6, 8],
  };
  const marcador = (id: string, p: [number, number, number], extra: Partial<Annotation> = {}): Annotation => ({
    id, kind: "marcador", points: [p], plane: null, label: id.toUpperCase(), note: "", visible: true, created_at: "", created_by: "", ...extra,
  });
  it("sitúa los cercanos en su punto más próximo, en orden, y deja fuera los lejanos", () => {
    const m = marcasEnLinea([
      marcador("m2", [1, 0, 6.2]), marcador("m1", [0, 1, 1.8]),
      marcador("lejos", [9, 0, 4]), marcador("oculto", [0, 0, 4], { visible: false }),
      { ...marcador("regla", [0, 0, 4]), kind: "regla" },
    ], track);
    expect(m.map((x) => [x.etiqueta, x.arc_mm])).toEqual([["M1", 2], ["M2", 6]]);
  });
  it("sin línea no hay marcas", () => {
    expect(marcasEnLinea([marcador("m", [0, 0, 0])], null)).toEqual([]);
  });
});
