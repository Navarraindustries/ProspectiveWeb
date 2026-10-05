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
