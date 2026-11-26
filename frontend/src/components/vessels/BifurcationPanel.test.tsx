/* Ángulo de bifurcación guiado: tres clics (madre, hija 1, hija 2) y medir. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const medir = vi.fn();
const leer = vi.fn();
vi.mock("../../api/client", () => ({ api: {
  medirBifurcacion: (...a: unknown[]) => medir(...a),
  leerBifurcacion: (...a: unknown[]) => leer(...a),
} }));

let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));

import { BifurcationPanel } from "./BifurcationPanel";

const p = (x: number, y: number, z: number) => ({ x, y, z });
const RESULTADO = {
  punto: p(1, 2, 3), angulo_hijas_deg: 118.4, angulo_hija1_deg: 61.2, angulo_hija2_deg: 57.9,
  diametro_madre_mm: 3.04, diametro_hija1_mm: 2.21, diametro_hija2_mm: 2.18, medido_a_mm: 6.1,
  sin_saco: true, madre: p(-14, 0, 0), hija_1: p(6, 11, 0), hija_2: p(6, -11, 0), linea_1: [], linea_2: [],
};

beforeEach(() => {
  medir.mockReset().mockResolvedValue(RESULTADO);
  leer.mockReset().mockResolvedValue(null);
  planning = {
    sessionId: "s", segmentation: { mesh_url: "/m.vtp" }, pickMode: null, setPickMode: vi.fn(),
    bifPuntos: { madre: null, hija1: null, hija2: null }, setBifPuntos: vi.fn(),
    bifResultado: null, setBifResultado: vi.fn(),
  };
});

describe("ángulo de bifurcación", () => {
  it("«Marcar madre e hijas» empieza por la madre y borra lo anterior", () => {
    render(<BifurcationPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar madre e hijas/ }));
    expect(planning.setPickMode).toHaveBeenCalledWith("bif_madre");
    expect(planning.setBifPuntos).toHaveBeenCalledWith({ madre: null, hija1: null, hija2: null });
    expect(planning.setBifResultado).toHaveBeenCalledWith(null);
  });

  it("sin los tres puntos no deja medir; con ellos manda los tres al servidor", async () => {
    const { rerender } = render(<BifurcationPanel />);
    expect(screen.getByRole("button", { name: "Medir ángulo" })).toBeDisabled();
    planning.bifPuntos = { madre: [-14, 0, 0], hija1: [6, 11, 0], hija2: [6, -11, 0] };
    rerender(<BifurcationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Medir ángulo" }));
    await waitFor(() => expect(medir).toHaveBeenCalledWith("s", {
      madre: p(-14, 0, 0), hija_1: p(6, 11, 0), hija_2: p(6, -11, 0) }));
    expect(planning.setBifResultado).toHaveBeenCalledWith(RESULTADO);
  });

  it("enseña los ángulos y dice desde dónde se midieron", () => {
    planning.bifResultado = RESULTADO;
    render(<BifurcationPanel />);
    expect(screen.getByText("Entre las dos hijas").parentElement).toHaveTextContent("118°");
    expect(screen.getByText(/a 6,1 mm de la bifurcación/)).toBeInTheDocument();
    expect(screen.getByText(/sin pasar por el saco medido/)).toBeInTheDocument();
  });

  it("si el servidor no puede, dice qué hacer", async () => {
    medir.mockRejectedValueOnce(new Error("Las dos hijas marcadas están en el mismo vaso: marca cada una en una rama distinta."));
    planning.bifPuntos = { madre: [-14, 0, 0], hija1: [6, 11, 0], hija2: [7, 12, 0] };
    render(<BifurcationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Medir ángulo" }));
    expect(await screen.findByText(/mismo vaso/)).toBeInTheDocument();
  });

  it("al abrir una sesión con la medida guardada, la recupera con sus puntos", async () => {
    leer.mockResolvedValueOnce(RESULTADO);
    render(<BifurcationPanel />);
    await waitFor(() => expect(planning.setBifResultado).toHaveBeenCalledWith(RESULTADO));
    expect(planning.setBifPuntos).toHaveBeenCalledWith({ madre: [-14, 0, 0], hija1: [6, 11, 0], hija2: [6, -11, 0] });
  });
});
