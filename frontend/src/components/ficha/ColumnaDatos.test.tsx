/* La columna Datos de la ficha en cascada: quién es el paciente, con quién
   está compartido, las entradas a Casos, Capturas y Pedidos, y eliminarlo.
   Viene de la ficha antigua (PatientSheet.test: «Compartido con», «eliminar el
   paciente desde la ficha», «derechos sobre los datos del paciente») y de
   Patients.test («borrar un paciente», «el glosario en Pacientes»). */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const patientShares = vi.fn();
const usersBrief = vi.fn();
const patientSessions = vi.fn();
const deletePatient = vi.fn();
const listCaptures = vi.fn();
const user = { id: 1, role: "medico" as string };

vi.mock("../../api/client", () => ({
  api: {
    patientShares: (id: number) => patientShares(id),
    usersBrief: () => usersBrief(),
    patientSessions: (id: number) => patientSessions(id),
    deletePatient: (id: number) => deletePatient(id),
    listCaptures: (by: unknown) => listCaptures(by),
  },
}));
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ColumnaDatos, derechosPaciente, type SeccionFicha } from "./ColumnaDatos";
import { ageFromDob } from "../patientAge";
import type { PatientDetail, PatientSummary } from "../../api/types";

const detalle = (o: Partial<PatientDetail> = {}): PatientDetail => ({
  id: 2, surname: "Segura", given_name: "Juan", hospital_id: "HC-2", sex: "M", dob: "1999-09-16",
  institution: "Clínica Universidad de Navarra", antecedentes_patologicos: "HTA", antecedentes_toxicologicos: "Tabaco",
  notes: "", ...o,
});
const resumen = (o: Partial<PatientSummary> = {}): PatientSummary => ({
  id: 2, full_name: "Segura, Juan", hospital_id: "HC-2", dob: "1999-09-16", sex: "M", institution: "",
  study_count: 2, created_at: "2026-10-01T00:00:00", owner_id: 1, shared_with_count: 0,
  is_shared_with_me: false, last_session_at: null, last_session_step: null, last_session_id: null,
  last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null, ...o,
});

const onSeccion = vi.fn();
const onEditar = vi.fn();
const onNuevoCaso = vi.fn();
const onEliminado = vi.fn();
const onOpenOrders = vi.fn();
const columna = ({ summary = resumen() as PatientSummary | null, puedeEditar = true, seccion = "casos" as SeccionFicha, patient = detalle(), casosCargados } =
  {} as { summary?: PatientSummary | null; puedeEditar?: boolean; seccion?: SeccionFicha; patient?: PatientDetail; casosCargados?: number | null }) => (
    <ColumnaDatos patient={patient} summary={summary} puedeEditar={puedeEditar} seccion={seccion} casosCargados={casosCargados}
                  onSeccion={onSeccion} onEditar={onEditar} onNuevoCaso={onNuevoCaso} onEliminado={onEliminado}
                  onOpenOrders={onOpenOrders} />
);
const abrir = (o: Parameters<typeof columna>[0] = {}) => render(columna(o));

beforeEach(() => {
  for (const f of [patientShares, usersBrief, patientSessions, deletePatient, listCaptures,
                   onSeccion, onEditar, onNuevoCaso, onEliminado, onOpenOrders]) f.mockReset();
  patientShares.mockResolvedValue([]);
  usersBrief.mockResolvedValue([]);
  patientSessions.mockResolvedValue([]);
  listCaptures.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ id: i + 1 })));
  user.id = 1;
  user.role = "medico";
});

describe("quién es el paciente", () => {
  it("nombre, HC, sexo y edad, institución y antecedentes resumidos", async () => {
    abrir();
    expect(screen.getByRole("heading", { name: "Segura, Juan" })).toBeTruthy();
    expect(screen.getByText("HC-2")).toBeTruthy();
    expect(screen.getByText(`M · ${ageFromDob("1999-09-16")} años`)).toBeTruthy();
    expect(screen.getByText("Clínica Universidad de Navarra")).toBeTruthy();
    expect(screen.getByText("Patológicos: HTA · Toxicológicos: Tabaco")).toBeTruthy();
    await screen.findByText("Capturas · 5");
  });

  it("sin antecedentes lo dice, y «Editar datos» abre la hoja del formulario", async () => {
    abrir({ patient: detalle({ antecedentes_patologicos: "", antecedentes_toxicologicos: "" }) });
    expect(screen.getByText("Sin antecedentes anotados.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar datos" }));
    expect(onEditar).toHaveBeenCalled();
    await screen.findByText("Capturas · 5");
  });
});

describe("entradas de la columna", () => {
  it("«Casos · 2» y «Capturas · 5» con sus contadores; Casos abierta por defecto", async () => {
    abrir();
    const casos = screen.getByRole("button", { name: "Casos · 2" });
    expect(casos.getAttribute("aria-pressed")).toBe("true");
    const capturas = await screen.findByRole("button", { name: "Capturas · 5" });
    expect(capturas.getAttribute("aria-pressed")).toBe("false");
    expect(listCaptures).toHaveBeenCalledWith({ patientId: 2 });
    fireEvent.click(capturas);
    expect(onSeccion).toHaveBeenLastCalledWith("capturas");
    fireEvent.click(casos);
    expect(onSeccion).toHaveBeenLastCalledWith("casos");
  });

  it("sin la fila de la lista, «Casos · n» sale con los casos ya cargados", async () => {
    abrir({ summary: null, casosCargados: 3 });
    expect(screen.getByRole("button", { name: "Casos · 3" })).toBeTruthy();
    await screen.findByText("Capturas · 5");
  });

  it("al abrir Capturas y al volver, vuelve a contarlas (un borrado en la galería se refleja)", async () => {
    listCaptures.mockReset()
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ id: i + 1 })))
      .mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: i + 1 })));
    const { rerender } = abrir();
    await screen.findByRole("button", { name: "Capturas · 5" });
    rerender(columna({ seccion: "capturas" }));
    await screen.findByRole("button", { name: "Capturas · 4" });
    rerender(columna({ seccion: "casos" }));
    await waitFor(() => expect(listCaptures).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "Capturas · 4" })).toBeTruthy();
  });

  it("con Capturas abierta, es Capturas la marcada", async () => {
    abrir({ seccion: "capturas" });
    expect((await screen.findByRole("button", { name: "Capturas · 5" })).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Casos · 2" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("«Pedidos de clip» abre los pedidos del paciente", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Pedidos de clip" }));
    expect(onOpenOrders).toHaveBeenCalled();
    await screen.findByText("Capturas · 5");
  });

  it("si las capturas no cargan, la entrada sigue sin contador", async () => {
    listCaptures.mockRejectedValue(new Error("caído"));
    abrir();
    await waitFor(() => expect(listCaptures).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Capturas" })).toBeTruthy();
  });

  /* El glosario (familia V, W, X): «caso», nunca «estudio» para lo clínico. */
  it("el glosario: «Casos · 0» y «Nuevo caso», sin «Nuevo estudio» ni «Casos / estudios»", async () => {
    abrir({ summary: resumen({ study_count: 0 }) });
    expect(screen.getByRole("button", { name: "Casos · 0" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo caso" }));
    expect(onNuevoCaso).toHaveBeenCalled();
    expect(screen.queryByText(/Casos \/ estudios|Nuevo estudio|Sesiones de estudio/)).toBeNull();
    await screen.findByText("Capturas · 5");
  });
});

describe("«Compartido con» (spec §6.1)", () => {
  it("lista las cuentas con nombre y rol", async () => {
    patientShares.mockResolvedValue([{ user_id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente", shared_at: "2026-10-12T10:00:00" }]);
    abrir();
    expect(await screen.findByText("Ana Ruiz · Residente")).toBeTruthy();
    expect(patientShares).toHaveBeenCalledWith(2);
  });

  it("sin cuentas lo dice", async () => {
    abrir();
    expect(await screen.findByText("No está compartido con ninguna cuenta.")).toBeTruthy();
  });

  it("«Compartir con…» lo ve quien lo creó", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Compartir con…" })).toBeTruthy();
  });

  it("y el administrador", async () => {
    user.id = 99; user.role = "admin";
    abrir();
    expect(await screen.findByRole("button", { name: "Compartir con…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar paciente" })).toBeTruthy();
  });

  it("pero no una cuenta con la que está compartido", async () => {
    user.id = 3;
    abrir({ summary: resumen({ is_shared_with_me: true }), puedeEditar: false });
    await screen.findByText("Compartido con");
    await screen.findByText("No está compartido con ninguna cuenta.");
    expect(screen.queryByRole("button", { name: "Compartir con…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
  });

  it("«Compartir con…» abre la hoja de elegir cuentas", async () => {
    usersBrief.mockResolvedValue([{ id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente" }]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Compartir con…" }));
    expect(await screen.findByRole("checkbox", { name: /Ana Ruiz/ })).toBeTruthy();
  });

  it("si la lista no carga, lo dice con «Reintentar» y la vuelve a pedir", async () => {
    patientShares.mockRejectedValueOnce(new Error("La base de datos está bloqueada"));
    abrir();
    expect(await screen.findByText("La base de datos está bloqueada")).toBeTruthy();
    patientShares.mockResolvedValueOnce([{ user_id: 3, username: "ana", full_name: "", role: "medico", shared_at: "" }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/^ana · /)).toBeTruthy();
  });
});

describe("derechos sobre los datos del paciente (T7-rights)", () => {
  it("una cuenta compartida no ve «Editar datos» ni «Eliminar paciente»; ve los datos con «Ver datos»", async () => {
    user.id = 3;
    abrir({ summary: resumen({ owner_id: 1, is_shared_with_me: true }), puedeEditar: false });
    await screen.findByText("No está compartido con ninguna cuenta.");
    expect(screen.queryByRole("button", { name: "Editar datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
    // Crear casos sí puede: trabaja con el paciente.
    expect(screen.getByRole("button", { name: "Nuevo caso" })).toBeTruthy();
    expect(screen.getByText(/puedes trabajar con él y crear o editar casos, pero no cambiar sus datos, borrar casos ni compartirlo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver datos" }));
    expect(onEditar).toHaveBeenCalled();
  });
});

describe("sin la fila de la lista (derechos sin comprobar)", () => {
  it("falla cerrado: sin «Compartir con…» ni «Eliminar paciente», con el aviso y «Reintentar»", async () => {
    const onReintentarPermisos = vi.fn();
    render(
      <ColumnaDatos patient={detalle()} summary={null} puedeEditar={derechosPaciente({ id: 1, role: "medico" } as never, null).puedeEditar}
                    seccion="casos" onSeccion={onSeccion} onEditar={onEditar} onNuevoCaso={onNuevoCaso}
                    onEliminado={onEliminado} onReintentarPermisos={onReintentarPermisos} />,
    );
    await screen.findByText("No está compartido con ninguna cuenta.");
    expect(screen.getByRole("button", { name: "Ver datos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compartir con…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar paciente" })).toBeNull();
    expect(screen.getByText("No se pudieron comprobar tus permisos sobre este paciente; los datos se muestran de solo lectura.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentarPermisos).toHaveBeenCalled();
  });

  it("derechosPaciente: sin fila nadie edita, ni el administrador", () => {
    expect(derechosPaciente({ id: 1, role: "medico" } as never, null)).toEqual({ creadorOAdmin: false, puedeEditar: false });
    expect(derechosPaciente({ id: 9, role: "admin" } as never, null).puedeEditar).toBe(false);
    expect(derechosPaciente({ id: 1, role: "medico" } as never, resumen()).puedeEditar).toBe(true);
    expect(derechosPaciente({ id: 9, role: "admin" } as never, resumen()).puedeEditar).toBe(true);
    expect(derechosPaciente({ id: 3, role: "medico" } as never, resumen({ is_shared_with_me: true })).puedeEditar).toBe(false);
  });
});

/* F1-58: el diálogo de borrar no decía cuánto se llevaba, e Intro lo
   confirmaba. Se elimina desde el pie de la columna Datos. */
describe("eliminar el paciente desde la ficha", () => {
  it("quien lo creó lo elimina al pie: el diálogo dice cuántos casos y sesiones se borran, e Intro no borra", async () => {
    patientSessions.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ session_id: `s${i}` })));
    deletePatient.mockResolvedValue(undefined);
    abrir({ summary: resumen({ study_count: 2 }) });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar paciente" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Eliminar paciente" });
    await waitFor(() => expect(dialogo.textContent).toContain("6 sesiones"));
    expect(dialogo.textContent).toContain("2 casos");
    expect(dialogo.textContent).toContain("Segura, Juan");
    expect(patientSessions).toHaveBeenCalledWith(2);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(deletePatient).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deletePatient).toHaveBeenCalledWith(2));
    await waitFor(() => expect(onEliminado).toHaveBeenCalled());
  });

  it("si el servidor no lo elimina, el motivo queda bajo el botón", async () => {
    deletePatient.mockRejectedValue(new Error("El paciente tiene pedidos abiertos"));
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar paciente" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("El paciente tiene pedidos abiertos")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onEliminado).not.toHaveBeenCalled();
  });
});
