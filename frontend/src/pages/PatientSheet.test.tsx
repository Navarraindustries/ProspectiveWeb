/* La ficha del paciente (F2-25…F2-31, F2-72…F2-74, F2-T1, F2-T5, fusión nº 9). */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getPatient = vi.fn();
const patientSessions = vi.fn();
const patientStudies = vi.fn();
const patientShares = vi.fn();
const usersBrief = vi.fn();
const renameSavedSession = vi.fn();
const deleteSavedSession = vi.fn();
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
      patientSessions: (id: number) => patientSessions(id),
      patientStudies: (id: number) => patientStudies(id),
      patientShares: (id: number) => patientShares(id),
      usersBrief: () => usersBrief(),
      renameSavedSession: (sid: string, label: string) => renameSavedSession(sid, label),
      deleteSavedSession: (sid: string) => deleteSavedSession(sid),
      deletePatient: (id: number) => deletePatient(id),
      updatePatient: vi.fn(),
      createPatient: vi.fn(),
    },
  };
});
vi.mock("../components/CaptureGallery", () => ({ CaptureGallery: () => null }));
vi.mock("./Studies", () => ({ StudyGallery: () => null }));
vi.mock("./NuevoCaso", () => ({
  NuevoEstudioSheet: (p: { open: boolean; onCreated: (s?: unknown) => void; onClose: () => void }) =>
    p.open ? (
      <div>
        <span>formulario del caso</span>
        <button onClick={() => { p.onCreated({ id: 50, patient_id: 2, dx_principal: "Aneurisma ACM" }); p.onClose(); }}>
          guardar el caso
        </button>
      </div>
    ) : null,
}));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ApiError } from "../api/client";
import { PatientSheet } from "./PatientSheet";
import { ageFromDob } from "../components/patientAge";
import { fechaHora } from "../lib/fecha";
import type { PatientSessionInfo, PatientSummary, StudySummary } from "../api/types";

const resumen = (o: Partial<PatientSummary> = {}): PatientSummary => ({
  id: 2, full_name: "Segura, Juan", hospital_id: "HC-2", dob: "1999-09-16", sex: "M", institution: "",
  study_count: 0, created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0,
  is_shared_with_me: false, last_session_at: null, last_session_step: null, last_session_id: null,
  last_case_label: "", ...o,
});
const caso = (o: Partial<StudySummary> & { id: number }): StudySummary => ({
  patient_id: 2, dicom_path: "", modality: "", description: "", acquired_at: "", session_count: 0,
  sintomas_positivos: "", dx_principal: "", dx_secundario: "", tipo_aneurisma: "", tratamiento_propuesto: "",
  region_anatomica: "", lateralidad: "", angiographer: "", mod_tac: false, mod_angio: false, mod_rm: false,
  mod_pangio: false, ...o,
});
const guardada = (o: Partial<PatientSessionInfo> & { session_id: string }): PatientSessionInfo => ({
  label: "", current_step: 2, max_diameter_mm: null, rupture_risk_label: null,
  created_at: "2026-10-11T05:00:00", updated_at: "2026-10-11T05:05:09", size_bytes: 349927 * 1024, ...o,
});

const onClose = vi.fn();
const onPlanCase = vi.fn();
const onResume = vi.fn();
const onDeleted = vi.fn();
const onChanged = vi.fn();
const abrir = (summary: PatientSummary | null = resumen()) =>
  render(
    <PatientSheet open patientId={2} summary={summary} onClose={onClose} onSaved={vi.fn()}
                  onResume={onResume} onPlanCase={onPlanCase} onOpenOrders={vi.fn()} onOpenStudy={vi.fn()}
                  onDeleted={onDeleted} onChanged={onChanged} />,
  );

beforeEach(() => {
  for (const f of [getPatient, patientSessions, patientStudies, patientShares, usersBrief, renameSavedSession,
                   deleteSavedSession, deletePatient, onClose, onPlanCase, onResume, onDeleted, onChanged]) f.mockReset();
  getPatient.mockResolvedValue({ id: 2, surname: "Segura", given_name: "Juan", hospital_id: "HC-2", sex: "M", dob: "1999-09-16", notes: "" });
  patientSessions.mockResolvedValue([]);
  patientStudies.mockResolvedValue([]);
  patientShares.mockResolvedValue([]);
  usersBrief.mockResolvedValue([]);
  user.id = 1;
  user.role = "medico";
});

describe("cabecera de la ficha (F1-59, F2-T1)", () => {
  it("rótulo «Ficha de paciente» y el nombre como título", async () => {
    abrir();
    expect(await screen.findByRole("dialog", { name: "Segura, Juan" })).toBeTruthy();
    expect(screen.getByText("Ficha de paciente")).toBeTruthy();
    expect(screen.queryByText("Editar paciente")).toBeNull();
  });

  it("con un 403 se titula «Paciente no autorizado» y solo queda el aviso", async () => {
    getPatient.mockRejectedValue(new ApiError(403, "No autorizado sobre este paciente."));
    abrir(null);
    expect(await screen.findByText("No autorizado sobre este paciente.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Paciente no autorizado" })).toBeTruthy();
    expect(screen.queryByText("Ficha de paciente")).toBeNull();
    expect(screen.queryByRole("button", { name: /Planificar este caso|Subir DICOM|Pedidos|Compartir con/ })).toBeNull();
  });
});

describe("datos del paciente", () => {
  it("la edad junto a la fecha de nacimiento (F2-25)", async () => {
    abrir();
    expect(await screen.findByText(`16/09/1999 · ${ageFromDob("1999-09-16")} años`)).toBeTruthy();
  });

  it("«Notas» es un área de texto (F2-26)", async () => {
    abrir();
    expect((await screen.findByLabelText("Notas")).tagName).toBe("TEXTAREA");
  });

  it("las líneas de ayuda de «Apellidos» y «Antecedentes», y «Sexo» sin dato (F1-61, F1-62, F1-63)", async () => {
    getPatient.mockResolvedValue({ id: 2, surname: "Segura", given_name: "", sex: "" });
    abrir();
    expect(await screen.findByText("Puedes usar iniciales o un código en lugar del nombre real")).toBeTruthy();
    expect(screen.getByText("Solo para consulta: no entran en el cálculo de riesgo ni en el informe.")).toBeTruthy();
    const sexo = screen.getByLabelText("Sexo") as HTMLSelectElement;
    expect(sexo.value).toBe("");
    expect(sexo.selectedOptions[0].textContent).toBe("— sin dato —");
  });

  it("«Guardar cambios» dice por qué está apagado (F2-31)", async () => {
    abrir();
    fireEvent.change(await screen.findByLabelText("Apellidos"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Escribe los apellidos para guardar.")).toBeTruthy();
  });
});

describe("acciones de arriba (F2-27, F2-29, F2-72)", () => {
  it("«Planificar este caso» va al caso más reciente; el selector elige otro", async () => {
    patientStudies.mockResolvedValue([caso({ id: 4, dx_principal: "Aneurisma ACoA" }), caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Planificar este caso" }));
    expect(onPlanCase).toHaveBeenLastCalledWith(expect.objectContaining({ id: 9 }));
    fireEvent.change(screen.getByLabelText("Caso a planificar"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Planificar este caso" }));
    expect(onPlanCase).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4 }));
  });

  it("«Subir DICOM de este paciente» entra al paso 1 con el caso fijado", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Subir DICOM de este paciente" }));
    expect(onPlanCase).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    expect(onClose).toHaveBeenCalled();
  });

  it("sin casos, «Subir DICOM» pide primero el caso y luego entra con él", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Subir DICOM de este paciente" }));
    expect(onPlanCase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "guardar el caso" }));
    await waitFor(() => expect(onPlanCase).toHaveBeenCalledWith(expect.objectContaining({ id: 50 })));
    expect(screen.queryByRole("button", { name: "Planificar este caso" })).toBeNull();
  });
});

describe("casos (F2-28, F2-T5, fusión nº 9)", () => {
  it("un caso sin diagnóstico se llama «Caso sin diagnóstico», y se edita con «Editar caso»", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9 })]);
    abrir();
    expect(await screen.findByText("Caso sin diagnóstico", { selector: "div" })).toBeTruthy();
    expect(screen.getByTitle("Editar caso")).toBeTruthy();
    expect(screen.queryByText(/Estudio|Nuevo estudio/)).toBeNull();
  });
});

describe("«Compartido con» (spec §6.1)", () => {
  it("lista las cuentas con nombre y rol", async () => {
    patientShares.mockResolvedValue([{ user_id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente", shared_at: "2026-10-12T10:00:00" }]);
    abrir();
    expect(await screen.findByText("Ana Ruiz · Residente")).toBeTruthy();
  });

  it("«Compartir con…» lo ve quien lo creó", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Compartir con…" })).toBeTruthy();
  });

  it("y el administrador", async () => {
    user.id = 99; user.role = "admin";
    abrir();
    expect(await screen.findByRole("button", { name: "Compartir con…" })).toBeTruthy();
  });

  it("pero no una cuenta con la que está compartido", async () => {
    user.id = 3;
    abrir(resumen({ is_shared_with_me: true }));
    await screen.findByText("Compartido con");
    expect(screen.queryByRole("button", { name: "Compartir con…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
  });

  it("«Compartir con…» abre la hoja de elegir cuentas", async () => {
    usersBrief.mockResolvedValue([{ id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente" }]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Compartir con…" }));
    expect(await screen.findByRole("checkbox", { name: /Ana Ruiz/ })).toBeTruthy();
  });
});

describe("sesiones guardadas (F2-30, F2-73, F2-74, F1-69)", () => {
  it("cada fila dice paso, fecha y hora local, y tamaño", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    abrir();
    expect(await screen.findByText("Antes de medir")).toBeTruthy();
    expect(screen.getByText(`Paso 3 · Detección · ${fechaHora("2026-10-11T05:05:09")} · 342 MB`)).toBeTruthy();
    const reanudar = screen.getByRole("button", { name: "Reanudar" });
    expect(reanudar.getAttribute("title")).toMatch(/Tarda unos segundos/);
    fireEvent.click(reanudar);
    expect(onResume).toHaveBeenCalledWith("s1");
  });

  it("la etiqueta no repite el nombre del paciente", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Segura, Juan · Detección" })]);
    abrir();
    expect(await screen.findByText("Detección", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Segura, Juan · Detección")).toBeNull();
  });

  it("se renombra en línea: lápiz, escribir, Intro", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    renameSavedSession.mockResolvedValue({ session_id: "s1", label: "Con el clip elegido" });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Renombrar «Antes de medir»" }));
    const campo = screen.getByLabelText("Nombre de la sesión guardada");
    fireEvent.change(campo, { target: { value: "  Con el clip elegido " } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(renameSavedSession).toHaveBeenCalledWith("s1", "Con el clip elegido"));
    expect(await screen.findByText("Con el clip elegido")).toBeTruthy();
    expect(renameSavedSession).toHaveBeenCalledTimes(1);
  });

  it("Escape cancela el nombre sin cerrar la ficha", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Renombrar «Antes de medir»" }));
    const campo = screen.getByLabelText("Nombre de la sesión guardada");
    fireEvent.change(campo, { target: { value: "otro" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(screen.getByText("Antes de medir")).toBeTruthy();
    expect(renameSavedSession).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("«Borrar» confirma con el nombre, borra y recarga la lista", async () => {
    patientSessions.mockResolvedValueOnce([guardada({ session_id: "s1", label: "Antes de medir" }), guardada({ session_id: "s2", label: "Otra" })]);
    deleteSavedSession.mockResolvedValue(undefined);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Borrar «Antes de medir»" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Borrar la sesión guardada" });
    expect(dialogo.textContent).toContain("Antes de medir");
    expect(dialogo.textContent).toContain("Se borra la copia guardada y no se puede deshacer. Si la acabas de reanudar, no se podrá borrar hasta que esa sesión abierta caduque sola.");
    patientSessions.mockResolvedValueOnce([guardada({ session_id: "s2", label: "Otra" })]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(deleteSavedSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.queryByText("Antes de medir")).toBeNull());
    expect(patientSessions).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Sesiones guardadas (1)")).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });

  it("el 409 del servidor sale literal bajo la fila", async () => {
    const detalle = "Esta sesión guardada es el origen de una sesión abierta: ciérrala antes de borrarla.";
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    deleteSavedSession.mockRejectedValue(new ApiError(409, detalle));
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Borrar «Antes de medir»" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar" }));
    const aviso = await screen.findByText(detalle);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Antes de medir").closest("[data-guardada]")?.contains(aviso)).toBe(true);
  });
});

describe("eliminar el paciente desde la ficha", () => {
  it("quien lo creó lo elimina al pie, con la confirmación de siempre", async () => {
    deletePatient.mockResolvedValue(undefined);
    abrir(resumen({ study_count: 2 }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar paciente" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Eliminar paciente" });
    expect(dialogo.textContent).toContain("2 casos");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deletePatient).toHaveBeenCalledWith(2));
    expect(onDeleted).toHaveBeenCalled();
  });
});

/* Ronda de arreglos 1 de la revisión de la Tarea 11. */
describe("salir de la ficha con cambios sin guardar", () => {
  it("«Planificar este caso» con «Notas» editado pregunta antes, y solo planifica al descartar", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir();
    fireEvent.change(await screen.findByLabelText("Notas"), { target: { value: "Cefalea en trueno" } });
    fireEvent.click(screen.getByRole("button", { name: "Planificar este caso" }));
    expect(onPlanCase).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalled();
    expect(onPlanCase).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("«Seguir editando» no ejecuta la salida pendiente", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    abrir();
    fireEvent.change(await screen.findByLabelText("Notas"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(onResume).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).value).toBe("x");
    // Y cerrar después con «Cancelar» y descartar cierra, sin reanudar.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });
});

describe("derechos sobre los datos del paciente (T7-rights)", () => {
  it("una cuenta compartida ve los datos de solo lectura, sin «Guardar cambios» ni «Eliminar caso»", async () => {
    user.id = 3;
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir(resumen({ owner_id: 1, is_shared_with_me: true }));
    expect(await screen.findByRole("button", { name: "Nuevo caso" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Editar caso «Aneurisma ACM»" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Eliminar caso/ })).toBeNull();
    expect((screen.getByLabelText("Apellidos") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Sexo") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/puedes trabajar con él y crear o editar casos, pero no cambiar sus datos, borrar casos ni compartirlo/)).toBeTruthy();
  });

  it("quien lo creó sigue viendo «Guardar cambios» y «Eliminar caso»", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir();
    expect(await screen.findByRole("button", { name: "Eliminar caso «Aneurisma ACM»" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    expect((screen.getByLabelText("Apellidos") as HTMLInputElement).readOnly).toBe(false);
  });
});

describe("derechos sobre los guardados (spec §6.2)", () => {
  it("una cuenta compartida reanuda, pero no ve el lápiz ni «Borrar»", async () => {
    user.id = 3;
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Antes de medir" })]);
    abrir(resumen({ is_shared_with_me: true }));
    expect(await screen.findByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Renombrar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Borrar/ })).toBeNull();
  });
});

describe("restos de F2-30 y acciones sin la fila de la lista", () => {
  it("si el nombre ya es el paso, la línea no lo repite", async () => {
    patientSessions.mockResolvedValue([guardada({ session_id: "s1", label: "Segura, Juan · Detección" })]);
    abrir();
    expect(await screen.findByText(`Paso 3 · ${fechaHora("2026-10-11T05:05:09")} · 342 MB`)).toBeTruthy();
  });

  it("sin la fila de la lista no salen «Planificar» ni «Subir DICOM» (no tendrían a quién llevar)", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "Aneurisma ACM" })]);
    abrir(null);
    await screen.findByText("Casos (1)");
    expect(screen.queryByRole("button", { name: "Planificar este caso" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subir DICOM de este paciente" })).toBeNull();
  });
});

describe("imágenes diagnósticas del caso (F2-40)", () => {
  it("con angio y pangio muestra «Angiografía por catéter» una vez y nunca «Pangio»", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "A", mod_angio: true, mod_pangio: true })]);
    abrir();
    expect(await screen.findByText(/Imágenes: Angiografía por catéter$/)).toBeTruthy();
    expect(screen.queryByText(/Pangio/)).toBeNull();
  });
  it("un caso antiguo con solo pangio también la muestra", async () => {
    patientStudies.mockResolvedValue([caso({ id: 9, dx_principal: "A", mod_pangio: true })]);
    abrir();
    expect(await screen.findByText(/Imágenes: Angiografía por catéter/)).toBeTruthy();
  });
});
