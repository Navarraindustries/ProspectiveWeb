/* F1-26: tras reanudar, el servidor cayó y la app no dijo nada; cada panel
   fallaba por su lado. La banda aparece cuando el cliente avisa de dos fallos
   de conexión seguidos, y «Reintentar» repite la última llamada fallida. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, retryLastFailed } = vi.hoisted(() => ({
  listeners: new Set<(down: boolean) => void>(),
  retryLastFailed: vi.fn(),
}));
vi.mock("../api/client", () => ({
  onServerDown: (cb: (down: boolean) => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  retryLastFailed: () => retryLastFailed(),
}));

import { SERVER_DOWN_TEXT, ServerDownBanner } from "./ServerDownBanner";

const avisar = (down: boolean) => act(() => { for (const cb of listeners) cb(down); });

beforeEach(() => {
  listeners.clear();
  retryLastFailed.mockReset().mockResolvedValue("replayed");
});

describe("ServerDownBanner", () => {
  it("no se ve mientras el servidor responde", () => {
    render(<ServerDownBanner />);
    expect(screen.queryByText(SERVER_DOWN_TEXT)).toBeNull();
  });

  it("con el aviso del cliente dice el texto del anexo y ofrece «Reintentar»", () => {
    render(<ServerDownBanner />);
    avisar(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El servidor no responde. Tu sesión sigue en disco: reinícialo y pulsa «Reintentar»");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("«Reintentar» repite la última llamada fallida", async () => {
    render(<ServerDownBanner />);
    avisar(true);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(retryLastFailed).toHaveBeenCalledTimes(1));
  });

  it("se retira cuando el servidor vuelve a responder", () => {
    render(<ServerDownBanner />);
    avisar(true);
    avisar(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si lo que falló era una escritura, no se repite: se avisa de que el servidor volvió", async () => {
    retryLastFailed.mockImplementation(async () => { avisar(false); return "probed"; });
    render(<ServerDownBanner />);
    avisar(true);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("El servidor responde de nuevo; repite la acción que falló")).toBeInTheDocument();
  });
});
