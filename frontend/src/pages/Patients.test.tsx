/* La ficha de un paciente ajeno (F1-33, F1-34, F1-257, F1-258).

   Un Médico que abría `?paciente=<id de otro>` recibía el 403 del servidor,
   pero la ficha seguía dibujando el formulario vacío con «Guardar cambios»,
   «Nuevo estudio», «Pedidos» y «Reanudar en …». Ahora solo queda el aviso. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const listPatients = vi.fn();
const getPatient = vi.fn();
const patientSessions = vi.fn();
const patientStudies = vi.fn();
const user = { role: "medico" as string };

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  }
  return {
    ApiError,
    api: {
      listPatients: () => listPatients(),
      listPending: () => Promise.resolve([]),
      getPatient: (id: number) => getPatient(id),
      patientSessions: (id: number) => patientSessions(id),
      patientStudies: (id: number) => patientStudies(id),
    },
  };
});
vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../components/CaptureGallery", () => ({ CaptureGallery: () => null }));
vi.mock("./NuevoCaso", () => ({ CasePatientPicker: () => null, NuevoEstudioSheet: () => null }));
vi.mock("./Studies", () => ({ StudyGallery: () => null }));
vi.mock("../store/nav", () => ({ useNav: () => ({ go: vi.fn() }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ApiError } from "../api/client";
import { Patients } from "./Patients";

const noop = () => {};
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Patients onOpenPatient={noop} onResume={noop} onPlanCase={noop} onOpenStudy={noop}
                onOpenPending={noop} onOpenOrders={noop} />
    </MemoryRouter>,
  );

beforeEach(() => {
  listPatients.mockReset().mockResolvedValue([]);
  getPatient.mockReset();
  patientSessions.mockReset();
  patientStudies.mockReset();
  user.role = "medico";
});

describe("la ficha de un paciente ajeno", () => {
  it("muestra el motivo del servidor y no dibuja el formulario", async () => {
    const no = () => Promise.reject(new ApiError(403, "No autorizado sobre este paciente."));
    getPatient.mockImplementation(no);
    patientSessions.mockImplementation(no);
    patientStudies.mockImplementation(no);
    renderAt("/app/pacientes?paciente=1");

    expect(await screen.findByText("No autorizado sobre este paciente.")).toBeTruthy();
    expect(screen.queryByText("Guardar cambios")).toBeNull();
    expect(screen.queryByText(/Nuevo estudio/)).toBeNull();
    expect(screen.queryByText(/Pedidos/)).toBeNull();
    expect(screen.queryByText(/Reanudar en/)).toBeNull();
    expect(screen.queryByLabelText("Apellidos")).toBeNull();
  });

  it("un paciente propio sigue abriendo su ficha", async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    patientSessions.mockResolvedValue([]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes?paciente=2");

    expect(await screen.findByText("Guardar cambios")).toBeTruthy();
    expect(screen.queryByText("No autorizado sobre este paciente.")).toBeNull();
  });
});

describe("la lista de «Pacientes»", () => {
  it("le dice al Médico que ve los pacientes que creó", async () => {
    renderAt("/app/pacientes");
    expect(await screen.findByText("Ves los pacientes que creaste")).toBeTruthy();
  });

  it("el administrador no ve esa línea: los ve todos", async () => {
    user.role = "admin";
    renderAt("/app/pacientes");
    await screen.findByText(/registros/);
    expect(screen.queryByText("Ves los pacientes que creaste")).toBeNull();
  });
});

describe("con el API fallando (F1-2, F1-29)", () => {
  it("la lista muestra el error y no «0 registros» ni el vacío; «Reintentar» vuelve a llamar", async () => {
    listPatients.mockRejectedValueOnce(new ApiError(0, "Sin conexión con el servidor"));
    renderAt("/app/pacientes");

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/No hay pacientes registrados/)).toBeNull();
    expect(screen.queryByText(/0 registros/)).toBeNull();

    listPatients.mockResolvedValueOnce([{
      id: 7, full_name: "Restrepo, María", hospital_id: "HC-7", sex: "F", dob: "",
      institution: "", study_count: 0, created_at: "2026-10-01T00:00:00Z",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Restrepo, María")).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Sin conexión con el servidor")).toBeNull();
  });

  it("la ficha que no carga no dibuja el formulario en blanco; «Reintentar» vuelve a pedirla", async () => {
    getPatient.mockRejectedValueOnce(new ApiError(500, "La base de datos está bloqueada"));
    patientSessions.mockResolvedValue([]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes?paciente=2");

    expect(await screen.findByText("La base de datos está bloqueada")).toBeTruthy();
    expect(screen.queryByText("Guardar cambios")).toBeNull();
    expect(screen.queryByLabelText("Apellidos")).toBeNull();

    getPatient.mockResolvedValueOnce({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Guardar cambios")).toBeTruthy();
    expect(getPatient).toHaveBeenCalledTimes(2);
  });
});
