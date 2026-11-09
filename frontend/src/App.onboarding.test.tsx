/* El onboarding no debe montarse ni arrancar mientras haya un cambio de
   contraseña pendiente, y sí arrancar una vez pasada esa puerta. */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let must = true;
const arranque = vi.fn();

vi.mock("./api/client", () => ({ api: { restoreSession: () => new Promise(() => {}) }, ApiError: class extends Error {}, onServerDown: () => () => {}, retryLastFailed: vi.fn() }));
vi.mock("./store/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: 1, username: "a", full_name: "A", role: "medico", institution: "", must_change_password: must }, ready: true, expiredNotice: null }),
}));
vi.mock("./store/planning", () => ({
  PlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlanning: () => ({ dirty: false, reset: vi.fn(), patient: null, imagingStudyId: null, saveNow: vi.fn(), setPatient: vi.fn(), setCase: vi.fn() }),
}));
vi.mock("./onboarding/OnboardingProvider", () => ({
  OnboardingProvider: ({ children }: { children: React.ReactNode }) => { arranque(); return children; },
}));
vi.mock("./resume", () => ({ rehydrateSession: vi.fn() }));
vi.mock("./pages/Workspace", () => ({ Workspace: () => null }));
vi.mock("./pages/Patients", () => ({ Patients: () => <p>pacientes</p> }));
for (const p of ["Studies", "ClipOrders", "Workshops", "PendingRequests", "UsersAdmin", "AuditTrail", "Login", "Signup"]) {
  vi.doMock(`./pages/${p}`, () => ({}));
}
vi.mock("./components/ForcePasswordChange", () => ({ ForcePasswordChange: () => <p>cambio</p> }));
vi.mock("./components/ServerDownBanner", () => ({ ServerDownBanner: () => null }));
vi.mock("./components/UnsavedExitDialog", () => ({ UnsavedExitDialog: () => null }));
vi.mock("./components/CommandPalette", () => ({ CommandPalette: () => null }));

import App from "./App";

const montar = () => render(<RouterProvider router={createMemoryRouter([{ path: "/app/*", element: <App /> }], { initialEntries: ["/app/pacientes"] })} />);

beforeEach(() => arranque.mockClear());

describe("App · puerta del onboarding", () => {
  it("con must_change_password se ve ForcePasswordChange y no se monta el proveedor", async () => {
    must = true;
    montar();
    expect(await screen.findByText("cambio")).toBeTruthy();
    expect(arranque).not.toHaveBeenCalled();
  });

  it("sin cambio pendiente se monta el proveedor", async () => {
    must = false;
    montar();
    expect(await screen.findByText("pacientes")).toBeTruthy();
    expect(arranque).toHaveBeenCalled();
  });
});
