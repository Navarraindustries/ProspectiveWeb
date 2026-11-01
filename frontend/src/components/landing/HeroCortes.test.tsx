import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { HeroCortes } from "./HeroCortes";
import { CONSULTA_HERO_QUIETO } from "./heroFrames";
import { simularPantalla } from "../../test/pantalla";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

const irA = vi.hoisted(() => vi.fn());
vi.mock("./desplazamiento", async (orig) => ({
  ...(await orig<typeof import("./desplazamiento")>()),
  useIrASeccion: () => irA,
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
  expect(screen.queryByText(/^W 3000 · L 1800/)).toBeNull();
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
    expect(screen.getByText("W 3000 · L 1800 · MIP 4,2 mm · corte 95/384")).toBeInTheDocument();
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
    expect(lista.querySelectorAll("li")[0].textContent).toContain("coincide con la lesión confirmada");
    expect(screen.getByRole("img", { name: /Malla 3D del árbol vascular/ })).toBeInTheDocument();
  });

  it("la ventana es de cristal y lista los cinco candidatos reales de Case 3, la lesión primero", () => {
    reducida.valor = true;
    montar();
    const ventana = screen.getByText("Detección · 5 candidatos").closest("[data-glass]");
    expect(ventana).not.toBeNull();
    const filas = ventana!.querySelectorAll("li");
    expect(filas).toHaveLength(5);
    expect(filas[0].textContent).toContain("candidato 1 · ≈3,7 mm · coincide con la lesión confirmada (tronco basilar)");
    expect(filas[0].textContent).toContain("curvatura");
    expect(filas[1].textContent).toContain("≈5,4 mm");
    for (const f of filas) expect(f.textContent).not.toContain("saco pequeño");
    const marco = screen.getByText("Detección · 5 candidatos").closest("[data-glass]") as HTMLElement;
    expect(within(marco).getByText("Case 3 · 3DRA · detector de Prospective")).toBeInTheDocument();
    expect(within(marco).getByText(/no el tamaño del aneurisma/)).toBeInTheDocument();
    expect(screen.queryByText(/Zenodo/)).toBeNull();
  });

  it("solo la lesión lleva baliza sobre el render: de las otras no hay posición en pantalla", () => {
    reducida.valor = true;
    const { container } = montar();
    const balizas = container.querySelectorAll("[data-baliza]");
    expect(balizas).toHaveLength(1);
    expect(balizas[0]).toHaveTextContent("1");
  });

  /* Hasta 1024 (móvil y tableta, en los dos giros) y en pantallas bajas, quieto;
     por encima de 1024 con alto suficiente, animado. */
  it.each([[390, 844], [844, 390], [768, 1024], [1024, 768], [1024, 1366], [1707, 600]])("a %i × %i es quieto", (ancho, alto) => {
    simularPantalla(ancho, alto);
    const { container } = montar();
    esperarQuieto(container);
  });

  it.each([[1025, 900], [1280, 900], [1366, 768], [1707, 743], [1920, 1080]])("a %i × %i es el hero animado", (ancho, alto) => {
    simularPantalla(ancho, alto);
    const { container } = montar();
    const seccion = container.querySelector("section") as HTMLElement;
    expect(seccion).not.toHaveClass("hero-cortes--quieto");
    expect(seccion.style.height).toBe("300vh");
  });
});

describe("HeroCortes, ancla", () => {
  it("«Ver cómo funciona ↓» desplaza a la sección y conserva el href", () => {
    simularPantalla(1280);
    montar();
    const a = screen.getByRole("link", { name: /Ver cómo funciona/ });
    expect(a).toHaveAttribute("href", "#como-funciona");
    fireEvent.click(a);
    expect(irA).toHaveBeenCalledWith(expect.anything(), "como-funciona");
    vi.unstubAllGlobals();
  });
});
