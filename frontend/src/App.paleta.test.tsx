/* La paleta ⌘K dentro del pipeline: «Reanudar · X» y «Prueba rápida sin
   paciente» cambian de sesión sin cambiar de ruta, así que el bloqueador de
   navegación no las ve. Con el análisis sin guardar quedan deshabilitadas. */
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const planning = {
  dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(),
};
let paletteProps: Record<string, unknown> = {};

vi.mock("./api/client", () => ({ api: { restoreSession: () => new Promise(() => {}) }, ApiError: class extends Error {}, onServerDown: () => () => {}, retryLastFailed: vi.fn() }));
vi.mock("./store/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "medico", institution: "" }, ready: true, expiredNotice: null }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", () => ({
  Workspace: ({ aviso }: { aviso?: { texto: string } | null }) => <><p>pipeline</p><p data-testid="aviso-pipeline">{aviso?.texto ?? ""}</p></>,
}));
vi.mock("./pages/Patients", () => ({ Patients: () => <p>pacientes</p> }));
vi.mock("./pages/Studies", () => ({ Studies: () => null }));
vi.mock("./pages/ClipOrders", () => ({ ClipOrdersPage: () => null }));
vi.mock("./pages/Workshops", () => ({ WorkshopsPage: () => null }));
vi.mock("./pages/PendingRequests", () => ({ PendingRequests: () => null }));
vi.mock("./pages/UsersAdmin", () => ({ UsersAdmin: () => null }));
vi.mock("./pages/AuditTrail", () => ({ AuditTrail: () => null }));
vi.mock("./pages/Login", () => ({ Login: () => null }));
vi.mock("./pages/Signup", () => ({ Signup: () => null }));
vi.mock("./components/ForcePasswordChange", () => ({ ForcePasswordChange: () => null }));
vi.mock("./components/ServerDownBanner", () => ({ ServerDownBanner: () => null }));
vi.mock("./components/UnsavedExitDialog", () => ({ UnsavedExitDialog: () => null }));
vi.mock("./components/CommandPalette", () => ({
  CommandPalette: (props: Record<string, unknown>) => { paletteProps = props; return null; },
}));

import App from "./App";
import { getCommands } from "./lib/commands";

const BLOQUEO = "Guarda o descarta los cambios del análisis antes";

function montar(path: string) {
  const router = createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const pruebaRapida = () => getCommands().find((c) => c.id === "prueba-rapida");

beforeEach(() => { planning.dirty = false; paletteProps = {}; });
afterEach(() => vi.clearAllMocks());

describe("App · paleta en el pipeline", () => {
  it("con el análisis sin guardar, «Prueba rápida sin paciente» y Recientes quedan deshabilitados", async () => {
    planning.dirty = true;
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    expect(pruebaRapida()?.disabled).toBe(true);
    expect(pruebaRapida()?.hint).toBe(BLOQUEO);
    expect(paletteProps.reanudarBloqueado).toBe(BLOQUEO);
  });

  it("sin cambios pendientes los dos siguen disponibles", async () => {
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    expect(pruebaRapida()?.disabled).toBeFalsy();
    expect(paletteProps.reanudarBloqueado).toBeUndefined();
  });

  it("fuera del pipeline un store sucio no bloquea nada", async () => {
    planning.dirty = true;
    montar("/app/pacientes");
    expect(await screen.findByText("pacientes")).toBeTruthy();
    expect(pruebaRapida()?.disabled).toBeFalsy();
    expect(paletteProps.reanudarBloqueado).toBeUndefined();
  });
});

describe("App · aviso global", () => {
  const paciente = { id: 1, full_name: "P" } as never;

  it("en el pipeline el aviso global lo pinta el apilado de Workspace, no App", async () => {
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    act(() => { void (paletteProps.onResume as (s: string, p: unknown) => void)("s1", paciente); });
    expect((await screen.findByTestId("aviso-pipeline")).textContent).toBe("Restaurando sesión…");
    // Una sola copia del texto y ningún toast propio de App (sería otro [data-glass]).
    expect(screen.getAllByText("Restaurando sesión…")).toHaveLength(1);
    expect(document.querySelector("[data-glass]")).toBeNull();
  });

  it("fuera del pipeline sigue pintándolo App, abajo a la derecha", async () => {
    montar("/app/pacientes");
    expect(await screen.findByText("pacientes")).toBeTruthy();
    act(() => { void (paletteProps.onResume as (s: string, p: unknown) => void)("s1", paciente); });
    const aviso = await screen.findByText("Restaurando sesión…");
    expect(aviso.closest("[data-glass]")).not.toBeNull();
  });
});
