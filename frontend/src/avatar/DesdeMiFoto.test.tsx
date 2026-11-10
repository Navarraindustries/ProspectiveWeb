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

import { DesdeMiFoto } from "./DesdeMiFoto";

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
});
