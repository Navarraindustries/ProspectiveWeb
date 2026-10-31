/* El panel lateral de Pacientes (spec §4.3): cifras de «Hoy», actividad reciente
   de los pacientes visibles y accesos. Mocks como en shell/UserMenu.test.tsx. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PatientActivity, PatientSummary } from "../../api/types";

const go = vi.fn();
let user: Record<string, unknown>;
const patientsActivity = vi.fn();
const listUsers = vi.fn();
vi.mock("../../store/auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("../../store/nav", async (orig) => ({ ...(await orig<object>()), useNav: () => ({ screen: "patients", go }) }));
vi.mock("../../api/client", () => ({
  api: {
    patientsActivity: (n?: number) => patientsActivity(n),
    listUsers: (s?: string) => listUsers(s),
  },
}));

import { PatientsSidePanel } from "./PatientsSidePanel";

function paciente(id: number, extra: Partial<PatientSummary> = {}): PatientSummary {
  return {
    id, full_name: `Paciente ${id}`, hospital_id: `HC-${id}`, dob: "1970-05-01", sex: "F",
    institution: "", study_count: 1, created_at: "2026-10-01T10:00:00", owner_id: 1,
    shared_with_count: 0, is_shared_with_me: false,
    last_session_at: null, last_session_step: null, last_session_id: null,
    last_case_label: "", last_risk_label: null, last_capture_id: null, last_imaging_study_id: null,
    ...extra,
  } as PatientSummary;
}

function actividad(n: number): PatientActivity[] {
  return Array.from({ length: n }, (_, i) => ({
    patient_id: 100 + i, patient_name: `Persona ${i}`, action: "SESSION_SAVED",
    at: new Date(Date.now() - 5 * 60_000).toISOString(), username: "dra",
  }));
}

function montar(over: { patients?: PatientSummary[]; loading?: boolean } = {}) {
  const onOpenPatient = vi.fn(), onNewPatient = vi.fn();
  render(<PatientsSidePanel patients={over.patients ?? []} loading={over.loading ?? false}
    onOpenPatient={onOpenPatient} onNewPatient={onNewPatient} />);
  return { onOpenPatient, onNewPatient };
}

/** La fila de «Hoy» con ese rótulo (rótulo y cifra comparten contenedor). */
const fila = (rotulo: string) => screen.getByText(rotulo).parentElement as HTMLElement;

beforeEach(() => {
  user = { id: 1, role: "doctor", username: "dra" };
  go.mockReset();
  patientsActivity.mockReset().mockResolvedValue([]);
  listUsers.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("PatientsSidePanel", () => {
  it("Hoy: pacientes, en curso, con informe, semana; «Compartidos contigo» solo si hay", async () => {
    const reciente = new Date(Date.now() - 3_600_000).toISOString();
    const ps = [
      paciente(1, { last_session_id: "a", last_session_step: 2, last_session_at: reciente }),
      paciente(2, { last_session_id: "b", last_session_step: 7, last_session_at: reciente }),
      paciente(3),
    ];
    montar({ patients: ps });
    expect(screen.getByRole("region", { name: "Hoy" })).toBeTruthy();
    expect(fila("Pacientes").textContent).toContain("3");
    expect(fila("En curso").textContent).toContain("1");
    expect(fila("Con informe").textContent).toContain("1");
    expect(fila("Sesiones esta semana").textContent).toContain("2");
    expect(screen.queryByText("Compartidos contigo")).toBeNull();
    await waitFor(() => expect(patientsActivity).toHaveBeenCalled());
    cleanup();

    montar({ patients: [paciente(1, { is_shared_with_me: true })] });
    expect(fila("Compartidos contigo").textContent).toContain("1");
    await waitFor(() => expect(patientsActivity).toHaveBeenCalledTimes(2));
  });

  it("Hoy: mientras carga las cifras muestran «—»", async () => {
    montar({ loading: true, patients: [paciente(1)] });
    expect(fila("Pacientes").textContent).toContain("—");
    expect(fila("En curso").textContent).toContain("—");
    await waitFor(() => expect(patientsActivity).toHaveBeenCalled());
  });

  it("Hoy: «Cuentas pendientes» solo para administradores, en aviso si > 0, y lleva a cuentas pendientes", async () => {
    montar();
    expect(screen.queryByText("Cuentas pendientes")).toBeNull();
    expect(listUsers).not.toHaveBeenCalled();
    await waitFor(() => expect(patientsActivity).toHaveBeenCalled());
    cleanup();

    user = { id: 1, role: "admin", username: "admin" };
    listUsers.mockResolvedValue([{ id: 5 }, { id: 6 }]);
    montar();
    expect(listUsers).toHaveBeenCalledWith("pending");
    const conAviso = await screen.findByRole("button", { name: /Cuentas pendientes/ });
    await waitFor(() => expect(conAviso.textContent).toContain("2"));
    expect(conAviso.className).toContain("pt-side-alert");
    fireEvent.click(conAviso);
    expect(go).toHaveBeenCalledWith("pending");
    cleanup();

    listUsers.mockResolvedValue([]);
    montar();
    const cero = await screen.findByRole("button", { name: /Cuentas pendientes/ });
    await waitFor(() => expect(cero.textContent).toContain("0"));
    expect(cero.className).not.toContain("pt-side-alert");
    cleanup();

    listUsers.mockRejectedValue(new Error("x"));
    montar();
    const fallo = await screen.findByRole("button", { name: /Cuentas pendientes/ });
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(3));
    expect(fallo.textContent).toContain("—");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Actividad: 8 entradas «{paciente} · {rótulo}» con tiempo relativo; clic abre la ficha", async () => {
    patientsActivity.mockResolvedValue(actividad(8));
    const { onOpenPatient } = montar();
    const bloque = screen.getByRole("region", { name: "Actividad reciente" });
    const filas = await within(bloque).findAllByRole("button", { name: /Persona \d · / });
    expect(filas).toHaveLength(8);
    expect(patientsActivity).toHaveBeenCalledWith(8);
    expect(filas[0].textContent).toContain("Persona 0 · ");
    expect(filas[0].textContent).toContain("hace 5 min");
    fireEvent.click(filas[2]);
    expect(onOpenPatient).toHaveBeenCalledWith(102);
  });

  it("Actividad vacía: «Aún no hay actividad en tus pacientes.»", async () => {
    montar();
    expect(await screen.findByText("Aún no hay actividad en tus pacientes.")).toBeTruthy();
  });

  it("Actividad con error: la línea de error y «Reintentar» vuelve a pedirla; las cifras siguen", async () => {
    patientsActivity.mockRejectedValueOnce(new Error("x")).mockResolvedValue(actividad(1));
    montar({ patients: [paciente(1), paciente(2)] });
    expect(await screen.findByText("No se pudo cargar la actividad")).toBeTruthy();
    expect(fila("Pacientes").textContent).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Persona 0 · / })).toBeTruthy();
    expect(patientsActivity).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("No se pudo cargar la actividad")).toBeNull();
  });

  it("Actividad: desmontar con un «Reintentar» en vuelo descarta la respuesta tardía", async () => {
    let resolver!: (v: PatientActivity[]) => void;
    patientsActivity.mockRejectedValueOnce(new Error("x"))
      .mockImplementationOnce(() => new Promise<PatientActivity[]>((r) => { resolver = r; }));
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(patientsActivity).toHaveBeenCalledTimes(2);
    cleanup();
    resolver(actividad(1));
    await Promise.resolve();
    expect(errores).not.toHaveBeenCalled();
    errores.mockRestore();
  });

  it("Accesos: Nuevo paciente, Estudios, Pedidos de clips; Usuarios y Auditoría solo al administrador; cada uno navega", async () => {
    const { onNewPatient } = montar();
    const accesos = screen.getByRole("region", { name: "Accesos" });
    fireEvent.click(within(accesos).getByRole("button", { name: /Nuevo paciente/ }));
    expect(onNewPatient).toHaveBeenCalled();
    fireEvent.click(within(accesos).getByRole("button", { name: /Estudios/ }));
    expect(go).toHaveBeenLastCalledWith("studies");
    fireEvent.click(within(accesos).getByRole("button", { name: /Pedidos de clips/ }));
    expect(go).toHaveBeenLastCalledWith("orders");
    expect(within(accesos).queryByRole("button", { name: /Usuarios/ })).toBeNull();
    expect(within(accesos).queryByRole("button", { name: /Auditoría/ })).toBeNull();
    await waitFor(() => expect(patientsActivity).toHaveBeenCalled());
    cleanup();

    user = { id: 1, role: "admin", username: "admin" };
    montar();
    const acc = screen.getByRole("region", { name: "Accesos" });
    fireEvent.click(within(acc).getByRole("button", { name: /Usuarios/ }));
    expect(go).toHaveBeenLastCalledWith("users");
    fireEvent.click(within(acc).getByRole("button", { name: /Auditoría/ }));
    expect(go).toHaveBeenLastCalledWith("audit");
    await waitFor(() => expect(listUsers).toHaveBeenCalled());
  });
});
