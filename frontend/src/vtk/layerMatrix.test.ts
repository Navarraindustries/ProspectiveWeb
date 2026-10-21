import { describe, expect, it } from "vitest";
import { vec3 } from "gl-matrix";
import { matrixAfterSwap, shouldApplyMatrix, toColumnMajor } from "./layerMatrix";
import { IDENTITY, applyPoint, poseDelta, type Mat4 } from "./clipPose";

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

describe("toColumnMajor", () => {
  // vtk.js (Prop3D) multiplica la matriz de usuario con gl-matrix, que la lee
  // POR COLUMNAS. clipPose las construye por filas: sin trasponer, la
  // traslación cae en la fila proyectiva y el clip desaparece al arrastrar.
  it("lleva la traslación de las posiciones 3/7/11 a las 12/13/14", () => {
    const m = toColumnMajor(delta);
    expect([m[12], m[13], m[14]]).toEqual([5, 0, 0]);
    expect([m[3], m[7], m[11]]).toEqual([0, 0, 0]);
  });
  it("gl-matrix con la traspuesta mueve un punto igual que applyPoint con la original", () => {
    const d = poseDelta(
      { position: [1, 2, 3], normal: [0, 0, 1], rotationDeg: 0 },
      { position: [4, -1, 7], normal: [0.6, 0, 0.8], rotationDeg: 35 },
    );
    const p: [number, number, number] = [2, -3, 5];
    const gl = vec3.transformMat4(vec3.create(), vec3.fromValues(...p), toColumnMajor(d) as unknown as Parameters<typeof vec3.transformMat4>[2]);
    const want = applyPoint(d, p);
    for (let i = 0; i < 3; i++) expect(gl[i]).toBeCloseTo(want[i], 5);   // vec3 de gl-matrix es Float32
  });
  it("la identidad no cambia y dos trasposiciones devuelven la original", () => {
    expect(toColumnMajor(IDENTITY)).toEqual([...IDENTITY]);
    expect(toColumnMajor(toColumnMajor(delta as Mat4))).toEqual(delta);
  });
  it("no toca la matriz de entrada", () => {
    const m = [...delta];
    toColumnMajor(m);
    expect(m).toEqual(delta);
  });
});
