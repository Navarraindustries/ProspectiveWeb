/* /app/usuarios y /app/auditoria escritas a mano por quien no es
   administrador (F1-254, F1-255, F1-30).

   La página se montaba entera: «Nuevo usuario» y «Verificar integridad» a la
   vista, y el 403 solo llegaba al pulsarlos. Ahora queda una tarjeta y nada
   más, y la página no llega a pedir nada al servidor. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listUsers = vi.fn();
const auditBlocks = vi.fn();
const listPending = vi.fn();
const user = { role: "medico" as string, username: "med" };

vi.mock("../api/client", () => ({
  api: {
    listUsers: () => listUsers(),
    auditBlocks: () => auditBlocks(),
    listPatients: () => Promise.resolve([]),
    auditVerify: () => Promise.resolve({ ok: true, total_blocks: 0, broken: [] }),
    listPending: () => listPending(),
  },
  ApiError: class ApiError extends Error {},
}));
// El shell se monta de verdad: lo que importa es que la tarjeta esté dentro de
// él y la barra lateral lleve a «Pacientes» (F1b-3: la tarjeta sola, sin
// barra, era un callejón sin salida).
vi.mock("../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => ({ screen: "users", go: vi.fn() }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { UsersAdmin } from "./UsersAdmin";
import { AuditTrail } from "./AuditTrail";
import { PendingRequests } from "./PendingRequests";

beforeEach(() => {
  listUsers.mockReset().mockResolvedValue([]);
  auditBlocks.mockReset().mockResolvedValue([]);
  listPending.mockReset().mockResolvedValue([]);
  user.role = "medico";
});

describe("rutas de administración para un Médico", () => {
  it("«Usuarios» es solo la tarjeta, sin «Nuevo usuario»", () => {
    render(<UsersAdmin onBack={() => {}} />);
    expect(screen.getByText("Solo para administradores")).toBeTruthy();
    expect(screen.queryByText(/Nuevo usuario/)).toBeNull();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("«Auditoría» es solo la tarjeta, sin «Verificar integridad»", () => {
    render(<AuditTrail onBack={() => {}} />);
    expect(screen.getByText("Solo para administradores")).toBeTruthy();
    expect(screen.queryByText(/Verificar integridad/)).toBeNull();
    expect(auditBlocks).not.toHaveBeenCalled();
  });

  it("«Cuentas pendientes» es solo la tarjeta, sin el 403 ni «Reintentar»", () => {
    const back = vi.fn();
    render(<PendingRequests onBack={back} />);
    expect(screen.getByText("Solo para administradores")).toBeTruthy();
    expect(screen.queryByText(/Reintentar/)).toBeNull();
    expect(listPending).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Volver a pacientes"));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("el administrador sigue viendo «Cuentas pendientes»", async () => {
    user.role = "admin";
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("Cuentas pendientes", { selector: "div" })).toBeTruthy();
    expect(listPending).toHaveBeenCalled();
    expect(screen.queryByText("Solo para administradores")).toBeNull();
  });

  it("el administrador sigue viendo las dos páginas", async () => {
    user.role = "admin";
    render(<UsersAdmin onBack={() => {}} />);
    expect(await screen.findByText("Nuevo usuario")).toBeTruthy();
    render(<AuditTrail onBack={() => {}} />);
    expect(await screen.findByText(/Verificar integridad/)).toBeTruthy();
    expect(screen.queryByText("Solo para administradores")).toBeNull();
  });
});

describe("la tarjeta no es un callejón sin salida (F1b-3)", () => {
  it("va dentro del shell: la barra lateral lleva a «Pacientes» y la miga es solo la página", () => {
    render(<AuditTrail onBack={() => {}} />);
    expect(screen.getByRole("link", { name: /Pacientes/ }).getAttribute("href")).toBe("/app/pacientes");
    expect(screen.getByRole("navigation", { name: "Miga de pan" }).textContent).toBe("Auditoría");
    // «Administración» no es un destino: la miga no lo lleva.
    expect(screen.queryByText("Administración")).toBeNull();
  });

  it("«Volver a pacientes» vuelve, en las dos páginas", () => {
    const back = vi.fn();
    render(<UsersAdmin onBack={back} />);
    fireEvent.click(screen.getByText("Volver a pacientes"));
    expect(back).toHaveBeenCalledTimes(1);
    render(<AuditTrail onBack={back} />);
    fireEvent.click(screen.getAllByText("Volver a pacientes")[1]);
    expect(back).toHaveBeenCalledTimes(2);
  });
});
