import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolverObjetivo } from "./resolverObjetivo";
import { useRecorrido, type Parada } from "./useRecorrido";
import { Burbuja } from "./Burbuja";
import { Foco } from "./Foco";

vi.mock("../../hooks/useEstrecho", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useEstrecho")>()),
  useMovil: vi.fn(() => false),
}));
import { useMovil } from "../../hooks/useEstrecho";

const rectDe = (x: number, w = 100) =>
  ({ x, y: 10, left: x, top: 10, width: w, height: 40, right: x + w, bottom: 50, toJSON() {} }) as DOMRect;

function poner(id: string, rect: DOMRect | null, estilo = "") {
  const el = document.createElement("div");
  el.setAttribute("data-tour", id);
  if (estilo) el.setAttribute("style", estilo);
  el.getBoundingClientRect = () => rect ?? rectDe(0, 0);
  document.body.appendChild(el);
  return el;
}

const expl = (t: string) => ({ titulo: t, como: `como ${t}`, cuando: `cuando ${t}`, porque: `porque ${t}` });
const paradas = (opc = false): Parada[] => [
  { id: "a", objetivos: ["a"], explicacion: expl("A") },
  { id: "b", objetivos: ["nada"], explicacion: expl("B"), opcional: opc },
  { id: "c", objetivos: ["c"], explicacion: expl("C") },
];

beforeEach(() => { document.body.innerHTML = ""; vi.mocked(useMovil).mockReturnValue(false); });
afterEach(() => vi.restoreAllMocks());

describe("resolverObjetivo", () => {
  it("elige el segundo id si el primero no es visible; null si ninguno", () => {
    poner("x", rectDe(0, 0));
    const y = poner("y", rectDe(5));
    expect(resolverObjetivo(["x", "y"])).toBe(y);
    expect(resolverObjetivo(["x", "z"])).toBeNull();
  });
  it("descarta display:none y visibility:hidden", () => {
    poner("x", rectDe(5), "display:none");
    poner("w", rectDe(5), "visibility:hidden");
    expect(resolverObjetivo(["x", "w"])).toBeNull();
  });
});

describe("useRecorrido", () => {
  it("salta una parada opcional sin objetivo", () => {
    poner("a", rectDe(1)); poner("c", rectDe(2));
    const { result } = renderHook(() => useRecorrido(paradas(true), { onTerminar: vi.fn() }));
    expect(result.current.indice).toBe(0);
    act(() => result.current.siguiente());
    expect(result.current.parada.id).toBe("c");
    act(() => result.current.anterior());
    expect(result.current.parada.id).toBe("a");
  });
  it("una parada no opcional sin objetivo se queda (objetivo null)", () => {
    poner("a", rectDe(1));
    const { result } = renderHook(() => useRecorrido(paradas(false), { onTerminar: vi.fn() }));
    act(() => result.current.siguiente());
    expect(result.current.parada.id).toBe("b");
    expect(result.current.objetivo).toBeNull();
  });
  it("saltar y completar avisan", () => {
    poner("a", rectDe(1)); poner("c", rectDe(2));
    const fin = vi.fn();
    const { result } = renderHook(() => useRecorrido(paradas(true), { onTerminar: fin }));
    act(() => result.current.siguiente());
    act(() => result.current.siguiente());
    expect(fin).toHaveBeenCalledWith("completado");
    const fin2 = vi.fn();
    const r2 = renderHook(() => useRecorrido(paradas(true), { onTerminar: fin2 }));
    act(() => r2.result.current.saltar());
    expect(fin2).toHaveBeenCalledWith("saltado");
  });
  it("recalcula rect en resize y tolera que el objetivo se desmonte", () => {
    const a = poner("a", rectDe(1));
    const { result } = renderHook(() => useRecorrido(paradas(true), { onTerminar: vi.fn() }));
    expect(result.current.rect?.left).toBe(1);
    a.getBoundingClientRect = () => rectDe(77);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(result.current.rect?.left).toBe(77);
    a.remove();
    expect(() => act(() => { window.dispatchEvent(new Event("resize")); })).not.toThrow();
    expect(result.current.objetivo).toBeNull();
    expect(result.current.rect).toBeNull();
  });
});

describe("Foco", () => {
  it("lleva data-foco y funciona sin rect", () => {
    const { container, rerender } = render(<Foco rect={null} />);
    expect(container.querySelector("[data-foco]")).not.toBeNull();
    rerender(<Foco rect={rectDe(10)} />);
    expect(container.querySelector("[data-foco]")).not.toBeNull();
  });
});

describe("Burbuja", () => {
  const props = () => ({ explicacion: expl("A"), indice: 0, total: 3, onSiguiente: vi.fn(), onAnterior: vi.fn(), onSaltar: vi.fn() });
  it("muestra etiquetas, textos y anuncia la parada", () => {
    render(<Burbuja {...props()} />);
    for (const t of ["Cómo", "Cuándo", "Por qué"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText("como A")).toBeTruthy();
    expect(screen.getByText("Parada 1 de 3: A")).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
  it("teclado: ← en la primera no hace nada; → siguiente; Esc salta", () => {
    const p = props();
    render(<Burbuja {...p} />);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(p.onAnterior).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(p.onSiguiente).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onSaltar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Saltar recorrido" }));
    expect(p.onSaltar).toHaveBeenCalledTimes(2);
  });
  it("no captura teclas que no maneja y limpia al desmontar", () => {
    const p = props();
    const { unmount } = render(<Burbuja {...p} />);
    const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    unmount();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(p.onSiguiente).not.toHaveBeenCalled();
  });
  it("ofrece «Anterior» deshabilitado en la primera y etiqueta de siguiente", () => {
    render(<Burbuja {...props()} etiquetaSiguiente="Empezar" />);
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Empezar" })).toBeTruthy();
  });
  it("en móvil se pinta como hoja inferior", () => {
    vi.mocked(useMovil).mockReturnValue(true);
    render(<Burbuja {...props()} rect={rectDe(10)} />);
    expect(document.querySelector('[data-variante="hoja"]')).not.toBeNull();
  });
  it("sin rect va centrada", () => {
    render(<Burbuja {...props()} />);
    expect(document.querySelector('[data-variante="centrada"]')).not.toBeNull();
  });
});
