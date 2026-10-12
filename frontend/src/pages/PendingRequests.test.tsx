/* «Solicitudes» con el API fallando (F1-92).

   Con el servidor caído salían la marca verde y «No hay solicitudes
   pendientes»: el administrador creía no tener nada que revisar. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const listPending = vi.fn();

vi.mock("../api/client", () => ({
  api: {
    listPending: () => listPending(),
    pendingPhotoObjectUrl: () => Promise.reject(new Error("sin foto")),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../components/Topbar", () => ({ Topbar: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { PendingRequests } from "./PendingRequests";

beforeEach(() => { listPending.mockReset(); });

describe("«Solicitudes» con el API fallando", () => {
  it("muestra el error sin la marca verde ni el vacío, y «Reintentar» vuelve a llamar", async () => {
    listPending.mockRejectedValueOnce(Object.assign(new Error("El servidor no responde"),
      { status: 0, fromServer: false }));
    render(<PendingRequests onBack={() => {}} />);

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
    render(<PendingRequests onBack={() => {}} />);
    expect(await screen.findByText("No hay solicitudes pendientes.")).toBeTruthy();
  });
});
