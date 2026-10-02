import { describe, expect, it } from "vitest";
import { matrixAfterSwap, shouldApplyMatrix } from "./layerMatrix";
import { IDENTITY } from "./clipPose";

const delta = [1,0,0,5, 0,1,0,0, 0,0,1,0, 0,0,0,1];

describe("shouldApplyMatrix", () => {
  it("aplica cuando el actor ya muestra el fichero de la capa", () => {
    expect(shouldApplyMatrix("/m/clips-b.vtp", "/m/clips-b.vtp")).toBe(true);
  });
  it("no aplica mientras el fichero nuevo se descarga (la matriz es para la malla nueva)", () => {
    expect(shouldApplyMatrix("/m/clips-a.vtp", "/m/clips-b.vtp")).toBe(false);
  });
  it("no aplica si el actor aún no tiene nada cargado", () => {
    expect(shouldApplyMatrix(undefined, "/m/clips-b.vtp")).toBe(false);
  });
});

describe("matrixAfterSwap", () => {
  it("aplica la matriz actual de la capa tras el cambio de geometría", () => {
    expect(matrixAfterSwap(delta, true)).toBe(delta);
    expect(matrixAfterSwap(delta, false)).toBe(delta);
  });
  it("vuelve a la identidad si la capa tuvo matriz y ya no", () => {
    expect(matrixAfterSwap(undefined, true)).toEqual(IDENTITY);
  });
  it("no toca una capa que nunca tuvo matriz (pieza del ensayo)", () => {
    expect(matrixAfterSwap(undefined, false)).toBeNull();
  });
});

describe("secuencia del soltar: plan y URL nuevos en el mismo tic", () => {
  it("la malla vieja conserva su delta hasta que llega la nueva, que nace con la matriz actual", () => {
    let loaded = "/m/clips-a.vtp";
    let actorMatrix: number[] = delta;          // delta P0→arrastre sobre la malla de P0
    const layer = { url: "/m/clips-b.vtp", userMatrix: undefined as number[] | undefined };
    // Efecto de la matriz: el plan ya llegó (sin delta) pero la malla es la vieja.
    if (shouldApplyMatrix(loaded, layer.url)) actorMatrix = layer.userMatrix ?? IDENTITY;
    expect(actorMatrix).toBe(delta);            // no salta atrás
    // Llega el fichero: geometría nueva y, justo después, la matriz actual.
    loaded = layer.url;
    const m = matrixAfterSwap(layer.userMatrix, true);
    if (m) actorMatrix = m;
    expect(actorMatrix).toEqual(IDENTITY);
    expect(shouldApplyMatrix(loaded, layer.url)).toBe(true);
  });
});
