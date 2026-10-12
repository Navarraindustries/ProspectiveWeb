/* «Crear cuenta» sin servidor (F1-50).

   El aviso decía «No se pudo enviar la solicitud. ¿Está el backend en
   marcha?», y desde que el cliente lanza ApiError 0 ni siquiera eso: salía
   «Sin conexión con el servidor» a secas. Ahora es el mismo texto que «Entrar». */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { signup, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    fromServer: boolean;
    constructor(status: number, detail: string, fromServer = status !== 0) {
      super(detail); this.status = status; this.fromServer = fromServer;
    }
  }
  return { signup: vi.fn(), ApiError };
});

vi.mock("../api/client", () => ({ api: { signup: (...a: unknown[]) => signup(...a) }, ApiError }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("../store/theme", () => ({ useThemeContext: () => ({ theme: "light" }) }));

import { Signup } from "./Signup";

const CONNECTIVITY = "El servidor no responde. Avisa al responsable de la instalación.";

async function enviar(failure: unknown) {
  signup.mockRejectedValueOnce(failure);
  render(
    <MemoryRouter>
      <Signup onBack={() => {}} onDone={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Nombre completo *"), { target: { value: "María Restrepo" } });
  fireEvent.change(screen.getByLabelText("Usuario *"), { target: { value: "mrestrepo" } });
  fireEvent.change(screen.getByLabelText("Contraseña *"), { target: { value: "una-mucho-mejor" } });
  fireEvent.change(screen.getByLabelText("Confirmar *"), { target: { value: "una-mucho-mejor" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud de registro" }));
}

beforeEach(() => signup.mockReset());

describe("el aviso de «Crear cuenta»", () => {
  it("un fallo de red muestra el texto nuevo, sin «backend»", async () => {
    await enviar(new ApiError(0, "Sin conexión con el servidor"));
    expect(await screen.findByText(CONNECTIVITY)).toBeInTheDocument();
    expect(screen.queryByText(/backend/)).toBeNull();
  });

  it("si el servidor contestó, repite su explicación", async () => {
    await enviar(new ApiError(409, "Ese usuario ya existe."));
    expect(await screen.findByText("Ese usuario ya existe.")).toBeInTheDocument();
    expect(screen.queryByText(CONNECTIVITY)).toBeNull();
  });
});

describe("la nota de cuenta pendiente (F1-48)", () => {
  it("dice que no habrá aviso y a quién escribir", () => {
    render(<MemoryRouter><Signup onBack={() => {}} onDone={() => {}} /></MemoryRouter>);
    expect(screen.getByText(/No recibirás aviso: prueba a entrar más adelante o escribe a/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ingprospective@skullapp.tech" })).toBeInTheDocument();
  });
});
