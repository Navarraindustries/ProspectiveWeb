import { describe, expect, it } from "vitest";
import { localAplicado, localBox, reencuadrarAlCambiarLocal } from "./localBox";
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

describe("LOCAL en el MIP (UNI-89)", () => {
  it("con RECORTE LIBRE el botón no dice LOCAL ● aunque esté pedido", () => {
    expect(localAplicado(true, false)).toBe(true);
    expect(localAplicado(true, true)).toBe(false);
    expect(localAplicado(false, false)).toBe(false);
  });
  it("encenderlo reencuadra; apagarlo también, si había lesión", () => {
    expect(reencuadrarAlCambiarLocal(false, true, false, true)).toBe(true);
    expect(reencuadrarAlCambiarLocal(true, false, false, true)).toBe(true);
  });
  it("apagarlo sin lesión no mueve la cámara: no había caja", () => {
    expect(reencuadrarAlCambiarLocal(true, false, false, false)).toBe(false);
  });
  it("con RECORTE LIBRE nunca reencuadra", () => {
    expect(reencuadrarAlCambiarLocal(false, true, true, true)).toBe(false);
    expect(reencuadrarAlCambiarLocal(true, false, true, true)).toBe(false);
  });
  it("al montar con LOCAL puesto se encuadra, como antes; sin él, no", () => {
    expect(reencuadrarAlCambiarLocal(true, true, false, true)).toBe(true);
    expect(reencuadrarAlCambiarLocal(false, false, false, true)).toBe(false);
  });
});
