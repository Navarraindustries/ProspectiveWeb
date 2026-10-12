/* La ficha de un paciente ajeno (F1-33, F1-34, F1-257, F1-258).

   Un Médico que abría `?paciente=<id de otro>` recibía el 403 del servidor,
   pero la ficha seguía dibujando el formulario vacío con «Guardar cambios»,
   «Nuevo caso», «Pedidos» y «Reanudar en …». Ahora solo queda el aviso. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const listPatients = vi.fn();
const getPatient = vi.fn();
const patientSessions = vi.fn();
const patientStudies = vi.fn();
const deletePatient = vi.fn();
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
      deletePatient: (id: number) => deletePatient(id),
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
import { fechaHora } from "../lib/fecha";

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
  deletePatient.mockReset().mockResolvedValue(undefined);
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
    expect(screen.queryByText(/Casos \(/)).toBeNull();
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

/* F1-252, F1-253: un Médico veía «Pacientes registrados · en la base de
   datos» y, con la lista vacía, «No hay pacientes registrados»; con cero
   pacientes propios parecía que la base de datos estaba vacía o perdida. */
describe("usuario no administrador (F1-252, F1-253)", () => {
  it("el contador dice «Tus pacientes · creados por ti»", async () => {
    renderAt("/app/pacientes");
    expect(await screen.findByText("Tus pacientes")).toBeTruthy();
    expect(screen.getByText("creados por ti")).toBeTruthy();
    expect(screen.queryByText("Pacientes registrados")).toBeNull();
    expect(screen.queryByText("en la base de datos")).toBeNull();
  });

  it("la lista vacía dice que solo ve los pacientes que ha creado", async () => {
    renderAt("/app/pacientes");
    expect(await screen.findByText("Solo ves los pacientes que has creado tú. Crea el primero para comenzar.")).toBeTruthy();
    expect(screen.queryByText("No hay pacientes registrados. Crea el primero para comenzar.")).toBeNull();
  });

  it("el administrador conserva «Pacientes registrados» y el vacío de siempre", async () => {
    user.role = "admin";
    renderAt("/app/pacientes");
    expect(await screen.findByText("No hay pacientes registrados. Crea el primero para comenzar.")).toBeTruthy();
    expect(screen.getByText("Pacientes registrados")).toBeTruthy();
    expect(screen.getByText("en la base de datos")).toBeTruthy();
    expect(screen.queryByText("Tus pacientes")).toBeNull();
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

/* F1-58: el diálogo de borrar un paciente no decía cuánto se llevaba, e Intro
   lo confirmaba. */
describe("borrar un paciente", () => {
  const maria = {
    id: 7, full_name: "Restrepo, María", hospital_id: "HC-7", sex: "F", dob: "",
    institution: "", study_count: 2, created_at: "2026-10-01T00:00:00Z",
  };

  it("el diálogo dice cuántos casos y sesiones se borran, e Intro no borra", async () => {
    listPatients.mockResolvedValue([maria]);
    patientSessions.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ session_id: `s${i}` })));
    renderAt("/app/pacientes");
    fireEvent.click(await screen.findByTitle("Eliminar"));
    const dialogo = screen.getByRole("alertdialog", { name: "Eliminar paciente" });
    expect(await screen.findByText(/6 sesiones/)).toBeTruthy();
    expect(dialogo.textContent).toContain("2 casos");
    expect(patientSessions).toHaveBeenCalledWith(7);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(deletePatient).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deletePatient).toHaveBeenCalledWith(7));
  });
});

/* F1-60, F1-71: «Cancelar», el ✕, Escape y el clic fuera cerraban la ficha y
   tiraban lo escrito sin preguntar. */
describe("descartar los cambios de la ficha", () => {
  const abrir = async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F", notes: "" });
    patientSessions.mockResolvedValue([]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes?paciente=2");
    await screen.findByText("Guardar cambios");
  };

  it("«Cancelar» con «Notas» editado pregunta y no cierra hasta confirmar", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Cefalea en trueno" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeTruthy();
    expect(screen.getByLabelText("Notas")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Notas") as HTMLInputElement).value).toBe("Cefalea en trueno");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    await waitFor(() => expect(screen.queryByLabelText("Notas")).toBeNull());
  });

  it("Escape con cambios también pregunta, y Escape otra vez cierra solo la pregunta", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "x" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Notas")).toBeTruthy();
  });

  it("«Cancelar» sin cambios cierra sin preguntar", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(screen.queryByLabelText("Notas")).toBeNull());
  });
});

describe("las sesiones guardadas (F1-243)", () => {
  it("la hora de la sesión sale en hora local, no la del servidor sin convertir", async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    patientStudies.mockResolvedValue([]);
    patientSessions.mockResolvedValue([{
      session_id: "s1", label: "", updated_at: "2026-10-11T05:05:09", current_step: "dicom",
      rupture_risk_label: null, max_diameter_mm: null,
    }]);
    renderAt("/app/pacientes?paciente=2");
    // 05:05 UTC son las 00:05 en UTC−5; la expectativa con zona fija está en fecha.test.ts.
    expect(await screen.findByText((t) => t.includes(fechaHora("2026-10-11T05:05:09")))).toBeTruthy();
  });
});

/* F1-53, F1-54, F1-55, F1-242, F1-64, F1-65, F1-66, F1-67, F1-89: la pantalla
   contaba «estudios» donde el glosario dice «caso», y llamaba «Solicitudes» a
   lo que son cuentas pendientes de aprobar. */
describe("el glosario en «Pacientes» (familia V, W, X)", () => {
  const maria = {
    id: 7, full_name: "Restrepo, María", hospital_id: "HC-7", sex: "F", dob: "",
    institution: "", study_count: 2, created_at: "2026-10-01T00:00:00Z",
  };

  it("los contadores y la columna cuentan casos, sin subtítulo de «carga»", async () => {
    listPatients.mockResolvedValue([maria]);
    renderAt("/app/pacientes");
    await screen.findByText("Restrepo, María");
    expect(screen.getByText("Casos clínicos")).toBeTruthy();
    expect(screen.getByText("Con caso")).toBeTruthy();
    expect(screen.getByText("Sin caso")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Casos" })).toBeTruthy();
    expect(screen.queryByText(/Estudios DICOM|Con estudios|Sin estudios|pendientes de carga|vinculados a pacientes|listos para planificar/)).toBeNull();
  });

  it("el administrador ve el acceso como «Cuentas pendientes», no «Solicitudes»", async () => {
    user.role = "admin";
    renderAt("/app/pacientes");
    expect(await screen.findByRole("button", { name: /Cuentas pendientes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Solicitudes/ })).toBeNull();
  });

  it("la ficha dice «Casos (0)», «Nuevo caso», el vacío nuevo y «Sesiones guardadas (n)»", async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    patientSessions.mockResolvedValue([{ session_id: "a" }, { session_id: "b" }]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes?paciente=2");
    expect(await screen.findByText("Casos (0)")).toBeTruthy();
    // Uno es el botón de la lista de detrás y otro el de la ficha.
    expect(screen.getAllByRole("button", { name: /Nuevo caso/ })).toHaveLength(2);
    expect(screen.getByText("Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.")).toBeTruthy();
    expect(await screen.findByText("Sesiones guardadas (2)")).toBeTruthy();
    expect(screen.queryByText(/Casos \/ estudios|Nuevo estudio|Sesiones de estudio/)).toBeNull();
  });
});
