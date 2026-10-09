import { describe, expect, it } from "vitest";
import { localBox } from "./localBox";
import { lesionFrameRadiusMm } from "./lesionFrame";

const vol: [number, number, number, number, number, number] = [0, 100, 0, 80, 0, 60];

describe("localBox (spec §6)", () => {
  it("es un cubo centrado en la lesión con el medio lado de «Centrar en la lesión»", () => {
    const r = lesionFrameRadiusMm(6);
    expect(localBox([50, 40, 30], 6, vol)).toEqual([50 - r, 50 + r, 40 - r, 40 + r, 30 - r, 30 + r]);
  });
  it("se acota al volumen sin perder extensión mínima", () => {
    const b = localBox([1, 40, 59], 6, vol);
    expect(b[0]).toBe(0); expect(b[5]).toBe(60);
    for (let a = 0; a < 3; a++) expect(b[2 * a + 1] - b[2 * a]).toBeGreaterThanOrEqual(1);
  });
  it("una lesión fuera del volumen devuelve una caja pegada al borde, no vacía", () => {
    const b = localBox([-50, 40, 30], 6, vol);
    expect(b[0]).toBe(0); expect(b[1]).toBeGreaterThanOrEqual(1);
  });
});
