import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { HeroCortes } from "./HeroCortes";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

const LEMA = "Planificación neurovascular con datos";
const montar = () => render(<HeroCortes onEntrar={() => {}} onCrearCuenta={() => {}} />);
const cortes = (c: HTMLElement) => c.querySelectorAll('img[src^="/media/landing/hero/"]');

describe("HeroCortes", () => {
  beforeEach(() => { reducida.valor = false; });

  it("el lema aparece una sola vez, con los dos accesos", () => {
    const { container } = montar();
    expect((container.textContent ?? "").split(LEMA)).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1, name: LEMA })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
  });

  it("sin movimiento reducido arranca en el primer corte, con su rótulo", () => {
    const { container } = montar();
    const primera = container.querySelector("img");
    expect(primera).toHaveAttribute("src", "/media/landing/hero/000.webp");
    expect(cortes(container)).toHaveLength(1);
    expect(screen.getByText("W 600 · L 60 · corte 60/594")).toBeInTheDocument();
  });

  it("con movimiento reducido: sin cortes, con el render 3D y la ventana, y sin scroll extra", () => {
    reducida.valor = true;
    const { container } = montar();
    expect(cortes(container)).toHaveLength(0);
    expect(container.querySelector('img[src="/media/landing/hero-3d.webp"]')).not.toBeNull();
    expect(screen.getByText("Detección · 5 candidatos")).toBeInTheDocument();
    expect(screen.queryByText(/^W 600 · L 60/)).toBeNull();
    const seccion = container.querySelector("section") as HTMLElement;
    expect(seccion.style.height).not.toBe("300vh");
  });

  it("la ventana es de cristal y lista los cinco candidatos reales del 036, la lesión primero", () => {
    reducida.valor = true;
    montar();
    const ventana = screen.getByText("Detección · 5 candidatos").closest("[data-glass]");
    expect(ventana).not.toBeNull();
    const filas = ventana!.querySelectorAll("li");
    expect(filas).toHaveLength(5);
    expect(filas[0].textContent).toContain("lesión");
    expect(filas[0].textContent).toContain("≈11,6 mm");
    expect(filas[0].textContent).toContain("calibre · cociente · curvatura");
    expect(filas[1].textContent).toContain("≈8,8 mm");
    expect(filas[4].textContent).toContain("saco pequeño");
    expect(ventana!.textContent).not.toContain("9,8");
    expect(screen.getByText("Caso Zenodo 036 · detector de Prospective")).toBeInTheDocument();
  });

  it("solo la lesión lleva baliza sobre el render: de las otras no hay posición en pantalla", () => {
    reducida.valor = true;
    const { container } = montar();
    const balizas = container.querySelectorAll("[data-baliza]");
    expect(balizas).toHaveLength(1);
    expect(balizas[0]).toHaveTextContent("1");
  });
});
