import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "../api/types";

let estado: OnboardingState;
let activo = false;
let pickMode: string | null = null;
const marcarPista = vi.fn();
const setPistasActivas = vi.fn();

vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ estado, activo, marcarPista, setPistasActivas }),
}));
vi.mock("../store/planning", () => ({ usePlanning: () => ({ pickMode }) }));

import { PistaPaso } from "./PistaPaso";
import { PISTAS_PASO } from "./copy";

const base = (extra: Partial<OnboardingState> = {}): OnboardingState => ({
  estado: "completado", fecha: null, pistas_vistas: [], pistas_activas: true, tarjeta_cerrada: false, ...extra,
});

beforeEach(() => {
  estado = base(); activo = false; pickMode = null;
  marcarPista.mockReset(); setPistasActivas.mockReset();
});

describe("PistaPaso", () => {
  it("sale la primera vez (4 campos, sin tomar el foco) y no cuando el paso ya está visto", () => {
    const { unmount } = render(<PistaPaso paso={3} />);
    expect(screen.getByText(PISTAS_PASO[3].titulo)).toBeInTheDocument();
    expect(screen.getByText(PISTAS_PASO[3].porque)).toBeInTheDocument();
    expect(screen.getByRole("note").contains(document.activeElement)).toBe(false);
    expect(screen.getByRole("note").getAttribute("aria-modal")).toBeNull();
    unmount();
    estado = base({ pistas_vistas: [3] });
    render(<PistaPaso paso={3} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("no sale mientras se marca, con el onboarding activo ni con las pistas apagadas", () => {
    pickMode = "neck_origin";
    const { rerender } = render(<PistaPaso paso={3} />);
    expect(screen.queryByRole("note")).toBeNull();
    pickMode = null; activo = true;
    rerender(<PistaPaso paso={3} />);
    expect(screen.queryByRole("note")).toBeNull();
    activo = false; estado = base({ pistas_activas: false });
    rerender(<PistaPaso paso={3} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("«Entendido» marca el paso; «No mostrar más pistas» las apaga", () => {
    render(<PistaPaso paso={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(marcarPista).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "No mostrar más pistas" }));
    expect(setPistasActivas).toHaveBeenCalledWith(false);
  });

  it("solo Esc la cierra (como «Entendido»); flechas, Intro y números no se tocan", () => {
    render(<PistaPaso paso={3} />);
    for (const key of ["ArrowRight", "ArrowLeft", "Enter", "4", "p"]) {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(marcarPista).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(marcarPista).toHaveBeenCalledWith(3);
  });

  it("Esc con el foco en un campo de texto no la cierra ni la marca", () => {
    render(<><input aria-label="nota" /><PistaPaso paso={3} /></>);
    const campo = screen.getByLabelText("nota");
    campo.focus();
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(marcarPista).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("Esc con un menú abierto (foco en él o en el cuerpo) no la marca", () => {
    render(<><div role="menu"><button role="menuitem">a</button></div><PistaPaso paso={3} /></>);
    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(marcarPista).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("Esc con el foco en el cuerpo la cierra y marca una sola vez", () => {
    render(<PistaPaso paso={3} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(marcarPista).toHaveBeenCalledTimes(1);
    expect(marcarPista).toHaveBeenCalledWith(3);
  });

  it("cambiar de paso con la pista abierta marca el anterior", () => {
    const { rerender } = render(<PistaPaso paso={3} />);
    expect(marcarPista).not.toHaveBeenCalled();
    rerender(<PistaPaso paso={4} />);
    expect(marcarPista).toHaveBeenCalledWith(3);
    expect(marcarPista).toHaveBeenCalledTimes(1);
  });

  it("si no llegó a verse (había un marcado en curso), cambiar de paso no la marca", () => {
    pickMode = "neck_origin";
    const { rerender } = render(<PistaPaso paso={3} />);
    rerender(<PistaPaso paso={4} />);
    expect(marcarPista).not.toHaveBeenCalled();
  });

  it("se oculta mientras hay una hoja abierta y vuelve al cerrarla", async () => {
    const { Sheet } = await import("../components/Sheet");
    const { rerender } = render(<><PistaPaso paso={3} /><Sheet open onClose={() => {}} title="x"><p>h</p></Sheet></>);
    expect(screen.queryByRole("note")).toBeNull();
    await act(async () => { rerender(<><PistaPaso paso={3} /><Sheet open={false} onClose={() => {}} title="x"><p>h</p></Sheet></>); });
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
