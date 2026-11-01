/* La ficha con URL propia (/app/pacientes/:id): carga el paciente, dice dónde
   está con la miga «Pacientes › nombre» y, si el servidor la niega o falla,
   avisa con una salida a la lista. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { simularPantalla } from "../test/pantalla";

const getPatient = vi.fn();
const listPatients = vi.fn();
const deletePatient = vi.fn();
const patientStudies = vi.fn();
const patientSessions = vi.fn();
const listStudies = vi.fn();
const deleteSavedSession = vi.fn();
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
      patientSessions: (id: number) => patientSessions(id),
      patientStudies: (id: number) => patientStudies(id),
      listStudies: (q: string, patientId?: number, caseId?: number) => listStudies(q, patientId, caseId),
      studyThumbnailObjectUrl: () => Promise.resolve("blob:miniatura"),
      deleteSavedSession: (sid: string) => deleteSavedSession(sid),
      listCaptures: () => Promise.resolve([]),
      deletePatient: (id: number) => deletePatient(id),
    },
  };
});
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("./NuevoCaso", () => ({
  NuevoEstudioSheet: (p: { open: boolean; patientName?: string; onCreated: (s?: unknown) => void; onClose: () => void }) =>
    p.open ? (
      <div>
        <span>formulario del caso de {p.patientName}</span>
        <button type="button" onClick={() => { p.onCreated({ id: 77, patient_id: 42, dx_principal: "Aneurisma nuevo" }); p.onClose(); }}>
          guardar el caso
        </button>
      </div>
    ) : null,
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
import type { PatientSessionInfo, PatientSummary, StudyCard, StudySummary } from "../api/types";

const onResume = vi.fn();
const onPlanCase = vi.fn();
const onOpenStudy = vi.fn();
const miga = () => screen.getByRole("navigation", { name: "Miga de pan" });
const Sonda = () =><output data-testid="ruta">{useLocation().pathname}</output>;
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/pacientes/42"]}>
      <PatientPage patientId={42} onResume={onResume} onPlanCase={onPlanCase} onOpenStudy={onOpenStudy} />
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
  patientStudies.mockReset().mockResolvedValue([]);
  patientSessions.mockReset().mockResolvedValue([]);
  listStudies.mockReset().mockResolvedValue([]);
  deleteSavedSession.mockReset();
  for (const f of [onResume, onPlanCase, onOpenStudy]) f.mockReset();
  user.id = 1;
  user.role = "medico";
  // Pantalla grande por defecto: caben las cinco columnas de la cascada.
  simularPantalla(1920);
});
afterEach(() => { vi.unstubAllGlobals(); });

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

  it("modo de la ficha por tramo: lista en móvil, pantalla y lienzo a ≥ 1920", async () => {
    getPatient.mockResolvedValue({ id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" });
    const ctl = simularPantalla(390);
    const { container } = renderPage();
    // En móvil la ficha abre con la columna Paciente a la vista (los datos del paciente).
    await screen.findByRole("region", { name: "Paciente" });
    expect(screen.queryByRole("region", { name: "Casos" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Volver a una columna anterior" })).toBeNull();
    const cuerpo = () => container.querySelector(".page-body")!;
    expect(cuerpo()).toHaveAttribute("data-modo", "lista");
    expect(cuerpo()).not.toHaveAttribute("data-lienzo");
    act(() => ctl.cambiar({ ancho: 1280 }));
    expect(cuerpo()).toHaveAttribute("data-modo", "pantalla");
    expect(cuerpo()).not.toHaveAttribute("data-lienzo");
    act(() => ctl.cambiar({ ancho: 1920 }));
    expect(cuerpo()).toHaveAttribute("data-modo", "pantalla");
    expect(cuerpo()).toHaveAttribute("data-lienzo", "true");
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
    expect(within(hoja).getByText("Datos del paciente")).toBeTruthy();
    expect((within(hoja).getByLabelText("Apellidos *") as HTMLInputElement).value).toBe("Zenodo");
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
    expect((within(hoja).getByLabelText("Apellidos *") as HTMLInputElement).readOnly).toBe(true);
    expect(within(hoja).queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });

  /* Los derechos fallan cerrados: sin la fila de la lista no se sabe quién lo
     creó, así que nadie edita hasta comprobarlo. */
  it("si la lista falla, los datos son de solo lectura, lo dice y «Reintentar» la vuelve a pedir", async () => {
    listPatients.mockRejectedValueOnce(new Error("caído"));
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    expect(await screen.findByRole("button", { name: "Ver datos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compartir con…" })).toBeNull();
    expect(screen.getByText("No se pudieron comprobar tus permisos sobre este paciente; los datos se muestran de solo lectura.")).toBeTruthy();
    expect(listPatients).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(listPatients).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Editar datos" })).toBeTruthy();
    expect(screen.queryByText(/No se pudieron comprobar tus permisos/)).toBeNull();
  });

  it("si la lista no trae a este paciente, también solo lectura con el aviso", async () => {
    listPatients.mockResolvedValue([fila({ id: 7 })]);
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ver datos" }));
    expect(screen.queryByRole("button", { name: "Editar datos" })).toBeNull();
    expect(screen.getByText("No se pudieron comprobar tus permisos sobre este paciente; los datos se muestran de solo lectura.")).toBeTruthy();
    const hoja = await screen.findByRole("dialog", { name: "Zenodo, Caso 002" });
    expect((within(hoja).getByLabelText("Apellidos *") as HTMLInputElement).readOnly).toBe(true);
    expect(within(hoja).queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });

  it("«Nuevo caso» abre el formulario del caso para este paciente", async () => {
    getPatient.mockResolvedValue(PACIENTE);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo caso" }));
    expect(screen.getByText("formulario del caso de Zenodo, Caso 002")).toBeTruthy();
    // Que terminen las cargas de la columna antes de desmontar.
    await screen.findByText("No está compartido con ninguna cuenta.");
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

/* Casos → Estudios de imagen → Sesiones guardadas → Vista previa. Dos casos:
   ACM (id 9) con el estudio «Angio 3D» (7), y ACoA (id 4) con «TAC control» (8).
   s-1 es del estudio 7, s-2 del caso ACM sin estudio archivado y s-3 del 8. */
describe("PatientPage · casos, estudios y sesiones en cascada", () => {
  const PACIENTE = { id: 42, surname: "Zenodo", given_name: "Caso 002", hospital_id: "HC-42", sex: "F" };
  const caso = (o: Partial<StudySummary> & { id: number }): StudySummary => ({
    patient_id: 42, dicom_path: "", modality: "", description: "", acquired_at: "", session_count: 0,
    sintomas_positivos: "", dx_principal: "", dx_secundario: "", tipo_aneurisma: "", tratamiento_propuesto: "",
    region_anatomica: "", lateralidad: "", angiographer: "", mod_tac: false, mod_angio: false, mod_rm: false,
    mod_pangio: false, ...o,
  });
  const estudio = (o: Partial<StudyCard> & { id: number; case_id: number }): StudyCard => ({
    patient_id: 42, owner_id: 1, patient_name: "Zenodo, Caso 002", hospital_id: "HC-42", description: "",
    modality: "XA", acquired_at: "2026-10-01", dx_principal: "", created_at: "2026-10-01T00:00:00",
    archived: true, has_thumbnail: false, n_files: 120, n_slices: 120, size_mb: 50, session_count: 0, last_step: null,
    max_diameter_mm: null, rupture_risk_label: null, resumable_session_id: null, ...o,
  });
  const guardada = (o: Partial<PatientSessionInfo> & { session_id: string }): PatientSessionInfo => ({
    label: "", current_step: 2, max_diameter_mm: null, rupture_risk_label: null,
    created_at: "2026-10-11T05:00:00", updated_at: "2026-10-11T05:05:09", size_bytes: 1024, case_id: null, imaging_study_id: null, ...o,
  });
  const CASOS = [caso({ id: 4, dx_principal: "Aneurisma ACoA" }), caso({ id: 9, dx_principal: "Aneurisma ACM" })];
  const SESIONES = [
    guardada({ session_id: "s-1", label: "Antes de medir", case_id: 9, imaging_study_id: 7 }),
    guardada({ session_id: "s-2", label: "Sin archivar", case_id: 9, imaging_study_id: null }),
    guardada({ session_id: "s-3", label: "Control", case_id: 4, imaging_study_id: 8 }),
  ];

  beforeEach(() => {
    getPatient.mockResolvedValue(PACIENTE);
    patientStudies.mockResolvedValue(CASOS);
    patientSessions.mockResolvedValue(SESIONES);
    listStudies.mockImplementation((_q: string, _p?: number, caseId?: number) =>
      Promise.resolve(caseId === 9
        ? [estudio({ id: 7, case_id: 9, description: "Angio 3D" })]
        : [estudio({ id: 8, case_id: 4, description: "TAC control" })]));
  });

  const region = (nombre: string | RegExp) => screen.getByRole("region", { name: nombre });
  const abrirHastaLaVista = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Aneurisma ACM/ }));
    fireEvent.click(await within(region("Estudios de imagen")).findByRole("button", { name: /^Angio 3D/ }));
    fireEvent.click(within(region(/^Sesiones guardadas/)).getByRole("button", { name: /^Antes de medir/ }));
    return region("Vista previa");
  };

  it("en móvil la ficha abre con Paciente a la vista y Casos es su siguiente columna, desde su entrada", async () => {
    simularPantalla(390);
    renderPage();
    const datos = await screen.findByRole("region", { name: "Paciente" });
    expect(within(datos).getByRole("heading", { name: "Zenodo, Caso 002" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Casos" })).toBeNull();
    fireEvent.click(within(datos).getByRole("button", { name: /^Casos/ }));
    expect(await screen.findByRole("region", { name: "Vista previa" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Volver a una columna anterior" })).getByRole("button", { name: "Casos" })).toBeTruthy();
  });

  it("sin caso elegido: Casos a 380 px y una vista previa del caso más reciente", async () => {
    renderPage();
    const vista = await screen.findByRole("region", { name: "Vista previa" });
    expect(screen.getByRole("region", { name: "Casos" }).style.flex).toBe("0 1 380px");
    expect(within(vista).getByRole("heading", { name: "Antes de medir" })).toBeTruthy();
    expect(within(vista).getByRole("button", { name: "Reanudar" })).toBeTruthy();
    // Elegir un caso la sustituye por sus estudios.
    fireEvent.click(await screen.findByRole("button", { name: /^Aneurisma ACoA/ }));
    expect(screen.queryByRole("region", { name: "Vista previa" })).toBeNull();
  });

  it("sin sesiones, la vista previa explica qué elegir", async () => {
    patientSessions.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Elige un caso para ver sus estudios de imagen y sus sesiones guardadas.")).toBeTruthy();
    expect(screen.getByText("Sin sesiones guardadas")).toBeTruthy();
  });

  it("Reanudar desde la ficha enseña «Abriendo…» mientras dura", async () => {
    onResume.mockImplementation(() => new Promise(() => {}));
    renderPage();
    const vista = await screen.findByRole("region", { name: "Vista previa" });
    fireEvent.click(await within(vista).findByRole("button", { name: "Reanudar" }));
    const abriendo = await within(vista).findByRole("button", { name: "Abriendo…" });
    expect(abriendo).toBeDisabled();
  });

  it("la columna Casos se abre a la derecha de Datos con los casos del paciente", async () => {
    renderPage();
    const casos = await screen.findByRole("region", { name: "Casos" });
    expect(await within(casos).findByText("Aneurisma ACM")).toBeTruthy();
    expect(within(casos).getByText("Aneurisma ACoA")).toBeTruthy();
    expect(patientStudies).toHaveBeenCalledWith(42);
  });

  it("una sesión del caso sin estudio de imagen aparece al elegir «Sesiones sin estudio archivado»", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Aneurisma ACM/ }));
    const estudios = region("Estudios de imagen");
    await within(estudios).findByText("Angio 3D");
    fireEvent.click(within(estudios).getByRole("button", { name: "Sesiones sin estudio archivado · 1" }));
    const sesiones = region("Sesiones guardadas · 1");
    expect(within(sesiones).getByText("Sin archivar")).toBeTruthy();
    expect(within(sesiones).queryByText("Antes de medir")).toBeNull();
    expect(within(sesiones).queryByText("Control")).toBeNull();
  });

  it("elegir un estudio enseña solo sus sesiones, y una sesión abre la vista previa", async () => {
    const vista = await abrirHastaLaVista();
    const sesiones = region("Sesiones guardadas · 1");
    expect(within(sesiones).getByText("Antes de medir")).toBeTruthy();
    expect(within(sesiones).queryByText("Sin archivar")).toBeNull();
    expect(within(vista).getByRole("heading", { name: "Antes de medir" })).toBeTruthy();
  });

  it("con el estudio y una sesión abiertos, elegir otro caso deja Sesiones y Vista previa sin pintar", async () => {
    await abrirHastaLaVista();
    fireEvent.click(within(region("Casos")).getByRole("button", { name: /^Aneurisma ACoA/ }));
    expect(screen.queryByRole("region", { name: /^Sesiones guardadas/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Vista previa" })).toBeNull();
    const estudios = region("Estudios de imagen");
    expect(await within(estudios).findByText("TAC control")).toBeTruthy();
    expect(within(estudios).queryByText("Angio 3D")).toBeNull();
    expect(screen.queryByText("Antes de medir")).toBeNull();
  });

  it("cambiar de estudio cierra la vista previa de la sesión anterior", async () => {
    await abrirHastaLaVista();
    fireEvent.click(within(region("Estudios de imagen")).getByRole("button", { name: "Sesiones sin estudio archivado · 1" }));
    expect(screen.queryByRole("region", { name: "Vista previa" })).toBeNull();
    expect(within(region("Sesiones guardadas · 1")).getByText("Sin archivar")).toBeTruthy();
  });

  it("«Reanudar» en la vista previa llama onResume con la sesión y la fila del paciente", async () => {
    const vista = await abrirHastaLaVista();
    fireEvent.click(within(vista).getByRole("button", { name: "Reanudar" }));
    expect(onResume).toHaveBeenCalledWith("s-1", expect.objectContaining({ id: 42, full_name: "Zenodo, Caso 002" }));
  });

  it("«Abrir estudio» lo abre en el flujo", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Aneurisma ACM/ }));
    fireEvent.click(await within(region("Estudios de imagen")).findByRole("button", { name: /Más acciones del estudio/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir estudio" }));
    expect(onOpenStudy).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  /* «salir de la ficha con cambios sin guardar» en lo que toca a planificar:
     los datos se editan en su hoja, así que planificar desde la columna no
     tiene nada escrito que perder y va directo (el aviso de descartar vive en
     PatientFormSheet). */
  it("«Planificar este caso» entra al flujo con el caso más reciente y la fila del paciente", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Planificar este caso" }));
    expect(onPlanCase).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), expect.objectContaining({ id: 42 }));
  });

  it("sin la fila de la lista no salen «Planificar» ni «Subir DICOM»", async () => {
    listPatients.mockRejectedValue(new Error("caído"));
    renderPage();
    expect(await screen.findByText("Aneurisma ACM")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Planificar este caso" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subir DICOM de este paciente" })).toBeNull();
  });

  it("borrar una sesión recarga las sesiones y cierra su vista previa", async () => {
    deleteSavedSession.mockResolvedValue(undefined);
    await abrirHastaLaVista();
    patientSessions.mockResolvedValueOnce(SESIONES.filter((s) => s.session_id !== "s-1"));
    fireEvent.click(screen.getByRole("button", { name: "Borrar «Antes de medir»" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Borrar la sesión guardada" })).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(deleteSavedSession).toHaveBeenCalledWith("s-1"));
    expect(await screen.findByRole("region", { name: "Sesiones guardadas · 0" })).toBeTruthy();
    expect(patientSessions).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("region", { name: "Vista previa" })).toBeNull();
  });

  it("una cuenta compartida no ve lápiz, «Borrar», «Eliminar caso» ni «Borrar estudio» en ninguna columna", async () => {
    user.id = 3;
    listPatients.mockResolvedValue([fila({ owner_id: 1, is_shared_with_me: true })]);
    const vista = await abrirHastaLaVista();
    expect(within(vista).getByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar caso «Aneurisma ACM»" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Renombrar|Borrar|Eliminar caso|Editar datos|Eliminar paciente/ })).toBeNull();
  });

  // Patients.test › el glosario en «Pacientes»: «Casos (0)» es ahora «Casos · 0»
  // y «Sesiones guardadas (n)» el título de su columna.
  it("el glosario: «Casos · 0», «Nuevo caso», el vacío nuevo y «Sesiones guardadas · 2»", async () => {
    listPatients.mockResolvedValue([fila({ study_count: 0 })]);
    patientStudies.mockResolvedValue([]);
    patientSessions.mockResolvedValue([guardada({ session_id: "a" }), guardada({ session_id: "b" })]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Casos · 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuevo caso" })).toBeTruthy();
    expect(await screen.findByText("Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.")).toBeTruthy();
    // Las sesiones que no cuelgan de ningún caso no se pierden: tienen su entrada.
    fireEvent.click(await screen.findByRole("button", { name: "Sesiones sin caso · 2" }));
    expect(screen.getByRole("region", { name: "Sesiones guardadas · 2" })).toBeTruthy();
    expect(screen.queryByText(/Casos \/ estudios|Nuevo estudio|Sesiones de estudio/)).toBeNull();
  });

  it("si las sesiones no cargan, la columna Casos lo dice aunque no haya casos, y «Reintentar» las trae", async () => {
    listPatients.mockResolvedValue([fila({ study_count: 0 })]);
    patientStudies.mockResolvedValue([]);
    patientSessions.mockReset()
      .mockRejectedValueOnce(new Error("No se pudieron leer las sesiones"))
      .mockResolvedValueOnce([guardada({ session_id: "a" }), guardada({ session_id: "b" })]);
    renderPage();
    const casos = await screen.findByRole("region", { name: "Casos" });
    expect(await within(casos).findByText("No se pudieron leer las sesiones")).toBeTruthy();
    fireEvent.click(within(casos).getByRole("button", { name: "Reintentar" }));
    expect(await within(casos).findByRole("button", { name: "Sesiones sin caso · 2" })).toBeTruthy();
    expect(patientSessions).toHaveBeenCalledTimes(2);
    expect(within(casos).queryByText("No se pudieron leer las sesiones")).toBeNull();
  });

  it("«Capturas · n» enseña la galería del paciente a la derecha de Datos y oculta Casos; «Casos · n» la recupera", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Casos" });
    fireEvent.click(await screen.findByRole("button", { name: "Capturas · 0" }));
    const galeria = await screen.findByRole("region", { name: "Capturas" });
    expect(await within(galeria).findByText(/Todavía no hay capturas/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Casos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Capturas · 0" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Casos · 3" }));
    expect(await screen.findByRole("region", { name: "Casos" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Capturas" })).toBeNull();
  });

  it("«Pedidos de clip» llama onOpenOrders con la fila del paciente", async () => {
    const onOpenOrders = vi.fn();
    render(
      <MemoryRouter initialEntries={["/app/pacientes/42"]}>
        <PatientPage patientId={42} onResume={onResume} onPlanCase={onPlanCase} onOpenOrders={onOpenOrders} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pedidos de clip" }));
    expect(onOpenOrders).toHaveBeenCalledWith(expect.objectContaining({ id: 42, full_name: "Zenodo, Caso 002" }));
  });

  /* Respuestas que llegan desordenadas para el mismo paciente: gana la última
     petición, no la última respuesta. */
  const diferida = <T,>() => {
    let resolver!: (v: T) => void;
    const promesa = new Promise<T>((r) => { resolver = r; });
    return { promesa, resolver };
  };

  it("dos recargas de casos que responden al revés dejan pintada la lista más nueva", async () => {
    const vieja = diferida<StudySummary[]>();
    const nueva = diferida<StudySummary[]>();
    patientStudies.mockReset().mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo caso" }));
    fireEvent.click(screen.getByRole("button", { name: "guardar el caso" }));
    await waitFor(() => expect(patientStudies).toHaveBeenCalledTimes(2));
    await act(async () => { nueva.resolver([...CASOS, caso({ id: 77, dx_principal: "Aneurisma nuevo" })]); });
    expect(await screen.findByText("Aneurisma nuevo")).toBeTruthy();
    await act(async () => { vieja.resolver(CASOS); });
    expect(screen.getByText("Aneurisma nuevo")).toBeTruthy();
    // Que terminen las cargas de la columna Datos antes de desmontar.
    await screen.findByText("No está compartido con ninguna cuenta.");
  });

  it("dos recargas de sesiones que responden al revés dejan pintada la lista más nueva", async () => {
    const huerfanas = [guardada({ session_id: "a", label: "Primera" }), guardada({ session_id: "b", label: "Segunda" })];
    const trasA = diferida<PatientSessionInfo[]>();
    const trasB = diferida<PatientSessionInfo[]>();
    patientSessions.mockReset().mockResolvedValueOnce(huerfanas)
      .mockReturnValueOnce(trasA.promesa).mockReturnValueOnce(trasB.promesa);
    deleteSavedSession.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Sesiones sin caso · 2" }));
    const borrar = async (nombre: string) => {
      fireEvent.click(screen.getByRole("button", { name: `Borrar «${nombre}»` }));
      fireEvent.click(within(screen.getByRole("alertdialog", { name: "Borrar la sesión guardada" })).getByRole("button", { name: "Borrar" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    };
    await borrar("Primera");
    await borrar("Segunda");
    expect(patientSessions).toHaveBeenCalledTimes(3);
    await act(async () => { trasB.resolver([]); });
    expect(await screen.findByRole("region", { name: "Sesiones guardadas · 0" })).toBeTruthy();
    await act(async () => { trasA.resolver([huerfanas[1]]); });
    expect(screen.getByRole("region", { name: "Sesiones guardadas · 0" })).toBeTruthy();
    expect(screen.queryByText("Segunda")).toBeNull();
  });

  describe("en pantalla estrecha (≤ 1280 px)", () => {
    beforeEach(() => { simularPantalla(1280); });
    // La columna Datos vuelve a montarse al salir de las migas: que terminen sus cargas.
    const esperaColumnaDatos = async () => {
      await within(region("Paciente")).findByText("No está compartido con ninguna cuenta.");
      await within(region("Paciente")).findByRole("button", { name: "Capturas · 0" });
    };

    it("una miga cierra las columnas que hay después de ella", async () => {
      await abrirHastaLaVista();
      // Solo las dos últimas: Sesiones y Vista previa; las demás son migas.
      expect(screen.queryByRole("region", { name: "Casos" })).toBeNull();
      const migas = screen.getByRole("navigation", { name: "Volver a una columna anterior" });
      fireEvent.click(within(migas).getByRole("button", { name: "Casos" }));
      expect(region("Casos")).toBeTruthy();
      // Sin caso elegido vuelve la vista previa por defecto; Paciente es ya una miga.
      expect(within(screen.getByRole("navigation", { name: "Volver a una columna anterior" })).getByRole("button", { name: "Paciente" })).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Estudios de imagen" })).toBeNull();
      expect(screen.queryByRole("region", { name: /^Sesiones guardadas/ })).toBeNull();
      expect(await screen.findByRole("region", { name: "Vista previa" })).toBeTruthy();
    });

    it("la miga «Paciente» deja solo la columna Datos", async () => {
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /^Aneurisma ACM/ }));
      fireEvent.click(within(screen.getByRole("navigation", { name: "Volver a una columna anterior" })).getByRole("button", { name: "Paciente" }));
      expect(region("Paciente")).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Casos" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Estudios de imagen" })).toBeNull();
      expect(within(region("Paciente")).getByRole("button", { name: "Casos · 3" }).getAttribute("aria-pressed")).toBe("false");
      await esperaColumnaDatos();
    });
  });
});
