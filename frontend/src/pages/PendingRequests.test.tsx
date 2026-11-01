/* «Solicitudes» con el API fallando (F1-92).

   Con el servidor caído salían la marca verde y «No hay solicitudes
   pendientes»: el administrador creía no tener nada que revisar. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
vi.mock("../components/shell/AppShell", async () => ({ AppShell: (await import("../test/shellMock")).ShellMock }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));
// La página es solo de administradores; quien no lo es ve la tarjeta (AdminOnly.test).
vi.mock("../store/auth", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));

import { PendingRequests } from "./PendingRequests";
import { fechaHora } from "../lib/fecha";
import { simularPantalla } from "../test/pantalla";

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
    render(<PendingRequests onBack={() => {}} />);

    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText("No hay cuentas pendientes")).toBeNull();
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
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("No hay cuentas pendientes")).toBeTruthy();
  });
});

/* F1-91: «Rechazar» echaba la solicitud al primer clic, al lado de «Aprobar». */
describe("«Rechazar» una solicitud", () => {
  it("abre la confirmación y no rechaza hasta confirmar", async () => {
    listPending.mockResolvedValue([{
      id: 5, username: "nuevo", full_name: "Nuevo Residente", has_photo: false, has_cv: false,
      created_at: "2026-10-01T00:00:00Z",
    }]);
    render(<PendingRequests onBack={() => {}} />);
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
    render(<PendingRequests onBack={() => {}} />);
    for (const t of ["Pendientes", "Aprobadas", "Rechazadas"]) expect(screen.getByRole("tab", { name: t })).toBeTruthy();
    expect(await screen.findByText("Nuevo Residente")).toBeTruthy();
    // El recuento es el subtítulo de la barra.
    expect(within(screen.getByRole("banner")).getByText("1 pendiente de aprobación")).toBeTruthy();
  });

  it("cada pestaña vacía dice lo suyo", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("No hay cuentas pendientes")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Aprobadas" }));
    expect(await screen.findByText("Ninguna cuenta aprobada todavía.")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledWith("approved");
    fireEvent.click(screen.getByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText("Ninguna cuenta rechazada.")).toBeTruthy();
    expect(listUsers).toHaveBeenCalledWith("rejected");
  });

  it("«Rechazadas» muestra cuándo se rechazó, en hora local", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockImplementation((st: string) => Promise.resolve(st === "rejected" ? [{
      id: 9, username: "rech", full_name: "Rita Rechazada", role: "medico", status: "rejected", is_active: false,
      specialty: "", hospital: "", created_at: "2026-10-01T00:00:00+00:00", rejected_at: "2026-10-03T15:30:00+00:00",
    }] : []));
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText("Rita Rechazada")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Rechazada: ${fechaHora("2026-10-03T15:30:00+00:00")}`))).toBeTruthy();
  });

  it("«Aprobadas» deja fuera a los administradores y lleva su nota (A56)", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockResolvedValue([
      { id: 1, username: "admin", full_name: "Admin", role: "admin", status: "active", is_active: true, specialty: "", hospital: "", created_at: "2026-09-01T00:00:00+00:00", rejected_at: null },
      { id: 8, username: "apro", full_name: "Aitor Aprobado", role: "medico", status: "active", is_active: true, specialty: "", hospital: "", created_at: "2026-10-02T09:00:00+00:00", rejected_at: null },
    ]);
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Aprobadas" }));
    expect(await screen.findByText("Aitor Aprobado")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
    expect(screen.getByText("Cuentas activas con acceso médico.")).toBeTruthy();
    expect(screen.queryByText(/El servidor no distingue/)).toBeNull();
  });

  it("falla la carga de una pestaña: error y «Reintentar», sin el vacío", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockRejectedValueOnce(Object.assign(new Error("El servidor no responde"), { status: 0, fromServer: false }));
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText("Ninguna cuenta rechazada.")).toBeNull();
  });
});

/* F1-90 */
describe("«Aprobar» (F1-90)", () => {
  it("la tarjeta dice con qué rol entra la cuenta", async () => {
    listPending.mockResolvedValue([solicitud]);
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("Entrará como Médico; cambia el rol en Usuarios.")).toBeTruthy();
  });
});

/* La insignia de la barra lateral se pone al día sin esperar su minuto. */
describe("aviso a la barra lateral", () => {
  const avisos = () => { const f = vi.fn(); window.addEventListener("prospective:pending-changed", f); return f; };

  it("aprobar lanza «prospective:pending-changed»", async () => {
    listPending.mockResolvedValue([solicitud]);
    const f = avisos();
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(approvePending).toHaveBeenCalledWith(5));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    window.removeEventListener("prospective:pending-changed", f);
  });

  it("rechazar lanza «prospective:pending-changed»", async () => {
    listPending.mockResolvedValue([solicitud]);
    const f = avisos();
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    window.removeEventListener("prospective:pending-changed", f);
  });

  it("si el servidor falla no avisa", async () => {
    listPending.mockResolvedValue([solicitud]);
    approvePending.mockRejectedValueOnce(new Error("boom"));
    const f = avisos();
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await screen.findByText("boom");
    expect(f).not.toHaveBeenCalled();
    window.removeEventListener("prospective:pending-changed", f);
  });
});

describe("«Rechazadas» (nota)", () => {
  it("avisa de que las rechazadas antes de esta versión no se listan", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Rechazadas" }));
    // Con lista vacía sale el vacío; con filas, la nota.
    listUsers.mockResolvedValue([{ id: 9, username: "r", full_name: "R R", role: "medico", status: "rejected", is_active: false, specialty: "", hospital: "", created_at: "2026-10-01T00:00:00+00:00", rejected_at: "2026-10-03T15:30:00+00:00" }]);
    fireEvent.click(screen.getByRole("tab", { name: "Pendientes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText(/las anteriores no tenían fecha/)).toBeTruthy();
  });

  it("la nota también sale con la lista vacía", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText("Ninguna cuenta rechazada.")).toBeTruthy();
    expect(screen.getByText(/las anteriores no tenían fecha/)).toBeTruthy();
  });

  it("la respuesta tardía de la pestaña anterior no pinta la actual", async () => {
    listPending.mockResolvedValue([]);
    let soltar: (v: unknown[]) => void = () => {};
    listUsers.mockImplementation((st: string) =>
      st === "approved" ? new Promise((r) => { soltar = r; }) : Promise.resolve([]));
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Aprobadas" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rechazadas" }));
    expect(await screen.findByText("Ninguna cuenta rechazada.")).toBeTruthy();
    soltar([{ id: 5, username: "tarde", full_name: "Cuenta Tardía", role: "medico", status: "approved", is_active: true, specialty: "", hospital: "", created_at: "2026-10-01T00:00:00+00:00", rejected_at: null }]);
    await Promise.resolve();
    expect(screen.queryByText("Cuenta Tardía")).toBeNull();
    expect(screen.getByText("Ninguna cuenta rechazada.")).toBeTruthy();
  });
});

describe("la cabecera de «Cuentas pendientes» en la oficina", () => {
  it("el título está en la miga y el subtítulo en la barra", async () => {
    listPending.mockResolvedValue([solicitud]);
    render(<PendingRequests onBack={() => {}} />);
    await screen.findByText("Nuevo Residente");
    const barra = within(screen.getByRole("banner"));
    expect(barra.getByText("1 pendiente de aprobación")).toBeInTheDocument();
    // «Actualizar» es un botón de icono junto a las pestañas, solo en Pendientes (A57).
    expect(barra.queryByRole("button", { name: "Actualizar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Actualizar la lista" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Cuentas pendientes")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Aprobadas" }));
    await screen.findByText("Ninguna cuenta aprobada todavía.");
    expect(within(screen.getByRole("banner")).getByText("Cuentas que ya pueden entrar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar la lista" })).toBeNull();
  });
});

describe("cristal (fase 2)", () => {
  it("la solicitud pendiente es un panel de cristal", async () => {
    listPending.mockResolvedValueOnce([solicitud]);
    render(<PendingRequests onBack={() => {}} />);
    const nombre = await screen.findByText("Nuevo Residente");
    expect(nombre.closest("[data-glass]")).not.toBeNull();
  });

  it("el historial de «Rechazadas» es una tabla en un panel denso", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockImplementation((st: string) => Promise.resolve(st === "rejected" ? [{
      id: 9, username: "rech", full_name: "Rita Rechazada", role: "medico", status: "rejected", is_active: false,
      specialty: "", hospital: "", created_at: "2026-10-01T00:00:00+00:00", rejected_at: "2026-10-03T15:30:00+00:00",
    }] : []));
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Rechazadas" }));
    const panel = (await screen.findByText("Rita Rechazada")).closest("[data-glass]");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("style")).toContain("--glass-dense");
  });
});

describe("Cuentas pendientes: estilo D (A56, A57)", () => {
  const aprobada = { id: 8, username: "apro", full_name: "Aitor Aprobado", role: "medico", status: "active", is_active: true, specialty: "Neurología", hospital: "", created_at: "2026-10-02T09:00:00+00:00", rejected_at: null };

  it("historial como tabla que pasa a tarjetas", async () => {
    listPending.mockResolvedValue([]);
    listUsers.mockResolvedValue([aprobada]);
    simularPantalla(1280);
    const { unmount } = render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Aprobadas" }));
    expect(await screen.findByRole("table", { name: "Cuentas aprobadas" })).toBeTruthy();
    unmount();
    simularPantalla(390);
    render(<PendingRequests onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Aprobadas" }));
    await screen.findByText("Aitor Aprobado");
    expect(document.querySelector('[data-vista="tarjetas"]')).not.toBeNull();
  });

  it("sin pendientes: estado vacío que explica qué pasará (A57)", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("No hay cuentas pendientes")).toBeTruthy();
    expect(screen.getByText(/Cuando alguien pida una cuenta desde «Crear cuenta»/)).toBeTruthy();
  });

  it("«Actualizar» es un botón de icono junto a las pestañas (A57)", async () => {
    listPending.mockResolvedValue([]);
    render(<PendingRequests onBack={() => {}} />);
    const b = await screen.findByRole("button", { name: "Actualizar la lista" });
    expect(b).toHaveAttribute("title", "Actualizar la lista");
    fireEvent.click(b);
    expect(listPending).toHaveBeenCalledTimes(2);
  });

  it("solicitud: tarjeta de cristal, CV como botón con icono y a ≤ 640 Aprobar/Rechazar debajo", async () => {
    simularPantalla(390);
    listPending.mockResolvedValue([{ ...solicitud, has_cv: true }]);
    render(<PendingRequests onBack={() => {}} />);
    const cv = await screen.findByRole("button", { name: "Descargar CV" });
    expect(cv).toHaveAttribute("data-variant", "outline");
    const tarjeta = cv.closest("article");
    expect(tarjeta).not.toBeNull();
    expect(tarjeta).toHaveAttribute("data-glass");
    const acciones = tarjeta!.querySelector("[data-acciones]") as HTMLElement;
    expect(acciones.style.flexDirection).toBe("row");
    expect(cv.compareDocumentPosition(acciones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
