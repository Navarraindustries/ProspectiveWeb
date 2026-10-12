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
    data?: unknown;
    constructor(status: number, detail: string, _fromServer?: boolean, data?: unknown) {
      super(detail);
      this.status = status;
      this.data = data;
    }
  }
  return { login: vi.fn(), ApiError };
});

vi.mock("../api/client", () => ({ ApiError }));
vi.mock("../store/auth", () => ({ useAuth: () => ({ login }) }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => null }));

import { Login } from "./Login";

// F1-41: el aviso de conexión ya no habla de «backend».
const CONNECTIVITY = "El servidor no responde. Avisa al responsable de la instalación.";

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
    expect(screen.queryByText(/backend/)).toBeNull();
  });

  it("el fallo de red del cliente (ApiError 0) da el texto nuevo, sin «backend»", async () => {
    // Desde la Tarea 6 el cliente lanza ApiError(0) y no TypeError: antes de
    // este arreglo se veía «Sin conexión con el servidor» a secas.
    await attempt(new ApiError(0, "Sin conexión con el servidor"));
    expect(await screen.findByText(CONNECTIVITY)).toBeInTheDocument();
  });

  it("el 500 vacío del proxy con el servidor caído tampoco es «el servidor respondió»", async () => {
    await attempt(Object.assign(new ApiError(500, "Error 500"), { fromServer: false }));
    expect(await screen.findByText(CONNECTIVITY)).toBeInTheDocument();
    expect(screen.queryByText(/respondió/)).toBeNull();
  });
});

describe("contacto del administrador y último intento", () => {
  it("con un intento restante avisa del bloqueo temporal (F1-40)", async () => {
    await attempt(new ApiError(401, "Credenciales incorrectas", true, { message: "Credenciales incorrectas", remaining_attempts: 1 }));
    expect(await screen.findByText("Credenciales incorrectas. Te queda un intento antes del bloqueo temporal.")).toBeInTheDocument();
  });

  it("con más intentos restantes no asusta", async () => {
    await attempt(new ApiError(401, "Credenciales incorrectas", true, { message: "Credenciales incorrectas", remaining_attempts: 3 }));
    expect(await screen.findByText("Credenciales incorrectas")).toBeInTheDocument();
  });

  it("la pantalla dice a quién escribir si se olvidó la contraseña (F1-1)", () => {
    render(<MemoryRouter><Login onLogin={() => {}} onSignup={() => {}} /></MemoryRouter>);
    expect(screen.getByText(/¿Olvidaste la contraseña\? Un administrador puede restablecerla/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ingprospective@skullapp.tech" })).toHaveAttribute("href", "mailto:ingprospective@skullapp.tech");
  });

  it("los tres avisos de cuenta bloqueada se ven completos con el correo (F1-42)", async () => {
    const textos = [
      "Tu cuenta está pendiente de aprobación. Un administrador debe activarla antes de que puedas iniciar sesión. Para consultas, escribe a ingprospective@skullapp.tech.",
      "Tu solicitud de registro fue rechazada. Para consultas, escribe a ingprospective@skullapp.tech.",
      "Cuenta desactivada. Para consultas, escribe a ingprospective@skullapp.tech.",
    ];
    for (const t of textos) {
      const { unmount } = render(<MemoryRouter><Login onLogin={() => {}} onSignup={() => {}} /></MemoryRouter>);
      login.mockRejectedValueOnce(new ApiError(403, t));
      fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "ab" } });
      fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "12345" } });
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
      expect(await screen.findByText(t)).toBeInTheDocument();
      unmount();
    }
  });

  it("tras la solicitud, el aviso dice que nadie avisará (F1-43)", () => {
    const aviso = "Solicitud enviada. Un administrador la revisará; no recibirás aviso, así que vuelve a intentar entrar más adelante. Para consultas, ingprospective@skullapp.tech.";
    render(<MemoryRouter><Login onLogin={() => {}} onSignup={() => {}} notice={aviso} /></MemoryRouter>);
    expect(screen.getByText(/no recibirás aviso/)).toBeInTheDocument();
  });
});
