import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { Revelar, RevelarItem, Seccion } from "./Seccion";
import { simularPantalla } from "../../test/pantalla";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  reducida.valor = false;
});

const nuncaCruza = () =>
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });

const montar = () => render(
  <Seccion id="x" rotulo="R" titulo="T"><RevelarItem data-prueba="1">a</RevelarItem></Seccion>);

describe("Seccion", () => {
  it("con IntersectionObserver y fuera de pantalla, los ítems esperan ocultos 16 px abajo", () => {
    nuncaCruza();
    const { container } = montar();
    const item = container.querySelector('[data-prueba="1"]') as HTMLElement;
    expect(item.style.opacity).toBe("0");
    expect(item.style.transform).toMatch(/translateY\(16px\)/);
  });

  it("sin IntersectionObserver todo se pinta ya entero", () => {
    const { container } = montar();
    const item = container.querySelector('[data-prueba="1"]') as HTMLElement;
    expect(item.style.opacity).not.toBe("0");
    expect(item.style.transform).not.toMatch(/translateY\(16px\)/);
  });

  it("con movimiento reducido no hay revelado ni desplazamiento", () => {
    simularPantalla({ ancho: 1280, movimientoReducido: true });
    reducida.valor = true;
    nuncaCruza();
    const { container } = montar();
    for (const el of [container.querySelector('[data-prueba="1"]'), container.querySelector(".sec__cabecera")]) {
      const s = (el as HTMLElement).style;
      expect(s.opacity).not.toBe("0");
      expect(s.transform).not.toMatch(/translateY\(16px\)/);
    }
  });

  it("Revelar suelto no oculta si no hay observador", () => {
    const { container } = render(<Revelar className="r">hola</Revelar>);
    expect((container.querySelector(".r") as HTMLElement).style.opacity).not.toBe("0");
  });

  it("la sección se puede enfocar al llegar por el desplazamiento y se anuncia por su rótulo", () => {
    render(<Seccion id="x" rotulo="Qué es" titulo="T">a</Seccion>);
    const s = screen.getByRole("region", { name: "Qué es" });
    expect(s).toHaveAttribute("tabindex", "-1");
    expect(s).toHaveAttribute("id", "x");
  });
});
