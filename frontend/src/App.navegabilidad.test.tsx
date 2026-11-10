/* Navegabilidad del Router de App: cerrar sesión desde el quirófano con cambios
   sin guardar pasa antes por el aviso; al terminar el informe se vuelve a la
   ficha del paciente; y el filtro por paciente de Pedidos vive en la URL. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PACIENTE = { id: 42, full_name: "Zenodo, Caso 002", hospital_id: "HC-42" };
const planning: Record<string, unknown> = {
  dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(),
};

// Ver App.ficha.test.tsx: el `Request` de Node rechaza la señal de jsdom.
const RequestNode = globalThis.Request;
globalThis.Request = class extends RequestNode {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init && { ...init, signal: undefined });
  }
} as typeof Request;

const logout = vi.fn();
const USUARIO = { id: 1, username: "a", full_name: "A", role: "medico", institution: "" };
let usuario: typeof USUARIO | null = USUARIO;
const listPatients = vi.fn();
vi.mock("./api/client", () => ({
  api: { listPatients: () => listPatients() },
  ApiError: class extends Error {},
  onServerDown: () => () => {},
  retryLastFailed: vi.fn(),
}));
vi.mock("./store/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: usuario, ready: true, expiredNotice: null, logout }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./onboarding/OnboardingProvider", () => ({ OnboardingProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", async () => {
  const { useNav } = await import("./store/nav");
  return {
    Workspace: ({ onFinish }: { onFinish: () => void }) => {
      const nav = useNav();
      return (
        <>
          <p>pipeline</p>
          <button onClick={() => nav.salir?.()}>cerrar sesión</button>
          <button onClick={onFinish}>terminar</button>
        </>
      );
    },
  };
});
vi.mock("./pages/Patients", () => ({ Patients: () => <p>lista de pacientes</p> }));
vi.mock("./pages/PatientPage", () => ({ PatientPage: ({ patientId }: { patientId: number }) => <p>ficha {patientId}</p> }));
vi.mock("./pages/Studies", () => ({ Studies: () => null }));
vi.mock("./pages/ClipOrders", () => ({
  ClipOrdersPage: ({ patientFilter, onClearPatient, onBackToPatient }: {
    patientFilter: { full_name: string } | null; onClearPatient: () => void; onBackToPatient?: () => void;
  }) => (
    <>
      <p data-testid="filtro">{patientFilter?.full_name ?? "todos"}</p>
      <button onClick={onClearPatient}>ver todos</button>
      {onBackToPatient && <button onClick={onBackToPatient}>volver a la ficha</button>}
    </>
  ),
}));
vi.mock("./pages/Workshops", () => ({ WorkshopsPage: () => null }));
vi.mock("./pages/PendingRequests", () => ({ PendingRequests: () => null }));
vi.mock("./pages/UsersAdmin", () => ({ UsersAdmin: () => null }));
vi.mock("./pages/AuditTrail", () => ({ AuditTrail: () => null }));
vi.mock("./pages/Login", () => ({
  Login: ({ onLogin }: { onLogin: () => void }) => (
    <><p>pantalla de entrada</p><button onClick={() => { usuario = USUARIO; onLogin(); }}>entrar</button></>
  ),
}));
vi.mock("./pages/Signup", () => ({ Signup: () => null }));
vi.mock("./components/ForcePasswordChange", () => ({ ForcePasswordChange: () => null }));
vi.mock("./components/ServerDownBanner", () => ({ ServerDownBanner: () => null }));
vi.mock("./components/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("./components/UnsavedExitDialog", () => ({
  UnsavedExitDialog: ({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) =>
    open ? (
      <div role="dialog">
        <button onClick={onStay}>seguir aquí</button>
        <button onClick={onLeave}>salir sin guardar</button>
      </div>
    ) : null,
}));

import App from "./App";

function montar(path: string) {
  const router = createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  usuario = USUARIO;
  planning.dirty = false;
  planning.patient = null;
  logout.mockReset();
  listPatients.mockReset().mockResolvedValue([PACIENTE]);
});
afterEach(() => { vi.useRealTimers(); });

describe("App · cerrar sesión desde el quirófano", () => {
  it("sin cambios pendientes cierra la sesión al momento", async () => {
    const router = montar("/app/sesion");
    fireEvent.click(await screen.findByRole("button", { name: "cerrar sesión" }));
    expect(logout).toHaveBeenCalledTimes(1);
    // El `logout` simulado no quita el usuario, así que App devuelve «Entrar» a
    // la lista: basta con ver que se salió del quirófano sin preguntar.
    await waitFor(() => expect(router.state.location.pathname).not.toBe("/app/sesion"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con cambios sin guardar pregunta antes, y la sesión sigue abierta mientras tanto", async () => {
    planning.dirty = true;
    montar("/app/sesion");
    fireEvent.click(await screen.findByRole("button", { name: "cerrar sesión" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByText("pipeline")).toBeTruthy();
  });

  it("«Seguir aquí» cancela también el cierre de sesión", async () => {
    planning.dirty = true;
    const router = montar("/app/sesion");
    fireEvent.click(await screen.findByRole("button", { name: "cerrar sesión" }));
    fireEvent.click(await screen.findByRole("button", { name: "seguir aquí" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(logout).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/app/sesion");
  });

  it("al aceptar la salida, cierra la sesión ya fuera del quirófano", async () => {
    planning.dirty = true;
    montar("/app/sesion");
    fireEvent.click(await screen.findByRole("button", { name: "cerrar sesión" }));
    fireEvent.click(await screen.findByRole("button", { name: "salir sin guardar" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});

describe("App · terminar el informe", () => {
  it("con paciente vuelve a su ficha", async () => {
    planning.patient = PACIENTE;
    const router = montar("/app/sesion");
    const terminar = await screen.findByRole("button", { name: "terminar" });
    vi.useFakeTimers();
    fireEvent.click(terminar);
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    vi.useRealTimers();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes/42"));
  });

  it("sin paciente vuelve a la lista", async () => {
    const router = montar("/app/sesion");
    const terminar = await screen.findByRole("button", { name: "terminar" });
    vi.useFakeTimers();
    fireEvent.click(terminar);
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    vi.useRealTimers();
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes"));
  });
});

describe("App · Pedidos filtrados por paciente", () => {
  it("lee el paciente de la URL: una recarga conserva el filtro y la vuelta a la ficha", async () => {
    const router = montar("/app/pedidos?paciente=42");
    await waitFor(() => expect(screen.getByTestId("filtro").textContent).toBe("Zenodo, Caso 002"));
    fireEvent.click(screen.getByRole("button", { name: "volver a la ficha" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes/42"));
  });

  it("«Ver todos» quita el filtro de la URL", async () => {
    const router = montar("/app/pedidos?paciente=42");
    await waitFor(() => expect(screen.getByTestId("filtro").textContent).toBe("Zenodo, Caso 002"));
    fireEvent.click(screen.getByRole("button", { name: "ver todos" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.getByTestId("filtro").textContent).toBe("todos");
  });

  it("sin parámetro, o con uno que no es un id, enseña todos", async () => {
    montar("/app/pedidos?paciente=abc");
    expect((await screen.findByTestId("filtro")).textContent).toBe("todos");
    expect(listPatients).not.toHaveBeenCalled();
  });
});

describe("App · entrar desde un enlace", () => {
  it("sin sesión, tras entrar se vuelve a la pantalla que se pedía", async () => {
    usuario = null;
    const router = montar("/app/pedidos?paciente=42");
    fireEvent.click(await screen.findByRole("button", { name: "entrar" }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe("/app/pedidos?paciente=42"));
  });

  it("entrando por «Entrar» directamente se va a Pacientes", async () => {
    usuario = null;
    const router = montar("/app/entrar");
    fireEvent.click(await screen.findByRole("button", { name: "entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/pacientes"));
  });
});
