/* Shell C (F2): una sola barra lateral para todo; el administrador ve su
   grupo, el médico no; Alt+B pliega y despliega sin robar el foco. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { user: { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" } as { role: string; [k: string]: unknown } | null };
const nav = { screen: "patients", go: vi.fn() };
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: auth.user, logout: vi.fn() }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => nav }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../api/client", () => ({ api: { listPending: vi.fn().mockResolvedValue([{ id: 9 }, { id: 10 }]) } }));

import { AppShell } from "./AppShell";

beforeEach(() => { localStorage.clear(); auth.user = { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" }; });

describe("AppShell", () => {
  it("el administrador ve Administración con la insignia de pendientes", async () => {
    render(<AppShell crumbs={[{ label: "Pacientes" }]}><p>contenido</p></AppShell>);
    expect(screen.getByRole("navigation", { name: "Secciones" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Usuarios/ })).toBeTruthy();
    expect(await screen.findByText("2")).toBeTruthy();           // insignia de Cuentas pendientes
  });
  it("un médico no ve el grupo Administración", () => {
    auth.user = { id: 2, username: "med", full_name: "Dra. Navarro", role: "medico", institution: "" };
    render(<AppShell><p>x</p></AppShell>);
    expect(screen.queryByRole("link", { name: /Usuarios/ })).toBeNull();
    expect(screen.queryByText(/Auditoría/)).toBeNull();
  });
  it("Alt+B despliega y pliega sin tocar el campo con foco", () => {
    render(<AppShell><input aria-label="campo" /></AppShell>);
    const campo = screen.getByLabelText("campo") as HTMLInputElement;
    campo.focus();
    fireEvent.keyDown(document, { key: "b", altKey: true });
    expect(screen.getByRole("navigation", { name: "Secciones" }).getAttribute("data-expanded")).toBe("true");
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe("");
    fireEvent.keyDown(document, { key: "b", altKey: true });
    expect(screen.getByRole("navigation", { name: "Secciones" }).getAttribute("data-expanded")).toBe("false");
  });
  it("la miga solo lleva lo que existe y las acciones del contexto", () => {
    render(<AppShell crumbs={[{ label: "Pacientes", onClick: () => {} }, { label: "segura, Juan" }]} actions={<button>Nuevo caso</button>}><p>x</p></AppShell>);
    expect(screen.getByText("segura, Juan")).toBeTruthy();
    expect(screen.queryByText("Administración")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo caso" })).toBeTruthy();
  });
});
