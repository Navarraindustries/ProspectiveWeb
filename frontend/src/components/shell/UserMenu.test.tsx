/* El menú de usuario del shell dice con qué cuenta se está y qué permite
   (F1-106, F1-251), y solo lleva lo propio de la cuenta: las secciones viven
   en la barra lateral. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const go = vi.fn();
let user: Record<string, unknown>;
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user, logout }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => ({ screen: "patients", go }) }));
vi.mock("../../api/client", () => ({ api: { myPhotoObjectUrl: vi.fn() } }));
vi.mock("../ChangePasswordSheet", () => ({
  ChangePasswordSheet: ({ open }: { open: boolean }) => (open ? <div>hoja de contraseña</div> : null),
}));

import { UserMenu } from "./UserMenu";

const base = { id: 1, username: "admin", full_name: "Administrador", avatar_initials: "AD", has_photo: false };

function abrir() {
  render(<UserMenu />);
  fireEvent.click(screen.getByRole("button", { name: "Menú de usuario" }));
}

beforeEach(() => {
  user = { ...base, role: "admin", institution: "Hospital Universitario" };
  logout.mockReset();
  go.mockReset();
});

describe("UserMenu", () => {
  it("muestra nombre, @usuario · rol, institución y la línea del rol", () => {
    abrir();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("@admin · Administrador")).toBeInTheDocument();
    expect(screen.getByText("Hospital Universitario")).toBeInTheDocument();
    expect(screen.getByText("Administrador: todos los pacientes, usuarios, cuentas pendientes, auditoría y catálogo de clips")).toBeInTheDocument();
  });

  it("sin institución no deja una línea vacía", () => {
    user = { ...base, role: "medico", institution: "" };
    abrir();
    expect(screen.queryByText("Hospital Universitario")).toBeNull();
    expect(screen.getByText("@admin · Médico")).toBeInTheDocument();
  });

  it("no lleva secciones: eso es de la barra lateral", () => {
    abrir();
    expect(screen.queryByRole("menuitem", { name: /Pacientes/ })).toBeNull();
    expect(screen.queryByText(/Cuentas pendientes/)).toBeNull();
    expect(screen.queryByText(/Auditoría/)).toBeNull();
  });

  it("«Cambiar contraseña» abre la hoja y cierra el menú", () => {
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cambiar contraseña" }));
    expect(screen.getByText("hoja de contraseña")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("«Cerrar sesión» cierra la sesión y lleva a entrar", () => {
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("login");
  });

  it("Escape cierra el menú", () => {
    abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
