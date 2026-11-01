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

  it("ocho pasos, cada uno con su icono, en el orden de STEPS", () => {
    render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".riel__nombre")?.textContent)).toEqual(STEPS.map((s) => s.label));
    for (const li of items) expect(li.querySelector(".riel__nodo svg")).not.toBeNull();
  });

  it("sin avanzar, ningún paso encendido y el relleno a cero", () => {
    const { container } = render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    for (const li of items) expect(li).toHaveAttribute("data-encendido", "false");
    const relleno = container.querySelector<HTMLElement>(".riel__relleno")!;
    expect(relleno.style.transform).toMatch(/scaleX\(0\)/);
  });

  it("con movimiento reducido, todo encendido y sin transformación", () => {
    reducida.valor = true;
    const { container } = render(<ComoFunciona />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    for (const li of items) expect(li).toHaveAttribute("data-encendido", "true");
    expect(container.querySelector<HTMLElement>(".riel__relleno")!.style.transform).toBe("");
  });
});
