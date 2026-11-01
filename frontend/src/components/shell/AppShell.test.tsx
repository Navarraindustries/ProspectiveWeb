/* Shell C (F2): una sola barra lateral para todo; el administrador ve su
   grupo, el médico no; Alt+B pliega y despliega sin robar el foco. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simularPantalla } from "../../test/pantalla";

const auth = { user: { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" } as { role: string; [k: string]: unknown } | null };
const nav = { screen: "patients", go: vi.fn() };
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: auth.user, logout: vi.fn() }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => nav }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../api/client", () => ({ api: { listPending: vi.fn().mockResolvedValue([{ id: 9 }, { id: 10 }]) } }));

import { AppShell } from "./AppShell";
import { resetSessionPinned } from "./useShellState";

/** Pinta el shell con un hijo mínimo; las props son las del propio AppShell. */
function renderShell(props: Omit<ComponentProps<typeof AppShell>, "children">) {
  return render(<AppShell {...props}><p>contenido</p></AppShell>);
}

beforeEach(() => { resetSessionPinned(); localStorage.clear(); localStorage.setItem("shell.sidebar", "collapsed"); auth.user = { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" }; });

afterEach(() => { vi.unstubAllGlobals(); });

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
  it("un keydown sin `key` (el autocompletado de Chrome) no lanza", () => {
    render(<AppShell><input aria-label="campo" /></AppShell>);
    const errores: unknown[] = [];
    const alFallar = (e: ErrorEvent) => { errores.push(e.error); e.preventDefault(); };
    window.addEventListener("error", alFallar);
    try {
      document.dispatchEvent(new Event("keydown")); // sin key, sin altKey
    } finally {
      window.removeEventListener("error", alFallar);
    }
    expect(errores).toEqual([]);
  });
  it("la miga solo lleva lo que existe y las acciones del contexto", () => {
    render(<AppShell crumbs={[{ label: "Pacientes", onClick: () => {} }, { label: "segura, Juan" }]} actions={<button>Nuevo caso</button>}><p>x</p></AppShell>);
    expect(screen.getByText("segura, Juan")).toBeTruthy();
    expect(screen.queryByText("Administración")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo caso" })).toBeTruthy();
  });
  it("la barra superior lleva subtítulo, acciones, tema y avatar, y no «Cerrar sesión»", () => {
    renderShell({ crumbs: [{ label: "Pacientes" }], subtitle: "14 pacientes", actions: <button>Nuevo caso</button> });
    const header = screen.getByRole("banner");
    expect(within(header).getByText("14 pacientes")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Nuevo caso" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: /tema/i })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Menú de usuario" })).toBeInTheDocument();
    expect(within(header).queryByText("Cerrar sesión")).toBeNull();
  });
  it("se pinta sobre el Ambiente", () => {
    const { container } = renderShell({});
    expect(container.querySelector("[data-ambiente]")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".shell")).toBeTruthy();
  });
  it("fijada, la rejilla es de 240px y plegada de 64px", () => {
    localStorage.setItem("shell.sidebar", "pinned");
    const { container } = renderShell({});
    expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "true");
    const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");
    expect(css).toMatch(/\.shell\[data-pinned="true"\]\s*\{[^}]*grid-template-columns:\s*240px 1fr/);
    expect(css).toMatch(/\.shell\s*\{[^}]*grid-template-columns:\s*64px 1fr/);
  });
  it("a 1280 px o menos arranca plegada aunque la preferencia diga fijada, sin pisarla", () => {
    localStorage.setItem("shell.sidebar", "pinned");
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q === "(max-width: 1280px)" })) as typeof window.matchMedia;
    try {
      const { container } = renderShell({});
      expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "false");
      expect(localStorage.getItem("shell.sidebar")).toBe("pinned");
    } finally {
      window.matchMedia = original;
    }
  });
  it("la altura de la barra sale del CSS: la clase es shell-top y mide 56 px", () => {
    renderShell({ crumbs: [{ label: "Pacientes" }] });
    expect(screen.getByRole("banner")).toHaveClass("shell-top");
    const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");
    expect(css).toMatch(/\.shell-top\s*\{[^}]*height:\s*56px/);
  });

  it("> 1280 con la preferencia «fijada»: carril fijado a 240", () => {
    const s = simularPantalla({ ancho: 1707 }); localStorage.setItem("shell.sidebar", "pinned");
    const { container } = renderShell({});
    expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "true");
    expect(screen.queryByRole("button", { name: "Abrir las secciones" })).toBeNull();
    s.restaurar();
  });
  it("a 1024: carril plegado, sin botón de cajón; enlaces de 44 px por CSS", () => {
    const s = simularPantalla({ ancho: 1024 });
    const { container } = renderShell({});
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-modo", "carril");
    expect(container.querySelector(".shell")).toHaveAttribute("data-pinned", "false");
    const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 1024px\)\s*\{[^}]*\.shell-nav-link\s*\{\s*height:\s*44px/);
    s.restaurar();
  });
  it("a 390: sin carril; el botón abre el cajón con el foco en el primer enlace y Escape lo cierra devolviendo el foco", () => {
    const s = simularPantalla({ ancho: 390 });
    const { container } = renderShell({ crumbs: [{ label: "Pacientes" }] });
    expect(container.querySelector(".shell")).toHaveAttribute("data-movil", "true");
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    const boton = screen.getByRole("button", { name: "Abrir las secciones" });
    fireEvent.click(boton);
    const cajon = screen.getByRole("navigation", { name: "Secciones" });
    expect(cajon).toHaveAttribute("data-modo", "cajon");
    expect(cajon).toHaveAttribute("data-expanded", "true");
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(within(cajon).getAllByRole("link")[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    expect(document.activeElement).toBe(boton);
    s.restaurar();
  });
  it("a 390: el Tab no sale del cajón (foco atrapado)", () => {
    const s = simularPantalla({ ancho: 390 });
    renderShell({});
    fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
    const cajon = screen.getByRole("navigation", { name: "Secciones" });
    const foco = Array.from(cajon.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    foco[foco.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(foco[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(foco[foco.length - 1]);
    s.restaurar();
  });
  it("a 390: elegir una sección navega y cierra; el velo también cierra", () => {
    const s = simularPantalla({ ancho: 390 });
    const { container } = renderShell({});
    nav.go.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Secciones" })).getByRole("link", { name: "Estudios" }));
    expect(nav.go).toHaveBeenCalledWith("studies");
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
    fireEvent.click(container.querySelector(".shell-nav-velo")!);
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    s.restaurar();
  });
  it("a 390: con el cajón abierto el fondo es inert y el cajón es un diálogo modal", () => {
    const s = simularPantalla({ ancho: 390 });
    const { container } = renderShell({});
    const fondo = container.querySelector(".shell-body")!;
    expect(fondo).not.toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
    expect(fondo).toHaveAttribute("inert");
    const dialogo = screen.getByRole("dialog", { name: "Secciones" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo.contains(screen.getByRole("navigation", { name: "Secciones" }))).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fondo).not.toHaveAttribute("inert");
    expect(screen.queryByRole("dialog")).toBeNull();
    s.restaurar();
  });
  it("si la ventana pasa de 640 con el cajón abierto, vuelve el carril", () => {
    const s = simularPantalla({ ancho: 390 });
    renderShell({});
    fireEvent.click(screen.getByRole("button", { name: "Abrir las secciones" }));
    act(() => s.cambiar({ ancho: 1024 }));
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-modo", "carril");
    expect(screen.queryByRole("button", { name: "Abrir las secciones" })).toBeNull();
    s.restaurar();
  });
});
