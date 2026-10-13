/* «Solicitudes» con el API fallando (F1-92).

   Con el servidor caído salían la marca verde y «No hay solicitudes
   pendientes»: el administrador creía no tener nada que revisar. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listPending = vi.fn();
const rejectPending = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listPending: () => listPending(),
    rejectPending: (id: number) => rejectPending(id),
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

beforeEach(() => { listPending.mockReset(); rejectPending.mockReset().mockResolvedValue(undefined); });

describe("«Solicitudes» con el API fallando", () => {
  it("muestra el error sin la marca verde ni el vacío, y «Reintentar» vuelve a llamar", async () => {
    listPending.mockRejectedValueOnce(Object.assign(new Error("El servidor no responde"),
      { status: 0, fromServer: false }));
    render(<PendingRequests />);

    expect(await screen.findByText("El servidor no responde")).toBeTruthy();
    expect(screen.queryByText("No hay solicitudes pendientes.")).toBeNull();
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
    expect(await screen.findByText("No hay solicitudes pendientes.")).toBeTruthy();
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
