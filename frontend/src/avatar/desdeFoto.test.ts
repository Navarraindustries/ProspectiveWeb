import { describe, expect, it, vi } from "vitest";
import { COLORES_PELO, ETIQUETAS, PIELES } from "./config";
import { LADO_MAX, decodificarLocal, leerRasgos, masCercano, medianaRegion, opcionesDecodificado } from "./desdeFoto";

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

describe("decodificado local reducido", () => {
  it("opciones: siempre orientación EXIF; reduce solo si sobra, por un lado (el otro sigue la proporción)", () => {
    expect(opcionesDecodificado(null)).toEqual({ imageOrientation: "from-image" });
    expect(opcionesDecodificado({ ancho: 800, alto: 600 })).toEqual({ imageOrientation: "from-image" });
    const grande = opcionesDecodificado({ ancho: 4000, alto: 3000 });
    expect(grande).toMatchObject({ imageOrientation: "from-image", resizeWidth: LADO_MAX, resizeQuality: "high" });
    expect(grande.resizeHeight).toBeUndefined();
    expect(opcionesDecodificado({ ancho: 3000, alto: 4000 }).resizeWidth).toBe(768);
  });

  it("decodificarLocal pide el bitmap ya reducido, sin red, y entrega ≤ 1024 px", async () => {
    const pedidas: unknown[] = [];
    const orig = { cib: globalThis.createImageBitmap, img: globalThis.Image, cou: URL.createObjectURL, rou: URL.revokeObjectURL, fetch: globalThis.fetch };
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    URL.createObjectURL = vi.fn(() => "blob:local");
    URL.revokeObjectURL = vi.fn();
    globalThis.Image = class {
      naturalWidth = 4032; naturalHeight = 3024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_u: string) { queueMicrotask(() => this.onload?.()); }
    } as unknown as typeof Image;
    globalThis.createImageBitmap = vi.fn(async (_f: unknown, op?: ImageBitmapOptions) => {
      pedidas.push(op);
      return { width: op?.resizeWidth ?? 4032, height: op?.resizeWidth ? 768 : 3024, close: vi.fn() } as unknown as ImageBitmap;
    }) as unknown as typeof createImageBitmap;
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ width: w, height: h })) };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    try {
      const d = await decodificarLocal(new File(["x"], "yo.jpg", { type: "image/jpeg" }));
      expect(pedidas).toEqual([{ imageOrientation: "from-image", resizeWidth: 1024, resizeQuality: "high" }]);
      expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(LADO_MAX);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      getContext.mockRestore();
      globalThis.createImageBitmap = orig.cib; globalThis.Image = orig.img; globalThis.fetch = orig.fetch;
      URL.createObjectURL = orig.cou; URL.revokeObjectURL = orig.rou;
    }
  });
});
