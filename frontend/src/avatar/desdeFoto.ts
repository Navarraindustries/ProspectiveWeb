/* Lectura de rasgos de una foto, 100 % en el navegador. Funciones puras sobre
   ImageData: nada de aquí toca la red. */
import { COLORES_PELO, PIELES } from "./config";

export type Region = { x: number; y: number; w: number; h: number };
export type Guia = { cx: number; cy: number; rx: number; ry: number };
export type Rgb = [number, number, number];

function mediana(v: number[]): number {
  v.sort((a, b) => a - b);
  return v[v.length >> 1] ?? 0;
}

/** Mediana por canal de los píxeles de la región (recortada a la imagen). */
export function medianaRegion(img: ImageData, r: Region): Rgb {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(img.width, Math.ceil(r.x + r.w)), y1 = Math.min(img.height, Math.ceil(r.y + r.h));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  }
  return [mediana(rs), mediana(gs), mediana(bs)];
}

function aRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** Índice del color de la paleta (hex) más cercano, por distancia euclídea en RGB. */
export function masCercano(rgb: Rgb, paleta: readonly string[]): number {
  let mejor = 0, dMejor = Infinity;
  paleta.forEach((h, i) => {
    const p = aRgb(h);
    const d = (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2;
    if (d < dMejor) { dMejor = d; mejor = i; }
  });
  return mejor;
}

/** Piel (mejillas) y pelo (franja sobre la frente) según el óvalo de la guía. */
export function leerRasgos(img: ImageData, g: Guia): { piel: number; pelo: string } {
  const mejilla = (signo: number): Rgb => medianaRegion(img, {
    x: g.cx + signo * 0.45 * g.rx - 0.1 * g.rx, y: g.cy + 0.15 * g.ry - 0.1 * g.ry,
    w: 0.2 * g.rx, h: 0.2 * g.ry,
  });
  const a = mejilla(-1), b = mejilla(1);
  const piel = masCercano([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], PIELES);
  const franja = medianaRegion(img, {
    x: g.cx - 0.4 * g.rx, y: g.cy - 1.05 * g.ry, w: 0.8 * g.rx, h: 0.3 * g.ry,
  });
  return { piel, pelo: COLORES_PELO[masCercano(franja, COLORES_PELO)] };
}

/* ---- Implementaciones por defecto con canvas (no se ejercitan en jsdom) ---- */

export const MAX_BYTES = 6 * 1024 * 1024;
export const LADO_MAX = 1024;

/** Ancho y alto de la foto sin decodificarla entera: un <img> sobre una URL local
    (blob:, nada sale del navegador) lee la cabecera. null si no se puede. */
export function medirImagen(file: Blob): Promise<{ ancho: number; alto: number } | null> {
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") return Promise.resolve(null);
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    const fin = (r: { ancho: number; alto: number } | null) => { URL.revokeObjectURL?.(url); res(r); };
    im.onload = () => fin(im.naturalWidth > 0 && im.naturalHeight > 0 ? { ancho: im.naturalWidth, alto: im.naturalHeight } : null);
    im.onerror = () => fin(null);
    im.src = url;
  });
}

/** Opciones de createImageBitmap: orientación EXIF aplicada y, si se conoce el tamaño y
    sobra, decodificada ya reducida (un solo lado: el otro sigue la proporción). */
export function opcionesDecodificado(medida: { ancho: number; alto: number } | null): ImageBitmapOptions {
  const op: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (medida && Math.max(medida.ancho, medida.alto) > LADO_MAX) {
    const k = LADO_MAX / Math.max(medida.ancho, medida.alto);
    op.resizeWidth = Math.max(1, Math.round(medida.ancho * k));
    op.resizeQuality = "high";
  }
  return op;
}

/** Decodifica en local (createImageBitmap), reducida desde el principio cuando se puede,
    y la deja en ≤ 1024 px por lado. */
export async function decodificarLocal(file: File): Promise<ImageData> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, opcionesDecodificado(await medirImagen(file)));
  } catch {
    bmp = await createImageBitmap(file); // navegador sin opciones: decodificado normal
  }
  const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return ctx.getImageData(0, 0, w, h);
}

/** Recorta al óvalo (caja del óvalo, fuera del óvalo en neutro) y devuelve un JPEG ≤ 1024 px. */
export async function recortarLocal(img: ImageData, g: Guia): Promise<Blob> {
  const src = document.createElement("canvas");
  src.width = img.width; src.height = img.height;
  src.getContext("2d")!.putImageData(img, 0, 0);
  const bw = 2 * g.rx, bh = 2 * g.ry;
  const k = Math.min(1, LADO_MAX / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * k)), h = Math.max(1, Math.round(bh * k));
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#DCE3EC";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(src, g.cx - g.rx, g.cy - g.ry, bw, bh, 0, 0, w, h);
  return new Promise((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error("sin blob"))), "image/jpeg", 0.88));
}
