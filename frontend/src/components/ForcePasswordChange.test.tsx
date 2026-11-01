/* Cambio obligatorio de la contraseña inicial. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refreshUser = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn();
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { username: "admin" }, logout, refreshUser }),
}));
vi.mock("../api/client", () => ({ api: { changePassword: vi.fn().mockResolvedValue({ status: "ok" }) } }));

import { api } from "../api/client";
import { ForcePasswordChange } from "./ForcePasswordChange";

/** Ningún contenedor de la ventana pinta un fondo opaco: el Ambiente debe verse. */
function sinFondoOpaco(ventana: HTMLElement) {
  for (let el = ventana.parentElement; el && el !== document.body; el = el.parentElement) {
    expect(el.style.background).toBe("");
  }
}

const escribir = (label: RegExp | string, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe("cambio obligatorio de la contraseña inicial", () => {
  it("cambia la contraseña y vuelve a pedir el usuario", async () => {
    render(<ForcePasswordChange />);
    const boton = () => screen.getByText("Cambiar contraseña y continuar").closest("button")!;
    expect(boton()).toBeDisabled();
    escribir("Contraseña actual", "admin123");
    escribir(/Nueva contraseña/, "una-mucho-mejor");
    escribir("Repite la nueva contraseña", "una-mucho-mejor");
    fireEvent.click(boton());
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(api.changePassword).toHaveBeenCalledWith("admin123", "una-mucho-mejor");
  });

  it("no deja repetir la misma ni enviar dos distintas", () => {
    render(<ForcePasswordChange />);
    escribir("Contraseña actual", "admin123");
    escribir(/Nueva contraseña/, "admin123");
    expect(screen.getByText(/debe ser distinta/)).toBeInTheDocument();
    escribir(/Nueva contraseña/, "una-mucho-mejor");
    escribir("Repite la nueva contraseña", "otra-cosa-xx");
    expect(screen.getByText(/no coinciden/)).toBeInTheDocument();
    expect(screen.getByText("Cambiar contraseña y continuar").closest("button")).toBeDisabled();
  });

  it("se puede cerrar sesión sin cambiarla", () => {
    render(<ForcePasswordChange />);
    fireEvent.click(screen.getByText("Cerrar sesión"));
    expect(logout).toHaveBeenCalled();
  });
});

describe("errores del servidor en el cambio (F1-51)", () => {
  const rellenarYEnviar = () => {
    escribir("Contraseña actual", "admin123");
    escribir(/Nueva contraseña/, "una-mucho-mejor");
    escribir("Repite la nueva contraseña", "una-mucho-mejor");
    fireEvent.click(screen.getByText("Cambiar contraseña y continuar").closest("button")!);
  };

  it("un fallo de red se dice en castellano, no «Failed to fetch»", async () => {
    vi.mocked(api.changePassword).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ForcePasswordChange />);
    rellenarYEnviar();
    expect(await screen.findByText("El servidor no responde. Avisa al responsable de la instalación.")).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("un 500 sin detalle se dice en castellano, no «Error 500»", async () => {
    vi.mocked(api.changePassword).mockRejectedValueOnce(
      Object.assign(new Error("Error 500"), { status: 500, fromServer: true }));
    render(<ForcePasswordChange />);
    rellenarYEnviar();
    expect(await screen.findByText(/El servidor respondió con el error 500 y sin más detalle/)).toBeInTheDocument();
    expect(screen.queryByText("Error 500")).toBeNull();
  });
});

describe("de dónde viene la contraseña que hay que cambiar (F1b-4)", () => {
  it("no afirma que sea la del alta: también llega así tras un restablecimiento o con la de instalación", () => {
    render(<ForcePasswordChange />);
    expect(screen.getByText(/no eligió y que conoce otra persona/)).toBeInTheDocument();
    expect(screen.queryByText(/se creó/)).toBeNull();
  });

  it("el formulario está en una ventana de cristal sobre el Ambiente", () => {
    const { container } = render(<ForcePasswordChange />);
    const ventana = screen.getByRole("region", { name: "Cambia la contraseña asignada" });
    expect(ventana).toHaveAttribute("data-glass");
    expect(ventana).toContainElement(screen.getByLabelText("Contraseña actual"));
    expect(container.querySelector("[data-ambiente]")).not.toBeNull();
  });

  it("la pantalla va sobre el Ambiente", () => {
    const { container } = render(<ForcePasswordChange />);
    expect(container.querySelector("[data-ambiente]")).not.toBeNull();
    expect(container.querySelector("img[aria-hidden]")).toBeNull();
  });

  it("los contenedores de la ventana no tapan el Ambiente", () => {
    render(<ForcePasswordChange />);
    sinFondoOpaco(screen.getByRole("region", { name: "Cambia la contraseña asignada" }));
  });
});
