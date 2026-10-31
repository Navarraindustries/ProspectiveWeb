/* La ficha con URL propia dentro del Router de App: la URL /app/pacientes/:id
   se conserva al cargar y recargar, un id malo cae en la lista y sin sesión se
   va a la entrada. */
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const planning = {
  dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(),
};

// El enrutador de datos crea un `Request` con la señal de aborto de jsdom, que
// el `Request` de Node rechaza; las navegaciones (las correcciones de URL de
// App) fallarían. Se le quita la señal: aquí no se aborta nada.
const RequestNode = globalThis.Request;
globalThis.Request = class extends RequestNode {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init && { ...init, signal: undefined });
  }
} as typeof Request;

const getPatient = vi.fn();
let usuario: Record<string, unknown> | null = { id: 1, username: "a", full_name: "A", role: "medico", institution: "" };
vi.mock("./api/client", () => ({
  api: {
    getPatient: (id: number) => getPatient(id),
    listPatients: () => Promise.resolve([]),
    patientShares: () => Promise.resolve([]),
    listCaptures: () => Promise.resolve([]),
  },
  ApiError: class extends Error {},
  onServerDown: () => () => {},
  retryLastFailed: vi.fn(),
}));
vi.mock("./store/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: usuario, ready: true, expiredNotice: null, logout: vi.fn() }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", () => ({ Workspace: () => <p>pipeline</p> }));
vi.mock("./pages/Patients", () => ({ Patients: () => <p>lista de pacientes</p> }));
vi.mock("./pages/Studies", () => ({ Studies: () => null }));
vi.mock("./pages/ClipOrders", () => ({ ClipOrdersPage: () => null }));
vi.mock("./pages/Workshops", () => ({ WorkshopsPage: () => null }));
vi.mock("./pages/PendingRequests", () => ({ PendingRequests: () => null }));
vi.mock("./pages/UsersAdmin", () => ({ UsersAdmin: () => null }));
vi.mock("./pages/AuditTrail", () => ({ AuditTrail: () => null }));
vi.mock("./pages/Login", () => ({ Login: () => <p>pantalla de entrada</p> }));
vi.mock("./pages/Signup", () => ({ Signup: () => null }));
vi.mock("./components/ForcePasswordChange", () => ({ ForcePasswordChange: () => null }));
vi.mock("./components/ServerDownBanner", () => ({ ServerDownBanner: () => null }));
vi.mock("./components/UnsavedExitDialog", () => ({ UnsavedExitDialog: () => null }));
vi.mock("./components/CommandPalette", () => ({
  CommandPalette: () => null,
}));

import App from "./App";

const PACIENTE = { id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" };

function montar(path: string) {
  const router = createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  getPatient.mockReset().mockResolvedValue(PACIENTE);
  usuario = { id: 1, username: "a", full_name: "A", role: "medico", institution: "" };
});

describe("App · ficha /app/pacientes/:id", () => {
  it("conserva la URL de la ficha y la enseña", async () => {
    const router = montar("/app/pacientes/42");
    expect(await screen.findByRole("heading", { name: "Zenodo, Caso 002" })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes/42"));
    expect(getPatient).toHaveBeenCalledWith(42);
    expect(screen.queryByText("lista de pacientes")).toBeNull();
  });

  it("con barra final corrige la URL a /app/pacientes/42 y enseña la ficha", async () => {
    const router = montar("/app/pacientes/42/");
    expect(await screen.findByRole("heading", { name: "Zenodo, Caso 002" })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes/42"));
  });

  it("un id que no es número cae en la lista /app/pacientes", async () => {
    const router = montar("/app/pacientes/abc");
    expect(await screen.findByText("lista de pacientes")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes"));
    expect(getPatient).not.toHaveBeenCalled();
  });

  it("sin sesión, /app/pacientes/42 va a la entrada /app/entrar", async () => {
    usuario = null;
    const router = montar("/app/pacientes/42");
    expect(await screen.findByText("pantalla de entrada")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/entrar"));
    expect(getPatient).not.toHaveBeenCalled();
  });

  it("en la ficha, «Pacientes» de la barra lateral es el enlace activo", async () => {
    montar("/app/pacientes/42");
    await screen.findByRole("heading", { name: "Zenodo, Caso 002" });
    const activos = screen.getAllByRole("link", { current: "page" });
    expect(activos.map((a) => a.getAttribute("href"))).toEqual(["/app/pacientes"]);
    expect(activos[0].textContent).toContain("Pacientes");
  });
});
