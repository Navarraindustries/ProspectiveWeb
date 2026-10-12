/* «Auditoría» con el API fallando (F1-103).

   La tabla decía «La cadena está vacía.» mientras cargaba y cuando el
   servidor fallaba: una cadena de auditoría vacía es una alarma. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const auditBlocks = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    auditBlocks: () => auditBlocks(),
    auditVerify: () => Promise.resolve({ ok: true, total_blocks: 0, broken: [] }),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", username: "admin" } }) }));

import { AuditTrail } from "./AuditTrail";
import { fechaHora } from "../lib/fecha";

beforeEach(() => { auditBlocks.mockReset(); });

describe("«Auditoría» con el API fallando", () => {
  it("muestra su propio error, no «vacía», y «Reintentar» vuelve a llamar", async () => {
    auditBlocks.mockRejectedValueOnce(Object.assign(new Error("Sin conexión con el servidor"),
      { status: 0, fromServer: false }));
    render(<AuditTrail onBack={() => {}} />);

    expect(await screen.findByText("No se pudo leer la cadena: Sin conexión con el servidor")).toBeTruthy();
    expect(screen.queryByText(/vacía/)).toBeNull();

    auditBlocks.mockResolvedValueOnce([{
      id: 0, iso_ts: "2026-10-01T00:00:00Z", username: "", action: "GENESIS",
      block_hash: "abcdef0123456789abcdef", prev_hash: "", payload: "",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/abcdef0123456789/)).toBeTruthy();
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
  it("el encabezado dice «(local)», la celda muestra la hora local y la UTC va en el tooltip", async () => {
    auditBlocks.mockResolvedValueOnce([{
      id: 1, iso_ts: "2026-10-11T03:01:00Z", username: "admin", action: "LOGIN",
      block_hash: "abcdef0123456789abcdef", prev_hash: "", payload: "",
    }]);
    render(<AuditTrail onBack={() => {}} />);
    const celda = await screen.findByText(fechaHora("2026-10-11T03:01:00Z"));
    expect(celda.getAttribute("title")).toBe("UTC: 2026-10-11T03:01:00Z");
    expect(screen.getByText("Fecha/Hora (local)")).toBeTruthy();
    expect(screen.queryByText(/\(UTC\)/)).toBeNull();
  });
});