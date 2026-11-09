import { describe, expect, it } from "vitest";
import { COLORES_PELO, ETIQUETAS, PIELES } from "./config";
import { leerRasgos, masCercano, medianaRegion } from "./desdeFoto";

type Img = { data: Uint8ClampedArray; width: number; height: number };

function hex(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function imagen(w: number, h: number, fondo: string): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  const [r, g, b] = hex(fondo);
  for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
  return { data, width: w, height: h };
}
function pintar(img: Img, x0: number, y0: number, w: number, h: number, color: string) {
  const [r, g, b] = hex(color);
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y0 + h)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x0 + w)); x++)
      img.data.set([r, g, b, 255], (y * img.width + x) * 4);
}

describe("medianaRegion", () => {
  it("devuelve el color mayoritario de la región", () => {
    const img = imagen(10, 10, "#FF0000");
    pintar(img, 0, 0, 10, 2, "#00FF00");
    pintar(img, 0, 2, 10, 1, "#0000FF");
    expect(medianaRegion(img as unknown as ImageData, { x: 0, y: 0, w: 10, h: 10 })).toEqual([255, 0, 0]);
  });
  it("recorta la región a la imagen", () => {
    const img = imagen(4, 4, "#102030");
    expect(medianaRegion(img as unknown as ImageData, { x: -5, y: -5, w: 100, h: 100 })).toEqual([16, 32, 48]);
  });
});

describe("masCercano", () => {
  it("elige el índice de la paleta más próximo", () => {
    expect(masCercano([0xc6, 0x8a, 0x63], PIELES)).toBe(2);
    expect(masCercano([250, 220, 200], PIELES)).toBe(0);
  });
});

describe("leerRasgos", () => {
  it("mejillas #C68A63 y franja #121212 → piel «Media», pelo negro", () => {
    const img = imagen(200, 200, "#DCE3EC");
    const guia = { cx: 100, cy: 100, rx: 50, ry: 70 };
    for (const sx of [-0.45, 0.45]) {
      pintar(img, guia.cx + sx * guia.rx - 0.1 * guia.rx, guia.cy + 0.15 * guia.ry - 0.1 * guia.ry,
        0.2 * guia.rx, 0.2 * guia.ry, "#C68A63");
    }
    pintar(img, guia.cx - 0.4 * guia.rx, guia.cy - 1.05 * guia.ry, 0.8 * guia.rx, 0.3 * guia.ry, "#121212");
    const r = leerRasgos(img as unknown as ImageData, guia);
    expect(ETIQUETAS.piel[r.piel]).toBe("Media");
    expect(r.pelo).toBe(COLORES_PELO[1]);
  });
});
