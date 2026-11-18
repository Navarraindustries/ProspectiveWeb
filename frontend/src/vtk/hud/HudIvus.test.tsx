/* IVUS virtual de VINI 3D (17-11): el panel junto al recorrido. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FdSizingResult, IvusResult } from "../../api/types";

const ivusVirtual = vi.fn();
const ivusStack = vi.fn();
const fdSizing = vi.fn();
const ivusCompare = vi.fn();
vi.mock("../../api/client", () => ({ api: {
  ivusVirtual: (...a: unknown[]) => ivusVirtual(...a), ivusStack: (...a: unknown[]) => ivusStack(...a), fdSizing: (...a: unknown[]) => fdSizing(...a),
  ivusCompare: (...a: unknown[]) => ivusCompare(...a),
} }));

import { HudIvus, olvidarIvus } from "./HudIvus";
import { HudRecorrido, crearProgreso } from "./HudRecorrido";

const circulo = (r: number) => Array.from({ length: 72 }, (_, k) => [r * Math.cos((2 * Math.PI * k) / 72), r * Math.sin((2 * Math.PI * k) / 72)]);

function datos(): IvusResult {
  const sections = Array.from({ length: 5 }, (_, i) => ({
    arc_mm: i * 0.5, valid: i !== 3, in_lesion: i === 4, in_branch: false,
    area_mm2: i === 2 ? 3.14 : 7.07, perimeter_mm: 9.4, d_min_mm: i === 2 ? 2 : 3, d_max_mm: 3, d_eq_mm: 3,
    eccentricity: 0.05, angle_min_deg: 10, angle_max_deg: 100, centroid: [0, 0], contour: circulo(1.5),
  }));
  return {
    n_sections: 5, size_px: 4, fov_mm: 10, stack_url: "/data/sessions/s/meshes/ivus_pullback.u8?v=1", window: [0, 400], sections,
    summary: { mla_mm2: 3.14, mla_index: 2, mla_arc_mm: 1, d_min_mm: 2, d_max_mm: 2, eccentricity: 0, ref_prox_mm2: 7.07, ref_prox_arc_mm: 0, ref_dist_mm2: null, ref_dist_arc_mm: null, ref_mm2: 7.07, area_stenosis_pct: 55.6 },
    note: "",
  };
}

beforeEach(() => {
  olvidarIvus();
  ivusVirtual.mockReset().mockResolvedValue(datos());
  ivusStack.mockReset().mockResolvedValue(new Uint8Array(5 * 4 * 4));
  fdSizing.mockReset().mockRejectedValue(new Error("Falta la morfometría: hace falta el cuello medido."));
  ivusCompare.mockReset();
});

function montar() {
  const progreso = crearProgreso();
  const props = { sessionId: "s", claveLinea: "a", progreso, onIrA: vi.fn(), onCerrar: vi.fn() };
  render(<HudIvus {...props} />);
  return props;
}

describe("HudIvus", () => {
  it("calcula y enseña las medidas de la sección donde va el recorrido", async () => {
    const p = montar();
    expect(screen.getByText(/Calculando las secciones/)).toBeInTheDocument();
    expect(await screen.findByText("7,07 mm²")).toBeInTheDocument();
    expect(ivusVirtual).toHaveBeenCalledWith("s");
    expect(ivusStack).toHaveBeenCalledWith("/data/sessions/s/meshes/ivus_pullback.u8?v=1");
    act(() => p.progreso.poner(1.0));                    // sección 2: la más estrecha
    expect(await screen.findByText("3,14 mm²")).toBeInTheDocument();
    expect(screen.getByText("Estenosis de área 56 %")).toBeInTheDocument();
    expect(screen.getByText(/muestra la luz, no la pared/)).toBeInTheDocument();
  });

  it("sin contorno que rodee la línea lo dice; dentro de la lesión, también", async () => {
    const p = montar();
    await screen.findByText("7,07 mm²");
    act(() => p.progreso.poner(1.5));
    expect(await screen.findByText(/sin medidas/)).toBeInTheDocument();
    act(() => p.progreso.poner(2.0));
    expect(await screen.findByText("EN LA LESIÓN")).toBeInTheDocument();
  });

  it("el botón de la MLA lleva el recorrido allí y ✕ lo oculta", async () => {
    const p = montar();
    fireEvent.click(await screen.findByRole("button", { name: /MLA 3,14 mm² a 1,0 mm/ }));
    expect(p.onIrA).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el IVUS virtual" }));
    expect(p.onCerrar).toHaveBeenCalled();
  });

  it("no vuelve a pedir el pullback al reabrirlo con la misma línea", async () => {
    const { unmount } = render(<HudIvus sessionId="s" claveLinea="a" progreso={crearProgreso()} onIrA={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByText("7,07 mm²");
    unmount();
    montar();
    await screen.findByText("7,07 mm²");
    expect(ivusVirtual).toHaveBeenCalledTimes(1);
  });

  it("si el servidor falla, lo dice", async () => {
    ivusVirtual.mockRejectedValueOnce(new Error("Extrae la línea central primero."));
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Extrae la línea central primero.");
  });
});

describe("botón IVUS de la barra de VINI 3D", () => {
  it("aparece con onIvus, dice si está visible y lo alterna", () => {
    const onIvus = vi.fn();
    render(<HudRecorrido progreso={crearProgreso()} totalMm={10} diametroEn={() => 3} estado="pausa"
      onPausa={vi.fn()} onSeguir={vi.fn()} onSalir={vi.fn()} onIvus={onIvus} ivusVisible />);
    const b = screen.getByRole("button", { name: "IVUS" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(b);
    expect(onIvus).toHaveBeenCalled();
    expect(screen.getByText("VINI 3D")).toBeInTheDocument();
  });
});

describe("dispositivo en el panel (4 y 5)", () => {
  const plan = (): FdSizingResult => ({
    neck_arc_mm: [0.8, 1.2], neck_from_rim: true, total_arc_mm: 2,
    proximal: { arc_from_mm: 0, arc_to_mm: 0.8, diameter_mm: 3.9, min_mm: 3.7, max_mm: 4.1, n_sections: 2, truncated: false },
    distal: { arc_from_mm: 1.2, arc_to_mm: 2, diameter_mm: 3.4, min_mm: 3.2, max_mm: 3.6, n_sections: 2, truncated: false },
    mismatch_mm: 0.5, target_diameter_mm: 4, required_length_mm: 14, multiple_devices: false,
    options: [
      { device_id: "a", name: "FRED", manufacturer: "M", diameter_mm: 4, length_mm: 20, fits: true, reason: "", neck_note: "", narrow_end_note: "", deploy_arc_mm: [0, 2], elongated_length_mm: 26.5 },
      { device_id: "b", name: "Pipeline", manufacturer: "M", diameter_mm: 4.25, length_mm: 18, fits: true, reason: "", neck_note: "", narrow_end_note: "", deploy_arc_mm: [0, 2], elongated_length_mm: 23.9 },
    ],
    warnings: [], notes: [], sources: [],
  });

  it("sin morfometría dice lo que falta para el plan", async () => {
    montar();
    expect(await screen.findByText(/Plan del flow diverter: Falta la morfometría/)).toBeInTheDocument();
  });

  it("con el plan: anclajes, la opción elegida y su Ø frente al vaso donde va el recorrido", async () => {
    fdSizing.mockResolvedValue(plan());
    const p = montar();
    expect(await screen.findByText("PLAN DE FLOW DIVERTER")).toBeInTheDocument();
    expect(screen.getByText(/Anclajes Ø 3,90 · 3,40 mm · cuello 0,4 mm/)).toBeInTheDocument();
    expect(screen.getByText(/Aquí \(anclaje proximal\): Ø 4,00 frente a vaso 3,00 mm \(\+1,0\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Dispositivo del catálogo" }), { target: { value: "1" } });
    expect(screen.getByText(/Ø 4,25 frente a vaso/)).toBeInTheDocument();
    act(() => p.progreso.poner(1.0));
    expect(screen.getByText(/Aquí \(cuello\)/)).toBeInTheDocument();
    expect(fdSizing).toHaveBeenCalledTimes(1);
  });

  it("con un stent desplegado enseña su aposición y no pide el plan", async () => {
    const d = datos();
    d.stent = { from_arc_mm: 0.5, to_arc_mm: 2, noise_mm: 0.3, gap_length_mm: 0.5, max_gap_mm: 0.62, compressed_length_mm: 1, neck_length_mm: 0, proximal_gap_mm: 0.62, distal_gap_mm: 0 };
    d.sections[1].stent = { contour: circulo(1.8), apposition_mm: Array(72).fill(0.62), max_gap_mm: 0.62, max_compression_mm: 0, at_neck: false };
    d.sections[2].stent = { contour: circulo(1.8), apposition_mm: Array(72).fill(-0.8), max_gap_mm: 0, max_compression_mm: 0.8, at_neck: false };
    ivusVirtual.mockResolvedValue(d);
    const p = montar();
    expect(await screen.findByText("STENT DESPLEGADO")).toBeInTheDocument();
    expect(screen.getByText(/Aquí no hay stent: va de 0,5 a 2,0 mm/)).toBeInTheDocument();
    act(() => p.progreso.poner(0.5));
    expect(screen.getByText("Aquí: separado 0,62 mm de la pared.")).toBeInTheDocument();
    act(() => p.progreso.poner(1.0));
    expect(screen.getByText(/Aquí: comprimido 0,80 mm/)).toBeInTheDocument();
    expect(screen.getByText(/Anclajes: prox. 0,62 · dist. 0,00 mm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir al anclaje proximal" }));
    expect(p.onIrA).toHaveBeenCalledWith(0.5);
    expect(fdSizing).not.toHaveBeenCalled();
  });
});
