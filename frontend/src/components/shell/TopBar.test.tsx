import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "admin", institution: "" }, logout: vi.fn() }) }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));

import { OPEN_PALETTE_EVENT } from "../../lib/commands";
import { simularPantalla } from "../../test/pantalla";
import { TopBar } from "./TopBar";
import type { AccionBarra } from "./TopBar";

afterEach(() => vi.unstubAllGlobals());

/** El bloque de tableta de shell.css desde la regla de los controles de la barra. */
function cssTableta(): string {
  const css = readFileSync(resolve(__dirname, "shell.css"), "utf8").replace(/\r\n/g, "\n");
  const i = css.search(/@media \(max-width:\s*1024px\)\s*\{\s*\.shell-user-btn/);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i);
}

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
  it("fuera de Mac el botón dice «Ctrl K»", () => {
    render(<TopBar crumbs={[{ label: "Pacientes" }]} />);
    const b = screen.getByRole("button", { name: "Abrir la paleta de mandos (Ctrl+K)" });
    expect(b.textContent).toBe("Ctrl K");
    expect(b).toHaveAttribute("aria-keyshortcuts", "Control+K");
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
    // «Ctrl K» no cabe en 44 px: el botón de la paleta lleva mínimo, no ancho fijo.
    const cmdk = screen.getByRole("button", { name: /Abrir la paleta de mandos/ });
    expect(cmdk).toHaveClass("shell-cmdk");
    expect(cmdk.style.width).toBe("");
    const regla = /\.shell-cmdk\s*\{([^}]*)\}/.exec(cssTableta())![1];
    expect(regla).toMatch(/min-width:\s*var\(--control-md\)/);
    expect(regla).toMatch(/(^|[^-])width:\s*auto/);
    expect(regla).not.toMatch(/(^|[^-])width:\s*var\(--control-md\)/);
    p.restaurar();
  });
  it("a 1024 «Cerrar sesión» y la chincheta tienen diana de 44 px por CSS", () => {
    expect(cssTableta()).toMatch(/\.shell-logout,\s*\.shell-nav-pin\s*\{\s*min-height:\s*var\(--control-md\);\s*min-width:\s*var\(--control-md\)/);
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
  it("desde «⋯», la acción que abre una hoja no recupera el foco; la que no, sí", () => {
    const p = simularPantalla({ ancho: 390 });
    render(<TopBar acciones={[
      { id: "np", label: "Nuevo paciente", icon: "PLUS", principal: true, onClick: () => {} },
      { id: "nc", label: "Nuevo caso", icon: "FOLDER", abreDialogo: true, onClick: () => {} },
      { id: "ac", label: "Actualizar", icon: "REFRESH", onClick: () => {} },
    ]} />);
    const mas = screen.getByRole("button", { name: "Más acciones" });
    fireEvent.click(mas);
    fireEvent.click(screen.getByRole("menuitem", { name: "Nuevo caso" }));
    expect(document.activeElement).not.toBe(mas);
    fireEvent.click(mas);
    fireEvent.click(screen.getByRole("menuitem", { name: "Actualizar" }));
    expect(document.activeElement).toBe(mas);
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
  it("el contenedor de `extra` lleva su clase y el CSS le da mínimo y fila propia a ≤ 640", () => {
    const p = simularPantalla({ ancho: 390 });
    render(<TopBar crumbs={[{ label: LARGO }]} extra={<input aria-label="Buscar" />} />);
    expect(screen.getByLabelText("Buscar").parentElement).toHaveClass("shell-extra");
    const css = readFileSync(resolve(__dirname, "shell.css"), "utf8").split("\r").join("");
    const movil = css.slice(css.indexOf("@media (max-width: 640px) {\n  .shell-top {"));
    expect(movil).toMatch(/\.shell-actions \{ flex-wrap: wrap/);
    expect(movil).toMatch(/\.shell-extra \{ flex: 1 1 120px; min-width: 120px/);
    expect(movil).toMatch(/\.shell-crumbs \{ flex: 1 1 0; min-width: 72px/);
    p.restaurar();
  });
});
