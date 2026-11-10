/* Una dirección que no existe, o un fallo al pintar, dejan siempre una salida. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorDeRuta, NoEncontrado } from "./NoEncontrado";

// Ver App.ficha.test.tsx: el `Request` de Node rechaza la señal de jsdom.
const RequestNode = globalThis.Request;
globalThis.Request = class extends RequestNode {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init && { ...init, signal: undefined });
  }
} as typeof Request;

function Rota(): never {
  throw new Error("fallo al pintar");
}

function montar(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>portada</p> },
      { path: "/app/*", element: <p>aplicación</p> },
      { path: "/rota", element: <Rota />, errorElement: <ErrorDeRuta /> },
      { path: "*", element: <NoEncontrado /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => { vi.restoreAllMocks(); });

describe("NoEncontrado", () => {
  it("una dirección desconocida lo dice y ofrece la portada y la aplicación", async () => {
    const router = montar("/no-existe");
    expect(screen.getByRole("heading", { name: "Esta página no existe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Prospective" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
  });

  it("«Página principal» lleva a la portada", async () => {
    const router = montar("/no-existe");
    fireEvent.click(screen.getByRole("button", { name: "Página principal" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("ErrorDeRuta", () => {
  it("un fallo al pintar enseña un aviso con salida, no la pantalla del router", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    montar("/rota");
    expect(screen.getByRole("heading", { name: "Algo ha fallado en esta pantalla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recargar la página" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir a Pacientes" })).toBeTruthy();
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
  });
});
