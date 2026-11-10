/* La lista de pacientes. La ficha tiene URL propia (/app/pacientes/:id): aquí
   solo se prueba que la tarjeta y el enlace antiguo ?paciente= llevan a ella;
   la ficha en sí se prueba en PatientPage.test.tsx. */

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { simularPantalla } from "../test/pantalla";

const listPatients = vi.fn();
const getPatient = vi.fn();
const patientSessions = vi.fn();
const patientStudies = vi.fn();
const deletePatient = vi.fn();
const createPatient = vi.fn();
const listClipOrders = vi.fn();
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
      listClipOrders: (opts: unknown) => listClipOrders(opts),
    },
  };
});
// El shell (barra lateral y superior) se sustituye por su cabecera (subtítulo,
// estado y acciones) y su contenido: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", async () => ({ AppShell: (await import("../test/shellMock")).ShellMock }));
vi.mock("../components/CaptureGallery", () => ({ CaptureGallery: () => null }));
// «Nuevo caso» se sustituye por botones que eligen el paciente y crean el caso:
// aquí se prueba lo que la lista hace antes y después, no el formulario.
vi.mock("./NuevoCaso", () => ({
  CasePatientPicker: (p: {
    open: boolean; patients: { full_name: string }[]; onPick: (x: unknown) => void;
    loading?: boolean; error?: string | null; onRetry?: () => void;
  }) =>
    !p.open ? null : p.error ? (
      <div>
        <span>selector con error: {p.error}</span>
        <button onClick={p.onRetry}>reintentar en el selector</button>
      </div>
    ) : p.loading ? <span>selector cargando</span>
      : <button onClick={() => p.onPick(p.patients[0])}>elegir el primero</button>,
  NuevoEstudioSheet: (p: {
    open: boolean; patientName?: string; onCreated: (s?: unknown) => void; onClose: () => void;
    onCambiarPaciente?: () => void;
  }) =>
    p.open ? (
      <div>
        <span>formulario del caso de {p.patientName}</span>
        {p.onCambiarPaciente && <button onClick={p.onCambiarPaciente}>cambiar paciente</button>}
        <button onClick={() => { p.onCreated({ id: 41, patient_id: 7, dx_principal: "Aneurisma ACoA" }); p.onClose(); }}>
          guardar el caso
        </button>
      </div>
    ) : null,
}));
vi.mock("./Studies", () => ({ StudyGallery: () => null }));
const go = vi.fn();
vi.mock("../store/nav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../store/nav")>()),
  useNav: () => ({ go }),
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ApiError } from "../api/client";
import { Patients } from "./Patients";
import type { PatientSummary } from "../api/types";

const noop = () => {};
const onResume = vi.fn();
const onPlanCase = vi.fn();
const RutaActual = () => <output data-testid="ruta">{useLocation().pathname}</output>;
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Patients onResume={onResume} onPlanCase={onPlanCase}
                onStartWithoutPatient={noop} />
      <RutaActual />
    </MemoryRouter>,
  );

/** Una fila de la lista con todos los campos; cada prueba cambia los suyos. */
const fila = (o: Partial<PatientSummary> & { id: number; full_name: string }): PatientSummary => ({
  hospital_id: `HC-${o.id}`, sex: "F", dob: "", institution: "", study_count: 0,
  created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0, is_shared_with_me: false,
  last_session_at: null, last_session_step: null, last_session_id: null, last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null,
  ...o,
});

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  listPatients.mockReset().mockResolvedValue([]);
  getPatient.mockReset();
  patientSessions.mockReset();
  patientStudies.mockReset();
  deletePatient.mockReset().mockResolvedValue(undefined);
  createPatient.mockReset();
  listClipOrders.mockReset().mockResolvedValue([]);
  go.mockReset();
  onResume.mockReset();
  onPlanCase.mockReset();
  user.id = 1;
  user.role = "medico";
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

  it("el administrador ve el vacío de siempre y «en la base de datos»", async () => {
    user.role = "admin";
    renderAt("/app/pacientes");
    expect(await screen.findByText("No hay pacientes registrados. Crea el primero para comenzar.")).toBeTruthy();
    expect(screen.getByRole("banner").textContent).toContain("Ningún paciente · en la base de datos");
    expect(screen.queryByText(/tuyos o compartidos contigo/)).toBeNull();
  });

  it("al Médico el subtítulo le dice que ve los suyos y los compartidos", async () => {
    listPatients.mockResolvedValue(Array.from({ length: 7 }, (_, i) => fila({ id: i + 1, full_name: `P${i}, X` })));
    renderAt("/app/pacientes");
    await screen.findByText("P0, X");
    expect(screen.getByRole("banner").textContent).toContain("7 pacientes · tuyos o compartidos contigo");
    expect(screen.queryByText(/en la base de datos/)).toBeNull();
  });

  it("el título es la miga de la barra: la página no repite «Pacientes» como encabezado", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Uno");
    expect(screen.queryByRole("heading", { name: "Pacientes" })).toBeNull();
  });
});

describe("con el API fallando (F1-2, F1-29)", () => {
  it("la lista muestra el error y no «0 registros» ni el vacío; «Reintentar» vuelve a llamar", async () => {
    listPatients.mockRejectedValueOnce(new ApiError(0, "Sin conexión con el servidor"));
    renderAt("/app/pacientes");

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/No hay pacientes registrados/)).toBeNull();
    expect(screen.queryByText(/0 registros/)).toBeNull();
    // «Hoy» tampoco puede decir 0 pacientes: con el servidor caído parecería una pérdida.
    const hoy = screen.getByRole("region", { name: "Hoy" });
    expect(within(hoy).getByText("Pacientes").parentElement!.textContent).toContain("—");
    // Cada cifra del resumen, no el texto pegado («En curso0» no tiene frontera de palabra).
    const cifras = within(hoy).getAllByRole("definition").map((d) => d.textContent);
    expect(cifras.length).toBeGreaterThan(0);
    expect(cifras).not.toContain("0");
    expect(cifras.every((c) => c === "—")).toBe(true);

    listPatients.mockResolvedValueOnce([fila({ id: 7, full_name: "Restrepo, María" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Restrepo, María")).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Sin conexión con el servidor")).toBeNull();
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
    expect(await screen.findByText(/^Ningún paciente · /)).toBeTruthy();
    r1.unmount();

    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Uno" })]);
    const r2 = renderAt("/app/pacientes");
    expect(await screen.findByText(/^1 paciente · /)).toBeTruthy();
    r2.unmount();

    listPatients.mockResolvedValue(Array.from({ length: 7 }, (_, i) => fila({ id: i + 1, full_name: `P${i}` })));
    renderAt("/app/pacientes");
    expect(await screen.findByText(/^7 pacientes · /)).toBeTruthy();
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

    // La ficha tiene URL propia: la tarjeta navega a ella, no abre una hoja.
    const tarjeta = screen.getByRole("article", { name: /Propio/ });
    fireEvent.click(tarjeta);
    expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes/2");
    expect(screen.queryByText("Guardar cambios")).toBeNull();
  });

  // F1-58: borrar un paciente se hace al pie de su ficha (columna Datos), no desde la tarjeta.
  it("la tarjeta no tiene ✕ ni «Eliminar»", async () => {
    listPatients.mockResolvedValue([fila({ id: 7, full_name: "Restrepo, María", study_count: 2 })]);
    renderAt("/app/pacientes");
    await screen.findByText("Restrepo, María");
    expect(screen.queryByTitle("Eliminar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).toBeNull();
  });

  it("Intro en la tarjeta también navega a la ficha /app/pacientes/<id>", async () => {
    listPatients.mockResolvedValue([fila({ id: 2, full_name: "Propio" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Propio");
    fireEvent.keyDown(screen.getByRole("article", { name: /Propio/ }), { key: "Enter" });
    expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes/2");
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
    expect(within(screen.getByRole("tablist", { name: "Qué pacientes ver" })).getAllByRole("tab")).toHaveLength(3);
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
    expect(screen.getByRole("button", { name: /Prueba rápida sin paciente/ }).getAttribute("title"))
      .toBe("Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.");
  });

  it("las acciones de arriba: «Nuevo paciente», «Nuevo caso» y, la última, «Prueba rápida sin paciente»", async () => {
    renderAt("/app/pacientes");
    await screen.findByText(/^Ningún paciente · /);
    const header = screen.getByRole("banner");
    const nombres = within(header).getAllByRole("button").map((b) => b.textContent);
    expect(nombres).toEqual(["Nuevo paciente", "Nuevo caso", "Prueba rápida sin paciente"]);
    // Peso: el primario es «Nuevo paciente»; «Nuevo caso» y la prueba rápida, contorno.
    const botones = within(header).getAllByRole("button");
    expect(botones.map((b) => b.getAttribute("data-variant"))).toEqual(["default", "outline", "outline"]);
    expect(within(header).queryByText("Empezar sin paciente")).toBeNull();
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
    await screen.findByText(/^Ningún paciente · /);
    listPatients.mockResolvedValue([nuevo]);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo paciente/ })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Apellidos" }), { target: { value: "Restrepo" } });
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

  it("«Nuevo caso»: desde el formulario se vuelve al selector para cambiar de paciente", async () => {
    listPatients.mockResolvedValue([fila({ id: 7, full_name: "Restrepo, María" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Restrepo, María");
    fireEvent.click(screen.getByRole("button", { name: /Nuevo caso/ }));
    fireEvent.click(screen.getByRole("button", { name: "elegir el primero" }));
    expect(screen.getByText("formulario del caso de Restrepo, María")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "cambiar paciente" }));
    expect(screen.queryByText(/formulario del caso/)).toBeNull();
    expect(screen.getByRole("button", { name: "elegir el primero" })).toBeTruthy();
  });

  it("el caso ofrecido tras crear un paciente no ofrece cambiarlo: no vino del selector", async () => {
    createPatient.mockResolvedValue(fila({ id: 9, full_name: "Restrepo, María" }));
    renderAt("/app/pacientes?nuevo=paciente");
    fireEvent.change(await screen.findByRole("textbox", { name: "Apellidos" }), { target: { value: "Restrepo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear paciente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Crear un caso para Restrepo, María" }));
    expect(screen.getByText("formulario del caso de Restrepo, María")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "cambiar paciente" })).toBeNull();
  });

  it("si la lista falló, el selector de «Nuevo caso» recibe el error y su «Reintentar» la vuelve a pedir", async () => {
    listPatients.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAt("/app/pacientes?nuevo=caso");
    expect(await screen.findByText("selector con error: Sin conexión con el servidor")).toBeTruthy();
    listPatients.mockResolvedValue([fila({ id: 7, full_name: "Restrepo, María" })]);
    fireEvent.click(screen.getByRole("button", { name: "reintentar en el selector" }));
    expect(await screen.findByRole("button", { name: "elegir el primero" })).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(2);
  });
});

/* Los avisos clínicos de la oficina (rediseño, fase 2) encima de las tarjetas:
   casos parados antes del informe y pedidos de clip parados. */
describe("avisos clínicos sobre el panel de tarjetas", () => {
  it("muestra los avisos clínicos y oculta el de pedidos si fallan", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Segura, Prueba", last_session_at: "2026-10-10T10:00:00", last_session_step: 2 })]);
    listClipOrders.mockRejectedValue(new ApiError(403, "no"));
    renderAt("/app/pacientes");
    expect(await screen.findByText(/1 caso parado antes del informe/)).toBeTruthy();
    expect(screen.queryByText(/pedidos? de clip parados?/)).toBeNull();
    expect(listClipOrders).toHaveBeenCalledWith({ openOnly: true });
  });

  it("muestra el aviso de pedidos parados y «Ver» lleva a los pedidos", async () => {
    listClipOrders.mockResolvedValue([
      { part_no: "PR-2026-0002", status: "enviado", updated_at: Date.now() / 1000 - 60 * 86400 },
    ]);
    renderAt("/app/pacientes");
    expect(await screen.findByText("1 pedido de clip parado")).toBeTruthy();
    expect(screen.getByText("PR-2026-0002")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(go).toHaveBeenCalledWith("orders");
  });
});

/* Oficina L1: los avisos son una franja de chips y la paleta ⌘K llega por la URL. */
describe("avisos en franja y parámetros de URL", () => {
  const Sonda = () => {
    const l = useLocation();
    return <><output data-testid="busqueda">{l.search}</output><output data-testid="ruta">{l.pathname}</output></>;
  };
  const renderConSonda = (url: string) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Patients onResume={onResume} onPlanCase={onPlanCase}
                  onStartWithoutPatient={noop} />
        <Sonda />
      </MemoryRouter>,
    );

  it("los avisos son pastillas data-aviso dentro de una lista «Avisos clínicos»", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Segura, Prueba", last_session_at: "2026-10-10T10:00:00", last_session_step: 2 })]);
    renderAt("/app/pacientes");
    await screen.findByText(/1 caso parado antes del informe/);
    const lista = screen.getByRole("list", { name: "Avisos clínicos" });
    const chips = lista.querySelectorAll("[data-aviso]");
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((c) => expect(c.getAttribute("role")).toBe("listitem"));
  });

  it("?nuevo=paciente abre la hoja de nuevo paciente una vez y borra el parámetro", async () => {
    renderConSonda("/app/pacientes?nuevo=paciente");
    expect(await screen.findByRole("textbox", { name: "Apellidos" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("busqueda").textContent).toBe(""));
  });

  it("?nuevo=caso abre el selector de caso y borra el parámetro", async () => {
    listPatients.mockResolvedValue([fila({ id: 7, full_name: "Restrepo, María" })]);
    renderConSonda("/app/pacientes?nuevo=caso");
    expect(await screen.findByRole("button", { name: "elegir el primero" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("busqueda").textContent).toBe(""));
  });

  it("?paciente=7 redirige (replace) a la ficha con URL propia /app/pacientes/7", async () => {
    renderConSonda("/app/pacientes?paciente=7");
    await waitFor(() => expect(screen.getByTestId("ruta").textContent).toBe("/app/pacientes/7"));
    expect(screen.getByTestId("busqueda").textContent).toBe("");
    expect(screen.queryByText("Guardar cambios")).toBeNull();
  });
});

describe("Pacientes: gestión (A23-A29)", () => {
  it("el aviso de creación es de cristal y los avisos llevan title completo", async () => {
    const nuevo = fila({ id: 7, full_name: "Restrepo, María" });
    createPatient.mockResolvedValue(nuevo);
    const parados = [1, 2, 3, 4].map((i) => fila({ id: 20 + i, full_name: `P${i}`, last_session_at: "2026-10-10T10:00:00", last_session_step: 2 }));
    listPatients.mockResolvedValue(parados);
    renderAt("/app/pacientes");
    await screen.findByText(/4 casos parados/);
    const detalle = document.querySelector(".pt-aviso-detalle")!;
    expect(detalle.textContent).toBe("P1 · P2 +2");
    expect(detalle.getAttribute("title")).toBe("P1 · P2 · P3 · P4");
    listPatients.mockResolvedValue([nuevo]);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo paciente/ })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Apellidos" }), { target: { value: "Restrepo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear paciente" }));
    const estado = (await screen.findByText("Paciente creado: Restrepo, María.")).closest("[role=status]") as HTMLElement;
    expect(estado).toHaveAttribute("data-glass");
    expect(within(estado).getByRole("button", { name: "Cerrar aviso" })).toHaveAttribute("data-size", "icon");
  });

  it("las pestañas son de Tabs", async () => {
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "De otro", is_shared_with_me: true, owner_id: 9 })]);
    renderAt("/app/pacientes");
    await screen.findByText("De otro");
    expect(screen.getByRole("tab", { name: "Míos" })).toBeTruthy();
    expect(document.querySelector(".pt-tab")).toBeNull();
  });

  it("a ≤ 1280 el panel va debajo y compacto", async () => {
    simularPantalla(1280);
    listPatients.mockResolvedValue([fila({ id: 1, full_name: "Solo mío" })]);
    renderAt("/app/pacientes");
    await screen.findByText("Solo mío");
    expect(document.querySelector(".pt-side-stats--fila")).not.toBeNull();
  });
});
