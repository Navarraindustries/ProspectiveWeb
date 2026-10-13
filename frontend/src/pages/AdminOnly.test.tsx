/* /app/usuarios y /app/auditoria escritas a mano por quien no es
   administrador (F1-254, F1-255, F1-30).

   La página se montaba entera: «Nuevo usuario» y «Verificar integridad» a la
   vista, y el 403 solo llegaba al pulsarlos. Ahora queda una tarjeta y nada
   más, y la página no llega a pedir nada al servidor. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listUsers = vi.fn();
const auditBlocks = vi.fn();
const user = { role: "medico" as string, username: "med" };

vi.mock("../api/client", () => ({
  api: {
    listUsers: () => listUsers(),
    auditBlocks: () => auditBlocks(),
    auditVerify: () => Promise.resolve({ ok: true, total_blocks: 0, broken: [] }),
  },
  ApiError: class ApiError extends Error {},
}));
// La barra se sustituye por sus migas: lo que importa es que exista y lleve
// «Pacientes» (F1b-3: la tarjeta sola, sin barra, era un callejón sin salida).
vi.mock("../components/Topbar", () => ({
  Topbar: ({ crumbs }: { crumbs?: { label: string }[] }) => (
    <div data-testid="topbar">{(crumbs ?? []).map((c) => c.label).join(" / ")}</div>
  ),
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { UsersAdmin } from "./UsersAdmin";
import { AuditTrail } from "./AuditTrail";

beforeEach(() => {
  listUsers.mockReset().mockResolvedValue([]);
  auditBlocks.mockReset().mockResolvedValue([]);
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
  it("lleva la barra superior con la miga «Pacientes»", () => {
    render(<AuditTrail onBack={() => {}} />);
    expect(screen.getByTestId("topbar").textContent).toContain("Pacientes");
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
