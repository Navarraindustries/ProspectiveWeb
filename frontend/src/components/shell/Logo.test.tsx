import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { reducido } = vi.hoisted(() => ({ reducido: { valor: false } }));
vi.mock("../../motion", () => ({ useReducedMotion: () => reducido.valor }));

import { Logo, LogoIcono, PINCELADA_MS, tiempoPincelada, tiemposTramos } from "./Logo";
import { FIRMA_PROPORCION, MARCA_D, TRAMOS } from "./marcaSkullApp";

afterEach(() => { reducido.valor = false; });

describe("Logo · icono de SkullApp", () => {
  it("el icono es la marca de SkullApp, una sola pieza, sin el icono D", () => {
    const { container } = render(<LogoIcono size={48} variante="linea" />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("d")).toBe(MARCA_D);
    expect(container.querySelector("ellipse, circle")).toBeNull();
  });
  it("línea: monocromo con currentColor; sobre vídeo, --on-media", () => {
    const { container, rerender } = render(<LogoIcono size={38} variante="linea" />);
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    rerender(<LogoIcono size={38} variante="linea" tono="media" />);
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("var(--on-media)");
  });
  it("app: cuadrado monocromo (--logo-app-*) con la marca dentro, no el cuadrado azul", () => {
    const { container } = render(<LogoIcono size={32} variante="app" />);
    const rect = container.querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("var(--logo-app-fondo)");
    expect(rect.getAttribute("stroke")).toBe("var(--logo-app-borde)");
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("var(--logo-app-marca)");
    expect(container.querySelector("g")!.getAttribute("transform")).toBe("translate(14 14) scale(0.72)");
  });
  it("la raíz lleva data-logo", () => {
    const { container } = render(<Logo />);
    expect(container.firstElementChild).toHaveAttribute("data-logo");
  });
  it("el icono suelto es decorativo salvo que lleve etiqueta", () => {
    const { container, rerender } = render(<LogoIcono size={32} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).not.toHaveAttribute("role");
    rerender(<LogoIcono size={32} etiqueta="Prospective" />);
    expect(container.querySelector("svg")).not.toHaveAttribute("aria-hidden");
    expect(container.querySelector("svg")).toHaveAttribute("role", "img");
  });
});

describe("Logo · nombre y firma", () => {
  it("«Prospective» en Sora 600 con ™, firmado «por» + el logotipo de SkullApp", () => {
    const { container } = render(<Logo size={38} />);
    const nombre = screen.getByText("Prospective");
    expect(nombre.style.fontFamily).toBe("var(--font-brand)");
    expect(nombre.style.fontWeight).toBe("600");
    expect(nombre.style.fontSize).toBe("24px");
    expect(nombre.querySelector("sup")).toHaveAttribute("aria-hidden", "true");
    const firma = screen.getByRole("img", { name: "SkullApp" });
    expect(firma).toHaveAttribute("data-firma");
    expect(firma.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    const linea = container.querySelector<HTMLElement>("[data-firma-linea]")!;
    expect(linea.textContent!.trim()).toBe("por");
    expect(linea.style.fontSize).toBe("12px");
    // El logotipo va a la altura de la letra y con su proporción.
    expect(Number(firma.getAttribute("height"))).toBe(13);
    expect(Number(firma.getAttribute("width"))).toBe(Math.round(13 * FIRMA_PROPORCION));
  });
  it("sin firma y compacto", () => {
    const { container, rerender } = render(<Logo firma={false} />);
    expect(screen.queryByRole("img", { name: "SkullApp" })).toBeNull();
    rerender(<Logo compact />);
    expect(container.textContent).toBe("");
    expect(screen.getByRole("img", { name: "Prospective" })).toBe(container.querySelector("svg"));
  });
  it("tono media: la firma en --on-media-muted", () => {
    const { container } = render(<Logo tono="media" />);
    expect(container.querySelector<HTMLElement>("[data-firma-linea]")!.style.color).toBe("var(--on-media-muted)");
  });
});

describe("Logo · movimiento", () => {
  it("la curva de la pincelada arranca y acaba suave y nunca retrocede", () => {
    expect(tiempoPincelada(0)).toBe(0);
    expect(tiempoPincelada(1)).toBeCloseTo(1, 6);
    expect(tiempoPincelada(0.5)).toBeCloseTo(0.5, 6);
    // Al principio va despacio: el 10 % del trazo se lleva más del 10 % del tiempo.
    expect(tiempoPincelada(0.1)).toBeGreaterThan(0.1);
    const ts = TRAMOS.map((t) => tiempoPincelada(t.desde));
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });
  it("los tramos se encadenan: cada uno empieza donde acaba el anterior y el último acaba a su hora", () => {
    const t = tiemposTramos({ retrasoMs: 100, duracionMs: 1000 });
    expect(t[0].retraso).toBe(100);
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i].retraso - (t[i - 1].retraso + t[i - 1].duracion))).toBeLessThanOrEqual(1);
    const ultimo = t[t.length - 1];
    expect(Math.abs(ultimo.retraso + ultimo.duracion - 1100)).toBeLessThanOrEqual(1);
  });
  it("pincelada: la marca va enmascarada por los 14 tramos, cada uno con su retraso", () => {
    const { container } = render(<LogoIcono size={120} variante="linea" pincelada />);
    const tramos = container.querySelectorAll<SVGPathElement>("mask .logo-tramo");
    expect(tramos).toHaveLength(TRAMOS.length);
    expect(tramos[0].style.animationDelay).toBe("0ms");
    const t = tiemposTramos();
    expect(tramos[13].style.animationDelay).toBe(`${t[13].retraso}ms`);
    expect(t[13].retraso + t[13].duracion).toBeLessThanOrEqual(PINCELADA_MS + 1);
    const marca = container.querySelector(`path[d="${MARCA_D}"]`)!;
    expect(marca.getAttribute("mask")).toMatch(/^url\(#pincel-/);
  });
  it("latido: clase en bucle con el retraso y el halo según el tamaño", () => {
    const { container } = render(<LogoIcono size={100} variante="linea" latido={{ retrasoMs: 1300 }} />);
    const svg = container.querySelector<SVGSVGElement>("svg")!;
    expect(svg.classList.contains("logo-latido")).toBe(true);
    expect(svg.style.getPropertyValue("--latido-retraso")).toBe("1300ms");
    expect(svg.style.getPropertyValue("--latido-halo")).toBe("12px");
  });
  it("destello: el reflejo va recortado por la marca", () => {
    const { container } = render(<LogoIcono size={26} variante="linea" destello />);
    expect(container.querySelector("svg")!.classList.contains("logo-destello")).toBe(true);
    const brillo = container.querySelector(".logo-brillo")!;
    expect(brillo.closest("[clip-path]")!.getAttribute("clip-path")).toMatch(/^url\(#marca-/);
  });
  it("con movimiento reducido no hay pincelada, latido ni destello: la marca entera y quieta", () => {
    reducido.valor = true;
    const { container } = render(<LogoIcono size={100} variante="linea" pincelada latido destello />);
    expect(container.querySelector("mask")).toBeNull();
    expect(container.querySelector(".logo-brillo")).toBeNull();
    expect(container.querySelector("svg")!.getAttribute("class")).toBeNull();
    expect(container.querySelector("path")!.getAttribute("mask")).toBeNull();
  });
});
