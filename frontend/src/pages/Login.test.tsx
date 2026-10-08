/* Qué le dice el formulario de entrada a quien no consigue entrar.

   Hasta octubre de 2026 solo el 401 y el 403 tenían mensaje propio; cualquier
   otro error del servidor (un 429 por demasiados intentos, un 422 por una
   contraseña demasiado corta, un 500) se anunciaba como «¿Está el backend en
   marcha?». El servidor estaba en marcha: era él quien contestaba. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { login, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
    }
  }
  return { login: vi.fn(), ApiError };
});

vi.mock("../api/client", () => ({ ApiError }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ login }) }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => null }));

import { Login } from "./Login";

const CONNECTIVITY = /¿Está el backend en marcha\?/;

async function attempt(failure: unknown): Promise<void> {
  login.mockRejectedValueOnce(failure);
  render(
    <MemoryRouter>
      <Login onLogin={() => {}} onSignup={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "ab" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByRole("button", { name: "Entrar" });
}

beforeEach(() => login.mockReset());

describe("el aviso bajo la contraseña", () => {
  it("un 401 sigue siendo «Credenciales incorrectas»", async () => {
    await attempt(new ApiError(401, "Credenciales incorrectas"));
    expect(await screen.findByText("Credenciales incorrectas")).toBeInTheDocument();
  });

  it("repite lo que dijo el servidor cuando el error no es de credenciales", async () => {
    // 422: la contraseña no llega al mínimo. El servidor lo explica; antes
    // se tapaba con el aviso de conexión.
    await attempt(new ApiError(422, "La contraseña debe tener al menos 6 caracteres."));
    expect(await screen.findByText("La contraseña debe tener al menos 6 caracteres.")).toBeInTheDocument();
    expect(screen.queryByText(CONNECTIVITY)).toBeNull();
  });

  it("si el servidor contestó sin explicación, dice el código y no inventa una", async () => {
    // Un proxy delante que corta con un 429 en HTML: el cliente solo sabe el
    // código. «Error 429» a secas no le dice nada a un médico.
    await attempt(new ApiError(429, "Error 429"));
    expect(await screen.findByText(/El servidor respondió con el error 429/)).toBeInTheDocument();
  });

  it("solo habla de conexión cuando de verdad no hubo respuesta", async () => {
    await attempt(new TypeError("Failed to fetch"));
    expect(await screen.findByText(CONNECTIVITY)).toBeInTheDocument();
  });
});
