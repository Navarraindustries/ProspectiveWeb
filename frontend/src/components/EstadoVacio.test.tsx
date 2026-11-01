import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Button } from "./Button";
import { EstadoVacio } from "./EstadoVacio";

it("icono, título, texto y acción", () => {
  const { container } = render(
    <EstadoVacio icono="STATUS_WARN" titulo="Sin talleres" accion={<Button>Nuevo taller</Button>}>
      Aún no hay ninguno.
    </EstadoVacio>,
  );
  expect(screen.getByText("Sin talleres")).toBeInTheDocument();
  expect(screen.getByText("Aún no hay ninguno.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nuevo taller" })).toBeInTheDocument();
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.firstElementChild).toHaveAttribute("data-glass");
});
