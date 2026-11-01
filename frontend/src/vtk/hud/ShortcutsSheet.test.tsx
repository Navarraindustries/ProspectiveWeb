// frontend/src/vtk/hud/ShortcutsSheet.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATRIZ_ALTOS, MATRIZ_ANCHOS, simularPantalla } from "../../test/pantalla";
import { ShortcutsSheet } from "./ShortcutsSheet";

afterEach(() => vi.unstubAllGlobals());

describe("ShortcutsSheet", () => {
  it.each(MATRIZ_ANCHOS)("a %i px la hoja toma su forma, a cualquier alto", (w) => {
    for (const h of MATRIZ_ALTOS) {
      simularPantalla(w, h);
      const { unmount } = render(<ShortcutsSheet open onClose={() => {}} />);
      const card = screen.getByRole("dialog", { name: "Atajos" });
      expect(card.style.overflow).toBe("auto");
      expect(card.style.maxHeight).toBe("100%");
      if (w <= 640) {
        expect(card).toHaveAttribute("data-movil", "true");
        expect(card.style.height).toBe("100%");
        expect(card.style.maxWidth).toBe("");
      } else expect(card.style.maxWidth).toBe("920px");
      expect(card.style.fontSize).toBe(w <= 1024 ? "13px" : "11px");
      const cerrar = screen.getByRole("button", { name: "Cerrar" });
      expect(cerrar.style.width).toBe(w <= 1024 ? "44px" : "24px");
      expect(cerrar.style.height).toBe(w <= 1024 ? "44px" : "24px");
      unmount();
    }
  });

  it("la columna de teclas tiene tope de 22ch y las teclas pueden partir por espacios", () => {
    render(<ShortcutsSheet open onClose={() => {}} />);
    const dl = document.querySelector("dl") as HTMLElement;
    expect(dl.style.gridTemplateColumns).toBe("minmax(0, 22ch) minmax(0, 1fr)");
    expect((dl.querySelector("dt") as HTMLElement).style.whiteSpace).not.toBe("nowrap");
  });

  it("«Cerrar» cierra", () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cerrada no pinta nada", () => {
    render(<ShortcutsSheet open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abierta se pinta en document.body, fuera de la zona libre que aísla las capas del visor", () => {
    const { container } = render(<div data-zona-libre style={{ isolation: "isolate" }}><ShortcutsSheet open onClose={vi.fn()} /></div>);
    const fondo = screen.getByTestId("shortcuts-backdrop");
    expect(fondo.parentElement).toBe(document.body);
    expect(container.querySelector("[data-zona-libre]")?.contains(fondo)).toBe(false);
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
