import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Cascada, COLUMNAS_VISIBLES, type ColumnaCascada } from "./Cascada";
import { simularPantalla } from "../../test/pantalla";

const cols = (n: number): ColumnaCascada[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `c${i}`,
    titulo: `Columna ${i + 1}`,
    contenido: <button type="button">Fila {i + 1}</button>,
  }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

  it("Esc llega al documento, también desde un hijo en portal (Sheet, menú de usuario)", () => {
    const columnas = cols(2);
    columnas[0].contenido = (
      <>
        <button type="button">Fila 1</button>
        {createPortal(<input aria-label="En portal" />, document.body)}
      </>
    );
    render(<Cascada columnas={columnas} onVolver={() => {}} />);
    const escucha = vi.fn();
    document.addEventListener("keydown", escucha);
    try {
      const enPortal = screen.getByLabelText("En portal");
      enPortal.focus();
      fireEvent.keyDown(enPortal, { key: "Escape" });
      expect(escucha).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(screen.getByRole("button", { name: "Fila 1" }), { key: "Escape" });
      expect(escucha).toHaveBeenCalledTimes(2);
    } finally {
      document.removeEventListener("keydown", escucha);
    }
  });

  it("en pantalla estrecha solo se ven las dos últimas y las anteriores son migas", () => {
    simularPantalla(1280);
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

  it("columnas visibles por tramo", () => {
    expect(COLUMNAS_VISIBLES).toEqual({ movil: 1, tableta: 2, estrecho: 2, ancho: 3, grande: 5 });
  });

  it.each([[390, 1], [768, 2], [1024, 2], [1280, 2], [1707, 3], [1920, 5]])("a %i px se ven %i columnas y el resto son migas", (ancho, n) => {
    simularPantalla(ancho);
    render(<Cascada columnas={cols(5)} onVolver={() => {}} />);
    expect(screen.getAllByRole("region")).toHaveLength(n);
    const migas = screen.queryByRole("navigation", { name: "Volver a una columna anterior" });
    if (n === 5) expect(migas).toBeNull();
    else expect(within(migas!).getAllByRole("button")).toHaveLength(5 - n);
  });

  it("cambia en vivo de 1707 a 390", () => {
    const ctl = simularPantalla(1707);
    const { container } = render(<Cascada columnas={cols(5)} onVolver={() => {}} />);
    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(container.querySelector(".fc-wrap")).toHaveAttribute("data-tramo", "ancho");
    act(() => ctl.cambiar({ ancho: 390 }));
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Columna 5" })).toBeTruthy();
    expect(container.querySelector(".fc-wrap")).toHaveAttribute("data-tramo", "movil");
  });

  it("al estrechar, el foco de una columna que pasa a miga va a su miga; al ensanchar, vuelve a la columna", () => {
    const ctl = simularPantalla(1920);
    render(<Cascada columnas={cols(5)} onVolver={() => {}} />);
    screen.getByRole("button", { name: "Fila 2" }).focus();
    act(() => ctl.cambiar({ ancho: 1280 }));
    const migas = screen.getByRole("navigation", { name: "Volver a una columna anterior" });
    expect(document.activeElement).toBe(within(migas).getByRole("button", { name: "Columna 2" }));
    act(() => ctl.cambiar({ ancho: 1920 }));
    expect(screen.getByRole("region", { name: "Columna 2" }).contains(document.activeElement)).toBe(true);
  });

  it("la última columna llena y las demás encogen sin desbordar", () => {
    simularPantalla(1707);
    render(<Cascada columnas={cols(3)} onVolver={() => {}} />);
    const [a, b, c] = screen.getAllByRole("region");
    expect(a).toHaveStyle({ flex: "0 1 320px", minWidth: "0" });
    expect(b).toHaveStyle({ flex: "0 1 300px", minWidth: "0" });
    expect(c).toHaveStyle({ flex: "1 1 0" });
    expect(c.style.minWidth).toBe("min(300px, 100%)");
  });

  it("en móvil la única columna ocupa todo el ancho", () => {
    simularPantalla(390);
    render(<Cascada columnas={cols(3)} onVolver={() => {}} />);
    const [c] = screen.getAllByRole("region");
    expect(c).toHaveStyle({ flex: "1 1 auto", width: "100%" });
  });

  it("CSS: la cascada no desplaza en horizontal y en móvil el cuerpo no desplaza", () => {
    const css = readFileSync(join(__dirname, "ficha.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).not.toMatch(/overflow-x:\s*auto/);
    expect(css).not.toMatch(/scroll-snap/);
    expect(css).toMatch(/\.fc-cascada\s*\{[^}]*overflow-x:\s*clip/);
    expect(css).toMatch(/\.fc-wrap\[data-tramo="movil"\]\s+\.fc-cuerpo\s*\{[^}]*overflow-y:\s*visible/);
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{\s*\.fc-miga\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("Cascada · ↑/↓ entre filas (UNI-85)", () => {
  const conFilas = (): ColumnaCascada[] => [
    {
      key: "casos",
      titulo: "Casos",
      contenido: (
        <ul>
          {["Caso A", "Caso B", "Caso C"].map((n) => (
            <li key={n} className="fc-fila">
              <button type="button" className="fc-fila-boton">{n}</button>
              <button type="button">Editar {n}</button>
            </li>
          ))}
          <li><button type="button" className="fc-entrada">Sesiones sin caso</button></li>
        </ul>
      ),
    },
    { key: "otra", titulo: "Otra", contenido: <button type="button" className="fc-fila-boton">Fila de otra</button> },
  ];
  const boton = (name: string) => screen.getByRole("button", { name });
  const tecla = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

  it("↓ y ↑ recorren las filas de la columna, sin pasar a la siguiente ni dar la vuelta", () => {
    render(<Cascada columnas={conFilas()} onVolver={() => {}} />);
    boton("Caso A").focus();
    tecla("ArrowDown");
    expect(document.activeElement).toBe(boton("Caso B"));
    tecla("ArrowDown");
    tecla("ArrowDown");
    expect(document.activeElement).toBe(boton("Sesiones sin caso"));
    tecla("ArrowDown");
    expect(document.activeElement).toBe(boton("Sesiones sin caso"));
    tecla("ArrowUp");
    expect(document.activeElement).toBe(boton("Caso C"));
  });

  it("desde el botón de acción de una fila cuenta desde su fila", () => {
    render(<Cascada columnas={conFilas()} onVolver={() => {}} />);
    boton("Editar Caso B").focus();
    tecla("ArrowDown");
    expect(document.activeElement).toBe(boton("Caso C"));
    boton("Editar Caso B").focus();
    tecla("ArrowUp");
    expect(document.activeElement).toBe(boton("Caso A"));
  });

  it("← / → siguen moviendo entre columnas", () => {
    render(<Cascada columnas={conFilas()} onVolver={() => {}} />);
    boton("Caso B").focus();
    tecla("ArrowRight");
    expect(document.activeElement).toBe(boton("Fila de otra"));
  });
});
