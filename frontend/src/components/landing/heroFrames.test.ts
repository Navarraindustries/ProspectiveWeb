import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MANIFIESTO, fotogramaPara, rutaFotograma, ultimoCargado } from "./heroFrames";

describe("fotogramaPara: el fotograma sale del progreso, no de deltas", () => {
  it("los extremos y la mitad", () => {
    expect(fotogramaPara(0, 60)).toBe(0);
    expect(fotogramaPara(1, 60)).toBe(59);
    expect(fotogramaPara(0.5, 60)).toBe(30);
  });

  it("un salto con la barra fuera de 0–1 se recorta", () => {
    expect(fotogramaPara(1.7, 60)).toBe(59);
    expect(fotogramaPara(-1, 60)).toBe(0);
  });
});

describe("ultimoCargado: sin parpadeo a vacío mientras llega la imagen", () => {
  it("el mayor cargado que no pasa del objetivo", () => {
    expect(ultimoCargado(30, new Set([0, 10, 29]))).toBe(29);
  });

  it("si ninguno queda por debajo, el menor cargado", () => {
    expect(ultimoCargado(5, new Set([10, 20]))).toBe(10);
  });

  it("sin ninguno cargado, null", () => {
    expect(ultimoCargado(5, new Set())).toBeNull();
  });
});

describe("el manifiesto del código es el de disco", () => {
  const disco = JSON.parse(
    readFileSync(resolve(__dirname, "../../../public/media/landing/hero.json"), "utf-8"),
  ) as { count: number; total: number; lesionFrame: number; window: { w: number; l: number }; frames: string[]; sliceOf: number[] };

  it("cuenta, total, ventana, fotograma de la lesión y cortes", () => {
    expect(MANIFIESTO.count).toBe(disco.count);
    expect(MANIFIESTO.total).toBe(disco.total);
    expect(MANIFIESTO.lesionFrame).toBe(disco.lesionFrame);
    expect(MANIFIESTO.window).toEqual(disco.window);
    expect(MANIFIESTO.sliceOf).toEqual(disco.sliceOf);
  });

  it("cada ruta apunta al fichero que lista el manifiesto", () => {
    disco.frames.forEach((f, i) => {
      expect(rutaFotograma(i)).toBe(`/media/landing/hero/${f}`);
    });
  });
});
