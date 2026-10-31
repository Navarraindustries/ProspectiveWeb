/* La barra lateral (F2, shell C): la sección activa se marca para el lector de
   pantalla, se expande al pasar el ratón 150 ms y la chincheta la deja fija
   entre sesiones. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = { user: { id: 1, username: "admin", full_name: "Administrador", role: "admin", institution: "" } as { role: string; [k: string]: unknown } | null };
const nav = { screen: "studies", go: vi.fn() };
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user: auth.user, logout: vi.fn() }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => nav }));
vi.mock("../../store/theme", () => ({ useThemeContext: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../api/client", () => ({ api: { listPending: vi.fn().mockResolvedValue([]) } }));

import { api } from "../../api/client";
import { SideNav } from "./SideNav";
import { useShellState } from "./useShellState";

/* La barra recibe su estado del shell; aquí lo pone el mismo gancho real. */
function Host() {
  return <SideNav state={useShellState()} />;
}

const barra = () => screen.getByRole("navigation", { name: "Secciones" });

/* Los tests de plegado parten de la barra suelta: con la ventana ancha (jsdom
   mide 1024) la barra arranca fijada. */
function renderNav(opts: { screen?: string } = {}) {
  nav.screen = opts.screen ?? "studies";
  return render(<Host />);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shell.sidebar", "collapsed");
  nav.screen = "studies";
  nav.go.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe("SideNav", () => {
  it("la sección activa lleva aria-current=page y las demás no", () => {
    render(<Host />);
    expect(screen.getByRole("link", { name: /Estudios/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Pacientes/ }).getAttribute("aria-current")).toBeNull();
  });

  it("el enlace lleva la ruta real pero navega por el router, sin recargar", () => {
    render(<Host />);
    const enlace = screen.getByRole("link", { name: /Pacientes/ });
    expect(enlace.getAttribute("href")).toBe("/app/pacientes");
    const seguido = fireEvent.click(enlace);
    expect(seguido).toBe(false); // preventDefault: el navegador no sigue el href
    expect(nav.go).toHaveBeenCalledWith("patients");
  });

  it("al pasar el ratón 150 ms se expande y al salir se pliega", () => {
    vi.useFakeTimers();
    render(<Host />);
    expect(barra().getAttribute("data-expanded")).toBe("false");
    fireEvent.mouseEnter(barra());
    act(() => { vi.advanceTimersByTime(149); });
    expect(barra().getAttribute("data-expanded")).toBe("false");
    act(() => { vi.advanceTimersByTime(1); });
    expect(barra().getAttribute("data-expanded")).toBe("true");
    fireEvent.mouseLeave(barra());
    expect(barra().getAttribute("data-expanded")).toBe("false");
  });

  it("salir antes de los 150 ms no la expande después", () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.mouseEnter(barra());
    fireEvent.mouseLeave(barra());
    act(() => { vi.advanceTimersByTime(300); });
    expect(barra().getAttribute("data-expanded")).toBe("false");
  });

  it("fijar con la chincheta guarda shell.sidebar = pinned y se recuerda", () => {
    const { unmount } = render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Fijar la barra lateral" }));
    expect(barra().getAttribute("data-expanded")).toBe("true");
    expect(localStorage.getItem("shell.sidebar")).toBe("pinned");
    unmount();
    render(<Host />);
    expect(barra().getAttribute("data-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Soltar la barra lateral" }));
    expect(localStorage.getItem("shell.sidebar")).toBe("collapsed");
    expect(barra().getAttribute("data-expanded")).toBe("false");
  });

  it("el grupo Administración solo se nombra expandida", () => {
    render(<Host />);
    expect(screen.queryByText("Administración")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fijar la barra lateral" }));
    expect(screen.getByText("Administración")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cuentas pendientes/ }).getAttribute("href")).toBe("/app/cuentas-pendientes");
  });

  it("la insignia de Cuentas pendientes se pone al día con el aviso de la página", async () => {
    const lista = vi.mocked(api.listPending);
    lista.mockResolvedValueOnce([]);
    render(<Host />);
    await act(async () => {});
    expect(screen.queryByText("2")).toBeNull();

    lista.mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as never);
    await act(async () => { window.dispatchEvent(new Event("prospective:pending-changed")); });
    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("sin valor guardado y con ventana ancha arranca fijada", () => {
    localStorage.removeItem("shell.sidebar");
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    renderNav();
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-expanded", "true");
  });

  it("sin valor guardado y con ventana estrecha arranca plegada", () => {
    localStorage.removeItem("shell.sidebar");
    Object.defineProperty(window, "innerWidth", { value: 900, configurable: true });
    renderNav();
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-expanded", "false");
  });

  it("la barra activa es un solo elemento y vive en el enlace activo", () => {
    renderNav({ screen: "studies" });
    const bars = document.querySelectorAll("[data-nav-bar]");
    expect(bars).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Estudios/ }).contains(bars[0])).toBe(true);
  });

  it("el pie lleva nombre, rol y «Cerrar sesión»", () => {
    renderNav();
    expect(screen.getByText("Administrador", { selector: ".shell-nav-user-name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
