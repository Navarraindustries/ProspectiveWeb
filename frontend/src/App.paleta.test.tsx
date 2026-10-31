/* La paleta ⌘K dentro del pipeline: «Reanudar · X» y «Prueba rápida sin
   paciente» cambian de sesión sin cambiar de ruta, así que el bloqueador de
   navegación no las ve. Con el análisis sin guardar quedan deshabilitadas. */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const planning = {
  dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(),
};
let paletteProps: Record<string, unknown> = {};

vi.mock("./api/client", () => ({ api: {}, ApiError: class extends Error {}, onServerDown: () => () => {}, retryLastFailed: vi.fn() }));
vi.mock("./store/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "medico", institution: "" }, ready: true, expiredNotice: null }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", () => ({ Workspace: () => <p>pipeline</p> }));
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
