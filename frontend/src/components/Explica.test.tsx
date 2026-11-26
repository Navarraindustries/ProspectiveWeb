/* UX-16: la explicación se lee sin ratón (tableta, teclado). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Explica } from "./Explica";

describe("Explica", () => {
  it("el botón ⓘ despliega el texto visible y lo vuelve a ocultar", () => {
    render(<Explica texto="4πA/P²: 1 es un círculo">Circularidad</Explica>);
    expect(screen.queryByRole("note")).toBeNull();
    const boton = screen.getByRole("button", { name: "Ver la explicación" });
    fireEvent.click(boton);
    expect(screen.getByRole("note")).toHaveTextContent("4πA/P²: 1 es un círculo");
    expect(boton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar la explicación" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("con el ratón sigue saliendo como texto emergente", () => {
    render(<Explica texto="Margen entre vías">Confianza</Explica>);
    expect(screen.getByText("Confianza").closest(".explica")).toHaveAttribute("title", "Margen entre vías");
  });
});
