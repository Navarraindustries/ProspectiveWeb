import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Indices } from "./SeccionIndices";

const activas = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-cota][data-activa="true"]')].map((g) => g.getAttribute("data-cota")).sort();
const fila = (re: RegExp) => screen.getByRole("button", { name: re });

describe("Indices", () => {
  it("arranca con DNR: Ø máx y cuello", () => {
    const { container } = render(<Indices />);
    expect(fila(/Relación domo-cuello/)).toHaveAttribute("aria-pressed", "true");
    expect(activas(container)).toEqual(["cuello", "dmax"]);
    expect(screen.getByRole("img", { name: "Diagrama del saco: resalta Ø máx y cuello" })).toBeInTheDocument();
  });
  it("pasar por AR resalta altura y cuello; enfocar EI, la elipse; tocar SR, Ø máx y arteria madre", () => {
    const { container } = render(<Indices />);
    fireEvent.mouseEnter(fila(/Relación de aspecto/));
    expect(activas(container)).toEqual(["altura", "cuello"]);
    fireEvent.focus(fila(/elipticidad/));
    expect(activas(container)).toEqual(["elipse"]);
    fireEvent.click(fila(/Relación de tamaño/));
    expect(activas(container)).toEqual(["dmax", "madre"]);
  });
  it("solo un índice pulsado a la vez", () => {
    const { container } = render(<Indices />);
    fireEvent.click(fila(/Factor de cuello/));
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(fila(/Factor de cuello/)).toHaveAttribute("aria-pressed", "true");
  });
});
