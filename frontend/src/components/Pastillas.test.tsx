import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Pastillas } from "./Pastillas";
import { simularPantalla } from "../test/pantalla";

afterEach(() => vi.unstubAllGlobals());

const opciones = [
  { id: "todos", label: "Todos", cuenta: 3 },
  { id: "firmado", label: "Firmado", cuenta: 0 },
];

describe("Pastillas", () => {
  it("grupo con aria-pressed en la activa, recuento en mono y clic cambia", () => {
    const onCambiar = vi.fn();
    render(<Pastillas rotulo="Filtrar por estado" valor="todos" onCambiar={onCambiar} opciones={opciones} />);
    expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Todos/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3")).toHaveStyle({ fontFamily: "var(--font-mono)" });
    fireEvent.click(screen.getByRole("button", { name: /Firmado/ }));
    expect(onCambiar).toHaveBeenCalledWith("firmado");
  });
  it("envuelve en vez de desbordar y mide 44 px en ≤ 1024", () => {
    simularPantalla(390);
    render(<Pastillas rotulo="F" valor="todos" onCambiar={() => {}} opciones={opciones} />);
    expect(screen.getByRole("group")).toHaveStyle({ flexWrap: "wrap" });
    for (const b of screen.getAllByRole("button")) expect(b).toHaveStyle({ minHeight: "44px" });
  });
});
