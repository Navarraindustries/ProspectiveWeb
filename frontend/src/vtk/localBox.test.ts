import { describe, expect, it } from "vitest";
import { localAplicado, localBox, reencuadrarAlCambiarCaja } from "./localBox";
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
  // reencuadrarAlCambiarCaja recibe si la caja se aplicaba antes y ahora.
  const caja = (local: boolean, libre: boolean) => localAplicado(local, libre);
  it("encender LOCAL reencuadra; apagarlo también, si había lesión", () => {
    expect(reencuadrarAlCambiarCaja(caja(false, false), caja(true, false), true)).toBe(true);
    expect(reencuadrarAlCambiarCaja(caja(true, false), caja(false, false), true)).toBe(true);
  });
  it("pasar a RECORTE LIBRE con LOCAL puesto reencuadra: la caja se quita", () => {
    expect(reencuadrarAlCambiarCaja(caja(true, false), caja(true, true), true)).toBe(true);
    // Y volver a EJE con LOCAL pedido vuelve a encuadrar la caja.
    expect(reencuadrarAlCambiarCaja(caja(true, true), caja(true, false), true)).toBe(true);
  });
  it("cambiar de recorte con LOCAL apagado no mueve la cámara", () => {
    expect(reencuadrarAlCambiarCaja(caja(false, false), caja(false, true), true)).toBe(false);
    expect(reencuadrarAlCambiarCaja(caja(false, true), caja(false, false), true)).toBe(false);
  });
  it("quitar la caja sin lesión no mueve la cámara: no había caja", () => {
    expect(reencuadrarAlCambiarCaja(true, false, false)).toBe(false);
  });
  it("al montar con la caja puesta se encuadra, como antes; sin ella, no", () => {
    expect(reencuadrarAlCambiarCaja(true, true, true)).toBe(true);
    expect(reencuadrarAlCambiarCaja(false, false, true)).toBe(false);
  });
});
