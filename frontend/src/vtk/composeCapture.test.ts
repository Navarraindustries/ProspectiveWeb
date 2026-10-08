/* Componer la captura del visor: qué acaba dentro de la imagen y qué no.

   Lo que se defiende aquí:
   - Que están los cinco paneles, cada uno en su sitio, y no solo el 3D.
   - Que el HUD viaja dentro de los píxeles: sin el rumbo y el índice de corte
     la imagen no se puede situar seis semanas después.
   - Que un panel que no se deja capturar no tumba la captura entera.
   - Que NO se cuela ningún dato del paciente en la imagen. */
import { describe, expect, it, vi } from "vitest";

import { composeCapture, drawShapes, type ComposeDeps, type Ctx2D, type PaneShot } from "./composeCapture";

/** Un contexto 2D que apunta lo que le mandan dibujar. */
function recorder() {
  const textos: { text: string; x: number; y: number; align: string; color: string }[] = [];
  const imagenes: { src: unknown; x: number; y: number; w: number; h: number }[] = [];
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  // Todo en orden, para poder decir qué va antes de qué (el fondo del rótulo).
  const ops: unknown[][] = [];
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", font: "", textAlign: "left", textBaseline: "top", lineWidth: 1,
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: ctx.fillStyle }); ops.push(["fillRect", x, y, w, h, ctx.fillStyle]); },
    fillText(text, x, y) { textos.push({ text, x, y, align: ctx.textAlign, color: ctx.fillStyle }); ops.push(["fillText", text, x, y, ctx.fillStyle]); },
    drawImage(src, x, y, w, h) { imagenes.push({ src, x, y, w, h }); },
    beginPath: vi.fn(() => { ops.push(["beginPath"]); }),
    moveTo: vi.fn((x: number, y: number) => { ops.push(["moveTo", x, y]); }),
    lineTo: vi.fn((x: number, y: number) => { ops.push(["lineTo", x, y]); }),
    closePath: vi.fn(() => { ops.push(["closePath"]); }),
    stroke: vi.fn(() => { ops.push(["stroke", ctx.strokeStyle, ctx.lineWidth]); }),
    fill: vi.fn(() => { ops.push(["fill", ctx.fillStyle]); }),
    arc: vi.fn((x: number, y: number, r: number) => { ops.push(["arc", x, y, r]); }),
    setLineDash: vi.fn((d: number[]) => { ops.push(["setLineDash", d]); }),
    measureText: vi.fn((t: string) => ({ width: t.length * 6 })),
    save: vi.fn(() => { ops.push(["save"]); }),
    restore: vi.fn(() => { ops.push(["restore"]); }),
    rect: vi.fn((x: number, y: number, w: number, h: number) => { ops.push(["rect", x, y, w, h]); }),
    clip: vi.fn(() => { ops.push(["clip"]); }),
  };
  return { ctx, textos, imagenes, rects, ops };
}

function deps(rec = recorder()): { deps: ComposeDeps; rec: ReturnType<typeof recorder> } {
  return {
    rec,
    deps: {
      loadImage: async (url) => ({ url }),
      makeCanvas: () => ({ ctx: rec.ctx, toDataURL: () => "data:image/png;base64,COMPUESTA" }),
    },
  };
}

const COLORS = { hud: "#cfe", dim: "#567", gap: "#123" };

const panel = (id: string, x: number, y: number, w: number, h: number, extra: Partial<PaneShot> = {}): PaneShot => ({
  id, rect: { x, y, w, h }, capture: async () => `data:image/png;base64,${id}`, ...extra,
});

/** El visor de siempre: principal arriba, franja de cuatro debajo. */
function visor(extra: Partial<PaneShot> = {}): PaneShot[] {
  return [
    panel("scene", 0, 0, 800, 400, extra),
    panel("axial", 0, 401, 199, 199),
    panel("coronal", 200, 401, 199, 199),
    panel("sagital", 400, 401, 199, 199),
    panel("mip", 600, 401, 200, 199),
  ];
}

const base = (panes: PaneShot[], d: ComposeDeps, extra = {}) => ({
  width: 800, height: 600, panes, colors: COLORS, fontFamily: "mono", deps: d, ...extra,
});

describe("la captura lleva los cinco paneles", () => {
  it("dibuja cada panel donde está en pantalla", async () => {
    const { deps: d, rec } = deps();
    const url = await composeCapture(base(visor(), d));
    expect(url).toBe("data:image/png;base64,COMPUESTA");
    expect(rec.imagenes).toHaveLength(5);
    // El principal ocupa la parte de arriba; la franja va debajo, en fila.
    expect(rec.imagenes[0]).toMatchObject({ x: 0, y: 0, w: 800, h: 400 });
    expect(rec.imagenes.slice(1).map((i) => i.x)).toEqual([0, 200, 400, 600]);
    expect(rec.imagenes.slice(1).every((i) => i.y === 401)).toBe(true);
  });

  it("cada panel recibe SU propia imagen, no la del vecino", async () => {
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d));
    expect(rec.imagenes.map((i) => (i.src as { url: string }).url)).toEqual([
      "data:image/png;base64,scene", "data:image/png;base64,axial",
      "data:image/png;base64,coronal", "data:image/png;base64,sagital",
      "data:image/png;base64,mip",
    ]);
  });

  it("pide todas las capturas antes de dibujar", async () => {
    // Encadenarlas dejaba medio visor repintándose mientras el resto ya estaba
    // capturado, y la imagen salía con paneles de momentos distintos.
    const orden: string[] = [];
    const panes = visor().map((p) => ({
      ...p,
      capture: async () => { orden.push(`captura:${p.id}`); return `data:image/png;base64,${p.id}`; },
    }));
    const { deps: d, rec } = deps();
    const original = rec.ctx.drawImage;
    rec.ctx.drawImage = ((...a: Parameters<typeof original>) => { orden.push("dibuja"); return original(...a); }) as typeof original;
    await composeCapture(base(panes, d));
    expect(orden.filter((o) => o.startsWith("captura:"))).toHaveLength(5);
    expect(orden.indexOf("dibuja")).toBeGreaterThan(orden.lastIndexOf("captura:mip"));
  });

  it("el hueco entre paneles se ve porque el fondo lo pinta", async () => {
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d));
    expect(rec.rects[0]).toMatchObject({ x: 0, y: 0, w: 800, h: 600, color: COLORS.gap });
  });
});

describe("debajo de cada panel hay negro", () => {
  it("si la imagen del panel llega vacía se ve negro, no el color de las separaciones", async () => {
    // Pasó en vídeo: un lienzo de vtk copiado ya descartado es transparente, y
    // asomaba el fondo verde de las separaciones en fotogramas enteros.
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d));
    for (const p of visor()) {
      const r = p.rect;
      const negro = rec.rects.findIndex((x) => x.color === "#000" && x.x === r.x && x.y === r.y && x.w === r.w && x.h === r.h);
      const imagen = rec.imagenes.findIndex((i) => i.x === r.x && i.y === r.y);
      expect(negro, p.id).toBeGreaterThanOrEqual(0);
      expect(imagen, p.id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("el HUD viaja dentro de la imagen", () => {
  it("lleva el rumbo y el aviso de resolución", async () => {
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d, {
      heading: "AZ 12° · EL -20°", note: "RESOLUCIÓN REDUCIDA · 1:2",
    }));
    const dichos = rec.textos.map((t) => t.text);
    expect(dichos).toContain("AZ 12° · EL -20°");
    expect(dichos).toContain("RESOLUCIÓN REDUCIDA · 1:2");
  });

  it("una orientación asumida se lee como asumida", async () => {
    // El visor rodea con corchetes lo que no viene del DICOM. Si la captura lo
    // perdiera, una orientación inventada parecería medida.
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d, { heading: "[AZ 0° · EL -20°]" }));
    expect(rec.textos.map((t) => t.text)).toContain("[AZ 0° · EL -20°]");
  });

  it("lleva el rótulo y las lecturas de cada panel", async () => {
    const { deps: d, rec } = deps();
    const panes = visor();
    panes[1] = panel("axial", 0, 401, 199, 199, {
      label: "axial", readouts: [{ at: "bl", lines: ["193 / 384", "W 7578 · L -343"] }],
    });
    await composeCapture(base(panes, d));
    const dichos = rec.textos.map((t) => t.text);
    expect(dichos).toContain("AXIAL");
    expect(dichos).toContain("193 / 384");
    expect(dichos).toContain("W 7578 · L -343");
  });

  it("las lecturas de abajo se apilan hacia arriba y las de la derecha se alinean a la derecha", async () => {
    const { deps: d, rec } = deps();
    const panes = [panel("axial", 0, 0, 200, 200, {
      readouts: [{ at: "br", lines: ["uno", "dos"] }],
    })];
    await composeCapture({ ...base(panes, d), width: 200, height: 200 });
    const uno = rec.textos.find((t) => t.text === "uno")!;
    const dos = rec.textos.find((t) => t.text === "dos")!;
    expect(uno.y).toBeLessThan(dos.y);                 // «dos» queda más abajo
    expect(dos.y).toBeLessThan(200);                   // dentro del panel
    expect(uno.align).toBe("right");
  });
});

describe("las anotaciones salen en la imagen", () => {
  const RECT = { x: 100, y: 50, w: 200, h: 200 };

  it("la línea es un trazo desplazado por el panel, y discontinua si es borrador", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [{ kind: "line", x1: 1, y1: 2, x2: 30, y2: 40, color: "#f5c02e", width: 3, dashed: true }], "mono");
    expect(rec.ops).toEqual([
      ["save"], ["beginPath"], ["rect", 100, 50, 200, 200], ["clip"],
      ["setLineDash", [6, 4]], ["beginPath"], ["moveTo", 101, 52], ["lineTo", 130, 90], ["stroke", "#f5c02e", 3],
      ["restore"],
    ]);
  });

  it("todo va recortado al panel: un tramo del 3D que se sale no invade al vecino", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [
      { kind: "line", x1: 10, y1: 10, x2: 500, y2: -300, color: "#f5c02e", width: 1.5 },
      { kind: "circle", x: 7, y: 8, r: 2.5, color: "#f5c02e" },
    ], "mono");
    const at = (n: string) => rec.ops.findIndex((o) => o[0] === n);
    const last = (n: string) => rec.ops.map((o) => o[0]).lastIndexOf(n);
    expect(rec.ops[at("rect")]).toEqual(["rect", 100, 50, 200, 200]);
    expect(at("save")).toBeLessThan(at("rect"));
    expect(at("clip")).toBeGreaterThan(at("rect"));
    expect(at("clip")).toBeLessThan(at("moveTo"));
    expect(last("restore")).toBe(rec.ops.length - 1);
    expect(last("restore")).toBeGreaterThan(last("fill"));
  });

  it("el polígono se rellena y luego se perfila, con su grosor", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [{ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], color: "#3ad", fill: "#3ad33", closed: true, width: 3 }], "mono");
    expect(rec.ops).toContainEqual(["stroke", "#3ad", 3]);
    const nombres = rec.ops.map((o) => o[0]);
    expect(rec.ops).toContainEqual(["moveTo", 100, 50]);
    expect(rec.ops).toContainEqual(["lineTo", 110, 60]);
    expect(rec.ops).toContainEqual(["fill", "#3ad33"]);
    expect(nombres.indexOf("closePath")).toBeGreaterThan(-1);
    expect(nombres.indexOf("fill")).toBeLessThan(nombres.indexOf("stroke"));
  });

  it("el círculo es un arco relleno", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [{ kind: "circle", x: 7, y: 8, r: 2.5, color: "#f5c02e" }], "mono");
    expect(rec.ops).toContainEqual(["arc", 107, 58, 2.5]);
    expect(rec.ops).toContainEqual(["fill", "#f5c02e"]);
  });

  it("el rótulo lleva un fondo oscuro debajo, del ancho del texto", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [{ kind: "text", x: 20, y: 30, text: "R1 · 5,0 mm", color: "#f5c02e" }], "mono");
    const fondo = rec.ops.findIndex((o) => o[0] === "fillRect");
    const texto = rec.ops.findIndex((o) => o[0] === "fillText");
    expect(rec.ops[fondo]).toEqual(["fillRect", 117, 69, "R1 · 5,0 mm".length * 6 + 6, 14, "rgba(0,0,0,.6)"]);
    expect(rec.ops[texto]).toEqual(["fillText", "R1 · 5,0 mm", 120, 80, "#f5c02e"]);
    expect(fondo).toBeLessThan(texto);
  });

  it("un rótulo fuera del panel (3D detrás del borde) no invade al vecino", () => {
    const rec = recorder();
    drawShapes(rec.ctx, RECT, [{ kind: "text", x: 50, y: -212, text: "R1 · 59,7 mm", color: "#f5c02e" }], "mono");
    expect(rec.textos).toEqual([]);
  });

  it("paintFrame pinta las formas de cada panel encima de su imagen", async () => {
    const { deps: d, rec } = deps();
    const panes = visor();
    panes[1] = panel("axial", 0, 401, 199, 199, { shapes: [{ kind: "text", x: 5, y: 15, text: "M1", color: "#fff" }] });
    await composeCapture(base(panes, d));
    expect(rec.textos).toContainEqual(expect.objectContaining({ text: "M1", x: 5, y: 416 }));
  });
});

describe("cuando algo falla", () => {
  it("un panel sin escena montada deja su hueco rotulado, no un agujero negro", async () => {
    const { deps: d, rec } = deps();
    const panes = visor();
    panes[4] = { ...panes[4], capture: null };
    await composeCapture(base(panes, d));
    expect(rec.imagenes).toHaveLength(4);
    expect(rec.textos.map((t) => t.text)).toContain("SIN IMAGEN");
  });

  it("un panel que revienta al capturar no tumba la captura", async () => {
    const { deps: d, rec } = deps();
    const panes = visor();
    panes[2] = { ...panes[2], capture: async () => { throw new Error("contexto perdido"); } };
    const url = await composeCapture(base(panes, d));
    expect(url).toBe("data:image/png;base64,COMPUESTA");
    expect(rec.imagenes).toHaveLength(4);
  });

  it("si no se pudo capturar NI UN panel, no se guarda una imagen vacía", async () => {
    const { deps: d } = deps();
    const panes = visor().map((p) => ({ ...p, capture: null }));
    expect(await composeCapture(base(panes, d))).toBeNull();
  });

  it("sin paneles o sin tamaño no intenta nada", async () => {
    const { deps: d } = deps();
    expect(await composeCapture(base([], d))).toBeNull();
    expect(await composeCapture({ ...base(visor(), d), width: 0 })).toBeNull();
  });
});

describe("lo que NO puede acabar en los píxeles", () => {
  it("no hay forma de meterle datos del paciente", async () => {
    // La imagen se reenvía sin pensarlo y no se puede recuperar. Quién es el
    // paciente lo sabe la fila de la base de datos, no el PNG. Esta prueba
    // existe para que añadir un pie con el nombre tenga que romperla a
    // propósito.
    const { deps: d, rec } = deps();
    await composeCapture(base(visor(), d, { heading: "AZ 0° · EL -20°", note: "1:2" }));
    const todo = rec.textos.map((t) => t.text).join(" | ");
    for (const dato of ["Hernandez", "Tannia", "32453646568", "1999", "paciente", "HC-"]) {
      expect(todo).not.toContain(dato);
    }
    // Y la entrada no tiene por dónde colarlos: solo rumbo, aviso y lecturas.
    const claves = Object.keys(base(visor(), d, {})).sort();
    expect(claves).toEqual(["colors", "deps", "fontFamily", "height", "panes", "width"]);
  });
});

describe("los ayudantes del navegador", () => {
  it("se pueden sustituir enteros al probar", () => {
    // Si `composeCapture` tocara `document` o `Image` por su cuenta, esta
    // suite no podría correr en jsdom sin lienzo.
    const espia = vi.fn();
    expect(() => composeCapture({
      width: 1, height: 1, panes: [], colors: COLORS, fontFamily: "mono",
      deps: { loadImage: espia, makeCanvas: espia as never },
    })).not.toThrow();
  });
});
