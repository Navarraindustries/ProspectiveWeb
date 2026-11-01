import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuMas } from "./MenuMas";
import type { ItemMenu } from "./MenuMas";
import { simularPantalla } from "../test/pantalla";

const items = (): ItemMenu[] => [
  { id: "a", label: "Editar", icon: "EDIT", onSelect: vi.fn() },
  { id: "b", label: "Descargar", href: "/x.zip" },
  { id: "c", label: "Borrar", destructive: true, separadoAntes: true, onSelect: vi.fn() },
  { id: "d", label: "Bloqueado", disabled: true, onSelect: vi.fn() },
];
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));

afterEach(() => vi.unstubAllGlobals());

describe("MenuMas", () => {
  it("abre un menú de cristal en el body y lo cierra con Escape devolviendo el foco", () => {
    render(<MenuMas items={items()} />);
    const boton = screen.getByRole("button", { name: "Más acciones" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("data-glass");
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(boton).toHaveFocus();
  });

  it("↓ y ↑ recorren los ítems", () => {
    render(<MenuMas items={items()} />);
    abrir();
    const mi = screen.getAllByRole("menuitem");
    expect(mi[0]).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(mi[1]).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(mi[3]).toHaveFocus();
  });

  it("elegir ejecuta y cierra; deshabilitado no ejecuta; destructivo con data-danger; href es un enlace", () => {
    const lista = items();
    render(<MenuMas items={lista} />);
    abrir();
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toHaveAttribute("data-danger", "true");
    const enlace = screen.getByRole("menuitem", { name: "Descargar" });
    expect(enlace.tagName).toBe("A");
    expect(enlace).toHaveAttribute("href", "/x.zip");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noreferrer");
    fireEvent.click(screen.getByRole("menuitem", { name: "Bloqueado" }));
    expect(lista[3].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(lista[0].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clic fuera cierra", () => {
    render(<MenuMas items={items()} />);
    abrir();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("cerca del borde inferior se abre hacia arriba (alto 600)", () => {
    const s = simularPantalla({ ancho: 1707, alto: 600 });
    render(<MenuMas items={items()} />);
    const boton = screen.getByRole("button", { name: "Más acciones" });
    vi.spyOn(boton, "getBoundingClientRect").mockReturnValue({ top: 560, bottom: 592, left: 1600, right: 1632, width: 32, height: 32, x: 1600, y: 560, toJSON() {} } as DOMRect);
    fireEvent.click(boton);
    expect(screen.getByRole("menu")).toHaveAttribute("data-lado", "arriba");
    s.restaurar();
  });

  it("lejos del borde se abre hacia abajo", () => {
    const s = simularPantalla({ ancho: 1707, alto: 900 });
    render(<MenuMas items={items()} />);
    abrir();
    expect(screen.getByRole("menu")).toHaveAttribute("data-lado", "abajo");
    s.restaurar();
  });

  it("táctil: ítems de 44 px y disparador de 44", () => {
    render(<MenuMas items={items()} tactil />);
    expect(screen.getByRole("button", { name: "Más acciones" }).style.width).toBe("44px");
    abrir();
    for (const m of screen.getAllByRole("menuitem")) expect((m as HTMLElement).style.minHeight).toBe("44px");
  });

  it("cerrado no deja nada en el body que capture el puntero (sin velo)", () => {
    render(<MenuMas items={items()} />);
    abrir();
    act(() => { fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }); });
    expect(document.body.querySelectorAll("[role=menu]")).toHaveLength(0);
    expect(document.body.querySelectorAll("body > div[style*='fixed']")).toHaveLength(0);
  });
});
