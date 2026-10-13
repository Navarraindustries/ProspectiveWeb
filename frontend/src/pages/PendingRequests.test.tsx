/* «Solicitudes» con el API fallando (F1-92).

   Con el servidor caído salían la marca verde y «No hay solicitudes
   pendientes»: el administrador creía no tener nada que revisar. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listPending = vi.fn();
const rejectPending = vi.fn();
const approvePending = vi.fn();
const listUsers = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listPending: () => listPending(),
    rejectPending: (id: number) => rejectPending(id),
    approvePending: (id: number) => approvePending(id),
    listUsers: (st?: string) => listUsers(st),
    pendingPhotoObjectUrl: () => Promise.reject(new Error("sin foto")),
  },
  ApiError: class ApiError extends Error {},
}));
// El shell (barra lateral y superior) se sustituye por su contenido y sus
// acciones: lo que se prueba aquí es la página.
vi.mock("../components/shell/AppShell", () => ({
  AppShell: (p: { actions?: import("react").ReactNode; children?: import("react").ReactNode }) => <>{p.actions}{p.children}</>,
}));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { PendingRequests } from "./PendingRequests";
import { fechaHora } from "../lib/fecha";

beforeEach(() => {
  listPending.mockReset();
  rejectPending.mockReset().mockResolvedValue(undefined);
  approvePending.mockReset().mockResolvedValue(undefined);
  listUsers.mockReset().mockResolvedValue([]);
});

const solicitud = { id: 5, username: "nuevo", full_name: "Nuevo Residente", has_photo: false, has_cv: false, created_at: "2026-10-01T00:00:00Z" };

describe("«Solicitudes» con el API fallando", () => {
  it("muestra el error sin la marca verde ni el vacío, y «Reintentar» vuelve a llamar", async () => {
    listPending.mockRejectedValueOnce(Object.assign(new Error("El servidor no responde"),
      { status: 0, fromServer: false }));
    render(<PendingRequests />);

    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText("No hay cuentas pendientes.")).toBeNull();
    expect(screen.queryByText(/0 pendientes/)).toBeNull();

    listPending.mockResolvedValueOnce([{
      id: 5, username: "nuevo", full_name: "Nuevo Residente", has_photo: false, has_cv: false,
      created_at: "2026-10-01T00:00:00Z",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Nuevo Residente")).toBeTruthy();
    expect(listPending).toHaveBeenCalledTimes(2);
  });

  it("sin solicitudes y sin error sigue mostrando el vacío", async () => {
    listPending.mockResolvedValueOnce([]);
    render(<PendingRequests />);
    expect(await screen.findByText("No hay cuentas pendientes.")).toBeTruthy();
  });
});

/* F1-91: «Rechazar» echaba la solicitud al primer clic, al lado de «Aprobar». */
describe("«Rechazar» una solicitud", () => {
  it("abre la confirmación y no rechaza hasta confirmar", async () => {
    listPending.mockResolvedValue([{
      id: 5, username: "nuevo", full_name: "Nuevo Residente", has_photo: false, has_cv: false,
      created_at: "2026-10-01T00:00:00Z",
    }]);
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Rechazar la solicitud?" });
    expect(dialogo.textContent).toContain("Nuevo Residente");
    expect(rejectPending).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    await vi.waitFor(() => expect(rejectPending).toHaveBeenCalledWith(5));
    await vi.waitFor(() => expect(screen.queryByText("Nuevo Residente")).toBeNull());
  });
});

/* F2-51: lo que se aprueba o se rechaza ya no desaparece sin historial. */
describe("pestañas «Pendientes · Aprobadas · Rechazadas» (F2-51)", () => {
  it("hay tres pestañas y arranca en Pendientes", async () => {
    listPending.mockResolvedValue([solicitud]);
    render(<PendingRequests />);
    for (const t of ["Pendientes", "Aprobadas", "Rechazadas"]) expect(screen.getByRole("button", { name: t })).toBeTruthy();
    expect(await screen.findByText("Nuevo Residente")).toBeTruthy();
    expect(screen.getByText("1 pendiente de aprobación")).toBeTruthy();
  });

  it("cada pestaña vacía dice lo suyo", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests />);
    expect(await screen.findByText("No hay cuentas pendientes.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aprobadas" }));
    expect(await screen.findByText("Ninguna cuenta aprobada todavía.")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledWith("approved");
    fireEvent.click(screen.getByRole("button", { name: "Rechazadas" }));
    expect(await screen.findByText("Ninguna cuenta rechazada.")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledWith("rejected");
  });

  it("«Rechazadas» muestra cuándo se rechazó, en hora local", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockImplementation((st: string) => Promise.resolve(st === "rejected" ? [{
      id: 9, username: "rech", full_name: "Rita Rechazada", role: "medico", status: "rejected", is_active: false,
      specialty: "", hospital: "", created_at: "2026-10-01T00:00:00+00:00", rejected_at: "2026-10-03T15:30:00+00:00",
    }] : []));
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazadas" }));
    expect(await screen.findByText("Rita Rechazada")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Rechazada: ${fechaHora("2026-10-03T15:30:00+00:00")}`))).toBeTruthy();
  });

  it("«Aprobadas» deja fuera a los administradores y avisa de lo que no distingue", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockResolvedValue([
      { id: 1, username: "admin", full_name: "Admin", role: "admin", status: "active", is_active: true, specialty: "", hospital: "", created_at: "2026-09-01T00:00:00+00:00", rejected_at: null },
      { id: 8, username: "apro", full_name: "Aitor Aprobado", role: "medico", status: "active", is_active: true, specialty: "", hospital: "", created_at: "2026-10-02T09:00:00+00:00", rejected_at: null },
    ]);
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobadas" }));
    expect(await screen.findByText("Aitor Aprobado")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
    expect(screen.getByText(/no distingue/)).toBeTruthy();
  });

  it("falla la carga de una pestaña: error y «Reintentar», sin el vacío", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockRejectedValueOnce(Object.assign(new Error("El servidor no responde"), { status: 0, fromServer: false }));
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazadas" }));
    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText("Ninguna cuenta rechazada.")).toBeNull();
  });
});

/* F1-90 */
describe("«Aprobar» (F1-90)", () => {
  it("la tarjeta dice con qué rol entra la cuenta", async () => {
    listPending.mockResolvedValue([solicitud]);
    render(<PendingRequests />);
    expect(await screen.findByText("Entrará como Médico; cambia el rol en Usuarios.")).toBeTruthy();
  });
});

/* La insignia de la barra lateral se pone al día sin esperar su minuto. */
describe("aviso a la barra lateral", () => {
  const avisos = () => { const f = vi.fn(); window.addEventListener("prospective:pending-changed", f); return f; };

  it("aprobar lanza «prospective:pending-changed»", async () => {
    listPending.mockResolvedValue([solicitud]);
    const f = avisos();
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(approvePending).toHaveBeenCalledWith(5));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    window.removeEventListener("prospective:pending-changed", f);
  });

  it("rechazar lanza «prospective:pending-changed»", async () => {
    listPending.mockResolvedValue([solicitud]);
    const f = avisos();
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    window.removeEventListener("prospective:pending-changed", f);
  });

  it("si el servidor falla no avisa", async () => {
    listPending.mockResolvedValue([solicitud]);
    approvePending.mockRejectedValueOnce(new Error("boom"));
    const f = avisos();
    render(<PendingRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await screen.findByText("boom");
    expect(f).not.toHaveBeenCalled();
    window.removeEventListener("prospective:pending-changed", f);
  });
});
