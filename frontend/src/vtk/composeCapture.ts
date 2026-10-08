/* Una sola imagen con lo que el profesional está viendo.

   El visor son cinco paneles independientes —escena, tres cortes y MIP—, cada
   uno con su propia ventana de vtk.js y su propio lienzo, y encima una capa
   HUD en HTML. Una captura «de pantalla» tiene que juntar las tres cosas:

     1. Los píxeles de cada panel, que solo su ventana sabe dar
        (`captureRenderWindow`: el búfer no se conserva, hay que pedir la
        imagen del siguiente render).
     2. Colocados donde están en pantalla, para que la imagen se lea igual que
        el visor: el principal arriba y la franja debajo.
     3. El HUD, que es el que dice hacia dónde mira el paciente, en qué corte
        va y con qué resolución — sin eso la imagen no se puede situar.

   El HUD se REDIBUJA aquí en el lienzo; no es una copia del DOM. Rasterizar
   HTML dentro de un canvas pide `foreignObject` con todo el CSS en línea, y
   con variables de color y una fuente web eso falla de formas silenciosas
   (texto que desaparece, fuente distinta). Se pagan estas ~80 líneas y a
   cambio la captura sale siempre igual. La colocación es espejo de `hud.css`:
   esquinas a 14 px, rótulo centrado arriba, mono de 10,5 px.

   LO QUE NO LLEVA: ningún dato del paciente. Ni nombre, ni historia, ni fecha
   de nacimiento. La fila de la base de datos sabe de quién es cada captura;
   los píxeles no, porque un PNG se reenvía sin pensarlo y no hay forma de
   recuperarlo. Quien la mire dentro del programa tiene el caso al lado.

   Sin vtk.js ni DOM: el visor pone las piezas y esto solo las ordena, así que
   la secuencia entera se puede probar con dobles. */

import type { Shape } from "./annotationOverlay";
import type { CaptureFn } from "./captureRenderWindow";

export type Corner = "tl" | "tr" | "bl" | "br";

export interface PaneRect { x: number; y: number; w: number; h: number }

export interface PaneShot {
  /** Identificador del panel, solo para diagnosticar. */
  id: string;
  rect: PaneRect;
  /** La captura del panel, o null si su escena no está montada. */
  capture: CaptureFn | null;
  /** Rótulo centrado arriba, como en el visor («AXIAL», «MIP»…). */
  label?: string;
  /** Lecturas por esquina, ya formateadas por quien las tiene. */
  readouts?: { at: Corner; lines: string[] }[];
  /** Las anotaciones que se ven en el panel, en px del panel (`readPaneShapes`). */
  shapes?: Shape[];
}

/** Los colores del HUD, ya resueltos: aquí no se leen variables CSS. */
export interface HudColors {
  /** Texto vivo. */ hud: string;
  /** Texto apagado y separaciones. */ dim: string;
  /** Fondo entre paneles. */ gap: string;
}

/** Un contexto 2D, con lo poco que se le pide. */
export interface Ctx2D {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: "left" | "right" | "center";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic";
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  setLineDash(d: number[]): void;
  measureText(t: string): { width: number };
  save(): void;
  restore(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
}

export interface ComposeDeps {
  /** Convierte un data URL en algo que `drawImage` acepte. */
  loadImage: (dataUrl: string) => Promise<unknown>;
  /** Un lienzo del tamaño pedido, y cómo sacarle el PNG. */
  makeCanvas: (w: number, h: number) => { ctx: Ctx2D; toDataURL: () => string };
}

export interface ComposeInput {
  width: number;
  height: number;
  panes: PaneShot[];
  /** La cinta de rumbo, ya en texto: «AZ 12° · EL -20°», o entre corchetes si
   *  la orientación es asumida. Va arriba, centrada, como en el visor. */
  heading?: string;
  /** Aviso de arriba a la derecha: «RESOLUCIÓN REDUCIDA · 1:2» y similares. */
  note?: string;
  colors: HudColors;
  /** Familia mono ya resuelta, p. ej. el valor de --font-mono. */
  fontFamily: string;
  deps: ComposeDeps;
}

const PAD = 14;          // margen de las lecturas, como .hud-readout
const LINE = 15;         // interlineado a 10,5 px con line-height 1.5, redondeado
const SIZE = 10.5;       // .hud-readout
const LABEL_SIZE = 10;   // .hud-label

/** Compone la imagen. Devuelve el data URL, o null si no hubo ni un panel. */
export async function composeCapture(input: ComposeInput): Promise<string | null> {
  const { width, height, panes, deps } = input;
  if (width <= 0 || height <= 0 || panes.length === 0) return null;

  // Las capturas se piden TODAS a la vez y antes de dibujar nada: cada una
  // fuerza un render en su ventana, y encadenarlas dejaba medio visor
  // repintándose mientras el resto ya estaba capturado.
  const shots = await Promise.all(
    panes.map(async (p) => {
      if (!p.capture) return null;
      try {
        const url = await p.capture();
        return url ? await deps.loadImage(url) : null;
      } catch {
        return null;   // un panel que no se deja capturar no tumba la captura
      }
    }),
  );
  if (shots.every((s) => s === null)) return null;

  const { ctx, toDataURL } = deps.makeCanvas(width, height);
  paintFrame(ctx, input, (i, r) => {
    const img = shots[i];
    if (!img) return false;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return true;
  });
  return toDataURL();
}

/** Lo que hace falta para pintar un fotograma, sin las capturas. */
export type FrameLayout = Pick<ComposeInput, "width" | "height" | "heading" | "note" | "colors" | "fontFamily"> & {
  panes: Omit<PaneShot, "capture">[];
};

/** Pinta un fotograma del visor: fondo, cada panel (lo pone `draw`) y el HUD.
 *
 *  Es lo común a la captura y a la grabación, para que una imagen y un vídeo
 *  del mismo visor no puedan diferir. `draw(i, rect)` dibuja el panel i y
 *  devuelve false si no pudo: su hueco queda en negro con «SIN IMAGEN». */
export function paintFrame(
  ctx: Ctx2D,
  frame: FrameLayout,
  draw: (index: number, rect: PaneRect) => boolean,
): void {
  const { width, height, panes, colors, fontFamily } = frame;
  // El fondo es el color de las separaciones: los huecos de 1 px entre paneles
  // salen solos, igual que en la franja del visor.
  ctx.fillStyle = colors.gap;
  ctx.fillRect(0, 0, width, height);

  panes.forEach((p, i) => {
    const { x, y, w, h } = p.rect;
    // Negro debajo de cada panel, como en el visor: si su imagen llega vacía
    // o transparente, se ve negro y no el color de las separaciones. Así salía
    // un vídeo con fotogramas enteros en verde.
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
    if (!draw(i, p.rect)) {
      ctx.fillStyle = colors.dim;
      ctx.font = `${SIZE}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SIN IMAGEN", x + w / 2, y + h / 2);
    }
    drawPaneHud(ctx, p, colors, fontFamily);
    if (p.shapes?.length) drawShapes(ctx, p.rect, p.shapes, fontFamily);
  });

  drawTopBand(ctx, frame);
}

/** Rótulo del panel y sus lecturas, en las esquinas de siempre. */
function drawPaneHud(ctx: Ctx2D, p: Omit<PaneShot, "capture">, colors: HudColors, fontFamily: string): void {
  const { x, y, w, h } = p.rect;
  if (p.label) {
    ctx.fillStyle = colors.dim;
    ctx.font = `${LABEL_SIZE}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(p.label.toUpperCase(), x + w / 2, y + 8);
  }
  ctx.font = `${SIZE}px ${fontFamily}`;
  for (const r of p.readouts ?? []) {
    const derecha = r.at === "tr" || r.at === "br";
    const abajo = r.at === "bl" || r.at === "br";
    ctx.fillStyle = colors.hud;
    ctx.textAlign = derecha ? "right" : "left";
    ctx.textBaseline = "top";
    const px = derecha ? x + w - PAD : x + PAD;
    // Abajo se apila hacia arriba: la última línea queda pegada al borde, que
    // es como se lee en pantalla.
    const py0 = abajo ? y + h - PAD - LINE * r.lines.length : y + 22;
    r.lines.forEach((linea, k) => ctx.fillText(linea, px, py0 + k * LINE));
  }
}

/** Las anotaciones de un panel, espejo de `HudAnnotations` y de `.hud-anot` en
 *  `hud.css`. El rótulo lleva un fondo oscuro en vez del contorno negro del
 *  SVG: en el lienzo un `strokeText` grueso empasta la mono de 10,5 px, y el
 *  rótulo tiene que leerse sobre hueso blanco igual que sobre fondo negro. */
export function drawShapes(ctx: Ctx2D, rect: PaneRect, shapes: Shape[], fontFamily: string): void {
  const { x: ox, y: oy } = rect;
  // En pantalla la celda recorta lo que su svg pinte fuera (un tramo del 3D
  // que se sale); aquí lo hace el recorte, o invadiría el panel vecino. El
  // restore() deja además el trazo discontinuo y los estilos como estaban.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  for (const s of shapes) {
    if (s.kind === "line") {
      ctx.setLineDash(s.dashed ? [6, 4] : []);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(ox + s.x1, oy + s.y1);
      ctx.lineTo(ox + s.x2, oy + s.y2);
      ctx.stroke();
    } else if (s.kind === "polygon") {
      if (s.points.length < 2) continue;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(ox + s.points[0].x, oy + s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(ox + p.x, oy + p.y);
      if (s.closed) ctx.closePath();
      if (s.fill && s.fill !== "none") {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 1.5;
      ctx.stroke();
    } else if (s.kind === "circle") {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(ox + s.x, oy + s.y, s.r, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Un rótulo del 3D anclado fuera de la celda: el recorte dejaría solo un
      // trozo de su fondo asomando por el borde, que es ruido.
      if (s.x < 0 || s.y < 0 || s.x > rect.w || s.y > rect.h) continue;
      // Línea base alfabética y a la izquierda: lo que hace <text> por defecto,
      // así el rótulo cae donde caía en pantalla.
      ctx.font = `${SIZE}px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const x = ox + s.x, y = oy + s.y;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(x - 3, y - 11, ctx.measureText(s.text).width + 6, 14);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, y);
    }
  }
  ctx.restore();
}

/** Cinta de rumbo y aviso, arriba del todo. */
function drawTopBand(ctx: Ctx2D, input: Pick<ComposeInput, "heading" | "note" | "colors" | "fontFamily" | "width">): void {
  const { heading, note, colors, fontFamily, width } = input;
  ctx.font = `${LABEL_SIZE}px ${fontFamily}`;
  ctx.textBaseline = "top";
  if (heading) {
    ctx.fillStyle = colors.hud;
    ctx.textAlign = "center";
    ctx.fillText(heading, width / 2, 8);
  }
  if (note) {
    ctx.fillStyle = colors.dim;
    ctx.textAlign = "right";
    ctx.fillText(note, width - PAD, 8);
  }
}

/** Los dos ayudantes del navegador, aparte para poder no usarlos al probar. */
export const browserDeps: ComposeDeps = {
  loadImage: (dataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("no se pudo leer la captura de un panel"));
      img.src = dataUrl;
    }),
  makeCanvas: (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2D para componer la captura");
    return { ctx: ctx as unknown as Ctx2D, toDataURL: () => canvas.toDataURL("image/png") };
  },
};
