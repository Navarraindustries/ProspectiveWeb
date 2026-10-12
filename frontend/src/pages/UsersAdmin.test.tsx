/* «Usuarios» con el API fallando (F1-88).

   El error salía junto a «0 usuarios» y «No hay usuarios que coincidan con la
   búsqueda»: parecía que la búsqueda no encontraba a nadie. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listUsers = vi.fn();

vi.mock("../api/client", () => ({
  api: { listUsers: () => listUsers(), createUser: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", username: "admin" } }) }));

import { UsersAdmin } from "./UsersAdmin";
import { fechaHora } from "../lib/fecha";

beforeEach(() => { listUsers.mockReset(); });

describe("«Usuarios» con el API fallando", () => {
  it("muestra el error sin el vacío de búsqueda y «Reintentar» vuelve a llamar", async () => {
    listUsers.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<UsersAdmin onBack={() => {}} />);

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/No hay usuarios que coincidan/)).toBeNull();
    expect(screen.queryByText(/0 usuarios/)).toBeNull();

    listUsers.mockResolvedValueOnce([{
      id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico", is_active: true,
      created_at: "2026-10-01T00:00:00Z", specialty: "", hospital: "",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("María Restrepo")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});

describe("la columna «Creado» (F1-83)", () => {
  it("lee la fecha del servidor como UTC y la muestra en hora local", async () => {
    listUsers.mockResolvedValueOnce([{
      id: 2, username: "mrestrepo", full_name: "María Restrepo", role: "medico", is_active: true,
      created_at: "2026-10-11T03:28:00+00:00", specialty: "", hospital: "",
    }]);
    render(<UsersAdmin onBack={() => {}} />);
    // La conversión a UTC−5 (22:28 del día anterior) se fija en fecha.test.ts con zona explícita.
    expect(await screen.findByText(fechaHora("2026-10-11T03:28:00+00:00"))).toBeTruthy();
  });
});
describe("la línea bajo «Rol» (F1-86)", () => {
  it("cambia con el rol elegido y el rótulo de la contraseña dice «mín. 8»", async () => {
    listUsers.mockResolvedValueOnce([]);
    render(<UsersAdmin onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    expect(screen.getByText("Médico: ves y editas los pacientes que creas; firmas pedidos")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña * (mín. 8)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "viewer" } });
    expect(screen.getByText("Observador: ves y editas los pacientes que creas; no firmas pedidos")).toBeTruthy();
    expect(screen.queryByText(/^Médico: ves/)).toBeNull();
  });
});
