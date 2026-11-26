/* P4 (18-11): métricas de sección del IVUS virtual (Ø por perímetro, Ø inscrito,
   circularidad) y el gráfico de secciones que lleva el recorrido. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IvusCompareSection, IvusResult, IvusSection } from "../../api/types";
import { graficoDe } from "../ivusVirtual";

const ivusVirtual = vi.fn();
const ivusStack = vi.fn();
const fdSizing = vi.fn();
vi.mock("../../api/client", () => ({ api: {
  ivusVirtual: (...a: unknown[]) => ivusVirtual(...a), ivusStack: (...a: unknown[]) => ivusStack(...a),
  fdSizing: (...a: unknown[]) => fdSizing(...a), ivusCompare: vi.fn(),
} }));

import { HudIvus, olvidarIvus } from "./HudIvus";
import { crearProgreso } from "./HudRecorrido";

const circulo = (r: number) => Array.from({ length: 72 }, (_, k) => [r * Math.cos((2 * Math.PI * k) / 72), r * Math.sin((2 * Math.PI * k) / 72)]);

function seccion(i: number, extra: Partial<IvusSection> = {}): IvusSection {
  return {
    arc_mm: i * 0.5, valid: true, in_lesion: false, in_branch: false, area_mm2: 7.07, perimeter_mm: 9.42,
    d_min_mm: 3, d_max_mm: 3, d_eq_mm: 3, eccentricity: 0, d_perimeter_mm: 3, d_inscribed_mm: 3,
    inscribed_center: [0, 0], circularity: 1, angle_min_deg: 0, angle_max_deg: 90, centroid: [0, 0], contour: circulo(1.5), ...extra,
  };
}

function datos(): IvusResult {
  const sections = [
    seccion(0),
    seccion(1, { area_mm2: 4.2, d_min_mm: 1.6, d_max_mm: 3.4, d_perimeter_mm: 2.9, d_inscribed_mm: 1.55, circularity: 0.68 }),
    seccion(2, { valid: false, area_mm2: null }),
    seccion(3, { in_lesion: true, area_mm2: 60 }),
  ];
  return { n_sections: 4, size_px: 4, fov_mm: 10, stack_url: "/data/x.u8?v=1", window: [0, 400], sections, summary: null, note: "Sin resumen." };
}

beforeEach(() => {
  olvidarIvus();
  ivusVirtual.mockReset().mockResolvedValue(datos());
  ivusStack.mockReset().mockResolvedValue(new Uint8Array(4 * 4 * 4));
  fdSizing.mockReset().mockRejectedValue(new Error("Sin morfometría."));
});

describe("graficoDe", () => {
  it("deja huecos sin medida y en la lesión, y la escala no la aplasta el saco", () => {
    const g = graficoDe(datos().sections, "area");
    expect(g.series).toHaveLength(1);
    expect(g.series[0].valores).toEqual([7.07, 4.2, null, null]);
    expect(g.min).toBe(0);
    expect(g.max).toBeCloseTo(7.07 * 1.1);
    expect(g.unidad).toBe("mm²");
  });

  it("diámetros: máximo, por perímetro e inscrito", () => {
    const g = graficoDe(datos().sections, "diametros");
    expect(g.series.map((s) => s.nombre)).toEqual(["Ø máx", "Ø perímetro", "Ø inscrito"]);
    expect(g.series[2].valores.slice(0, 2)).toEqual([3, 1.55]);
    expect(g.max).toBeCloseTo(3.4 * 1.1);
  });

  it("una sección de rama no estira la escala", () => {
    const secs = [...datos().sections, seccion(4, { in_branch: true, area_mm2: 60 })];
    const g = graficoDe(secs, "area");
    expect(g.series[0].valores[4]).toBe(60);                   // se pinta (recortada)
    expect(g.max).toBeCloseTo(7.07 * 1.1);                     // pero no cuenta para la escala
  });

  it("circularidad va hasta 1 y baja el suelo si hace falta", () => {
    const g = graficoDe(datos().sections, "circularidad");
    expect(g.max).toBe(1);
    expect(g.min).toBe(0.6);
    const muyPlana = graficoDe([seccion(0, { circularity: 0.42 })], "circularidad");
    expect(muyPlana.min).toBe(0.4);
  });

  it("con el estudio anterior, el área de antes va discontinua", () => {
    const previo: IvusCompareSection[] = datos().sections.map((s) => ({ arc_mm: s.arc_mm, valid: true, area_mm2: 8, contour: [] }));
    const g = graficoDe(datos().sections, "area", previo);
    expect(g.series[1]).toMatchObject({ nombre: "Antes", raya: true });
    expect(g.series[1].valores).toEqual([8, 8, 8, null]);      // en la lesión, tampoco
  });
});

describe("HudIvus · P4", () => {
  function montar() {
    const progreso = crearProgreso();
    const props = { sessionId: "s", claveLinea: "a", progreso, onIrA: vi.fn(), onCerrar: vi.fn() };
    render(<HudIvus {...props} />);
    return props;
  }

  it("enseña Ø por perímetro, Ø inscrito y circularidad de la sección", async () => {
    const p = montar();
    await screen.findByText("7,07 mm²");
    expect(screen.getByText("Circularidad", { selector: "dt .explica" })).toBeInTheDocument();
    act(() => p.progreso.poner(0.5));
    expect(await screen.findByText("4,20 mm²")).toBeInTheDocument();
    expect(screen.getByText("0,68")).toBeInTheDocument();
    // Ø mínimo (1,6) e inscrito (1,55 → 1,6), los dos en ámbar.
    expect(screen.getAllByText("1,6").map((e) => e.className)).toEqual(["hud-ivus-min", "hud-ivus-min"]);
  });

  it("el gráfico cambia de medida y un clic en él lleva el recorrido a esa sección", async () => {
    const p = montar();
    await screen.findByText("7,07 mm²");
    const g = screen.getByRole("img", { name: /Gráfico de secciones: Área/ });
    fireEvent.click(screen.getByRole("button", { name: "Ø" }));
    expect(screen.getByRole("button", { name: "Ø" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /Gráfico de secciones: Ø/ })).toBe(g);
    expect(screen.getByText("inscrito")).toHaveClass("hud-ivus-min");
    g.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 64, right: 300, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 20, buttons: 1 });
    expect(p.onIrA).toHaveBeenLastCalledWith(0.5);                          // columna 100 de 300 → sección 1
  });
});
