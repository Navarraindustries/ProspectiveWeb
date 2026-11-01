/* La ficha con URL propia dentro del Router de App: la URL /app/pacientes/:id
   se conserva al cargar y recargar, un id malo cae en la lista y sin sesión se
   va a la entrada. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const listPatients = vi.fn();
let usuario: Record<string, unknown> | null = { id: 1, username: "a", full_name: "A", role: "medico", institution: "" };
vi.mock("./api/client", () => ({
  api: {
    getPatient: (id: number) => getPatient(id),
    listPatients: () => listPatients(),
    patientShares: () => Promise.resolve([]),
    listCaptures: () => Promise.resolve([]),
    patientStudies: () => Promise.resolve([]),
    patientSessions: () => Promise.resolve([]),
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
  listPatients.mockReset().mockResolvedValue([]);
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

  it("una respuesta tardía del paciente anterior no pisa la ficha del actual", async () => {
    getPatient.mockImplementation((id: number) =>
      Promise.resolve(id === 42 ? PACIENTE : { ...PACIENTE, id: 43, surname: "Otro", given_name: "Paciente 43", hospital_id: "HC-43" }),
    );
    const router = montar("/app/pacientes/42");
    // La fila de la lista no llega: la ficha del 42 pide «Reintentar» y su
    // respuesta queda pendiente mientras se navega al 43.
    const reintentar = await screen.findByRole("button", { name: "Reintentar" });
    let resolver42: (v: unknown) => void = () => {};
    listPatients.mockReset().mockImplementationOnce(() => new Promise((r) => { resolver42 = r; })).mockResolvedValue([]);
    fireEvent.click(reintentar);
    await act(async () => { await router.navigate("/app/pacientes/43"); });
    expect(await screen.findByRole("heading", { name: "Otro, Paciente 43" })).toBeTruthy();
    await act(async () => {
      resolver42([{ id: 42, full_name: "Zenodo, Caso 002", hospital_id: "HC-42", dob: null, sex: "F", institution: "",
        study_count: 7, created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
        last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", last_risk_label: null,
        last_capture_id: null, last_imaging_study_id: null }]);
    });
    expect(screen.getByRole("heading", { name: "Otro, Paciente 43" })).toBeTruthy();
    expect(screen.queryByText("Casos · 7")).toBeNull();
    expect(screen.queryByText("Zenodo, Caso 002")).toBeNull();
  });
});
