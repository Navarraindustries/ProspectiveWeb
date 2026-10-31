/* La ficha con URL propia (/app/pacientes/:id): carga el paciente, dice dónde
   está con la miga «Pacientes › nombre» y, si el servidor la niega o falla,
   avisa con una salida a la lista. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const getPatient = vi.fn();
const listPatients = vi.fn();
const deletePatient = vi.fn();
const user = { id: 1, role: "medico" as string };

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  }
  return {
    ApiError,
    api: {
      getPatient: (id: number) => getPatient(id),
      listPatients: () => listPatients(),
      patientShares: () => Promise.resolve([]),
      patientSessions: () => Promise.resolve([]),
      listCaptures: () => Promise.resolve([]),
      deletePatient: (id: number) => deletePatient(id),
    },
  };
});
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("./NuevoCaso", () => ({
  NuevoEstudioSheet: (p: { open: boolean; patientName?: string }) =>
    p.open ? <span>formulario del caso de {p.patientName}</span> : null,
}));
// El shell se sustituye por sus migas y su contenido: se prueba la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { crumbs?: { label: string; onClick?: () => void }[]; children?: import("react").ReactNode }) => (
    <>
      <nav aria-label="Miga de pan">
        {p.crumbs?.map((c, i) => c.onClick
          ? <button key={i} type="button" onClick={c.onClick}>{c.label}</button>
          : <span key={i}>{c.label}</span>)}
      </nav>
      {p.children}
    </>
  ),
}));

import { ApiError } from "../api/client";
import { PatientPage } from "./PatientPage";
import type { PatientSummary } from "../api/types";

const miga = () => screen.getByRole("navigation", { name: "Miga de pan" });
const Sonda = () =><output data-testid="ruta">{useLocation().pathname}</output>;
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/pacientes/42"]}>
      <PatientPage patientId={42} onResume={() => {}} onPlanCase={() => {}} />
      <Sonda />
    </MemoryRouter>,
  );

/** La fila de la lista del paciente 42: trae quién lo creó y cuántos casos tiene. */
const fila = (o: Partial<PatientSummary> = {}): PatientSummary => ({
  id: 42, full_name: "Zenodo, Caso 002", hospital_id: "HC-42", dob: "", sex: "F", institution: "",
  study_count: 3, created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0,
  is_shared_with_me: false, last_session_at: null, last_session_step: null, last_session_id: null,
  last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null, ...o,
});

beforeEach(() => {
  getPatient.mockReset();
  listPatients.mockReset().mockResolvedValue([fila()]);
  deletePatient.mockReset();
  user.id = 1;
  user.role = "medico";
});

describe("PatientPage", () => {
  it("la miga dice «Pacientes» y el nombre del paciente", async () => {
    getPatient.mockResolvedValue({ id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" });
    renderPage();
    expect(await within(miga()).findByText("Zenodo, Caso 002")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pacientes" })).toBeTruthy();
    expect(getPatient).toHaveBeenCalledWith(42);
  });

  it("pulsar la miga «Pacientes» vuelve a /app/pacientes", async () => {
    getPatient.mockResolvedValue({ id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" });
    renderPage();
    await within(miga()).findByText("Zenodo, Caso 002");
    fireEvent.click(screen.getByRole("button", { name: "Pacientes" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes");
  });

  it("con un 403 avisa «Paciente no autorizado» y ofrece «Volver a Pacientes»", async () => {
    getPatient.mockRejectedValueOnce(new ApiError(403, "No autorizado sobre este paciente."));
    renderPage();
    expect(await screen.findByText("Paciente no autorizado")).toBeTruthy();
    expect(screen.getByText("No autorizado sobre este paciente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver a Pacientes" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes");
    expect(getPatient).toHaveBeenCalledTimes(1);
  });

  it("con otro fallo dice el motivo y «Reintentar» lo vuelve a pedir", async () => {
    getPatient.mockRejectedValueOnce(new ApiError(500, "La base de datos está bloqueada"));
    renderPage();
    expect(await screen.findByText("La base de datos está bloqueada")).toBeTruthy();
    expect(screen.queryByText("Paciente no autorizado")).toBeNull();

    getPatient.mockResolvedValueOnce({ id: 42, surname: "Zenodo", given_name: "", hospital_id: "HC-42", sex: "F" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await within(miga()).findByText("Zenodo")).toBeTruthy();
    expect(getPatient).toHaveBeenCalledTimes(2);
  });

  it("con un 403 no hay columna Datos ni sus acciones", async () => {
    getPatient.mockRejectedValueOnce(new ApiError(403, "No autorizado sobre este paciente."));
    renderPage();
    await screen.findByText("Paciente no autorizado");
    expect(screen.queryByRole("button", { name: /Editar datos|Ver datos|Nuevo caso|Compartir con|Eliminar paciente/ })).toBeNull();
  });
});

describe("PatientPage · columna Datos", () => {
  const PACIENTE = { id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" };

  it("un paciente propio abre su ficha con la columna «Paciente» primera de la cascada", async () => {
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    const columna = await screen.findByRole("region", { name: "Paciente" });
    expect(within(columna).getByRole("heading", { name: "Zenodo, Caso 002" })).toBeTruthy();
    expect(within(columna).getByRole("button", { name: "Editar datos" })).toBeTruthy();
    expect(within(columna).getByRole("button", { name: "Casos · 3" }).getAttribute("aria-pressed")).toBe("true");
    expect(await within(columna).findByRole("button", { name: "Eliminar paciente" })).toBeTruthy();
  });

  it("«Editar datos» abre la hoja del formulario con sus datos", async () => {
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Editar datos" }));
    const hoja = await screen.findByRole("dialog", { name: "Zenodo, Caso 002" });
    expect((within(hoja).getByLabelText("Apellidos") as HTMLInputElement).value).toBe("Zenodo");
    expect(within(hoja).getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
  });

  it("una cuenta compartida no ve «Editar datos» ni «Eliminar paciente»; «Ver datos» abre la hoja de solo lectura", async () => {
    user.id = 3;
    listPatients.mockResolvedValue([fila({ owner_id: 1, is_shared_with_me: true })]);
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ver datos" }));
    expect(screen.queryByRole("button", { name: "Editar datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
    const hoja = await screen.findByRole("dialog", { name: "Zenodo, Caso 002" });
    expect((within(hoja).getByLabelText("Apellidos") as HTMLInputElement).readOnly).toBe(true);
    expect(within(hoja).queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });

  it("«Nuevo caso» abre el formulario del caso para este paciente", async () => {
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo caso" }));
    expect(screen.getByText("formulario del caso de Zenodo, Caso 002")).toBeTruthy();
  });

  it("eliminar el paciente vuelve a la lista", async () => {
    getPatient.mockResolvedValue(PACIENTE);
    deletePatient.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar paciente" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Eliminar paciente" })).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deletePatient).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes"));
  });
});
