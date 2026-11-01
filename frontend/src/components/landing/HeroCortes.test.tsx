import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { HeroCortes } from "./HeroCortes";
import { CONSULTA_HERO_QUIETO } from "./heroFrames";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

const LEMA = "Planificación neurovascular con datos";
const montar = () => render(<HeroCortes onEntrar={() => {}} onCrearCuenta={() => {}} />);
const cortes = (c: HTMLElement) => c.querySelectorAll('img[src^="/media/landing/hero/"]');

/* matchMedia que solo cumple las consultas dadas. */
function conConsultas(...cumplen: string[]) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: cumplen.includes(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/* Cuenta las `Image` que se crean (la precarga) y las rutas que piden. */
function espiarImagenes() {
  const pedidas: string[] = [];
  class ImagenEspia {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) { pedidas.push(v); }
  }
  vi.stubGlobal("Image", ImagenEspia);
  return pedidas;
}

/* La disposición quieta, de verdad: sin escenario de 300 vh, sin cortes ni
   rótulo, sin transformaciones en línea, y con la ventana visible y accesible. */
function esperarQuieto(container: HTMLElement) {
  const seccion = container.querySelector("section") as HTMLElement;
  expect(seccion).toHaveClass("hero-cortes--quieto");
  expect(seccion.getAttribute("style")).toBeNull();
  expect(container.querySelectorAll('[style*="300vh"]')).toHaveLength(0);
  for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
    expect(el.style.transform).toBe("");
  }
  expect(cortes(container)).toHaveLength(0);
  expect(screen.queryByText(/^W 600 · L 60/)).toBeNull();
  const cabecera = screen.getByText("Detección · 5 candidatos");
  expect(cabecera.closest("[aria-hidden]")).toBeNull();
  expect((cabecera.closest(".hero-cortes__ventana") as HTMLElement).style.opacity).toBe("1");
}

describe("HeroCortes", () => {
  beforeEach(() => { reducida.valor = false; });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "connection");
  });

  it("el lema aparece una sola vez, con los dos accesos", () => {
    const { container } = montar();
    expect((container.textContent ?? "").split(LEMA)).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1, name: LEMA })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
  });

  it("sin movimiento reducido y en escritorio arranca en el primer corte, con su rótulo y 300 vh", () => {
    const { container } = montar();
    const primera = container.querySelector("img");
    expect(primera).toHaveAttribute("src", "/media/landing/hero/000.webp");
    expect(cortes(container)).toHaveLength(1);
    expect(screen.getByText("W 600 · L 60 · corte 60/594")).toBeInTheDocument();
    const seccion = container.querySelector("section") as HTMLElement;
    expect(seccion.style.height).toBe("300vh");
    expect(seccion).not.toHaveClass("hero-cortes--quieto");
  });

  it("con movimiento reducido: disposición quieta, sin 300 vh ni transformaciones", () => {
    reducida.valor = true;
    const { container } = montar();
    esperarQuieto(container);
    expect(container.querySelector('img[src="/media/landing/hero-3d.webp"]')).not.toBeNull();
  });

  it("en pantalla estrecha o baja (sin movimiento reducido) también es quieto, con la ventana entera", () => {
    conConsultas(CONSULTA_HERO_QUIETO);
    const { container } = montar();
    esperarQuieto(container);
    expect(screen.getByRole("img", { name: /Malla 3D del árbol vascular/ })).toBeInTheDocument();
  });

  it("con ahorro de datos es quieto y no precarga ningún corte", () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    const pedidas = espiarImagenes();
    const { container } = montar();
    esperarQuieto(container);
    expect(pedidas).toEqual([]);
  });

  it("en pantalla pequeña no precarga los cortes", () => {
    conConsultas(CONSULTA_HERO_QUIETO);
    const pedidas = espiarImagenes();
    montar();
    expect(pedidas).toEqual([]);
  });

  it("animado, la precarga empieza por el fotograma 0, solo", () => {
    const pedidas = espiarImagenes();
    montar();
    expect(pedidas).toEqual(["/media/landing/hero/000.webp"]);
  });

  it("animado, la ventana sigue en el árbol de accesibilidad antes del 85 % del scroll", () => {
    montar();
    const cabecera = screen.getByText("Detección · 5 candidatos");
    expect(cabecera.closest("[aria-hidden]")).toBeNull();
    const lista = screen.getByRole("list");
    expect(lista.querySelectorAll("li")).toHaveLength(5);
    expect(lista.querySelectorAll("li")[0].textContent).toContain("coincide con la lesión anotada");
    expect(screen.getByRole("img", { name: /Malla 3D del árbol vascular/ })).toBeInTheDocument();
  });

  it("la ventana es de cristal y lista los cinco candidatos reales del 036, la lesión primero", () => {
    reducida.valor = true;
    montar();
    const ventana = screen.getByText("Detección · 5 candidatos").closest("[data-glass]");
    expect(ventana).not.toBeNull();
    const filas = ventana!.querySelectorAll("li");
    expect(filas).toHaveLength(5);
    expect(filas[0].textContent).toContain("candidato 1 · ≈11,6 mm · coincide con la lesión anotada");
    expect(filas[0].textContent).not.toContain("lesión · ≈11,6");
    expect(filas[0].textContent).toContain("calibre · cociente · curvatura");
    expect(filas[1].textContent).toContain("≈8,8 mm");
    expect(filas[4].textContent).toContain("saco pequeño");
    expect(ventana!.textContent).not.toContain("9,8");
    expect(screen.getByText("Caso Zenodo 036 · detector de Prospective")).toBeInTheDocument();
    expect(screen.getByText("Un caso real; el puesto de la lesión varía de un caso a otro.")).toBeInTheDocument();
  });

  it("solo la lesión lleva baliza sobre el render: de las otras no hay posición en pantalla", () => {
    reducida.valor = true;
    const { container } = montar();
    const balizas = container.querySelectorAll("[data-baliza]");
    expect(balizas).toHaveLength(1);
    expect(balizas[0]).toHaveTextContent("1");
  });
});
