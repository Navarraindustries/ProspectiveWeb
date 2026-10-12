/* La ficha de un paciente ajeno (F1-33, F1-34, F1-257, F1-258).

   Un Médico que abría `?paciente=<id de otro>` recibía el 403 del servidor,
   pero la ficha seguía dibujando el formulario vacío con «Guardar cambios»,
   «Nuevo estudio», «Pedidos» y «Reanudar en …». Ahora solo queda el aviso. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
