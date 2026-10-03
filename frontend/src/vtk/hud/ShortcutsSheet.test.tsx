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
    // Sobre el cuerpo, como una tecla de verdad: la hoja escucha en captura.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "?" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("shortcuts-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
    // Un clic dentro de la tarjeta no la cierra.
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("abierta se traga las teclas (Esc no llega a Workspace, 3 no salta de paso) salvo Tab", () => {
    // Registrada antes que la hoja, como la escucha de Workspace.
    const behind = vi.fn();
    window.addEventListener("keydown", behind);
    const onClose = vi.fn();
    const { rerender } = render(<ShortcutsSheet open onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: "3", code: "Digit3" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(behind).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(behind).toHaveBeenCalledTimes(1);
    // Cerrada, las teclas vuelven a pasar.
    rerender(<ShortcutsSheet open={false} onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: "3", code: "Digit3" });
    expect(behind).toHaveBeenCalledTimes(2);
    window.removeEventListener("keydown", behind);
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
