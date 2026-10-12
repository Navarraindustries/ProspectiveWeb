/* Los tres estados de una lista que se carga (familia A de la auditoría).

   Las pantallas de gestión trataban un fallo al cargar como una lista vacía:
   con el servidor caído, «Pacientes» decía «0 registros» y «No hay pacientes
   registrados», y la persona creía haber perdido los datos. */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LoadState, loadErrorText } from "./LoadState";

class FakeApiError extends Error {
  status: number;
  fromServer: boolean;
  constructor(status: number, detail: string, fromServer = status !== 0) {
    super(detail);
    this.status = status;
    this.fromServer = fromServer;
  }
}

describe("LoadState", () => {
  it("mientras carga dice «Cargando…»", () => {
    render(<LoadState state="cargando" />);
    expect(screen.getByText("Cargando…")).toBeTruthy();
  });

  it("con error muestra el mensaje y «Reintentar» vuelve a llamar", () => {
    const retry = vi.fn();
    render(<LoadState state="error" mensaje="No autorizado." onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("No autorizado.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("vacío muestra el texto que se le pasa, sin botón", () => {
    render(<LoadState state="vacio" mensaje="No hay talleres." />);
    expect(screen.getByText("No hay talleres.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("loadErrorText", () => {
  it("usa el detalle del servidor cuando contestó", () => {
    expect(loadErrorText(new FakeApiError(500, "La base de datos está bloqueada"))).toBe(
      "La base de datos está bloqueada");
  });
  it("sin conexión da el texto de conexión, no «Failed to fetch»", () => {
    expect(loadErrorText(new FakeApiError(0, "Sin conexión con el servidor"))).toBe(
      "Sin conexión con el servidor");
    expect(loadErrorText(new TypeError("Failed to fetch"))).toBe("Sin conexión con el servidor");
  });
  it("el 500 vacío del proxy dice que el servidor no responde, no «Error 500»", () => {
    expect(loadErrorText(new FakeApiError(500, "Error 500", false))).toBe("El servidor no responde");
  });
  it("algo que no es un error da un texto genérico en castellano", () => {
    expect(loadErrorText(undefined)).toBe("No se pudo cargar");
  });
});
