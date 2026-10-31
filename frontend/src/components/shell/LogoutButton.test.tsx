/* «Cerrar sesión» a la vista en el pie de la barra lateral: el menú del avatar
   no se encontraba. Hace lo mismo que la entrada del menú. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const go = vi.fn();
let user: Record<string, unknown> | null;
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user, logout }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => ({ screen: "patients", go }) }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../api/client", () => ({ api: { listPending: vi.fn().mockResolvedValue([]) } }));

import { LogoutButton } from "./LogoutButton";
import { AppShell } from "./AppShell";

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

  it("la barra lateral lo lleva siempre en el pie", () => {
    render(<AppShell crumbs={[{ label: "Pacientes" }]}><p>x</p></AppShell>);
    const barra = screen.getByRole("navigation", { name: "Secciones" });
    expect(within(barra).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    // Y la barra superior ya no lo repite.
    expect(within(screen.getByRole("banner")).queryByRole("button", { name: /Cerrar sesión/ })).toBeNull();
  });
});
