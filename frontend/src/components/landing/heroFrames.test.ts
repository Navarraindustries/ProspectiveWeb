import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DETECCION_CASE3, MANIFIESTO, fotogramaPara, precargarEnOrden, rutaFotograma, ultimoCargado,
} from "./heroFrames";

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

describe("DETECCION_CASE3: la salida del detector para el caso del hero", () => {
  it("cinco candidatos por puesto y solo el primero es la lesión", () => {
    expect(DETECCION_CASE3.map((c) => c.puesto)).toEqual([1, 2, 3, 4, 5]);
    expect(DETECCION_CASE3.filter((c) => c.lesion).map((c) => c.puesto)).toEqual([1]);
  });

  it("diámetros a un decimal, como los da el detector redondeados", () => {
    expect(DETECCION_CASE3.map((c) => c.diametroMm)).toEqual([3.7, 5.4, 5.8, 5.1, 2.7]);
    expect(DETECCION_CASE3[0].canales).toEqual(["curvatura"]);
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

/* Una `Image` de mentira: guarda la ruta pedida y deja disparar la carga a mano. */
class ImagenFalsa {
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  cargar() { this.onload?.(); }
  fallar() { this.onerror?.(); }
}

function preparar(count: number, enParalelo = 4) {
  const creadas: ImagenFalsa[] = [];
  const listos: number[] = [];
  const cancelar = precargarEnOrden(count, (i) => `f${i}`, (i) => listos.push(i), {
    enParalelo,
    crear: () => {
      const img = new ImagenFalsa();
      creadas.push(img);
      return img as unknown as HTMLImageElement;
    },
  });
  return { creadas, listos, cancelar, pedidas: () => creadas.map((c) => c.src) };
}

describe("precargarEnOrden: el fotograma 0 primero, luego por orden y sin retener nada", () => {
  it("al montar solo pide el 0; al llegar, abre los siguientes por índice", () => {
    const { creadas, listos, pedidas } = preparar(10, 3);
    expect(pedidas()).toEqual(["f0"]);
    creadas[0].cargar();
    expect(listos).toEqual([0]);
    expect(pedidas()).toEqual(["f0", "f1", "f2", "f3"]);
    creadas[2].cargar();
    expect(pedidas()).toEqual(["f0", "f1", "f2", "f3", "f4"]);
  });

  it("los pide todos, un fallo no atasca la cola y solo cuenta lo que llegó", () => {
    const { creadas, listos } = preparar(6, 2);
    creadas[0].cargar();
    for (let k = 1; k < creadas.length; k++) {
      if (k === 2) creadas[k].fallar();
      else creadas[k].cargar();
    }
    expect(creadas.map((c) => c.src)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5"]);
    expect(listos).toEqual([0, 1, 3, 4, 5]);
  });

  it("suelta cada imagen al terminar: sin manejadores que la retengan", () => {
    const { creadas } = preparar(3, 4);
    creadas[0].cargar();
    expect(creadas[0].onload).toBeNull();
    expect(creadas[0].onerror).toBeNull();
  });

  it("cancelar corta la cola y ya no avisa", () => {
    const { creadas, listos, cancelar, pedidas } = preparar(10, 4);
    cancelar();
    creadas[0].cargar();
    expect(listos).toEqual([]);
    expect(pedidas()).toEqual(["f0"]);
  });
});
