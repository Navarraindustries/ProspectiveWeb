/* La ficha de un paciente ajeno (F1-33, F1-34, F1-257, F1-258).

   Un Médico que abría `?paciente=<id de otro>` recibía el 403 del servidor,
   pero la ficha seguía dibujando el formulario vacío con «Guardar cambios»,
   «Nuevo caso», «Pedidos» y «Reanudar en …». Ahora solo queda el aviso. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const listPatients = vi.fn();
const getPatient = vi.fn();
const patientSessions = vi.fn();
const patientStudies = vi.fn();
const deletePatient = vi.fn();
const createPatient = vi.fn();
const user = { id: 1, role: "medico" as string };

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
      patientsActivity: () => Promise.resolve([]),
      listUsers: () => Promise.resolve([]),
      getPatient: (id: number) => getPatient(id),
      patientSessions: (id: number) => patientSessions(id),
      patientStudies: (id: number) => patientStudies(id),
      patientShares: () => Promise.resolve([]),
      deletePatient: (id: number) => deletePatient(id),
      createPatient: (body: unknown) => createPatient(body),
    },
  };
});
// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../components/CaptureGallery", () => ({ CaptureGallery: () => null }));
// «Nuevo caso» se sustituye por botones que eligen el paciente y crean el caso:
// aquí se prueba lo que la lista hace antes y después, no el formulario.
vi.mock("./NuevoCaso", () => ({
  CasePatientPicker: (p: { open: boolean; patients: { full_name: string }[]; onPick: (x: unknown) => void }) =>
    p.open ? <button onClick={() => p.onPick(p.patients[0])}>elegir el primero</button> : null,
  NuevoEstudioSheet: (p: { open: boolean; patientName?: string; onCreated: (s?: unknown) => void; onClose: () => void }) =>
    p.open ? (
      <div>
        <span>formulario del caso de {p.patientName}</span>
        <button onClick={() => { p.onCreated({ id: 41, patient_id: 7, dx_principal: "Aneurisma ACoA" }); p.onClose(); }}>
          guardar el caso
        </button>
      </div>
    ) : null,
}));
vi.mock("./Studies", () => ({ StudyGallery: () => null }));
vi.mock("../store/nav", () => ({ useNav: () => ({ go: vi.fn() }) }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ApiError } from "../api/client";
import { Patients } from "./Patients";
import { fechaHora } from "../lib/fecha";
import type { PatientSummary } from "../api/types";

const noop = () => {};
const onResume = vi.fn();
const onPlanCase = vi.fn();
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Patients onResume={onResume} onPlanCase={onPlanCase} onOpenStudy={noop} onOpenOrders={noop}
                onStartWithoutPatient={noop} />
    </MemoryRouter>,
  );

/** Una fila de la lista con todos los campos; cada prueba cambia los suyos. */
const fila = (o: Partial<PatientSummary> & { id: number; full_name: string }): PatientSummary => ({
  hospital_id: `HC-${o.id}`, sex: "F", dob: "", institution: "", study_count: 0,
  created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
  last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null,
  ...o,
});

beforeEach(() => {
  listPatients.mockReset().mockResolvedValue([]);
  getPatient.mockReset();
  patientSessions.mockReset();
  patientStudies.mockReset();
  deletePatient.mockReset().mockResolvedValue(undefined);
  createPatient.mockReset();
  onResume.mockReset();
  onPlanCase.mockReset();
  user.id = 1;
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
    // «Pedidos de clips» sigue siendo un acceso del panel lateral: se mira solo la ficha.
    expect(within(screen.getByRole("dialog")).queryByText(/Pedidos/)).toBeNull();
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

/* F1-252, F1-253: un Médico veía «Pacientes registrados · en la base de
   datos» y, con la lista vacía, «No hay pacientes registrados»; con cero
   pacientes propios parecía que la base de datos estaba vacía o perdida. */
describe("vacío por rol (F1-252, F1-253)", () => {
  it("la lista vacía dice que solo ve los suyos y los compartidos", async () => {
    renderAt("/app/pacientes");
    expect(await screen.findByText("Solo ves tus pacientes y los que te han compartido. Crea el primero para comenzar.")).toBeTruthy();
    expect(screen.queryByText("No hay pacientes registrados. Crea el primero para comenzar.")).toBeNull();
  });

  it("el administrador ve el vacío de siempre", async () => {
    user.role = "admin";
    renderAt("/app/pacientes");
    expect(await screen.findByText("No hay pacientes registrados. Crea el primero para comenzar.")).toBeTruthy();
  });
});

describe("con el API fallando (F1-2, F1-29)", () => {
  it("la lista muestra el error y no «0 registros» ni el vacío; «Reintentar» vuelve a llamar", async () => {
    listPatients.mockRejectedValueOnce(new ApiError(0, "Sin conexión con el servidor"));
    renderAt("/app/pacientes");

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/No hay pacientes registrados/)).toBeNull();
    expect(screen.queryByText(/0 registros/)).toBeNull();

    listPatients.mockResolvedValueOnce([fila({ id: 7, full_name: "Restrepo, María" })]);
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
   lo confirmaba. Desde F2 (Tarea 11) se elimina desde el pie de la ficha: la
   fila se queda con «Reanudar» y «Abrir ficha». */
describe("borrar un paciente", () => {
  const maria = fila({ id: 7, full_name: "Restrepo, María", study_count: 2 });

  it("la tarjeta ya no tiene ✕; el pie de la ficha dice cuántos casos y sesiones se borran, e Intro no borra", async () => {
    listPatients.mockResolvedValue([maria]);
    getPatient.mockResolvedValue({ id: 7, surname: "Restrepo", given_name: "María", hospital_id: "HC-7", sex: "F" });
    patientStudies.mockResolvedValue([]);
    patientSessions.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ session_id: `s${i}`, label: "", current_step: 0, updated_at: "2026-10-01T00:00:00", size_bytes: 0 })));
    renderAt("/app/pacientes");
    await screen.findByText("Restrepo, María");
    expect(screen.queryByTitle("Eliminar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Eliminar a/ })).toBeNull();

    fireEvent.click(screen.getByRole("article", { name: /Restrepo, María/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar paciente" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Eliminar paciente" });
    await waitFor(() => expect(dialogo.textContent).toContain("6 sesiones"));
    expect(dialogo.textContent).toContain("2 casos");
    expect(patientSessions).toHaveBeenCalledWith(7);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(deletePatient).not.toHaveBeenCalled();

    listPatients.mockResolvedValue([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deletePatient).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText("Restrepo, María")).toBeNull());
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
  it("la ficha dice «Casos (0)», «Nuevo caso», el vacío nuevo y «Sesiones guardadas (n)»", async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    patientSessions.mockResolvedValue([{ session_id: "a" }, { session_id: "b" }]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes?paciente=2");
    expect(await screen.findByText("Casos (0)")).toBeTruthy();
    // Uno es el botón de la cabecera y otro el de la ficha.
    expect(screen.getAllByRole("button", { name: /Nuevo caso/ })).toHaveLength(2);
    expect(screen.getByText("Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.")).toBeTruthy();
    expect(await screen.findByText("Sesiones guardadas (2)")).toBeTruthy();
    expect(screen.queryByText(/Casos \/ estudios|Nuevo estudio|Sesiones de estudio/)).toBeNull();
  });
});

/* F2-18, F2-19, F2-20, F2-21, F2-22, F2-23, F2-24, F1-52, F1-56, F1-57 y la
   fusión nº 8: la lista dice cuántos hay con concordancia, pone arriba al
   último con el que se trabajó, enseña edad, último caso y última sesión con
   «Reanudar», y abre la ficha con el clic en la fila o «Abrir ficha». */
describe("la lista de pacientes (F2)", () => {
  const nombresEnOrden = () =>
    within(screen.getByTestId("pacientes-rejilla")).getAllByRole("article")
      .map((r) => r.querySelector("h3")?.textContent ?? "");

  it("el recuento concuerda: «Ningún paciente», «1 paciente», «7 pacientes»", async () => {
    const r1 = renderAt("/app/pacientes");
    expect(await screen.findByText("Ningún paciente")).toBeTruthy();
    r1.unmount();

    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno" })]);
    const r2 = renderAt("/app/pacientes");
    expect(await screen.findByText("1 paciente")).toBeTruthy();
    r2.unmount();

    listPatients.mockResolvedValue(Array.from({ length: 7 }, (_, i) => fila({ id: i + 1, full_name: `P${i}` })));
    renderAt("/app/pacientes");
    expect(await screen.findByText("7 pacientes")).toBeTruthy();
    expect(screen.queryByText(/registros|ordenados por fecha de creación/)).toBeNull();
  });

  it("ordena por última actividad: la primera tarjeta es la última sesión o, si no hay, el alta", async () => {
    listPatients.mockResolvedValue([
      fila({ id: 1, full_name: "Alta reciente", created_at: "2026-10-03T00:00:00" }),
      fila({ id: 2, full_name: "Sesión de ayer", created_at: "2026-09-01T00:00:00",
             last_session_at: "2026-10-05T10:00:00", last_session_step: 2, last_session_id: "s2" }),
      fila({ id: 3, full_name: "Alta antigua", created_at: "2026-10-01T00:00:00" }),
    ]);
    renderAt("/app/pacientes");
    await screen.findByText("Alta antigua");
    expect(nombresEnOrden()).toEqual(["Sesión de ayer", "Alta reciente", "Alta antigua"]);
  });

  it("«Reanudar» de la tarjeta reanuda esa sesión sin abrir la ficha; la tarjeta e Intro abren la ficha", async () => {
    const conSesion = fila({ id: 1, full_name: "Con sesión", last_session_at: "2026-10-05T10:00:00", last_session_step: 1, last_session_id: "s1" });
    listPatients.mockResolvedValue([conSesion, fila({ id: 2, full_name: "Propio" })]);
    getPatient.mockResolvedValue({ id: 2, surname: "Propio", given_name: "", hospital_id: "HC-2", sex: "F" });
    patientSessions.mockResolvedValue([]);
    patientStudies.mockResolvedValue([]);
    renderAt("/app/pacientes");
    await screen.findByText("Propio");
    const botones = screen.getAllByRole("button", { name: "Reanudar" });
    expect(botones).toHaveLength(1);
    expect(screen.getByRole("article", { name: /Con sesión/ }).contains(botones[0])).toBe(true);
    fireEvent.click(botones[0]);
    expect(onResume).toHaveBeenCalledWith("s1", conSesion);
    expect(getPatient).not.toHaveBeenCalled();

    const tarjeta = screen.getByRole("article", { name: /Propio/ });
    fireEvent.click(tarjeta);
    expect(await screen.findByText("Guardar cambios")).toBeTruthy();
    expect(getPatient).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Guardar cambios")).toBeNull());

    fireEvent.keyDown(tarjeta, { key: "Enter" });
    expect(await screen.findByText("Guardar cambios")).toBeTruthy();
    expect(getPatient).toHaveBeenCalledTimes(2);
  });

  it("las pestañas solo aparecen con algún compartido; «Míos» y «Compartidos conmigo» filtran", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Solo mío" })]);
    const r = renderAt("/app/pacientes");
    await screen.findByText("Solo mío");
    expect(screen.queryByRole("tablist")).toBeNull();
    r.unmount();

    listPatients.mockResolvedValue([
      fila({ id: 1, full_name: "De otro", is_shared_with_me: true, owner_id: 9 }),
      fila({ id: 2, full_name: "Mío compartido", shared_with_count: 2 }),
      fila({ id: 3, full_name: "Solo mío" }),
    ]);
    renderAt("/app/pacientes");
    await screen.findByText("Solo mío");
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Todos" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Míos" }));
    expect(screen.getByRole("tab", { name: "Míos" }).getAttribute("aria-selected")).toBe("true");
    expect(nombresEnOrden().sort()).toEqual(["Mío compartido", "Solo mío"]);

    fireEvent.click(screen.getByRole("tab", { name: "Compartidos conmigo" }));
    expect(nombresEnOrden()).toEqual(["De otro"]);
  });

  it("insignias «Compartido contigo» y «Compartido con N»", async () => {
    listPatients.mockResolvedValue([
      fila({ id: 1, full_name: "De otro", is_shared_with_me: true, owner_id: 9 }),
      fila({ id: 2, full_name: "Mío compartido", shared_with_count: 2 }),
    ]);
    renderAt("/app/pacientes");
    await screen.findByText("Mío compartido");
    expect(screen.getByText("Compartido contigo")).toBeTruthy();
    expect(screen.getByText("Compartido con 2")).toBeTruthy();
  });

  it("cargando: esqueletos, no texto", async () => {
    listPatients.mockReturnValue(new Promise(() => {}));
    const { container } = renderAt("/app/pacientes");
    expect(container.querySelectorAll(".pt-card--skeleton")).toHaveLength(6);
    expect(screen.queryByText("Ningún paciente coincide con la búsqueda.")).toBeNull();
    expect(screen.queryByText(/No hay pacientes registrados/)).toBeNull();
  });

  it("el panel lateral está", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Uno");
    expect(await screen.findByText("Actividad reciente")).toBeTruthy();
    expect(screen.getByText("Accesos")).toBeTruthy();
  });

  it("las acciones de la cabecera son solo las clínicas; Usuarios y Estudios son accesos del panel lateral", async () => {
    user.role = "admin";
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Uno");
    // Fuera del panel lateral no hay «Usuarios», «Cuentas pendientes» ni «Estudios» (F2-20, F2-21).
    const panel = screen.getByRole("complementary", { name: "Resumen y accesos" });
    const fuera = (re: RegExp) =>
      screen.queryAllByText(re).filter((el) => !panel.contains(el));
    expect(fuera(/Usuarios/)).toHaveLength(0);
    expect(fuera(/Cuentas pendientes|Solicitudes/)).toHaveLength(0);
    expect(fuera(/^Estudios$/)).toHaveLength(0);
    // Y dentro, cada acceso una sola vez.
    const accesos = within(screen.getByText("Accesos").closest("section")!);
    expect(accesos.getAllByRole("button", { name: "Usuarios" })).toHaveLength(1);
    expect(accesos.getAllByRole("button", { name: "Estudios" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Usuarios" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Estudios" })).toHaveLength(1);
    // Las tres acciones clínicas de la cabecera.
    expect(screen.getAllByRole("button", { name: /Nuevo paciente/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Nuevo caso/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Empezar sin paciente/ }).getAttribute("title"))
      .toBe("Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.");
  });

  it("la búsqueda filtra por nombre y por HC sin distinguir mayúsculas", async () => {
    listPatients.mockResolvedValue([
      fila({ id: 1, full_name: "Segura, Juan", hospital_id: "HC2345" }),
      fila({ id: 2, full_name: "Restrepo, María", hospital_id: "HC9999" }),
    ]);
    renderAt("/app/pacientes");
    await screen.findByText("Segura, Juan");
    const buscar = screen.getByPlaceholderText("Buscar paciente o HC…");
    fireEvent.change(buscar, { target: { value: "segura" } });
    expect(screen.queryByText("Restrepo, María")).toBeNull();
    expect(screen.getByText("Segura, Juan")).toBeTruthy();
    fireEvent.change(buscar, { target: { value: "hc9999" } });
    expect(screen.queryByText("Segura, Juan")).toBeNull();
    expect(screen.getByText("Restrepo, María")).toBeTruthy();
    fireEvent.change(buscar, { target: { value: "basilar" } });
    expect(screen.getByText("Ningún paciente coincide con la búsqueda.")).toBeTruthy();
  });

  it("«Nuevo paciente», al guardar, ofrece «Crear un caso para {nombre}» con el paciente fijado", async () => {
    const nuevo = fila({ id: 7, full_name: "Restrepo, María" });
    createPatient.mockResolvedValue(nuevo);
    renderAt("/app/pacientes");
    await screen.findByText("Ningún paciente");
    listPatients.mockResolvedValue([nuevo]);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo paciente/ })[0]);
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Restrepo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear paciente" }));
    const ofrece = await screen.findByRole("button", { name: "Crear un caso para Restrepo, María" });
    fireEvent.click(ofrece);
    expect(screen.getByText("formulario del caso de Restrepo, María")).toBeTruthy();
  });

  it("«Nuevo caso», al guardar, ofrece «Planificar este caso»", async () => {
    const maria = fila({ id: 7, full_name: "Restrepo, María" });
    listPatients.mockResolvedValue([maria]);
    renderAt("/app/pacientes");
    await screen.findByText("Restrepo, María");
    fireEvent.click(screen.getByRole("button", { name: /Nuevo caso/ }));
    fireEvent.click(screen.getByRole("button", { name: "elegir el primero" }));
    fireEvent.click(screen.getByRole("button", { name: "guardar el caso" }));
    fireEvent.click(await screen.findByRole("button", { name: "Planificar este caso" }));
    expect(onPlanCase).toHaveBeenCalledWith(expect.objectContaining({ id: 41 }), maria);
  });
});
