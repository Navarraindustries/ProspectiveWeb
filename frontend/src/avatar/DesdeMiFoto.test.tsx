import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configPorDefecto } from "./config";

let user: Record<string, unknown>;
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));
let movil = false;
vi.mock("../hooks/useEstrecho", async (orig) => ({
  ...(await orig<typeof import("../hooks/useEstrecho")>()),
  useMovil: () => movil,
}));

import { DesdeMiFoto, acotarDesplazamiento, pixelesPorCss } from "./DesdeMiFoto";

const base = configPorDefecto(3);
const imgFalsa = () => {
  const data = new Uint8ClampedArray(100 * 100 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([0xc6, 0x8a, 0x63, 255], i);
  return { data, width: 100, height: 100 } as unknown as ImageData;
};
const jpg = () => new File(["x"], "yo.jpg", { type: "image/jpeg" });

let fetchSpy: ReturnType<typeof vi.fn>;
let xhrSpy: ReturnType<typeof vi.fn>;
const fetchOriginal = globalThis.fetch;
const xhrOriginal = globalThis.XMLHttpRequest;
beforeEach(() => {
  user = { id: 3, has_photo: false };
  movil = false;
  fetchSpy = vi.fn(); xhrSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  globalThis.XMLHttpRequest = xhrSpy as unknown as typeof XMLHttpRequest;
});
afterEach(() => { globalThis.fetch = fetchOriginal; globalThis.XMLHttpRequest = xhrOriginal; });

function subir(f: File) {
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [f] } });
}

describe("DesdeMiFoto", () => {
  it("«Mi avatar»: foto null y ni fetch ni XHR en todo el flujo", async () => {
    const onListo = vi.fn();
    render(<DesdeMiFoto base={base} onListo={onListo} onCancel={() => {}}
      decodificar={async () => imgFalsa()} />);
    subir(jpg());
    fireEvent.click(await screen.findByRole("button", { name: "Leer colores" }));
    expect(await screen.findByText("¿Qué quieres que vean los demás?")).toBeInTheDocument();
    expect(screen.getByText("Tu foto nunca se envía a servicios externos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mi avatar" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(onListo).toHaveBeenCalledTimes(1));
    const r = onListo.mock.calls[0][0];
    expect(r.foto).toBeNull();
    expect(r.mostrar).toBe("avatar");
    expect(r.config.piel).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it("«Mi foto»: entrega el recorte", async () => {
    const onListo = vi.fn();
    const blob = new Blob(["j"], { type: "image/jpeg" });
    render(<DesdeMiFoto base={base} onListo={onListo} onCancel={() => {}}
      decodificar={async () => imgFalsa()} recortar={async () => blob} />);
    subir(jpg());
    fireEvent.click(await screen.findByRole("button", { name: "Leer colores" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(onListo).toHaveBeenCalled());
    expect(onListo.mock.calls[0][0]).toMatchObject({ mostrar: "foto", foto: blob });
  });

  it("«Usar la foto de mi registro» solo si hay foto de registro", async () => {
    const { unmount } = render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}}
      decodificar={async () => imgFalsa()} />);
    subir(jpg());
    fireEvent.click(await screen.findByRole("button", { name: "Leer colores" }));
    await screen.findByText("¿Qué quieres que vean los demás?");
    expect(screen.queryByRole("button", { name: "Usar la foto de mi registro" })).toBeNull();
    unmount();
    user = { id: 3, has_photo: true };
    const onListo = vi.fn();
    render(<DesdeMiFoto base={base} onListo={onListo} onCancel={() => {}}
      decodificar={async () => imgFalsa()} />);
    subir(jpg());
    fireEvent.click(await screen.findByRole("button", { name: "Leer colores" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar la foto de mi registro" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(onListo).toHaveBeenCalled());
    expect(onListo.mock.calls[0][0]).toMatchObject({ mostrar: "foto", foto: null, usarRegistro: true });
  });

  it("fichero que no se decodifica: mensaje y no se avanza", async () => {
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}}
      decodificar={async () => { throw new Error("x"); }} />);
    subir(jpg());
    expect(await screen.findByText("No hemos podido leer esa imagen. Prueba con un JPG o PNG.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leer colores" })).toBeNull();
  });

  it("fichero que no es imagen: mismo mensaje, sin decodificar", async () => {
    const dec = vi.fn();
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={dec} />);
    subir(new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("No hemos podido leer esa imagen. Prueba con un JPG o PNG.")).toBeInTheDocument();
    expect(dec).not.toHaveBeenCalled();
  });

  it("en el móvil no fuerza la cámara: sin `capture`, con galería y cámara vía accept", () => {
    movil = true;
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} />);
    const input = document.querySelector('input[type="file"]')!;
    expect(input.hasAttribute("capture")).toBe(false);
    expect(input.getAttribute("accept")).toBe("image/*");
  });

  it("fichero sin tipo (algunos selectores de Android): se intenta decodificar y sigue", async () => {
    const dec = vi.fn(async () => imgFalsa());
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={dec} />);
    subir(new File(["x"], "IMG_0001", { type: "" }));
    expect(await screen.findByRole("button", { name: "Leer colores" })).toBeInTheDocument();
    expect(dec).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No hemos podido leer esa imagen. Prueba con un JPG o PNG.")).toBeNull();
  });

  it("fichero sin tipo que no se decodifica: el mismo aviso", async () => {
    const dec = vi.fn(async () => { throw new Error("x"); });
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={dec} />);
    subir(new File(["x"], "raro", { type: "" }));
    expect(await screen.findByText("No hemos podido leer esa imagen. Prueba con un JPG o PNG.")).toBeInTheDocument();
    expect(dec).toHaveBeenCalledTimes(1);
  });

  it("fichero > 6 MB: «La foto supera 6 MB.» sin decodificar", async () => {
    const dec = vi.fn();
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={dec} />);
    const f = new File(["x"], "g.jpg", { type: "image/jpeg" });
    Object.defineProperty(f, "size", { value: 6 * 1024 * 1024 + 1 });
    subir(f);
    expect(await screen.findByText("La foto supera 6 MB.")).toBeInTheDocument();
    expect(dec).not.toHaveBeenCalled();
  });

  it("Esc cierra «Desde mi foto» y no llega a la hoja ni al recorrido que lo contienen", () => {
    const onCancel = vi.fn();
    const deFuera = vi.fn();
    document.addEventListener("keydown", deFuera);
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    document.removeEventListener("keydown", deFuera);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(deFuera).not.toHaveBeenCalled();
    expect(document.querySelector("[data-escape-propio]")).not.toBeNull();
  });

  it("la rueda acerca y no desplaza la hoja (escuchador no pasivo con preventDefault)", async () => {
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={async () => imgFalsa()} />);
    subir(jpg());
    const visor = await screen.findByLabelText("Encaja tu cara en el óvalo");
    expect(fireEvent.wheel(visor, { deltaY: -100, cancelable: true })).toBe(false);
    expect((screen.getByRole("slider", { name: "Zoom" }) as HTMLInputElement).value).toBe("1.08");
  });

  /** Recorre hasta «Mi foto» + «Listo» y devuelve la guía que recibe el recorte. */
  async function guiaTras(mover: (visor: HTMLElement) => void) {
    const recortar = vi.fn(async () => new Blob(["j"]));
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={async () => imgFalsa()} recortar={recortar} />);
    subir(jpg());
    const visor = await screen.findByLabelText("Encaja tu cara en el óvalo");
    mover(visor);
    fireEvent.click(screen.getByRole("button", { name: "Leer colores" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mi foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(recortar).toHaveBeenCalled());
    return (recortar.mock.calls[0] as unknown as [unknown, { cx: number; cy: number }])[1];
  }
  const arrastrar = (visor: HTMLElement, dx: number) => {
    fireEvent.pointerDown(visor, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(visor, { pointerId: 1, clientX: dx, clientY: 0 });
    fireEvent.pointerUp(visor, { pointerId: 1, clientX: dx, clientY: 0 });
  };

  it("arrastrar en un visor encogido mueve la foto en px del canvas, no en px CSS", async () => {
    // Visor de 300 px de canvas pintado a 150 px CSS: 10 px de dedo son 20 de canvas.
    const g = await guiaTras((visor) => {
      Object.defineProperty(visor, "clientWidth", { configurable: true, value: 150 });
      arrastrar(visor, 10);
    });
    // Imagen de 100 px en un visor de 300: escala 3. cx = 50 - 20 / 3.
    expect(g.cx).toBeCloseTo(50 - 20 / 3, 5);
  });

  it("al alejar el zoom, el desplazamiento se vuelve a acotar", async () => {
    const g = await guiaTras((visor) => {
      Object.defineProperty(visor, "clientWidth", { configurable: true, value: 300 });
      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "4" } });
      arrastrar(visor, 300); // a zoom 4 (escala 12) cabe: tope 600
      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "1" } });
    });
    // A zoom 1 (escala 3) el tope es 150: cx = 50 - 150 / 3 = 0 (sin volver a acotar sería -50).
    expect(g.cx).toBeCloseTo(0, 5);
  });

  it("acotarDesplazamiento y pixelesPorCss", () => {
    const o = { x: 10, y: -5 };
    expect(acotarDesplazamiento(o, 100, 100, 3)).toBe(o);
    expect(acotarDesplazamiento({ x: 400, y: -400 }, 100, 100, 3)).toEqual({ x: 150, y: -150 });
    expect(pixelesPorCss({ width: 300, clientWidth: 150 })).toBe(2);
    expect(pixelesPorCss({ width: 300, clientWidth: 0 })).toBe(1);
  });

  it("en estrecho, «Cambiar foto» va aparte y «Cancelar» + la acción principal juntas", async () => {
    render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={async () => imgFalsa()} />);
    subir(jpg());
    const leer = await screen.findByRole("button", { name: "Leer colores" });
    const fin = leer.parentElement!;
    expect(fin.className).toBe("dmf-acciones__fin");
    expect(fin).toContainElement(screen.getByRole("button", { name: "Cancelar" }));
    expect(fin).not.toContainElement(screen.getByRole("button", { name: "Cambiar foto" }));
    fireEvent.click(leer);
    expect(screen.getByRole("button", { name: "Listo" }).parentElement).toBe(fin);
    const css = readFileSync(join(__dirname, "avatar.css"), "utf-8");
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*\.dmf-acciones__cambiar \{\s*flex: 1 1 100%;/);
  });

  it("Esc que nace en otro diálogo encima (que no contiene el panel) no cierra la foto", () => {
    const onCancel = vi.fn();
    render(<><DesdeMiFoto base={base} onListo={() => {}} onCancel={onCancel} />
      <div role="dialog" aria-modal="true"><button type="button">confirmar</button></div></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "confirmar" }), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    // Desde un diálogo que SÍ lo contiene (la hoja, la capa de bienvenida), Esc cierra la foto.
    const { unmount } = render(<div role="dialog"><DesdeMiFoto base={base} onListo={() => {}} onCancel={onCancel} /></div>);
    fireEvent.keyDown(screen.getAllByRole("button", { name: "Cancelar" })[1], { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    unmount();
  });

  it("al cerrar el panel suelta el lienzo de la foto (0 × 0)", async () => {
    const lienzos: HTMLCanvasElement[] = [];
    const crear = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = crear(tag);
      if (tag === "canvas") lienzos.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
    const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? undefined : vi.fn()), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const { unmount } = render(<DesdeMiFoto base={base} onListo={() => {}} onCancel={() => {}} decodificar={async () => imgFalsa()} />);
    subir(jpg());
    await screen.findByLabelText("Encaja tu cara en el óvalo");
    // El del visor lo pinta React; el de la foto es el que no está en la página.
    const cache = lienzos.filter((c) => !c.isConnected);
    expect(cache).toHaveLength(1);
    expect(cache[0].width).toBe(100);
    unmount();
    expect([cache[0].width, cache[0].height]).toEqual([0, 0]);
    vi.restoreAllMocks();
  });
});
