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
  fireEvent.change(screen.getByLabelText("Usuario * (mín. 3)"), { target: { value: "mrestrepo" } });
  fireEvent.change(screen.getByLabelText("Contraseña * (mín. 8)"), { target: { value: "una-mucho-mejor" } });
  fireEvent.change(screen.getByLabelText("Repite la contraseña *"), { target: { value: "una-mucho-mejor" } });
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
    expect(screen.getByText(/No recibirás ningún aviso: vuelve a intentar entrar en unos días/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ingprospective@skullapp.tech" })).toBeInTheDocument();
  });
});

const montar = (extra: Partial<{ onBack: () => void; onDone: (m: string) => void }> = {}) =>
  render(<MemoryRouter><Signup onBack={() => {}} onDone={() => {}} {...extra} /></MemoryRouter>);
const escribir = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("rótulos y ayudas nuevos (F2-13…F2-17)", () => {
  it("«Volver a Entrar» es el único camino de vuelta (F2-13)", () => {
    const { container } = montar();
    expect(screen.getAllByRole("button", { name: /Volver a Entrar/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(container.textContent).not.toMatch(/login/i);
  });

  it("DNI / NIE, colegiado y ORCID dicen que son opcionales y para qué (F2-14, F2-15, F2-16)", () => {
    montar();
    expect(screen.getByLabelText("DNI / NIE (opcional)")).toBeInTheDocument();
    expect(screen.getByText("Solo si tu centro lo pide")).toBeInTheDocument();
    expect(screen.getByLabelText("Número de colegiado (opcional)")).toBeInTheDocument();
    const orcid = screen.getByLabelText("ORCID (opcional)");
    expect(orcid).toHaveAttribute("placeholder", "0000-0000-0000-0000");
    expect(screen.getByText("Identificador de investigador, si lo tienes")).toBeInTheDocument();
    expect(screen.queryByText(/Cédula/)).toBeNull();
  });

  it("repetir la contraseña lleva su rótulo (F2-17)", () => {
    montar();
    expect(screen.getByLabelText("Repite la contraseña *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirmar *")).toBeNull();
  });

  it("el título y los pies no repiten «profesional» ni «VTK» ni «Datos cifrados»", () => {
    const { container } = montar();
    expect(screen.getByText("Crear cuenta")).toBeInTheDocument();
    expect(screen.getByText("Tus datos")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/VTK|Datos cifrados|SKULLAPP/);
    expect(screen.getByText("Planificación neurovascular con datos")).toBeInTheDocument();
  });
});

describe("la validación sale junto a cada campo (F1-49)", () => {
  it("muestra todos los errores a la vez y marca cada campo", () => {
    montar();
    escribir("Usuario * (mín. 3)", "ab");
    escribir("Contraseña * (mín. 8)", "corta");
    escribir("Repite la contraseña *", "otra");
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud de registro" }));
    for (const [label, texto] of [
      ["Nombre completo *", "El nombre completo es obligatorio."],
      ["Usuario * (mín. 3)", "El usuario debe tener al menos 3 caracteres."],
      ["Contraseña * (mín. 8)", "La contraseña debe tener al menos 8 caracteres."],
      ["Repite la contraseña *", "Las contraseñas no coinciden."],
    ] as const) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
    expect(signup).not.toHaveBeenCalled();
  });

  it("un campo correcto no queda marcado", () => {
    montar();
    escribir("Usuario * (mín. 3)", "mrestrepo");
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud de registro" }));
    expect(screen.getByLabelText("Usuario * (mín. 3)")).not.toHaveAttribute("aria-invalid");
  });

  it("avisa en vivo si la contraseña es corta o no coincide (F1-47)", () => {
    montar();
    escribir("Contraseña * (mín. 8)", "corta");
    expect(screen.getByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();
    escribir("Contraseña * (mín. 8)", "una-mucho-mejor");
    escribir("Repite la contraseña *", "distinta");
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
  });
});

describe("tras la solicitud (F2-11)", () => {
  it("entrega a «Entrar» la frase única de la aprobación", async () => {
    signup.mockResolvedValueOnce({ message: "texto del servidor" });
    const onDone = vi.fn();
    montar({ onDone });
    escribir("Nombre completo *", "María Restrepo");
    escribir("Usuario * (mín. 3)", "mrestrepo");
    escribir("Contraseña * (mín. 8)", "una-mucho-mejor");
    escribir("Repite la contraseña *", "una-mucho-mejor");
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud de registro" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(
      "Un administrador revisará la solicitud. No recibirás ningún aviso: vuelve a intentar entrar en unos días.",
    ));
    // Deja que termine el «Enviando…» para que ninguna actualización caiga fuera de act.
    await screen.findByRole("button", { name: "Enviar solicitud de registro" });
  });
});
