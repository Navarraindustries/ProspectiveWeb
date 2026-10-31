import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Cascada, type ColumnaCascada } from "./Cascada";

function simulaEstrecho(estrecho: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: estrecho, media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const cols = (n: number): ColumnaCascada[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `c${i}`,
    titulo: `Columna ${i + 1}`,
    contenido: <button type="button">Fila {i + 1}</button>,
  }));

afterEach(() => { cleanup(); delete (window as { matchMedia?: unknown }).matchMedia; });

describe("Cascada", () => {
  it("cada columna es una región de cristal con su nombre", () => {
    render(<Cascada columnas={cols(3)} onVolver={() => {}} />);
    for (const n of ["Columna 1", "Columna 2", "Columna 3"]) {
      expect(screen.getByRole("region", { name: n }).hasAttribute("data-glass")).toBe(true);
    }
  });

  it("→ enfoca la columna siguiente y ← la anterior", () => {
    render(<Cascada columnas={cols(3)} onVolver={() => {}} />);
    const fila1 = screen.getByRole("button", { name: "Fila 1" });
    fila1.focus();
    fireEvent.keyDown(fila1, { key: "ArrowRight" });
    expect(screen.getByRole("region", { name: "Columna 2" }).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(screen.getByRole("region", { name: "Columna 1" }).contains(document.activeElement)).toBe(true);
  });

  it("las flechas no se roban dentro de un campo de texto", () => {
    const columnas = cols(2);
    columnas[0].contenido = <input aria-label="Nombre" />;
    render(<Cascada columnas={columnas} onVolver={() => {}} />);
    const campo = screen.getByLabelText("Nombre");
    campo.focus();
    fireEvent.keyDown(campo, { key: "ArrowRight" });
    expect(document.activeElement).toBe(campo);
  });

  it("Esc dentro de la cascada no sube a quien escucha fuera", () => {
    const fuera = vi.fn();
    render(<div onKeyDown={fuera}><Cascada columnas={cols(2)} onVolver={() => {}} /></div>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Fila 1" }), { key: "Escape" });
    expect(fuera).not.toHaveBeenCalled();
  });

  it("en pantalla estrecha solo se ven las dos últimas y las anteriores son migas", () => {
    simulaEstrecho(true);
    const onVolver = vi.fn();
    render(<Cascada columnas={cols(4)} onVolver={onVolver} />);
    expect(screen.queryByRole("region", { name: "Columna 1" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Columna 2" })).toBeNull();
    expect(screen.getByRole("region", { name: "Columna 3" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Columna 4" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Columna 1" }));
    expect(onVolver).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Columna 2" }));
    expect(onVolver).toHaveBeenCalledWith(1);
  });
});
