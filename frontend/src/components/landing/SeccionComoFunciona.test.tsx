import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

import { STEPS } from "../../pipeline/steps";
import { simularPantalla } from "../../test/pantalla";
import { ComoFunciona } from "./SeccionComoFunciona";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

describe("ComoFunciona", () => {
  beforeEach(() => { reducida.valor = false; });
  afterEach(() => vi.unstubAllGlobals());

  it.each([[1280, "horizontal"], [1707, "horizontal"], [1024, "vertical"], [768, "vertical"], [390, "vertical"]])(
    "a %i px el riel es %s", (ancho, disp) => {
      simularPantalla(ancho);
      render(<ComoFunciona />);
      expect(screen.getByRole("list")).toHaveAttribute("data-disposicion", disp);
    });

  it("al girar la tableta el riel cambia de orientación", () => {
    const p = simularPantalla(1280);
    render(<ComoFunciona />);
    expect(screen.getByRole("list")).toHaveAttribute("data-disposicion", "horizontal");
    act(() => p.cambiar({ ancho: 768 }));
    expect(screen.getByRole("list")).toHaveAttribute("data-disposicion", "vertical");
  });

  it("la lista solo tiene <li> como hijos: la pista va en el marco, fuera del <ol>", () => {
    const { container } = render(<ComoFunciona />);
    const ol = screen.getByRole("list");
    expect([...ol.children].map((h) => h.tagName)).toEqual(Array(STEPS.length).fill("LI"));
    const marco = container.querySelector(".riel__marco")!;
    expect(ol.parentElement).toBe(marco);
    expect(marco.querySelector(":scope > .riel__pista")).not.toBeNull();
  });

  it("ocho pasos, cada uno con su icono, en el orden de STEPS", () => {
    render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".riel__nombre")?.textContent)).toEqual(STEPS.map((s) => s.label));
    for (const li of items) expect(li.querySelector(".riel__nodo svg")).not.toBeNull();
  });

  it("en escritorio es un dial: el centro enseña el paso y no se lee dos veces", () => {
    simularPantalla(1280);
    const { container } = render(<ComoFunciona />);
    const centro = container.querySelector(".riel__centro")!;
    expect(centro).toHaveAttribute("aria-hidden", "true");
    expect(centro.querySelector(".riel__centro-nombre")?.textContent).toBe(STEPS[0].label);
    const marco = container.querySelector<HTMLElement>(".riel__marco")!;
    expect(marco.style.getPropertyValue("--avance")).toBe("0");
    const pasos = [...container.querySelectorAll<HTMLElement>(".riel__paso")];
    expect(pasos.map((p) => p.style.getPropertyValue("--i"))).toEqual(STEPS.map((_, i) => String(i)));
  });

  it("en tableta no hay dial", () => {
    simularPantalla(768);
    const { container } = render(<ComoFunciona />);
    expect(container.querySelector(".riel__centro")).toBeNull();
  });

  it("sin avanzar, ningún paso encendido y el relleno a cero", () => {
    const { container } = render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    for (const li of items) expect(li).toHaveAttribute("data-encendido", "false");
    const relleno = container.querySelector<HTMLElement>(".riel__relleno")!;
    expect(relleno.style.transform).toMatch(/scaleX\(0\)/);
  });

  it("en escritorio el dial va fijo bajo la nav dentro de un recorrido alto (UNI-132)", () => {
    simularPantalla(1280);
    const { container } = render(<ComoFunciona />);
    const recorrido = container.querySelector<HTMLElement>(".riel__recorrido")!;
    expect(recorrido.style.height).toBe("415vh");
    const fijo = recorrido.querySelector<HTMLElement>(":scope > .riel__fijo")!;
    expect(fijo.style.position).toBe("sticky");
    expect(fijo.style.top).toBe("96px");
    expect(fijo).toContainElement(container.querySelector<HTMLElement>(".riel__marco"));
  });

  it("en tableta y móvil el riel vertical no se fija", () => {
    simularPantalla(768);
    const { container } = render(<ComoFunciona />);
    expect(container.querySelector(".riel__recorrido")).toBeNull();
    expect(container.querySelector(".riel__fijo")).toBeNull();
  });

  it("con movimiento reducido no hay fijado: todos los pasos encendidos a la vista", () => {
    reducida.valor = true;
    simularPantalla(1280);
    const { container } = render(<ComoFunciona />);
    expect(container.querySelector(".riel__recorrido")).toBeNull();
    for (const li of within(screen.getByRole("list")).getAllByRole("listitem")) expect(li).toHaveAttribute("data-encendido", "true");
  });

  it("con movimiento reducido, todo encendido y sin transformación", () => {
    reducida.valor = true;
    const { container } = render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    for (const li of items) expect(li).toHaveAttribute("data-encendido", "true");
    expect(container.querySelector<HTMLElement>(".riel__relleno")!.style.transform).toBe("");
  });
});
