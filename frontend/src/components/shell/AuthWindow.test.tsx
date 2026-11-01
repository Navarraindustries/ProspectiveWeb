/* La ventana de cristal que comparten Entrar, Crear cuenta y el cambio de contraseña. */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { simularPantalla } from "../../test/pantalla";

import { AuthWindow } from "./AuthWindow";

describe("AuthWindow", () => {
  it("es una sección de cristal nombrada por su título", () => {
    render(<AuthWindow titulo="Entrar" subtitulo="Accede a tu cuenta"><input aria-label="correo" /></AuthWindow>);
    const seccion = screen.getByRole("region", { name: "Entrar" });
    expect(seccion).toHaveAttribute("data-glass");
    expect(screen.getByText("Accede a tu cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("correo")).toBeInTheDocument();
  });

  it("es fluida: ocupa el ancho de su zona hasta 440 px", () => {
    render(<AuthWindow titulo="Entrar">x</AuthWindow>);
    const seccion = screen.getByRole("region", { name: "Entrar" });
    expect(seccion.style.width).toBe("100%");
    expect(seccion.style.maxWidth).toBe("440px");
  });
});

describe("AuthWindow: cristal normal y relleno por ancho (A15)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cristal normal con data-glass", () => {
    render(<AuthWindow titulo="Iniciar sesión"><p>x</p></AuthWindow>);
    const v = screen.getByRole("region", { name: "Iniciar sesión" });
    expect(v).toHaveAttribute("data-glass");
    expect(v.style.background).toBe("var(--glass)");
  });

  it.each([[390, "24px"], [768, "40px"], [1707, "40px"]])("a %i px el relleno es %s", (ancho, relleno) => {
    simularPantalla(ancho);
    render(<AuthWindow titulo="Entrar">x</AuthWindow>);
    expect(screen.getByRole("region", { name: "Entrar" }).style.padding).toBe(relleno);
  });
});
