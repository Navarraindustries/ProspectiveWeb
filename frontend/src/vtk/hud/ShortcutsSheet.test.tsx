// frontend/src/vtk/hud/ShortcutsSheet.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsSheet } from "./ShortcutsSheet";

describe("ShortcutsSheet", () => {
  it("cerrada no pinta nada", () => {
    render(<ShortcutsSheet open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza las tres secciones con sus teclas", () => {
    render(<ShortcutsSheet open onClose={vi.fn()} />);
    const dlg = screen.getByRole("dialog", { name: "Atajos" });
    for (const h of ["Visor", "Celda", "Flujo"]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(dlg.textContent).toContain("Espacio");
    expect(dlg.textContent).toContain("Alt+4");
    // Los ocho pasos van en una sola fila.
    expect(dlg.textContent).toContain("1 … 8");
  });

  it("cierra con Escape, con ? y con clic fuera", () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "?" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("shortcuts-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
    // Un clic dentro de la tarjeta no la cierra.
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("lleva el foco a la tarjeta y lo devuelve al cerrar", () => {
    const cell = document.createElement("div");
    cell.tabIndex = 0;
    document.body.appendChild(cell);
    cell.focus();
    const { rerender } = render(<ShortcutsSheet open onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    rerender(<ShortcutsSheet open={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(cell);
    cell.remove();
  });
});
