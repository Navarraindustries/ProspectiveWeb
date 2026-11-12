import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { escenasDisponibles } from "../presentation";
import { HudPresentacion } from "./HudPresentacion";

function montar(escena = 0, girando: boolean | null = true) {
  const props = {
    titulo: "Aneurisma de la punta de la basilar", subtitulo: "Candidato 1",
    cifras: [{ etiqueta: "Ø máximo", valor: "5,3", unidad: "mm", estimada: true }],
    escenas: escenasDisponibles({ lesion: true, abordaje: false, linea: true }), escena, girando,
    onEscena: vi.fn(), onGiro: vi.fn(), onSalir: vi.fn(),
  };
  const r = render(<HudPresentacion {...props} />);
  return { props, ...r };
}

describe("HudPresentacion", () => {
  it("enseña el caso, las cifras (con la estimación dicha) y la escena", () => {
    montar(1);
    expect(screen.getByRole("heading", { name: "Aneurisma de la punta de la basilar" })).toBeTruthy();
    expect(screen.getByText("5,3")).toBeTruthy();
    expect(screen.getByText(/Ø máximo · estimado/)).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText("Lesión")).toBeTruthy();
  });

  it("las flechas y los mandos de diapositivas pasan de escena; espacio gira; Esc sale", () => {
    const { props } = montar(1);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(props.onEscena).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(window, { key: "PageUp" });
    expect(props.onEscena).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: " " });
    expect(props.onGiro).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onSalir).toHaveBeenCalledTimes(1);
  });

  it("en la primera escena no hay anterior; sin giro no hay botón de giro", () => {
    montar(0, null);
    expect((screen.getByRole("button", { name: /Escena anterior/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /GIRO/ })).toBeNull();
  });
});
