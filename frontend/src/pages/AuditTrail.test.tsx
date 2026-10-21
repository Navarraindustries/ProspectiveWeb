/* «Auditoría»: error de carga (F1-103), hora local (F1-101) y F2 (16):
   título, «Exportar» siempre, filtro por paciente, filas desplegables. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const auditBlocks = vi.fn();
const listPatients = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    auditBlocks: (o?: { patientId?: number }) => auditBlocks(o),
    listPatients: () => listPatients(),
    auditVerify: () => Promise.resolve({ ok: true, total_blocks: 0, broken: [] }),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", username: "admin" } }) }));

import { AuditTrail } from "./AuditTrail";
import { fechaHora } from "../lib/fecha";

const bloque = (o: Record<string, unknown> = {}) => ({
  id: 1, iso_ts: "2026-10-11T03:01:00Z", username: "admin", action: "LOGIN",
  patient_hash: "", payload_json: "{}", block_hash: "abcdef0123456789abcdef", prev_hash: "0011223344",
  ...o,
});

beforeEach(() => {
  auditBlocks.mockReset();
  listPatients.mockReset();
  listPatients.mockResolvedValue([
    { id: 7, full_name: "Ana Pérez", hospital_id: "H-7" },
    { id: 8, full_name: "Luis Gil", hospital_id: "H-8" },
  ]);
});

describe("«Auditoría» con el API fallando", () => {
  it("muestra su propio error, no «vacía», y «Reintentar» vuelve a llamar", async () => {
    auditBlocks.mockRejectedValueOnce(Object.assign(new Error("Sin conexión con el servidor"),
      { status: 0, fromServer: false }));
    render(<AuditTrail onBack={() => {}} />);

    expect(await screen.findByText("No se pudo leer la cadena: Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/vacía/)).toBeNull();

    auditBlocks.mockResolvedValueOnce([bloque({ id: 0, username: "", action: "GENESIS" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Inicio de la cadena")).toBeTruthy();
    expect(auditBlocks).toHaveBeenCalledTimes(2);
  });

  it("mientras carga no dice que la cadena está vacía", () => {
    auditBlocks.mockReturnValueOnce(new Promise(() => {}));
    render(<AuditTrail onBack={() => {}} />);
    expect(screen.getByText("Cargando…")).toBeTruthy();
    expect(screen.queryByText(/vacía/)).toBeNull();
  });
});

describe("la columna de hora (F1-101)", () => {
  it("la celda muestra la hora local y la UTC va en el tooltip", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    const celda = await screen.findByText(fechaHora("2026-10-11T03:01:00Z"));
    expect(celda.getAttribute("title")).toBe("UTC: 2026-10-11T03:01:00Z");
    expect(screen.getByText("Fecha y hora")).toBeTruthy();
  });
});

describe("F2 (16)", () => {
  it("título sin «SkullChain» y «Exportar» visible antes de verificar", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    const { container } = render(<AuditTrail onBack={() => {}} />);
    expect(await screen.findByText("Registro de auditoría")).toBeTruthy();
    expect(screen.getByText("Cadena de bloques con firma; alterar un bloque invalida todos los siguientes.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/SkullChain|SHA-256/);
    const link = screen.getByRole("link", { name: /Exportar/ });
    expect(link.getAttribute("href")).toBe("/api/audit/export");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("el filtro «Paciente» llama al cliente con el id y muestra su nombre", async () => {
    auditBlocks.mockResolvedValue([bloque({ patient_hash: "deadbeef" })]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión");
    const sel = await screen.findByLabelText("Paciente");
    await screen.findByRole("option", { name: "Ana Pérez · H-7" });
    fireEvent.change(sel, { target: { value: "7" } });
    await waitFor(() => expect(auditBlocks).toHaveBeenLastCalledWith({ patientId: 7 }));
    expect((await screen.findAllByText("Ana Pérez")).length).toBeGreaterThan(0);
  });

  it("con el filtro activo, un bloque sin huella muestra «—» y no el nombre", async () => {
    auditBlocks.mockResolvedValue([bloque({ patient_hash: "" })]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión");
    await screen.findByRole("option", { name: "Ana Pérez · H-7" });
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "7" } });
    await waitFor(() => expect(auditBlocks).toHaveBeenLastCalledWith({ patientId: 7 }));
    await screen.findByText("Inicio de sesión");
    expect(screen.queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByText("—", { selector: "td" })).toBeTruthy();
  });

  it("un 404 del servidor muestra su detalle", async () => {
    auditBlocks.mockResolvedValueOnce([bloque()]);
    render(<AuditTrail onBack={() => {}} />);
    await screen.findByText("Inicio de sesión");
    await screen.findByRole("option", { name: "Luis Gil · H-8" });
    auditBlocks.mockRejectedValueOnce(Object.assign(new Error("Paciente no encontrado."), { status: 404, fromServer: true }));
    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "8" } });
    expect(await screen.findByText(/Paciente no encontrado\./)).toBeTruthy();
  });

  it("la fila se despliega con el detalle y los hashes; la columna «Hash bloque» no existe", async () => {
    auditBlocks.mockResolvedValueOnce([bloque({
      action: "TREATMENT_DECISION", payload_json: JSON.stringify({ decision: "clipaje", clips: [1, 2] }),
    })]);
    render(<AuditTrail onBack={() => {}} />);
    const fila = await screen.findByRole("button", { name: /Decisión de tratamiento/ });
    expect(fila.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Hash bloque")).toBeNull();
    expect(screen.queryByText("abcdef0123456789abcdef")).toBeNull();
    fireEvent.click(fila);
    expect(fila.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("decision")).toBeTruthy();
    expect(screen.getByText("clipaje")).toBeTruthy();
    expect(screen.getByText("1, 2")).toBeTruthy();
    expect(screen.getByText("Hash anterior")).toBeTruthy();
    expect(screen.getByText("abcdef0123456789abcdef")).toBeTruthy();
    expect(screen.getByText("0011223344")).toBeTruthy();
  });

  it("muestra el rótulo en castellano y conserva el código", async () => {
    auditBlocks.mockResolvedValueOnce([bloque({ action: "password_change" })]);
    render(<AuditTrail onBack={() => {}} />);
    expect(await screen.findByText("Cambio de contraseña")).toBeTruthy();
    expect(screen.getByText("password_change")).toBeTruthy();
  });
});
