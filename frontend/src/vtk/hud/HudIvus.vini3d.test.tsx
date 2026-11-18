/* VINI 3D, segunda tanda (18-11): ramas bajo el dispositivo, comparación con
   el estudio anterior, marcadores y la copia del panel para la grabación. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IvusCompareResult, IvusResult } from "../../api/types";

const ivusVirtual = vi.fn();
const ivusStack = vi.fn();
const fdSizing = vi.fn();
const ivusCompare = vi.fn();
vi.mock("../../api/client", () => ({ api: {
  ivusVirtual: (...a: unknown[]) => ivusVirtual(...a), ivusStack: (...a: unknown[]) => ivusStack(...a),
  fdSizing: (...a: unknown[]) => fdSizing(...a), ivusCompare: (...a: unknown[]) => ivusCompare(...a),
} }));

import type { GrabFn } from "../captureRenderWindow";
import { HudIvus, olvidarIvus } from "./HudIvus";
import { crearProgreso } from "./HudRecorrido";

const circulo = (r: number) => Array.from({ length: 72 }, (_, k) => [r * Math.cos((2 * Math.PI * k) / 72), r * Math.sin((2 * Math.PI * k) / 72)]);

function datos(): IvusResult {
  const sections = Array.from({ length: 5 }, (_, i) => ({
    arc_mm: i * 0.5, valid: true, in_lesion: false, in_branch: false,
    area_mm2: 7.07, perimeter_mm: 9.4, d_min_mm: 3, d_max_mm: 3, d_eq_mm: 3,
    eccentricity: 0.05, angle_min_deg: 10, angle_max_deg: 100, centroid: [0, 0], contour: circulo(1.5),
  }));
  return {
    n_sections: 5, size_px: 4, fov_mm: 10, stack_url: "/u8", window: [0, 400], sections,
    summary: { mla_mm2: 7.07, mla_index: 2, mla_arc_mm: 1, d_min_mm: 3, d_max_mm: 3, eccentricity: 0, ref_mm2: 7.07, area_stenosis_pct: 0 },
    note: "",
    stent: { from_arc_mm: 0.5, to_arc_mm: 1.5, noise_mm: 0.3, gap_length_mm: 0, max_gap_mm: 0, compressed_length_mm: 0, neck_length_mm: 0, proximal_gap_mm: 0, distal_gap_mm: 0 },
    branches: [
      { arc_mm: 1.0, calibre_mm: 1.4, parent_mm: 3, angle_deg: 90, distance_mm: 1.5 },
      { arc_mm: 2.0, calibre_mm: 1.0, parent_mm: 3, angle_deg: 0, distance_mm: 1.5 },
    ],
    branch_floor_mm: 0.8,
  };
}

function comparacion(): IvusCompareResult {
  return {
    previous_session_id: "antes", noise_mm: 0.3, residual_median_mm: 0.1,
    sections: datos().sections.map((s) => ({ arc_mm: s.arc_mm, valid: true, area_mm2: 7.07 / 0.8, contour: circulo(1.7) })),
    summary: { mla_mm2: 8.8, mla_index: 0, mla_arc_mm: 0, d_min_mm: 3.3, d_max_mm: 3.3, eccentricity: 0 },
  };
}

beforeEach(() => {
  olvidarIvus();
  ivusVirtual.mockReset().mockResolvedValue(datos());
  ivusStack.mockReset().mockResolvedValue(new Uint8Array(5 * 4 * 4));
  fdSizing.mockReset();
  ivusCompare.mockReset().mockResolvedValue(comparacion());
});

function montar(extra: Partial<Parameters<typeof HudIvus>[0]> = {}) {
  const progreso = crearProgreso();
  const props = { sessionId: "s", claveLinea: "a", progreso, onIrA: vi.fn(), onCerrar: vi.fn(), ...extra };
  render(<HudIvus {...props} />);
  return props;
}

describe("HudIvus · ramas", () => {
  it("dice qué ramas visibles quedan bajo el stent y lleva el recorrido a cada una", async () => {
    const p = montar();
    expect(await screen.findByText(/1 rama visible bajo el dispositivo/)).toBeInTheDocument();
    expect(screen.getByText(/perforantes \(menos de 0,8 mm\) no se ven/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1,0 mm (Ø 1,4)" }));
    expect(p.onIrA).toHaveBeenCalledWith(1);
  });

  it("en la sección donde nace una rama lo dice", async () => {
    const p = montar();
    await screen.findByText(/rama visible bajo/);
    expect(screen.queryByText(/Nace una rama/)).toBeNull();
    act(() => p.progreso.poner(1.0));
    expect(await screen.findByText("Nace una rama Ø 1,4 mm")).toBeInTheDocument();
  });
});

describe("HudIvus · estudio anterior", () => {
  it("sin estudio superpuesto no ofrece comparar", async () => {
    montar();
    await screen.findByText(/rama visible bajo/);
    expect(screen.queryByRole("button", { name: /Comparar con el estudio anterior/ })).toBeNull();
  });

  it("compara al pedirlo: área de antes con su cambio y la MLA de antes", async () => {
    montar({ anterior: "antes" });
    fireEvent.click(await screen.findByRole("button", { name: "Comparar con el estudio anterior" }));
    expect(ivusCompare).toHaveBeenCalledWith("s", "antes");
    expect(await screen.findByText("8,84 mm² (−20 %)")).toBeInTheDocument();
    expect(screen.getByText("Antes: MLA 8,80 mm² a 0,0 mm")).toBeInTheDocument();
    expect(screen.getByText(/menor que 0,30 mm .* no se distingue/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar la comparación" }));
    expect(screen.queryByText(/8,84 mm²/)).toBeNull();
  });

  it("si falta superponerlo en Seguimiento, lo dice", async () => {
    ivusCompare.mockRejectedValue(new Error("Superpón primero ese estudio en Seguimiento (Morfometría)"));
    montar({ anterior: "antes" });
    fireEvent.click(await screen.findByRole("button", { name: "Comparar con el estudio anterior" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Superpón primero/);
  });
});

describe("HudIvus · marcadores", () => {
  it("«Marcar aquí» pide una nota y la entrega; las marcas llevan el recorrido", async () => {
    const onMarcar = vi.fn();
    const p = montar({ onMarcar, marcas: [{ id: "m", arc_mm: 1.5, etiqueta: "M3", nota: "estrechez" }] });
    fireEvent.click(await screen.findByRole("button", { name: "Marcar aquí" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nota del marcador" }), { target: { value: "  placa?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onMarcar).toHaveBeenCalledWith("placa?");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "M3 · 1,5 mm" }));
    expect(p.onIrA).toHaveBeenCalledWith(1.5);
  });

  it("Cancelar no deja marcador", async () => {
    const onMarcar = vi.fn();
    montar({ onMarcar });
    fireEvent.click(await screen.findByRole("button", { name: "Marcar aquí" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onMarcar).not.toHaveBeenCalled();
  });
});

describe("HudIvus · grabación", () => {
  it("registra una copia del panel y la retira al cerrarse", async () => {
    let copia: GrabFn | null = null;
    const registrarCopia = vi.fn((g: GrabFn | null) => { copia = g; });
    const progreso = crearProgreso();
    const { unmount } = render(<HudIvus sessionId="s" claveLinea="a" progreso={progreso} onIrA={vi.fn()} onCerrar={vi.fn()} registrarCopia={registrarCopia} />);
    await screen.findByText(/rama visible bajo/);
    expect(typeof copia).toBe("function");
    unmount();
    expect(registrarCopia).toHaveBeenLastCalledWith(null);
  });
});
