import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "admin", institution: "" }, logout: vi.fn() }) }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));

import { OPEN_PALETTE_EVENT } from "../../lib/commands";
import { simularPantalla } from "../../test/pantalla";
import { TopBar } from "./TopBar";
import type { AccionBarra } from "./TopBar";

afterEach(() => vi.unstubAllGlobals());

const LARGO = "Segura Restrepo, María Fernanda de los Ángeles";
const acciones: AccionBarra[] = [
  { id: "np", label: "Nuevo paciente", icon: "PLUS", principal: true, onClick: () => {} },
  { id: "nc", label: "Nuevo caso", icon: "FOLDER", onClick: () => {} },
  { id: "ex", label: "Exportar", icon: "EXPORT", href: "/api/audit/export" },
];
const barra = () => (
  <TopBar crumbs={[{ label: "Pacientes", onClick: () => {} }, { label: LARGO }]} subtitle="14 pacientes" acciones={acciones} />
);

describe("TopBar", () => {
  it("es de cristal", () => {
    const { container } = render(<TopBar />);
    expect(container.querySelector("header.shell-top")?.hasAttribute("data-glass")).toBe(true);
  });
  it("lleva solo el borde inferior", () => {
    const { container } = render(<TopBar />);
    expect((container.querySelector("header.shell-top") as HTMLElement).style.borderWidth).toBe("0px 0px 1px");
  });
  it("el botón ⌘K abre la paleta", () => {
    const fn = vi.fn();
    window.addEventListener(OPEN_PALETTE_EVENT, fn);
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir la paleta de mandos (Ctrl+K)" }));
    window.removeEventListener(OPEN_PALETTE_EVENT, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("a 1707 todas llevan texto y hay botón Ctrl K", () => {
    const p = simularPantalla({ ancho: 1707 });
    render(barra());
    expect(screen.getByRole("button", { name: "Nuevo caso" }).textContent).toContain("Nuevo caso");
    expect(screen.getByRole("link", { name: "Exportar" }).textContent).toContain("Exportar");
    expect(screen.getByRole("button", { name: /Abrir la paleta de mandos/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
    p.restaurar();
  });
  it("a 1280 la principal lleva texto y las demás solo icono con tooltip", () => {
    const p = simularPantalla({ ancho: 1280 });
    render(barra());
    expect(screen.getByRole("button", { name: "Nuevo paciente" }).textContent).toContain("Nuevo paciente");
    const caso = screen.getByRole("button", { name: "Nuevo caso" });
    expect(caso.textContent).toBe("");
    expect(caso).toHaveAttribute("aria-label", "Nuevo caso");
    expect(caso).toHaveAttribute("title", "Nuevo caso");
    const ex = screen.getByRole("link", { name: "Exportar" });
    expect(ex).toHaveAttribute("aria-label", "Exportar");
    expect(ex).toHaveAttribute("href", "/api/audit/export");
    p.restaurar();
  });
  it("a 1024 los controles miden 44", () => {
    const p = simularPantalla({ ancho: 1024 });
    render(barra());
    expect(screen.getByRole("button", { name: "Nuevo paciente" })).toHaveAttribute("data-size", "md");
    expect(screen.getByRole("button", { name: "Nuevo caso" }).style.height).toBe("var(--control-md)");
    expect(screen.getByRole("button", { name: /tema/i }).style.height).toBe("44px");
    p.restaurar();
  });
  it("a 390: icono principal, «⋯» con secundarias y la paleta, solo el último segmento de la miga y sin subtítulo", () => {
    const p = simularPantalla({ ancho: 390 });
    render(barra());
    expect(screen.getByRole("button", { name: "Nuevo paciente" }).textContent).toBe("");
    expect(screen.queryByText("14 pacientes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pacientes" })).toBeNull();
    expect(screen.getByText(LARGO)).toHaveClass("shell-crumb");
    expect(screen.queryByRole("button", { name: /Abrir la paleta de mandos/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menuitem", { name: "Nuevo caso" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Exportar" })).toHaveAttribute("href", "/api/audit/export");
    expect(screen.getByRole("menuitem", { name: "Paleta de mandos" })).toBeInTheDocument();
    p.restaurar();
  });
  it("«Paleta de mandos» del menú «⋯» abre la paleta", () => {
    const p = simularPantalla({ ancho: 390 });
    const fn = vi.fn();
    window.addEventListener(OPEN_PALETTE_EVENT, fn);
    render(barra());
    fireEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Paleta de mandos" }));
    window.removeEventListener(OPEN_PALETTE_EVENT, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    p.restaurar();
  });
  it("al pasar de 1707 a 390 en vivo, las secundarias se recogen en «⋯»", () => {
    const p = simularPantalla({ ancho: 1707 });
    render(barra());
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
    act(() => p.cambiar({ ancho: 390 }));
    expect(screen.getByRole("button", { name: "Más acciones" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo caso" })).toBeNull();
    p.restaurar();
  });
});
