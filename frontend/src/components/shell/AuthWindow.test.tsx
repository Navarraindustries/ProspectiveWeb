/* La ventana de cristal que comparten Entrar, Crear cuenta y el cambio de contraseña. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthWindow } from "./AuthWindow";

describe("AuthWindow", () => {
  it("es una sección de cristal nombrada por su título", () => {
    render(<AuthWindow titulo="Entrar" subtitulo="Accede a tu cuenta"><input aria-label="correo" /></AuthWindow>);
    const seccion = screen.getByRole("region", { name: "Entrar" });
    expect(seccion).toHaveAttribute("data-glass");
    expect(screen.getByText("Accede a tu cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("correo")).toBeInTheDocument();
  });

  it("pinta el pie cuando se da", () => {
    render(<AuthWindow titulo="Crear cuenta" pie={<a href="/entrar">Ya tengo cuenta</a>}>x</AuthWindow>);
    expect(screen.getByText("Ya tengo cuenta")).toBeInTheDocument();
  });
});
