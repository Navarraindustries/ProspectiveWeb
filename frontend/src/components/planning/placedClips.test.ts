import { describe, expect, it } from "vitest";
import { activeClip, clipNormal, fieldColoursOnScreen, isStale, neckPlacement, poseKey, toPlacement } from "./placedClips";
import type { MorphometryResult } from "../../api/types";
const morpho = { principal_axis: [0, 1, 0], neck_origin: { x: 1, y: 2, z: 3 } } as unknown as MorphometryResult;
const clip = { key: 1, clip_id: "navarro:x", name: "X", position: [1, 2, 3] as [number, number, number], rotation_deg: 10, azimuthDeg: 0, elevationDeg: 0 };
describe("placedClips", () => {
  it("con 0/0 la normal es el eje principal; sin morfometría, +z", () => {
    expect(clipNormal(morpho, clip)).toEqual([0, 1, 0]);
    expect(clipNormal(null, clip)).toEqual([0, 0, 1]);
  });
  it("toPlacement manda la normal derivada y la posición como objeto", () => {
    expect(toPlacement(morpho, { ...clip, elevationDeg: 90, azimuthDeg: 90 }).normal.map((v) => +v.toFixed(6))).toEqual([1, 0, 0]);   // eje +y, el 90°, az 90° → +x
    expect(toPlacement(morpho, clip).position).toEqual({ x: 1, y: 2, z: 3 });
    expect(toPlacement(morpho, clip).rotation_deg).toBe(10);
  });
  it("poseKey cambia con los ángulos e isStale compara con lo planificado", () => {
    expect(poseKey([clip])).not.toBe(poseKey([{ ...clip, elevationDeg: 5 }]));
    expect(isStale([clip], null)).toBe(false);
    expect(isStale([clip], [clip])).toBe(false);
    expect(isStale([{ ...clip, position: [1, 2, 4] }], [clip])).toBe(true);
  });
  it("neckPlacement parte del origen del cuello", () => {
    expect(neckPlacement(morpho).position).toEqual([1, 2, 3]);
  });
});

describe("activeClip", () => {
  const c = (key: number) => ({ key, clip_id: "c", name: "C", position: [0, 0, 0] as [number, number, number], rotation_deg: 0, azimuthDeg: 0, elevationDeg: 0 });
  it("el elegido si está; si no, el último; sin lista, ninguno", () => {
    expect(activeClip([c(1), c(2)], 1)?.key).toBe(1);
    expect(activeClip([c(1), c(2)], 7)?.key).toBe(2);
    expect(activeClip([c(1), c(2)], null)?.key).toBe(2);
    expect(activeClip([], null)).toBeNull();
  });
});

describe("fieldColoursOnScreen", () => {
  // La respuesta del campo llega antes que su .vtp: hasta que el 3D enseña ESE
  // fichero, los colores son los de la pose anterior.
  it("con el campo en el 3D, solo cuando el fichero cargado es el del campo", () => {
    expect(fieldColoursOnScreen({ shown: true, fieldUrl: "/f.vtp?v=2", loadedUrl: "/f.vtp?v=1" })).toBe(false);
    expect(fieldColoursOnScreen({ shown: true, fieldUrl: "/f.vtp?v=2", loadedUrl: null })).toBe(false);
    expect(fieldColoursOnScreen({ shown: true, fieldUrl: "/f.vtp?v=2", loadedUrl: "/f.vtp?v=2" })).toBe(true);
  });
  it("sin el campo en el 3D (CALOR ○, otra vista, ensayo) no hay colores que esperar", () => {
    expect(fieldColoursOnScreen({ shown: false, fieldUrl: "/f.vtp?v=2", loadedUrl: "/f.vtp?v=1" })).toBe(true);
  });
  it("sin campo tampoco", () => {
    expect(fieldColoursOnScreen({ shown: true, fieldUrl: null, loadedUrl: null })).toBe(true);
  });
});
