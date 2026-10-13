/* «Compartir con…» (F2-75, spec §6.1): la hoja que elige con qué cuentas se
   comparte un paciente. Guarda la lista ENTERA (PUT sustituye a la anterior). */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const usersBrief = vi.fn();
const setPatientShares = vi.fn();
const user = { id: 1, role: "medico" };

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  }
  return {
    ApiError,
    api: {
      usersBrief: () => usersBrief(),
      setPatientShares: (id: number, ids: number[]) => setPatientShares(id, ids),
    },
  };
});
vi.mock("../store/auth", () => ({ useAuth: () => ({ user }) }));

import { ApiError } from "../api/client";
import { ShareSheet } from "./ShareSheet";

const CUENTAS = [
  { id: 1, username: "yo", full_name: "Yo Mismo", role: "medico" },
  { id: 2, username: "admin", full_name: "Administración", role: "admin" },
  { id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente" },
  { id: 4, username: "luis", full_name: "Luis Pérez", role: "medico" },
];

const onSaved = vi.fn();
const onClose = vi.fn();
const abrir = (current: number[] = [4]) =>
  render(<ShareSheet open patientId={7} patientName="Segura, Juan" current={current} onClose={onClose} onSaved={onSaved} />);

beforeEach(() => {
  usersBrief.mockReset().mockResolvedValue(CUENTAS);
  setPatientShares.mockReset();
  onSaved.mockReset();
  onClose.mockReset();
});

describe("ShareSheet", () => {
  it("lista las cuentas sin la propia ni la administración, con las ya compartidas marcadas", async () => {
    abrir();
    const ana = await screen.findByRole("checkbox", { name: /Ana Ruiz/ });
    expect((ana as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: /Luis Pérez/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: /Yo Mismo/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Administración/ })).toBeNull();
    // El rol se lee con su nombre, no con la clave del servidor.
    expect(screen.getByText(/Residente/)).toBeTruthy();
  });

  it("la búsqueda filtra por nombre o usuario, sin distinguir mayúsculas ni tildes", async () => {
    abrir();
    await screen.findByRole("checkbox", { name: /Ana Ruiz/ });
    const buscar = screen.getByLabelText("Buscar cuenta");
    fireEvent.change(buscar, { target: { value: "PEREZ" } });
    expect(screen.queryByRole("checkbox", { name: /Ana Ruiz/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Luis Pérez/ })).toBeTruthy();
    fireEvent.change(buscar, { target: { value: "zzz" } });
    expect(screen.getByText("Ninguna cuenta coincide con la búsqueda.")).toBeTruthy();
  });

  it("marcar y desmarcar cambia lo que se guarda: la lista entera", async () => {
    const vuelta = [{ user_id: 3, username: "ana", full_name: "Ana Ruiz", role: "residente", shared_at: "2026-10-13T10:00:00" }];
    setPatientShares.mockResolvedValue(vuelta);
    abrir();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Ana Ruiz/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Luis Pérez/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(setPatientShares).toHaveBeenCalledWith(7, [3]));
    expect(onSaved).toHaveBeenCalledWith(vuelta);
  });

  it("un 403 del servidor se muestra con su texto", async () => {
    setPatientShares.mockRejectedValue(new ApiError(403, "Solo quien creó al paciente o un administrador puede compartirlo."));
    abrir();
    await screen.findByRole("checkbox", { name: /Ana Ruiz/ });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Solo quien creó al paciente o un administrador puede compartirlo.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
