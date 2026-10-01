import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClipFieldCard } from "./ClipFieldCard";
import type { ClipFieldSummary } from "../../api/types";

const s: ClipFieldSummary = { covered_pct: 92, residual_pct: 8, unreached_pct: 0, contact_area_mm2: 8.4, force_g: 120,
  force_is_band_min: true, force_provisional: true, pressure_g_mm2: 14.3, window_g_mm2: [10.1, 11.6, 17.4, 21.8],
  pressure_verdict: "optima", verdict: "warn", clip_name: "T1 10",
  criteria: [{ key: "coverage", label: "Cobertura", verdict: "ok", detail: "ok" }, { key: "force", label: "Fuerza", verdict: "warn", detail: "banda provisional" }],
  note: "Estimación geométrica: …" };

describe("ClipFieldCard", () => {
  it("enseña cobertura, presión frente a la ventana, los criterios y la nota", () => {
    render(<ClipFieldCard summary={s} show onToggle={vi.fn()} />);
    expect(screen.getByText(/92\.0 %/)).toBeInTheDocument();
    expect(screen.getByText(/14\.3 g\/mm²/)).toBeInTheDocument();
    expect(screen.getByText(/11\.6.*17\.4/)).toBeInTheDocument();
    expect(screen.getByText("Fuerza")).toBeInTheDocument();
    expect(screen.getByText(/banda provisional/)).toBeInTheDocument();
    expect(screen.getByText(/Estimación geométrica/)).toBeInTheDocument();
    expect(screen.getByText(/fuerza mínima de la banda/i)).toBeInTheDocument();
  });
  it("el interruptor del mapa de calor avisa al padre", () => {
    const onToggle = vi.fn();
    render(<ClipFieldCard summary={s} show={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mapa de calor/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
  it("sin fuerza de catálogo lo dice en vez de dar una presión", () => {
    render(<ClipFieldCard summary={{ ...s, pressure_verdict: "sin_fuerza", force_g: 0, force_is_band_min: false, force_provisional: false }} show onToggle={vi.fn()} />);
    expect(screen.getByText("Sin fuerza de catálogo")).toBeInTheDocument();
    expect(screen.queryByText(/fuerza mínima de la banda/i)).toBeNull();
  });
  it("sin contacto no enseña una presión ni una ventana de ceros", () => {
    const z: ClipFieldSummary = { ...s, pressure_verdict: "sin_contacto", covered_pct: 0, pressure_g_mm2: 0, window_g_mm2: [0, 0, 0, 0] };
    render(<ClipFieldCard summary={z} show onToggle={vi.fn()} />);
    expect(screen.getByText("Sin contacto")).toBeInTheDocument();
    expect(screen.queryByText(/g\/mm²/)).toBeNull();
  });
});
