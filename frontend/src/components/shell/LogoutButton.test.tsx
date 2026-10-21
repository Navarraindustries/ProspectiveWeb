/* «Cerrar sesión» a la vista en la barra superior: el menú del avatar no se
   encontraba. Hace lo mismo que la entrada del menú. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const go = vi.fn();
let user: Record<string, unknown> | null;
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user, logout }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => ({ screen: "patients", go }) }));

import { LogoutButton } from "./LogoutButton";
import { TopBar } from "./TopBar";

beforeEach(() => {
  user = { id: 1, username: "admin", role: "admin" };
  logout.mockReset();
  go.mockReset();
});

describe("LogoutButton", () => {
  it("cierra la sesión y vuelve a «Entrar»", () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("login");
  });

  it("no se pinta sin sesión", () => {
    user = null;
    const { container } = render(<LogoutButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("la barra superior lo lleva siempre, detrás de las acciones de la pantalla", () => {
    render(<TopBar crumbs={[{ label: "Pacientes" }]} actions={<button type="button">Nuevo paciente</button>} />);
    const botones = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botones.indexOf("Nuevo paciente")).toBeLessThan(botones.findIndex((t) => /Cerrar sesión/.test(t ?? "")));
  });
});
