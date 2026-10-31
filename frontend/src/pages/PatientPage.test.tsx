/* La ficha con URL propia (/app/pacientes/:id): carga el paciente, dice dónde
   está con la miga «Pacientes › nombre» y, si el servidor la niega o falla,
   avisa con una salida a la lista. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const getPatient = vi.fn();

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  }
  return { ApiError, api: { getPatient: (id: number) => getPatient(id) } };
});
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

const Sonda = () => <output data-testid="ruta">{useLocation().pathname}</output>;
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/pacientes/42"]}>
      <PatientPage patientId={42} onResume={() => {}} onPlanCase={() => {}} />
      <Sonda />
    </MemoryRouter>,
  );

beforeEach(() => getPatient.mockReset());

describe("PatientPage", () => {
  it("la miga dice «Pacientes» y el nombre del paciente", async () => {
    getPatient.mockResolvedValue({ id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" });
    renderPage();
    expect(await screen.findByText("Zenodo, Caso 002")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pacientes" })).toBeTruthy();
    expect(getPatient).toHaveBeenCalledWith(42);
  });

  it("pulsar la miga «Pacientes» vuelve a /app/pacientes", async () => {
    getPatient.mockResolvedValue({ id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" });
    renderPage();
    await screen.findByText("Zenodo, Caso 002");
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
    expect(await screen.findByText("Zenodo")).toBeTruthy();
    expect(getPatient).toHaveBeenCalledTimes(2);
  });
});
