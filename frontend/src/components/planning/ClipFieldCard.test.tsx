import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClipFieldCard } from "./ClipFieldCard";
import type { ClipFieldSummary } from "../../api/types";

const s: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", force_window_g: [70, 80, 120, 150], neck_evaluated: true,
  clips: [{ name: "T1 10", force_g: 120, verdict: "optima" }],
  verdict: "warn", clip_name: "T1 10",
  criteria: [{ key: "coverage", label: "Longitud de hoja", verdict: "ok", detail: "ok" }, { key: "force", label: "Fuerza", verdict: "warn", detail: "banda provisional" }],
  note: "Estimación geométrica: …" };

describe("ClipFieldCard", () => {
  it("enseña el cuello cubierto, la fuerza frente a la ventana en gramos, el área, los criterios y la nota", () => {
    render(<ClipFieldCard summary={s} show onToggle={vi.fn()} />);
    expect(screen.getByText("Cuello cubierto")).toBeInTheDocument();
    expect(screen.getByText("Cuello residual")).toBeInTheDocument();
    expect(screen.getByText("Cuello no alcanzado")).toBeInTheDocument();
    expect(screen.getByText(/92\.0 %/)).toBeInTheDocument();
    expect(screen.getByText("Fuerza de cierre")).toBeInTheDocument();
    expect(screen.getByText("120 g")).toBeInTheDocument();
    expect(screen.getByText("Óptima")).toBeInTheDocument();
    expect(screen.getByText(/óptima 80–120 g · aceptable 70–150 g/)).toBeInTheDocument();
    expect(screen.getByText("Área pinzada estimada")).toBeInTheDocument();
    expect(screen.getByText("8.4 mm²")).toBeInTheDocument();
    expect(screen.queryByText(/g\/mm²/)).toBeNull();
    expect(screen.getByText("Longitud de hoja")).toBeInTheDocument();
    expect(screen.getByText(/banda provisional/)).toBeInTheDocument();
    expect(screen.getByText(/Estimación geométrica/)).toBeInTheDocument();
    expect(screen.getByText(/fuerza mínima de la banda/i)).toBeInTheDocument();
  });
  it("con el clip movido desde el último plan lleva el aviso DESFASADO; sin moverlo, no", () => {
    const { rerender } = render(<ClipFieldCard summary={s} show onToggle={vi.fn()} stale />);
    expect(screen.getByTitle("El clip se ha movido; el mapa se recalcula al soltar")).toHaveTextContent("DESFASADO");
    rerender(<ClipFieldCard summary={s} show onToggle={vi.fn()} />);
    expect(screen.queryByText("DESFASADO")).toBeNull();
  });
  it("el interruptor del mapa de calor avisa al padre", () => {
    const onToggle = vi.fn();
    render(<ClipFieldCard summary={s} show={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mapa de calor/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
  it("sin fuerza de catálogo lo dice pero deja la ventana en gramos", () => {
    render(<ClipFieldCard summary={{ ...s, pressure_verdict: "sin_fuerza", force_g: 0, force_is_band_min: false, force_provisional: false,
      clips: [{ name: "importado", force_g: 0, verdict: "sin_fuerza" }] }} show onToggle={vi.fn()} />);
    expect(screen.getByText("Sin fuerza de catálogo")).toBeInTheDocument();
    expect(screen.getByText(/óptima 80–120 g/)).toBeInTheDocument();
    expect(screen.queryByText(/fuerza mínima de la banda/i)).toBeNull();
  });
  it("sin cuello evaluado los porcentajes son «—» y sin contacto no hay área", () => {
    const z: ClipFieldSummary = { ...s, pressure_verdict: "sin_contacto", covered_pct: 0, residual_pct: 0, contact_area_mm2: 0,
      pressure_g_mm2: 0, window_g_mm2: [0, 0, 0, 0], neck_evaluated: false };
    render(<ClipFieldCard summary={z} show onToggle={vi.fn()} />);
    expect(screen.getByText("Sin contacto")).toBeInTheDocument();
    expect(screen.queryByText(/0\.0 %/)).toBeNull();
    expect(screen.getAllByText("—").length).toBe(4);
    expect(screen.queryByText(/g\/mm²/)).toBeNull();
  });
  it("con dos clips enseña la fuerza de cada uno y el veredicto del peor", () => {
    render(<ClipFieldCard summary={{ ...s, pressure_verdict: "aceptable", clips: [
      { name: "A", force_g: 120, verdict: "optima" }, { name: "B", force_g: 140, verdict: "aceptable" }] }} show onToggle={vi.fn()} />);
    expect(screen.getByText("120 g + 140 g")).toBeInTheDocument();
    expect(screen.getByText("Aceptable")).toBeInTheDocument();
    expect(screen.getByText(/B: 140 g · Aceptable/)).toBeInTheDocument();
  });
});
