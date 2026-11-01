import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { NavPildora } from "./NavPildora";

const ENLACES = ["Qué es", "Cómo funciona", "Índices", "Dispositivos"];

function conAnchoEstrecho(estrecho: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: estrecho && query === "(max-width: 760px)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const montar = () => render(<NavPildora onEntrar={() => {}} onCrearCuenta={() => {}} />);

afterEach(() => vi.unstubAllGlobals());

describe("NavPildora", () => {
  it("lleva los cuatro enlaces de ancla y los dos botones, sobre cristal", () => {
    conAnchoEstrecho(false);
    const { container } = montar();
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toHaveAttribute("data-glass");
    expect(container.querySelector("[data-glass]")).not.toBeNull();
    const hrefs = ["#que-es", "#como-funciona", "#indices", "#dispositivos"];
    ENLACES.forEach((texto, i) => {
      expect(screen.getByRole("link", { name: texto })).toHaveAttribute("href", hrefs[i]);
    });
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menú" })).toBeNull();
  });

  it("los botones llaman a sus manejadores", () => {
    conAnchoEstrecho(false);
    const onEntrar = vi.fn();
    const onCrearCuenta = vi.fn();
    render(<NavPildora onEntrar={onEntrar} onCrearCuenta={onCrearCuenta} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(onEntrar).toHaveBeenCalledTimes(1);
    expect(onCrearCuenta).toHaveBeenCalledTimes(1);
  });

  it("a 760 px o menos los enlaces se pliegan tras un botón «Menú»", () => {
    conAnchoEstrecho(true);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Qué es" })).toBeNull();
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    for (const texto of ENLACES) {
      expect(screen.getByRole("link", { name: texto })).toBeInTheDocument();
    }
  });

  it("en estrecho la marca es compacta, para que la pastilla quepa en una fila", () => {
    conAnchoEstrecho(true);
    montar();
    expect(screen.queryByText("por SkullApp")).toBeNull();
    // El nombre sigue ahí para los lectores de pantalla.
    expect(screen.getByText("PROSPECTIVE")).toHaveClass("landing-sr");
  });

  it("el botón «Menú» controla el panel, y Escape lo cierra devolviendo el foco al botón", () => {
    conAnchoEstrecho(true);
    montar();
    const menu = screen.getByRole("button", { name: "Menú" });
    const idPanel = menu.getAttribute("aria-controls");
    expect(idPanel).toBeTruthy();
    const panel = document.getElementById(idPanel!);
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();

    fireEvent.click(menu);
    expect(panel).toBeVisible();
    screen.getByRole("link", { name: "Qué es" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();
    expect(menu).toHaveFocus();
  });

  it("los enlaces llevan su color en una clase (sin color en línea que anule el hover)", () => {
    conAnchoEstrecho(false);
    montar();
    for (const texto of ENLACES) {
      const enlace = screen.getByRole("link", { name: texto });
      expect(enlace).toHaveClass("landing-nav__enlace");
      expect(enlace.style.color).toBe("");
    }
  });
});
