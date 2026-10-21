/* El menú de usuario del visor dice con qué cuenta se está y qué permite
   (F1-106, F1-251). Desde F2 las secciones viven en la barra lateral del shell,
   así que aquí solo queda la vuelta a «Pacientes» y lo propio de la cuenta. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let currentUser: Record<string, unknown>;

vi.mock("../store/auth", () => ({ useAuth: () => ({ user: currentUser, logout: vi.fn() }) }));
vi.mock("../store/nav", () => ({ useNav: () => ({ go: vi.fn() }) }));
vi.mock("../api/client", () => ({ api: { myPhotoObjectUrl: vi.fn() } }));
vi.mock("../assets/logo.png", () => ({ default: "logo.png" }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("./ChangePasswordSheet", () => ({ ChangePasswordSheet: () => null }));

import { Topbar } from "./Topbar";

const base = { id: 1, username: "mrestrepo", full_name: "María Restrepo", avatar_initials: "MR", has_photo: false };

function abrirMenu() {
  render(<Topbar />);
  fireEvent.click(screen.getByTitle("Menú de usuario"));
}

beforeEach(() => { currentUser = { ...base, role: "medico", institution: "Hospital Universitario" }; });

describe("el encabezado del menú de usuario", () => {
  it("un Médico ve su institución y lo que puede hacer", () => {
    abrirMenu();
    expect(screen.getByText("Hospital Universitario")).toBeInTheDocument();
    expect(screen.getByText("Médico: ves y editas los pacientes que creas; firmas pedidos")).toBeInTheDocument();
  });

  it("un administrador ve la línea de su rol", () => {
    currentUser = { ...base, role: "admin", institution: "Hospital Universitario" };
    abrirMenu();
    expect(screen.getByText("Administrador: todos los pacientes, usuarios, cuentas pendientes, auditoría y catálogo de clips")).toBeInTheDocument();
  });

  it("el menú del visor no enumera secciones: solo la vuelta a «Pacientes» (F2, shell C)", () => {
    currentUser = { ...base, role: "admin", institution: "Hospital Universitario" };
    abrirMenu();
    expect(screen.getByText("Pacientes")).toBeInTheDocument();
    expect(screen.getByText("Cambiar contraseña")).toBeInTheDocument();
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
    expect(screen.queryByText("Cuentas pendientes")).toBeNull();
    expect(screen.queryByText("Solicitudes de registro")).toBeNull();
    expect(screen.queryByText(/Auditoría/)).toBeNull();
    expect(screen.queryByText("Pedidos de clips")).toBeNull();
  });

  it("sin institución no deja una línea vacía", () => {
    currentUser = { ...base, role: "medico", institution: "" };
    abrirMenu();
    expect(screen.queryByText("Hospital Universitario")).toBeNull();
  });
});
