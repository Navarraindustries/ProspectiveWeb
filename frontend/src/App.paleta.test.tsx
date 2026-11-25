/* La paleta ⌘K dentro del pipeline: «Reanudar · X» y «Prueba rápida sin
   paciente» cambian de sesión sin cambiar de ruta, así que el bloqueador de
   navegación no las ve. Con el análisis sin guardar quedan deshabilitadas. */
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ver App.ficha.test.tsx: el `Request` de Node rechaza la señal de jsdom.
const RequestNode = globalThis.Request;
globalThis.Request = class extends RequestNode {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init && { ...init, signal: undefined });
  }
} as typeof Request;

const planning = {
  dirty: false, patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(), setAnnotationsLoadState: vi.fn(),
  // Como el store real: cada reset abre otra época.
  epoca: 0,
  reset: vi.fn(() => { planning.epoca += 1; }),
  epocaActual: () => planning.epoca,
};
let paletteProps: Record<string, unknown> = {};

const restoreSession = vi.hoisted(() => vi.fn());
vi.mock("./api/client", () => ({ api: { restoreSession: (...a: unknown[]) => restoreSession(...a) }, ApiError: class extends Error {}, onServerDown: () => () => {}, retryLastFailed: vi.fn() }));
vi.mock("./store/auth", () => ({
  alCerrarSesion: () => () => {},
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "medico", institution: "" }, ready: true, expiredNotice: null }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", async () => {
  const { useNav } = await import("./store/nav");
  // Lo que ve el menú de usuario del quirófano (QuirofanoBar → UserMenu) por useNav().
  const Bloqueo = () => <p data-testid="nav-bloqueo">{useNav().bloqueoPipeline ?? ""}</p>;
  return {
    Workspace: ({ aviso, initialStep }: { aviso?: { texto: string } | null; initialStep?: number }) => (
      <><p>pipeline</p><p data-testid="paso-inicial">{initialStep}</p><p data-testid="aviso-pipeline">{aviso?.texto ?? ""}</p><Bloqueo /></>
    ),
  };
});
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
import { rehydrateSession } from "./resume";

const BLOQUEO = "Guarda o descarta los cambios del análisis antes";

function montar(path: string) {
  const router = createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const pruebaRapida = () => getCommands().find((c) => c.id === "prueba-rapida");

beforeEach(() => {
  planning.dirty = false; paletteProps = {};
  restoreSession.mockImplementation(() => new Promise(() => {}));
});
afterEach(() => vi.clearAllMocks());

describe("App · paleta en el pipeline", () => {
  it("con el análisis sin guardar, «Prueba rápida sin paciente» y Recientes quedan deshabilitados", async () => {
    planning.dirty = true;
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    expect(pruebaRapida()?.disabled).toBe(true);
    expect(pruebaRapida()?.hint).toBe(BLOQUEO);
    expect(paletteProps.reanudarBloqueado).toBe(BLOQUEO);
    // La misma señal llega por useNav: el menú de usuario deshabilita «Ver el recorrido de bienvenida».
    expect(screen.getByTestId("nav-bloqueo").textContent).toBe(BLOQUEO);
  });

  it("sin cambios pendientes los dos siguen disponibles", async () => {
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    expect(screen.getByTestId("nav-bloqueo").textContent).toBe("");
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

describe("App · «Reanudar · B» desde el quirófano (FE-3)", () => {
  it("abre en el paso de B, no en el de la sesión anterior", async () => {
    // Lo vio la prueba en el navegador: con el informe de A abierto (paso 8),
    // reanudar B (guardada en Detección) abría B en el paso 8.
    let terminar!: (v: { step: number; invalidated: boolean }) => void;
    vi.mocked(rehydrateSession).mockImplementationOnce(() => new Promise((r) => { terminar = r; }));
    restoreSession.mockResolvedValueOnce({ session_id: "b" });
    montar("/app/sesion");
    expect(await screen.findByText("pipeline")).toBeTruthy();
    await act(async () => { void (paletteProps.onResume as (s: string, p: unknown) => void)("b", { id: 2 }); });
    // Mientras se rellena el store no hay quirófano a medias; el aviso lo pinta App.
    expect(screen.queryByText("pipeline")).toBeNull();
    expect(screen.getByText("Restaurando sesión…")).toBeTruthy();
    await act(async () => { terminar({ step: 3, invalidated: false }); });
    expect(screen.getByTestId("paso-inicial").textContent).toBe("3");
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
