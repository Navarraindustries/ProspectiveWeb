/* Momento 5: la ilustración del quirófano en cinco zonas. Las zonas se pueden
   tocar en cualquier orden; la 2 añade los cinco tramos; «Siguiente» en la 5
   termina el momento y «Saltar» (o Esc) salta el onboarding entero, una vez. */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AVISO_PISTAS, ZONAS_QUIROFANO } from "./copy";

const terminar = vi.fn().mockResolvedValue(undefined);
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ activo: true, momento: "quirofano", ir: vi.fn(), terminar }),
}));

import { QuirofanoZonas } from "./QuirofanoZonas";

const onFin = vi.fn();
const zona = (n: number) => screen.getByRole("button", { name: new RegExp(`^Zona ${n}: `) });
const dialogo = (titulo: string) => screen.getByRole("dialog", { name: titulo });

beforeEach(() => { vi.clearAllMocks(); });

describe("QuirofanoZonas", () => {
  it("empieza en el visor y pulsar el 4 muestra «Dónde estás»", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    expect(dialogo("El visor")).toBeTruthy();
    fireEvent.click(zona(4));
    expect(dialogo("Dónde estás")).toBeTruthy();
    expect(zona(4).getAttribute("aria-pressed")).toBe("true");
    expect(zona(1).getAttribute("aria-pressed")).toBe("false");
  });

  it("hay un botón por zona, con el título de cada una", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    ZONAS_QUIROFANO.forEach((z, i) => expect(zona(i + 1).getAttribute("aria-label")).toBe(`Zona ${i + 1}: ${z.titulo}`));
  });

  it("en la zona 2 se ven los cinco tramos con sus pasos y el aviso de las pistas", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(zona(2));
    const lista = within(dialogo("Los pasos")).getByRole("list", { name: "Los cinco tramos" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toMatch(/Preparar.*1.*2/);
    expect(items[4].textContent).toMatch(/Informe.*8/);
    expect(within(dialogo("Los pasos")).getByText(AVISO_PISTAS)).toBeTruthy();
  });

  it("fuera de la zona 2 no salen los tramos", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    expect(screen.queryByRole("list", { name: "Los cinco tramos" })).toBeNull();
  });

  it("«Siguiente» recorre las zonas y en la 5 llama a onFin una sola vez", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(zona(5));
    expect(onFin).not.toHaveBeenCalled();
    const siguiente = screen.getByRole("button", { name: "Siguiente" });
    fireEvent.click(siguiente);
    fireEvent.click(siguiente);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("«Anterior» vuelve una zona y «Siguiente» avanza una", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(dialogo("Los pasos")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(dialogo("El visor")).toBeTruthy();
  });

  it("los marcadores numerados sobre la ilustración también cambian de zona", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcador de la zona 3" }));
    expect(dialogo("El panel del paso")).toBeTruthy();
  });

  it("«Saltar recorrido» salta todo el onboarding", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.click(screen.getByRole("button", { name: "Saltar recorrido" }));
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
    expect(onFin).not.toHaveBeenCalled();
  });

  it("Esc salta todo el onboarding, una vez", () => {
    render(<QuirofanoZonas onFin={onFin} />);
    fireEvent.keyDown(dialogo("El visor"), { key: "Escape" });
    expect(terminar).toHaveBeenCalledTimes(1);
    expect(terminar).toHaveBeenCalledWith("saltado");
  });

  it("la maqueta muestra el panel «PASO 3 · DETECCIÓN» y el dock con ocho pasos", () => {
    const { container } = render(<QuirofanoZonas onFin={onFin} />);
    expect(container.textContent).toContain("PASO 3 · DETECCIÓN");
    expect(container.querySelectorAll("[data-paso]")).toHaveLength(8);
    expect(container.querySelector('[data-paso="1"]')?.getAttribute("data-estado")).toBe("hecho");
    expect(container.querySelector('[data-paso="3"]')?.getAttribute("data-estado")).toBe("activo");
  });
});
