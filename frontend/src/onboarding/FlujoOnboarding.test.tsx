import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configPorDefecto } from "../avatar/config";

const refreshUser = vi.fn();
const terminar = vi.fn().mockResolvedValue(undefined);
const empezar = vi.fn();
let momento = "hola";
const ir = vi.fn((m: string) => { momento = m; });
let reducido = false;

let extraUser: Record<string, unknown> = {};
vi.mock("../store/auth", () => ({
  useAuth: () => ({ user: { id: 7, full_name: "Ana Pérez", avatar_config: configPorDefecto(7), avatar_mode: "avatar", ...extraUser }, refreshUser }),
}));
vi.mock("../api/client", () => ({
  api: { myProfilePhotoObjectUrl: vi.fn().mockResolvedValue("blob:x"), saveAvatar: vi.fn().mockResolvedValue({}), uploadProfilePhoto: vi.fn(), copyRegistroPhoto: vi.fn() },
}));
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ activo: true, momento, ir, terminar, empezar }),
}));
vi.mock("../motion", async (orig) => ({ ...(await orig<object>()), useReducedMotion: () => reducido }));

import { api } from "../api/client";
import { FlujoOnboarding } from "./FlujoOnboarding";

function Montar() {
  return <MemoryRouter><FlujoOnboarding /></MemoryRouter>;
}
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: /Siguiente|Empezar/ }));

beforeEach(() => {
  vi.clearAllMocks();
  momento = "hola"; reducido = false; extraUser = {};
});

describe("FlujoOnboarding", () => {
  it("recorre hola → avatar → intro → pacientes con «Siguiente»", async () => {
    const { rerender } = render(<Montar />);
    expect(screen.getByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    siguiente();
    expect(ir).toHaveBeenLastCalledWith("avatar");
    rerender(<Montar />);
    expect(screen.getByRole("heading", { name: "Tu avatar" })).toBeInTheDocument();
    siguiente();
    await waitFor(() => expect(ir).toHaveBeenLastCalledWith("intro"));
    rerender(<Montar />);
    expect(screen.getByRole("heading", { name: "En 20 segundos" })).toBeInTheDocument();
    siguiente();
    expect(ir).toHaveBeenLastCalledWith("pacientes");
  });

  it("«Saltar todo» está siempre y termina como saltado; Esc también", () => {
    render(<Montar />);
    fireEvent.click(screen.getByRole("button", { name: "Saltar todo" }));
    expect(terminar).toHaveBeenCalledWith("saltado");
    terminar.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(terminar).toHaveBeenCalledWith("saltado");
  });

  it("en «avatar», cambiar el pijama y avanzar guarda ese pijama", async () => {
    momento = "avatar";
    render(<Montar />);
    const antes = configPorDefecto(7);
    const nombres = ["Verde quirófano", "Azul", "Violeta", "Granate", "Ámbar", "Gris pizarra"];
    const otro = nombres.map((n) => screen.getByRole("button", { name: n })).find((b) => b.getAttribute("aria-pressed") === "false");
    expect(otro).toBeTruthy();
    fireEvent.click(otro!);
    siguiente();
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalled());
    const [cfg, modo] = (api.saveAvatar as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(modo).toBe("avatar");
    expect(cfg.pijama).not.toBe(antes.pijama);
  });

  it("«Ir a mis pacientes» termina como completado y «Repetir» vuelve a empezar", () => {
    momento = "listo";
    render(<Montar />);
    fireEvent.click(screen.getByRole("button", { name: "Repetir el recorrido" }));
    expect(empezar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ir a mis pacientes" }));
    expect(terminar).toHaveBeenCalledWith("completado");
  });

  it("Listo no lleva marcas de progreso", () => {
    momento = "listo";
    render(<Montar />);
    expect(screen.queryByText(/desbloque|logro|insignia/i)).toBeNull();
  });

  it("con movimiento reducido las tarjetas de intro no se animan", () => {
    momento = "intro"; reducido = true;
    const { container, rerender } = render(<Montar />);
    const tarjetas = container.querySelectorAll("[data-tarjeta-tramo]");
    expect(tarjetas).toHaveLength(4);
    tarjetas.forEach((t) => expect(t.getAttribute("data-animada")).toBe("false"));
    reducido = false;
    rerender(<Montar />);
    container.querySelectorAll("[data-tarjeta-tramo]").forEach((t) => expect(t.getAttribute("data-animada")).toBe("true"));
  });

  it("con foto guardada, avanzar sin cambios mantiene el modo «foto»", async () => {
    momento = "avatar";
    extraUser = { avatar_mode: "foto", has_profile_photo: true };
    render(<Montar />);
    siguiente();
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalled());
    expect((api.saveAvatar as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("foto");
  });

  it("Ctrl+K no llega a la paleta y Tab se queda dentro de la capa", () => {
    render(<Montar />);
    const paleta = vi.fn();
    window.addEventListener("keydown", paleta);
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    window.removeEventListener("keydown", paleta);
    expect(paleta).not.toHaveBeenCalled();
    const botones = screen.getAllByRole("button").filter((b) => !(b as HTMLButtonElement).disabled);
    act(() => botones[botones.length - 1].focus());
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(botones[0]);
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(botones[botones.length - 1]);
  });

  it("si se salta mientras guarda el avatar, no avanza después", async () => {
    momento = "avatar";
    let fin: () => void = () => {};
    (api.saveAvatar as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => { fin = () => r({}); }));
    render(<Montar />);
    siguiente();
    await waitFor(() => expect(api.saveAvatar).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(terminar).toHaveBeenCalledWith("saltado");
    fin();
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(ir).not.toHaveBeenCalled();
  });

  describe("«Tu avatar»: qué ven los demás", () => {
    it("con foto guardada se puede volver al avatar: la vista previa lo sigue y se guarda «avatar»", async () => {
      momento = "avatar";
      extraUser = { avatar_mode: "foto", has_profile_photo: true };
      render(<Montar />);
      const foto = screen.getByRole("button", { name: "Mostrar mi foto" });
      const avatar = screen.getByRole("button", { name: "Mostrar mi avatar" });
      expect(foto).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("img", { name: "Vista previa de tu avatar" })).toBeNull();
      fireEvent.click(avatar);
      expect(avatar).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("img", { name: "Vista previa de tu avatar" })).toBeInTheDocument();
      fireEvent.click(foto);
      expect(screen.queryByRole("img", { name: "Vista previa de tu avatar" })).toBeNull();
      fireEvent.click(avatar);
      siguiente();
      await waitFor(() => expect(api.saveAvatar).toHaveBeenCalled());
      expect((api.saveAvatar as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("avatar");
      expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    });

    it("sin foto guardada ni elegida, «Mostrar mi foto» está deshabilitado", () => {
      momento = "avatar";
      render(<Montar />);
      expect(screen.getByRole("button", { name: "Mostrar mi foto" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Mostrar mi avatar" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("con la capa a pantalla completa no se escapan teclas a la app de debajo", () => {
    const escuchar = () => {
      const app = vi.fn();
      window.addEventListener("keydown", app);
      document.addEventListener("keydown", app);
      return { app, quitar: () => { window.removeEventListener("keydown", app); document.removeEventListener("keydown", app); } };
    };

    it.each(["hola", "avatar", "intro", "listo"])("%s: dígitos, P, S y espacio no llegan, ni desde la capa ni desde el cuerpo", (m) => {
      momento = m;
      render(<Montar />);
      const { app, quitar } = escuchar();
      const boton = screen.getAllByRole("button").find((b) => !(b as HTMLButtonElement).disabled)!;
      for (const key of ["1", "4", "p", "s", "c", "h", " "]) {
        fireEvent.keyDown(document.body, { key });
        fireEvent.keyDown(boton, { key });
      }
      quitar();
      expect(app).not.toHaveBeenCalled();
    });

    it("quirofano: tampoco desde la burbuja (por portal) ni desde un control oculto del trabajo", () => {
      momento = "quirofano";
      const fuera = document.createElement("button");
      document.body.appendChild(fuera);
      render(<MemoryRouter><FlujoOnboarding /></MemoryRouter>);
      const b = screen.getByRole("dialog", { name: "El visor" });
      const { app, quitar } = escuchar();
      for (const key of ["2", "p", "s", " "]) {
        fireEvent.keyDown(b, { key });
        fireEvent.keyDown(fuera, { key });
        fireEvent.keyDown(document.body, { key });
      }
      quitar();
      fuera.remove();
      expect(app).not.toHaveBeenCalled();
      // Las teclas de la burbuja siguen funcionando.
      fireEvent.keyDown(b, { key: "ArrowRight" });
      expect(screen.getByRole("dialog", { name: "Los pasos" })).toBeInTheDocument();
    });

    it("escribir en un campo de la capa no se toca", () => {
      momento = "avatar";
      render(<Montar />);
      const campo = document.createElement("input");
      document.querySelector(".ob-capa")!.appendChild(campo);
      const { app, quitar } = escuchar();
      fireEvent.keyDown(campo, { key: "p" });
      quitar();
      expect(app).toHaveBeenCalled();
    });

    it("pacientes (sobre la app) no se aísla", async () => {
      momento = "pacientes";
      render(<MemoryRouter initialEntries={["/app/pacientes"]}><div data-tour="buscar" /><FlujoOnboarding /></MemoryRouter>);
      await screen.findByRole("dialog", { name: "Tus secciones" });
      const { app, quitar } = escuchar();
      fireEvent.keyDown(document.body, { key: "1" });
      quitar();
      expect(app).toHaveBeenCalled();
    });
  });

  describe("momento «pacientes» (recorrido sobre la app)", () => {
    const MontarPacientes = () => (
      <MemoryRouter initialEntries={["/app/pacientes"]}>
        <div data-tour="buscar" />
        <FlujoOnboarding />
      </MemoryRouter>
    );

    it("la capa se aparta: Tab gira dentro de la burbuja, ⌘K sigue bloqueado y Esc termina una sola vez", async () => {
      momento = "pacientes";
      render(<MontarPacientes />);
      const b = await screen.findByRole("dialog", { name: "Tus secciones" });
      // La capa a pantalla completa no está: solo una barra mínima con «Saltar todo».
      expect(document.querySelector(".ob-capa")).toBeNull();
      expect(screen.getByRole("button", { name: "Saltar todo" })).toBeInTheDocument();
      const paleta = vi.fn();
      window.addEventListener("keydown", paleta);
      fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
      window.removeEventListener("keydown", paleta);
      expect(paleta).not.toHaveBeenCalled();
      const botones = within(b).getAllByRole("button").filter((x) => !(x as HTMLButtonElement).disabled);
      act(() => botones[botones.length - 1].focus());
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(botones[0]);
      fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(botones[botones.length - 1]);
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(terminar).toHaveBeenCalledTimes(1);
      expect(terminar).toHaveBeenCalledWith("saltado");
      expect(document.querySelector("[data-foco]")).toBeNull();
    });

    it("Esc desde la pastilla «Saltar todo» también salta, una sola vez", async () => {
      momento = "pacientes";
      render(<MontarPacientes />);
      await screen.findByRole("dialog", { name: "Tus secciones" });
      const saltarTodo = screen.getByRole("button", { name: "Saltar todo" });
      act(() => saltarTodo.focus());
      fireEvent.keyDown(saltarTodo, { key: "Escape" });
      expect(terminar).toHaveBeenCalledTimes(1);
      expect(terminar).toHaveBeenCalledWith("saltado");
    });

    it("terminar la última parada lleva al siguiente momento con pantalla", async () => {
      momento = "pacientes";
      render(<MontarPacientes />);
      await screen.findByRole("dialog", { name: "Tus secciones" });
      for (let i = 0; i < 9 && !screen.queryByRole("button", { name: "Terminar" }); i++) {
        fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      }
      fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
      expect(ir).toHaveBeenCalledTimes(1);
      expect(ir).toHaveBeenCalledWith("quirofano");
      expect(terminar).not.toHaveBeenCalled();
    });
  });

  describe("momento «quirofano» (ilustración en cinco zonas)", () => {
    const MontarQuirofano = () => <MemoryRouter><FlujoOnboarding /></MemoryRouter>;

    it("la capa sigue a pantalla completa pero no pelea por Tab ni Esc: Esc termina una sola vez y ⌘K sigue bloqueado", () => {
      momento = "quirofano";
      render(<MontarQuirofano />);
      const b = screen.getByRole("dialog", { name: "El visor" });
      expect(document.querySelector(".ob-capa")).not.toBeNull();
      expect(document.querySelector(".ob-pie")).toBeNull();
      expect(document.activeElement).toBe(b);
      const paleta = vi.fn();
      window.addEventListener("keydown", paleta);
      fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
      window.removeEventListener("keydown", paleta);
      expect(paleta).not.toHaveBeenCalled();
      const botones = within(b).getAllByRole("button").filter((x) => !(x as HTMLButtonElement).disabled);
      act(() => botones[botones.length - 1].focus());
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(botones[0]);
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(terminar).toHaveBeenCalledTimes(1);
      expect(terminar).toHaveBeenCalledWith("saltado");
    });

    it("«Anterior» en la zona 1 vuelve al panel de pacientes", () => {
      momento = "quirofano";
      render(<MontarQuirofano />);
      fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
      expect(ir).toHaveBeenCalledWith("pacientes");
    });

    it("«Siguiente» en la zona 5 lleva a «Listo»", () => {
      momento = "quirofano";
      render(<MontarQuirofano />);
      fireEvent.click(screen.getByRole("button", { name: /^Zona 5: / }));
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(ir).toHaveBeenCalledWith("listo");
      expect(terminar).not.toHaveBeenCalled();
    });
  });
});
