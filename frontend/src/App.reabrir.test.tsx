/* FE-9: recargar en el quirófano vuelve a abrir la sesión de esta pestaña
   (sigue viva en el servidor) en el paso en que estaba. Mismos dobles que
   App.navegabilidad.test.tsx. */
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PACIENTE = { id: 42, full_name: "Zenodo, Caso 002", hospital_id: "HC-42" };
const planning: Record<string, unknown> = {
  dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(),
  setPatient: vi.fn(), setCase: vi.fn(), sessionId: null, epoca: 0,
  epocaActual: () => 0, setAnnotationsLoadState: vi.fn(),
};
const reopenSession = vi.fn();

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
  api: { listPatients: () => listPatients(), reopenSession: (...a: unknown[]) => reopenSession(...a) },
  ApiError: class extends Error {},
  onServerDown: () => () => {},
  retryLastFailed: vi.fn(),
}));
vi.mock("./store/auth", () => ({
  alCerrarSesion: () => () => {},
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: usuario, ready: true, expiredNotice: null, logout }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => planning,
}));
vi.mock("./onboarding/OnboardingProvider", () => ({ OnboardingProvider: ({ children }: { children: React.ReactNode }) => children }));
const rehydrateSession = vi.fn();
vi.mock("./resume", () => ({ rehydrateSession: (...a: unknown[]) => rehydrateSession(...a) }));
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
  Login: ({ onLogin, notice }: { onLogin: () => void; notice?: string | null }) => (
    <><p>pantalla de entrada</p>{notice && <p>{notice}</p>}<button onClick={() => { usuario = USUARIO; onLogin(); }}>entrar</button></>
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
import { leerSesionViva, olvidarSesionViva, recordarSesionViva } from "./lib/sesionViva";

function montar(path: string) {
  const router = createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  usuario = USUARIO;
  planning.sessionId = null;
  listPatients.mockReset().mockResolvedValue([PACIENTE]);
  reopenSession.mockReset();
  rehydrateSession.mockReset().mockResolvedValue({ step: 3, invalidated: false, faltan: [] });
  olvidarSesionViva();
});
afterEach(() => { olvidarSesionViva(); });

describe("recordar la sesión de la pestaña", () => {
  it("guarda, lee y olvida; lo que no tiene forma se ignora", () => {
    recordarSesionViva({ sessionId: "s1", paso: 4, patientId: 42, userId: 1 });
    expect(leerSesionViva()).toEqual({ sessionId: "s1", paso: 4, patientId: 42, userId: 1 });
    sessionStorage.setItem("prospective.sesionViva", "{no es json");
    expect(leerSesionViva()).toBeNull();
    olvidarSesionViva();
    expect(leerSesionViva()).toBeNull();
  });
});

describe("App · recargar en el quirófano (FE-9)", () => {
  it("reabre la sesión de esta pestaña en el paso en que estaba", async () => {
    recordarSesionViva({ sessionId: "viva-1", paso: 3, patientId: 42, userId: USUARIO.id });
    reopenSession.mockResolvedValue({ session_id: "viva-1", current_step: 3, patient_id: 42 });
    montar("/app/sesion");
    await waitFor(() => expect(reopenSession).toHaveBeenCalledWith("viva-1", 3));
    await waitFor(() => expect(rehydrateSession).toHaveBeenCalled());
    expect(planning.setPatient).toHaveBeenCalledWith(PACIENTE);
    expect(await screen.findByText("pipeline")).toBeTruthy();
  });

  it("si la sesión ya no está en el servidor, lo dice y va a Pacientes", async () => {
    recordarSesionViva({ sessionId: "purgada", paso: 2, patientId: null, userId: USUARIO.id });
    reopenSession.mockRejectedValue(new Error("La sesión en curso ya no está en el servidor."));
    const router = montar("/app/sesion");
    await waitFor(() => expect(router.state.location.pathname).not.toBe("/app/sesion"));
    expect(rehydrateSession).not.toHaveBeenCalled();
    expect(leerSesionViva()).toBeNull();
  });

  it("la sesión de otra cuenta no se reabre", async () => {
    recordarSesionViva({ sessionId: "ajena", paso: 2, patientId: null, userId: 999 });
    montar("/app/sesion");
    await screen.findByText("pipeline");
    expect(reopenSession).not.toHaveBeenCalled();
  });
});
