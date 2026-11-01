/* A drawer that renders inside a glass surface silently collapses. */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { simularPantalla } from "../test/pantalla";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("al cerrarse, la capa deja de capturar el puntero durante la salida (A18)", () => {
    const { rerender } = render(<Sheet open onClose={() => {}} title="Nuevo taller"><p>x</p></Sheet>);
    expect(screen.getByRole("dialog").parentElement!.style.pointerEvents).toBe("auto");
    rerender(<Sheet open={false} onClose={() => {}} title="Nuevo taller"><p>x</p></Sheet>);
    const saliendo = screen.getByRole("dialog");
    expect(saliendo.parentElement!.style.pointerEvents).toBe("none");
  });

  it("en móvil ocupa la pantalla entera", () => {
    simularPantalla({ ancho: 390 });
    render(<Sheet open onClose={() => {}} title="Ficha" width={560}><p>x</p></Sheet>);
    const panel = screen.getByRole("dialog");
    expect(panel.style.width).toBe("100%");
    expect(panel.style.maxWidth).toBe("100vw");
    expect(panel.style.borderRadius).toBe("0px");
  });

  it("en tableta conserva el ancho pedido con tope 94vw y «Cerrar» de 44 px", () => {
    simularPantalla({ ancho: 768 });
    render(<Sheet open onClose={() => {}} title="Ficha" width={560}><p>x</p></Sheet>);
    expect(screen.getByRole("dialog").style.width).toBe("560px");
    expect(screen.getByRole("dialog").style.maxWidth).toBe("94vw");
    expect(screen.getByRole("button", { name: "Cerrar" }).style.width).toBe("44px");
  });

  it("en escritorio, como hasta ahora", () => {
    simularPantalla({ ancho: 1707 });
    render(<Sheet open onClose={() => {}} title="Ficha"><p>x</p></Sheet>);
    expect(screen.getByRole("dialog").style.width).toBe("460px");
    expect(screen.getByRole("button", { name: "Cerrar" }).style.width).toBe("40px");
  });
  it("escapes an ancestor that captures fixed positioning", () => {
    // Regression: the topbar has backdrop-filter, which makes it the containing
    // block for `position: fixed`. A sheet opened from the user menu therefore
    // sized itself against the topbar's 66 px and clipped its own form — the
    // fields were in the DOM at the right size, just outside the visible box.
    // Rendering through a portal on <body> is what prevents that.
    const { container } = render(
      <div style={{ backdropFilter: "blur(8px)", height: 66 }}>
        <Sheet open onClose={() => {}} title="Cambiar contraseña">
          <input aria-label="Contraseña actual" type="password" />
        </Sheet>
      </div>,
    );

    const field = screen.getByLabelText("Contraseña actual");
    expect(field).toBeInTheDocument();
    expect(container.contains(field)).toBe(false);
    expect(document.body.contains(field)).toBe(true);
  });

  it("es de cristal denso con esquinas redondeadas a la izquierda y un rótulo mono", () => {
    render(
      <Sheet open onClose={() => {}} title="Ficha" eyebrow="Ficha de paciente">
        <p>x</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-glass");
    expect(dialog.style.borderRadius).toContain("var(--radius-xl)");
    expect(screen.getByText("Ficha de paciente").style.fontFamily).toContain("var(--font-mono)");
  });

  it("el velo de detrás usa --scrim (visible también en el tema claro)", () => {
    render(
      <Sheet open onClose={() => {}} title="Ficha">
        <p>x</p>
      </Sheet>,
    );
    const scrim = screen.getByRole("dialog").previousElementSibling as HTMLElement;
    expect(scrim.style.background).toContain("--scrim");
    expect(scrim.style.background).not.toContain("--veil");
  });

  it("renders nothing while closed", () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Oculto">
        <p>contenido</p>
      </Sheet>,
    );
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
  });

  it("shows its title and a way out", () => {
    render(
      <Sheet open onClose={() => {}} title="Editar paciente">
        <p>ficha</p>
      </Sheet>,
    );
    expect(screen.getByText("Editar paciente")).toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar")).toBeInTheDocument();
  });

  it("enfoca el primer campo al abrir", () => {
    render(<Sheet open onClose={() => {}} title="Nuevo paciente"><input aria-label="Apellidos" /><input aria-label="Nombre" /></Sheet>);
    expect(document.activeElement).toBe(screen.getByLabelText("Apellidos"));
  });

  it("pinta el pie fijo cuando se le pasa", () => {
    render(<Sheet open onClose={() => {}} title="Nuevo paciente" footer={<button>Crear paciente</button>}><p>campos</p></Sheet>);
    expect(screen.getByRole("button", { name: "Crear paciente" })).toBeInTheDocument();
  });

  it("la superficie es de cristal denso y la sombra tiene desplazamiento", () => {
    render(<Sheet open onClose={() => {}} title="Ficha"><p>x</p></Sheet>);
    const panel = screen.getByRole("dialog");
    expect(panel.style.background).toContain("--glass-dense");
    expect(panel.style.boxShadow).toContain("--shadow-sheet");
  });

  it("con dos hojas abiertas, Escape cierra solo la de encima", () => {
    const closed: string[] = [];
    render(<>
      <Sheet open onClose={() => closed.push("abajo")} title="Abajo"><p>a</p></Sheet>
      <Sheet open onClose={() => closed.push("arriba")} title="Arriba"><p>b</p></Sheet>
    </>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toEqual(["arriba"]);
  });
});
